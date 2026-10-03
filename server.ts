import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDatabase } from './src/lib/db';
import { Product, Transaction, TransactionItem } from './src/lib/validators';
import { DiscountService } from './src/services/DiscountService';
import { TaxService } from './src/services/TaxService';
import { hashPassword, verifyPassword } from './src/lib/password';
import { NotificationService } from './src/services/NotificationService';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import type { Request, Response, NextFunction } from 'express';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('');
console.log('=' .repeat(50));
console.log('KASIRKU SERVER STARTUP LOGS');
console.log('=' .repeat(50));
console.log('');

// Load environment variables FIRST
console.log('[1] Loading environment variables...');
let envLoaded = false;

const possibleEnvPaths = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
  '.env',
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn(`[WARN] Error loading .env at ${envPath}:`, result.error.message);
    } else {
      console.log('[OK] Environment variables loaded successfully');
      console.log(`   From: ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  console.warn('[WARN] No .env file found - using default variables');
  console.warn(`   Checked paths:`);
  possibleEnvPaths.forEach(p => console.warn(`   - ${p}`));
}

// Verify Telegram credentials
const hasTelegramConfig = !!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_ENABLED === 'true';
if (hasTelegramConfig && process.env.TELEGRAM_BOT_TOKEN) {
  console.log('[OK] Telegram credentials detected:');
  console.log(`   Bot Token: ${process.env.TELEGRAM_BOT_TOKEN.substring(0, 12)}...`);
  console.log(`   Chat ID: ${process.env.TELEGRAM_CHAT_ID || '(not set)'}`);
} else if (hasTelegramConfig) {
  console.warn('[WARN] Telegram enabled but credentials incomplete');
}

// Start server
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize telegram enabled flag outside try-catch
let telegramEnabled = hasTelegramConfig && process.env.TELEGRAM_BOT_TOKEN;

// FIX: Declare db at MODULE level so ALL routes (including those registered
// outside the startup try-block) can access it. Previously `const db` was
// declared inside the try block, making it invisible to routes defined after
// the try/catch -> caused "db is not defined" (HTTP 500) on GET /api/transactions.
const db = getDatabase();

// ---- Audit logging helper (module level) --------------------------------
// Records important actions. Actor is best-effort from the request (body/header).
function logAudit(
  req: any,
  action: string,
  entity: string,
  entityId: string | number | null,
  detail?: any
): void {
  try {
    // Pelaku diaudit diutamakan dari sesi terverifikasi (req.authUser),
    // bukan header/body yang bisa dipalsukan klien.
    const username =
      req?.authUser?.username ||
      req?.body?.actor ||
      req?.body?.cashier_name ||
      req?.headers?.['x-actor'] ||
      (req?.body?.username || null);
    const userId =
      req?.authUser?.id ||
      req?.body?.actor_id ||
      req?.headers?.['x-actor-id'] ||
      req?.body?.cashier_id ||
      null;
    db.writeAudit({
      user_id: userId,
      username,
      action,
      entity,
      entity_id: entityId,
      detail,
    });
  } catch (e: any) {
    console.error('[audit] helper error:', e.message);
  }
}

// ---- Signed session tokens (module level) --------------------------------
// Token format: kasirku_<expMs>.<base64url(username)>.<HMAC-SHA256 base64url>
// Pemisah '.' dipakai karena base64url boleh berisi '_' (kalau pakai '_' sebagai
// separator, sebagian token valid akan gagal di-parse).
// Sebelumnya token = kasirku_<ts>_<random>_<base64(username)> TANPA tanda tangan,
// sehingga siapa pun bisa memalsukan token (bypass login total). Sekarang token
// ditandatangani dengan secret di server dan kedaluwarsa dalam 24 jam.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = 'kasirku_';
const TOKEN_SECRET_FILE = path.join(__dirname, 'data', 'token-secret');
let cachedTokenSecret: string | null = null;

const getTokenSecret = (): string => {
  if (cachedTokenSecret) return cachedTokenSecret;
  try {
    if (fs.existsSync(TOKEN_SECRET_FILE)) {
      const existing = fs.readFileSync(TOKEN_SECRET_FILE, 'utf8').trim();
      if (existing.length >= 32) {
        cachedTokenSecret = existing;
        return existing;
      }
    }
    const fresh = randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(TOKEN_SECRET_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_SECRET_FILE, fresh, { mode: 0o600 });
    cachedTokenSecret = fresh;
    return fresh;
  } catch (e: any) {
    console.error('[auth] Gagal menyimpan token secret:', e.message);
    cachedTokenSecret = randomBytes(32).toString('hex');
    return cachedTokenSecret;
  }
};

const signTokenPayload = (payload: string): string =>
  createHmac('sha256', getTokenSecret()).update(payload).digest('base64url');

function createToken(username: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const bu = Buffer.from(username, 'utf8').toString('base64url');
  return `${TOKEN_PREFIX}${exp}.${bu}.${signTokenPayload(`${username}:${exp}`)}`;
}

// Mengembalikan username bila signature valid & belum kedaluwarsa, selain itu null.
function verifyToken(token: string): string | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const fields = token.slice(TOKEN_PREFIX.length).split('.');
  if (fields.length !== 3) return null;
  const exp = Number(fields[0]);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  let username: string;
  try {
    username = Buffer.from(fields[1], 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!username) return null;
  const expected = signTokenPayload(`${username}:${exp}`);
  const a = Buffer.from(fields[2], 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b) ? username : null;
  } catch {
    return null;
  }
}

// ---- Auth helpers (module level) -----------------------------------------
// Resolve the logged-in user from the `Authorization: Bearer kasirku_...`
// token issued by POST /api/auth/login. Returns the active user row or null.
function resolveAuthUser(req: any): any | null {
  const raw = req?.headers?.authorization || '';
  const token = String(raw).replace(/^Bearer\s+/i, '').trim();
  const username = verifyToken(token);
  if (!username) return null;
  try {
    // Selalu ambil role/active terbaru dari DB (bukan dari token/localStorage).
    return db.get<any>(
      'SELECT id, username, name, role, active FROM users WHERE username = ? AND active = 1',
      [username]
    );
  } catch {
    return null;
  }
}

// Guard: 401 bila tidak login / token tidak valid / user nonaktif.
function requireAuth(req: any, res: any): any | null {
  const user = resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ message: 'Harap login terlebih dahulu' });
    return null;
  }
  req.authUser = user; // supaya logAudit mencatat siapa pelakunya
  return user;
}

/**
 * Nama pelaku untuk notifikasi/audit pada endpoint yang TIDAK memakai guard
 * auth (products/stock-in). Identitas utama diambil dari token yang
 * DIVERIFIKASI (resolveAuthUser). Header x-actor hanya dipakai sebagai label
 * bila token tidak ada — tidak dipercaya untuk otorisasi. Fallback terakhir
 * "Sistem" (bukan "admin" palsu).
 */
function resolveActorName(req: any): string {
  try {
    const authed = req?.authUser || resolveAuthUser(req);
    if (authed) return authed.name || authed.username || 'Sistem';
  } catch {
    /* lanjut ke fallback */
  }
  const label = req?.headers?.['x-actor'] ?? req?.body?.actor;
  if (label && String(label).trim()) return String(label).trim();
  return 'Sistem';
}

// Guard for destructive admin-only endpoints: 401 when not logged in,
// 403 when logged in but not an admin. Returns the user or null (after replying).
function requireAdmin(req: any, res: any): any | null {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ message: 'Hanya admin yang boleh menjalankan aksi ini' });
    return null;
  }
  return user;
}

// Express middleware variants (dipakai sebagai argumen route).
const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!requireAdmin(req, res)) return;
  next();
};
const authOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!requireAuth(req, res)) return;
  next();
};

// Buat/baca secret token sekali di awal (persisten antar restart).
getTokenSecret();

// ---- Shared date/aggregation helpers (module level) ---------------------
// Transactions store date_time as UTC ISO strings; the business day is the
// LOCAL day (WIB). These helpers convert a local YYYY-MM-DD into inclusive
// UTC bounds and compute aggregates for a day or a range.
const toLocalDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const localDayBounds = (dayStr: string): { start: string; end: string } => {
  const start = new Date(`${dayStr}T00:00:00`);
  const end = new Date(`${dayStr}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
};

const validDay = (s: any): string | null =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

const rangeFromDays = (days: number): { start: string; end: string } => {
  const now = new Date();
  const end = toLocalDay(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  return { start: toLocalDay(from), end };
};

const computeDayMetrics = (dayStr: string) => {
  const { start, end } = localDayBounds(dayStr);
  // Metrik bisnis: PENGECUALIAN transaksi testing (is_test=1).
  const txRows = db.all<any>(
    "SELECT id, grand_total FROM transactions WHERE status = 'completed' AND (is_test IS NULL OR is_test = 0) AND date_time >= ? AND date_time <= ?",
    [start, end]
  );
  const totalTransactions = txRows.length;
  const revenue = txRows.reduce((s: number, t: any) => s + (Number(t.grand_total) || 0), 0);
  const itemRows = db.all<any>(
    `SELECT ti.quantity AS quantity, ti.unit_price AS unit_price, p.purchase_price AS purchase_price
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id
      WHERE t.status = 'completed' AND (t.is_test IS NULL OR t.is_test = 0) AND t.date_time >= ? AND t.date_time <= ?`,
    [start, end]
  );
  let itemsSold = 0;
  let grossProfit = 0;
  for (const it of itemRows) {
    const qty = Number(it.quantity) || 0;
    const sell = Number(it.unit_price) || 0;
    const buy = Number(it.purchase_price) || 0;
    itemsSold += qty;
    grossProfit += (sell - buy) * qty;
  }
  return { revenue, totalTransactions, itemsSold, grossProfit };
};

const computeRangeMetrics = (startDay: string, endDay: string) => {
  const start = new Date(`${startDay}T00:00:00`).toISOString();
  const end = new Date(`${endDay}T23:59:59.999`).toISOString();
  const txRows = db.all<any>(
    "SELECT id, subtotal, discount_amount, tax_amount, grand_total FROM transactions WHERE status = 'completed' AND (is_test IS NULL OR is_test = 0) AND date_time >= ? AND date_time <= ?",
    [start, end]
  );
  const revenue = txRows.reduce((s: number, t: any) => s + (Number(t.grand_total) || 0), 0);
  const discount = txRows.reduce((s: number, t: any) => s + (Number(t.discount_amount) || 0), 0);
  const tax = txRows.reduce((s: number, t: any) => s + (Number(t.tax_amount) || 0), 0);
  const itemRows = db.all<any>(
    `SELECT ti.quantity AS quantity, ti.unit_price AS unit_price, p.purchase_price AS purchase_price
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id
      WHERE t.status = 'completed' AND (t.is_test IS NULL OR t.is_test = 0) AND t.date_time >= ? AND t.date_time <= ?`,
    [start, end]
  );
  let itemsSold = 0;
  let cogs = 0;
  let grossProfit = 0;
  for (const it of itemRows) {
    const qty = Number(it.quantity) || 0;
    const sell = Number(it.unit_price) || 0;
    const buy = Number(it.purchase_price) || 0;
    itemsSold += qty;
    cogs += buy * qty;
    grossProfit += (sell - buy) * qty;
  }
  return {
    start_date: startDay,
    end_date: endDay,
    revenue,
    discount,
    tax,
    cogs,
    grossProfit,
    totalTransactions: txRows.length,
    itemsSold,
  };
};

try {
  console.log('');
  console.log('[2] Initializing database...');
  
  // Suppress sql.js wasm warnings
  process.on('unhandledRejection', (reason) => {
    if (typeof reason === 'string' && (reason.includes('sql.js') || reason.includes('wasm'))) {
      console.warn('[WARN] SQL.js/WASM warning (can be ignored): Database already loaded');
      return;
    }
    console.error('[ERROR] Unhandled rejection:', reason);
    process.exit(1);
  });

  // db is already declared at module level above; just wait for readiness here
  await db.ready;
  console.log('[OK] Database initialized');
  
  // Initialize notification service
  let notificationService: any = null;

  try {
    // Worker harus jalan bila kredensial tersedia — baik dari .env MAUPUN dari
    // Settings Admin (halaman Telegram). Sebelumnya worker hanya aktif bila
    // telegramEnabled (.env), sehingga token yang diisi lewat Admin tidak pernah
    // diproses. NotificationService.isConfigured() memuat settings + .env.
    notificationService = new NotificationService();
    if (notificationService.isConfigured()) {
      notificationService.startAutoSync(60000);
      telegramEnabled = true;
      console.log('[OK] Telegram auto-sync aktif (setiap 60s)');
    } else {
      console.log('[3] Telegram belum dikonfigurasi - hanya queue lokal');
    }
  } catch (error) {
    console.error('[ERROR] Telegram setup failed:', error);
    telegramEnabled = false;
  }

  // Critical unexpected error: catat ke log, kirim notifikasi Telegram yang
  // terkendali (dedup/cooldown/rate-limit/sanitize), lalu keluar dengan kode 1
  // mengikuti behavior existing. Tidak menyentuh graceful shutdown SIGINT/SIGTERM,
  // dan tidak mengubah perilaku unhandledRejection di atas.
  process.on('uncaughtException', (err) => {
    console.error('[ERROR] Uncaught exception:', err);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      process.exit(1);
    };
    try {
      if (notificationService?.isConfigured?.()) {
        notificationService.notifySystemErrorSafe('uncaughtException', err);
        // Beri worker kesempatan mengirim (maks 4 detik), lalu keluar.
        Promise.resolve(notificationService.processQueue?.()).finally(done);
        setTimeout(done, 4000);
        return;
      }
    } catch (notifErr: any) {
      console.error('[ERROR] Gagal mengirim notifikasi system error:', notifErr?.message || notifErr);
    }
    done();
  });

  // Setup middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  console.log('[OK] Middleware configured');

  // Define routes
  app.get('/api/products', (req, res) => {
    try {
      const filter: { search?: string; category?: string; active?: boolean; status?: string } = {};
      if (req.query.search) filter.search = String(req.query.search);
      if (req.query.category) filter.category = String(req.query.category);
      // Mode Kasir (Kiosk): ?status=Aktif -> hanya produk yang boleh dijual.
      if (req.query.status) filter.status = String(req.query.status);
      // Kompatibilitas lama: ?active=true / ?active=false
      if (req.query.active !== undefined) {
        const v = String(req.query.active).toLowerCase();
        filter.active = !(v === 'false' || v === '0' || v === '');
      }
      const products = db.getProducts(filter);
      res.json({ products });
    } catch (error) {
      res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
  });

  // Single source of truth for tax: frontend displays EXACTLY what the backend
  // will charge. Uses the same TaxService instance/rate as checkout, so the
  // number shown before submit always equals the number stored in the DB.
  app.get('/api/tax', (req, res) => {
    try {
      const subtotal = Number(req.query.subtotal) || 0;
      const taxService = new TaxService();
      const taxAmount = taxService.calculateTax(subtotal);
      res.json({
        subtotal,
        tax_rate: taxService.rate,
        tax_amount: taxAmount,
        total: subtotal + taxAmount,
      });
    } catch (error) {
      res.status(500).json({ message: 'Error calculating tax', error: error.message });
    }
  });

  app.post('/api/tax', (req, res) => {
    try {
      const subtotal = Number(req.body.subtotal) || 0;
      const taxService = new TaxService();
      const taxAmount = taxService.calculateTax(subtotal);
      res.json({
        subtotal,
        tax_rate: taxService.rate,
        tax_amount: taxAmount,
        total: subtotal + taxAmount,
      });
    } catch (error) {
      res.status(500).json({ message: 'Error calculating tax', error: error.message });
    }
  });

  // Read current tax rate (no subtotal needed) — for the Admin "Pajak" page.
  app.get('/api/tax/rate', (req, res) => {
    try {
      res.json({ tax_rate: new TaxService().rate });
    } catch (error) {
      res.status(500).json({ message: 'Error reading tax rate', error: error.message });
    }
  });

  // Update tax rate. Body: { rate: 0.11 } OR { percent: 11 }.
  app.put('/api/tax/rate', (req, res) => {
    try {
      let rate: number;
      if (req.body.percent != null) rate = Number(req.body.percent) / 100;
      else rate = Number(req.body.rate);

      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        return res.status(400).json({ message: 'Tarif tidak valid (0–100%)' });
      }
      const saved = new TaxService().setRate(rate);
      logAudit(req, 'update', 'tax_rate', 'tax_rate', { rate: saved });
      res.json({ tax_rate: saved, message: 'Tarif pajak berhasil disimpan' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menyimpan tarif pajak' });
    }
  });

  // ---- Discounts & Promo (Batch 2) --------------------------------------
  app.get('/api/discounts', (req, res) => {
    try {
      const rules = db.all<any>('SELECT * FROM discount_rules ORDER BY id ASC');
      res.json({ discounts: rules });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Normalize scope fields. For 'products' scope_value is stored as a JSON array.
  const normalizeScope = (b: any): { scope_type: 'all' | 'category' | 'products'; scope_value: string | null } => {
    const type = ['all', 'category', 'products'].includes(b.scope_type) ? b.scope_type : 'all';
    if (type === 'all') return { scope_type: 'all', scope_value: null };
    if (type === 'category') {
      const v = b.scope_value != null ? String(b.scope_value).trim() : '';
      return { scope_type: 'category', scope_value: v || null };
    }
    // products -> array of codes -> JSON string
    let arr: string[] = [];
    if (Array.isArray(b.scope_value)) arr = b.scope_value.map((x: any) => String(x));
    else if (typeof b.scope_value === 'string' && b.scope_value.trim()) {
      try { const p = JSON.parse(b.scope_value); arr = Array.isArray(p) ? p.map(String) : b.scope_value.split(',').map((s) => s.trim()); }
      catch { arr = b.scope_value.split(',').map((s) => s.trim()); }
    }
    arr = arr.map((s) => s.trim()).filter(Boolean);
    return { scope_type: 'products', scope_value: arr.length ? JSON.stringify(arr) : null };
  };

  const validateDiscountBody = (b: any) => {
    if (!b.name || String(b.name).trim() === '') return 'Nama diskon wajib diisi';
    if (!['percentage', 'fixed'].includes(b.discount_type)) return 'Tipe diskon harus percentage atau fixed';
    const v = Number(b.discount_value);
    if (!Number.isFinite(v) || v <= 0) return 'Nilai diskon harus lebih dari 0';
    if (b.discount_type === 'percentage' && v > 100) return 'Persentase tidak boleh lebih dari 100';
    if (b.start_date && b.end_date && b.start_date > b.end_date) return 'Tanggal mulai melebihi tanggal selesai';
    if (b.scope_type === 'category' && (!b.scope_value || String(b.scope_value).trim() === ''))
      return 'Pilih kategori untuk diskon';
    if (b.scope_type === 'products') {
      const arr = Array.isArray(b.scope_value) ? b.scope_value : (typeof b.scope_value === 'string' && b.scope_value.trim() ? (() => { try { return JSON.parse(b.scope_value); } catch { return b.scope_value.split(','); } })() : []);
      if (!Array.isArray(arr) || arr.filter(Boolean).length === 0) return 'Pilih minimal 1 produk untuk diskon';
    }
    return null;
  };

  app.post('/api/discounts', (req, res) => {
    try {
      const err = validateDiscountBody(req.body);
      if (err) return res.status(400).json({ message: err });
      const b = req.body;
      const scope = normalizeScope(b);
      db.run(
        `INSERT INTO discount_rules (name, description, discount_type, discount_value, start_date, end_date, days_of_week, min_purchase, max_discount, active, scope_type, scope_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(b.name).trim(),
          b.description || null,
          b.discount_type,
          Number(b.discount_value),
          b.start_date || null,
          b.end_date || null,
          b.days_of_week || null,
          b.min_purchase != null && b.min_purchase !== '' ? Number(b.min_purchase) : 0,
          b.max_discount != null && b.max_discount !== '' ? Number(b.max_discount) : null,
          b.active === false ? 0 : 1,
          scope.scope_type,
          scope.scope_value,
          new Date().toISOString(),
        ]
      );
      const created = db.get<any>('SELECT * FROM discount_rules ORDER BY id DESC LIMIT 1');
      logAudit(req, 'create', 'discount', created?.id ?? null, created);
      res.status(201).json({ discount: created });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal membuat diskon' });
    }
  });

  app.put('/api/discounts/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.get<any>('SELECT * FROM discount_rules WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ message: 'Diskon tidak ditemukan' });

      const err = validateDiscountBody(req.body);
      if (err) return res.status(400).json({ message: err });
      const b = req.body;
      const scope = normalizeScope(b);
      db.run(
        `UPDATE discount_rules SET name = ?, description = ?, discount_type = ?, discount_value = ?,
          start_date = ?, end_date = ?, days_of_week = ?, min_purchase = ?, max_discount = ?, active = ?,
          scope_type = ?, scope_value = ?
         WHERE id = ?`,
        [
          String(b.name).trim(),
          b.description || null,
          b.discount_type,
          Number(b.discount_value),
          b.start_date || null,
          b.end_date || null,
          b.days_of_week || null,
          b.min_purchase != null && b.min_purchase !== '' ? Number(b.min_purchase) : 0,
          b.max_discount != null && b.max_discount !== '' ? Number(b.max_discount) : null,
          b.active === false ? 0 : 1,
          scope.scope_type,
          scope.scope_value,
          id,
        ]
      );
      const updated = db.get<any>('SELECT * FROM discount_rules WHERE id = ?', [id]);
      logAudit(req, 'update', 'discount', id, { before: existing, after: updated });
      res.json({ discount: updated });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal mengupdate diskon' });
    }
  });

  app.delete('/api/discounts/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.get<any>('SELECT * FROM discount_rules WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ message: 'Diskon tidak ditemukan' });
      db.run('DELETE FROM discount_rules WHERE id = ?', [id]);
      logAudit(req, 'delete', 'discount', id, existing);
      res.json({ message: 'Diskon dihapus' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menghapus diskon' });
    }
  });

  // Preview which discount applies right now (for the admin page / kiosk).
  // Accepts either ?subtotal= (legacy) or ?items=<json array of cart lines>
  // where each line is { product_id?, product_code?, category?, quantity, unit_price }.
  app.get('/api/discounts/preview', (req, res) => {
    try {
      let cart: any[] | null = null;
      if (req.query.items) {
        try {
          const parsed = JSON.parse(String(req.query.items));
          if (Array.isArray(parsed)) {
            cart = parsed.map((it: any) => {
              const qty = Number(it.quantity) || 0;
              const price = Number(it.unit_price) || 0;
              const subtotal = it.subtotal != null ? Number(it.subtotal) : price * qty;
              return {
                product_code: it.product_code || null,
                category: it.category || null,
                quantity: qty,
                unit_price: price,
                subtotal,
              };
            });
          }
        } catch { /* fall through to subtotal */ }
      }
      const subtotal = cart ? cart.reduce((s, l) => s + l.subtotal, 0) : (Number(req.query.subtotal) || 0);
      const result = new DiscountService().calculateDiscount(cart ?? subtotal);
      res.json({ subtotal, ...result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ---- Telegram notifications (Batch 2) ---------------------------------
  const maskToken = (t: string) => {
    if (!t) return '';
    if (t.length <= 10) return '***';
    return t.slice(0, 6) + '...' + t.slice(-4);
  };

  app.get('/api/telegram/config', adminOnly, (req, res) => {
    try {
      const svc = new NotificationService();
      const cfg = svc.getConfig();
      res.json({
        bot_token_masked: maskToken(cfg.bot_token),
        chat_id: cfg.chat_id,
        configured: !!(cfg.bot_token && cfg.chat_id),
        pending: svc.getPendingCount(),
        failed: svc.getFailedCount(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put('/api/telegram/config', adminOnly, (req, res) => {
    try {
      const botToken = req.body.bot_token;
      const chatId = req.body.chat_id;
      if (botToken == null || String(botToken).trim() === '') {
        return res.status(400).json({ message: 'Bot token wajib diisi' });
      }
      if (chatId == null || String(chatId).trim() === '') {
        return res.status(400).json({ message: 'Chat ID wajib diisi' });
      }
      new NotificationService().setConfig(String(botToken).trim(), String(chatId).trim());
      logAudit(req, 'update', 'telegram_config', 'telegram', { chat_id: String(chatId).trim() });
      res.json({ message: 'Konfigurasi Telegram disimpan' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menyimpan konfigurasi' });
    }
  });

  app.get('/api/telegram/status', adminOnly, async (req, res) => {
    try {
      const result = await new NotificationService().testConnection();
      res.json({
        ok: result.ok,
        message: result.message,
        bot_username: result.bot?.username || null,
        chat_title: result.chat?.title || result.chat?.first_name || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send a REAL test message to the configured chat (not just getMe).
  app.post('/api/telegram/test-notification', adminOnly, async (req, res) => {
    try {
      const result = await new NotificationService().sendTestNotification();
      res.status(result.ok ? 200 : 400).json({
        ok: result.ok,
        message: result.message,
        notification_id: result.queuedId ?? null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Notification history (for the admin table)
  app.get('/api/telegram/notifications', adminOnly, (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
      const status = req.query.status as string;
      let sql = 'SELECT * FROM notifications_queue';
      const params: any[] = [];
      if (status) {
        sql += ' WHERE status = ?';
        params.push(status);
      }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      const rows = db.all<any>(sql, params);
      res.json({ notifications: rows });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete all processed (non-pending) notifications
  app.delete('/api/telegram/notifications/processed', adminOnly, (req, res) => {
    try {
      const changes = new NotificationService().clearProcessedNotifications();
      res.json({ message: `Menghapus ${changes} notifikasi selesai`, changes });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ---- Import Excel (Batch 2) -------------------------------------------
  // Parse rows -> normalized products + validation (duplicate code, missing fields).
  const normalizeImportRows = (rows: any[]) => {
    const existingCodes = new Set(
      db.getProducts().map((p: any) => String(p.code).toLowerCase())
    );
    const seenInFile = new Set<string>();
    const parsed: any[] = [];
    const errors: { row: number; message: string }[] = [];

    rows.forEach((row, idx) => {
      const lineNo = idx + 2; // header is row 1
      // Alias termasuk header kanonik template (Code/Description/Purchase_price/Minstock)
      // supaya baris mentah dari sheet Excel tetap terbaca tanpa pra-pemetaan.
      const code = String(row.code ?? row.Code ?? row.Kode ?? row.kode ?? row.KD_BARANG ?? '').trim();
      const description = String(
        row.description ?? row.Description ?? row.Deskripsi ?? row.deskripsi ?? row.name ?? row.Name ?? row.Nama ?? row.nama ?? row.NM_BARANG ?? ''
      ).trim();
      const category = String(row.category ?? row.Category ?? row.Kategori ?? row.kategori ?? row.KELAS ?? '').trim() || null;
      const unit = String(row.unit ?? row.Unit ?? row.Satuan ?? row.satuan ?? row.SATUAN ?? 'pcs').trim() || 'pcs';
      // Angka: pakai ?? (bukan ||) supaya nilai 0 yang sah tidak berubah jadi
      // default. Sel kosong (null/'') tetap jatuh ke default.
      const numOr = (raw: any, fallback: number): number => {
        if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
        const n = Number(String(raw).replace(/,/g, '.'));
        return Number.isFinite(n) ? n : fallback;
      };
      const purchase_price = numOr(
        row.purchase_price ?? row.Purchase_price ?? row['Purchase Price'] ?? row.Harga_Beli ?? row.harga_beli ?? row.HARGA_BELI,
        0
      );
      const selling_price = numOr(
        row.selling_price ?? row.Selling_price ?? row['Selling Price'] ?? row.Harga_Jual ?? row.harga_jual ?? row.HARGA_JUAL,
        0
      );
      const stock = numOr(row.stock ?? row.Stock ?? row.Stok ?? row.stok ?? row.STOK, 0);
      // minimum_stock default 5 HANYA bila sel kosong; nilai 0 dipertahankan.
      const minimum_stock = numOr(row.minimum_stock ?? row.Min_stock ?? row.Minimum ?? row.minimum, 5);
      const barcode = String(row.barcode ?? row.Barcode ?? '').trim() || null;
      const brand = String(row.brand ?? row.Brand ?? row.merek ?? row.Merek ?? '').trim() || null;
      const note = String(row.note ?? row.Note ?? row.Catatan ?? row.catatan ?? '').trim() || null;
      const ext01 = String(row.ext01 ?? row.EXT01 ?? '').trim() || null;
      const ext02 = String(row.ext02 ?? row.EXT02 ?? '').trim() || null;
      // Status jual: default 'Aktif'; nilai non-aktif fleksibel (Tidak Aktif/nonaktif/inactive/0/tidak).
      const statusRaw = String(row.status ?? row.Status ?? row.STATUS ?? '').trim().toLowerCase();
      const status = ['tidak aktif', 'nonaktif', 'inactive', 'no', '0', 'tidak'].includes(statusRaw)
        ? 'Tidak Aktif'
        : 'Aktif';

      const lc = code.toLowerCase();
      if (!code) { errors.push({ row: lineNo, message: 'Kode produk kosong' }); return; }
      if (!description) { errors.push({ row: lineNo, message: `Deskripsi produk kosong (kode ${code})` }); return; }
      if (existingCodes.has(lc)) { errors.push({ row: lineNo, message: `Kode "${code}" sudah ada di database` }); return; }
      if (seenInFile.has(lc)) { errors.push({ row: lineNo, message: `Kode "${code}" duplikat di dalam file` }); return; }
      if (purchase_price < 0 || selling_price < 0) { errors.push({ row: lineNo, message: `Harga negatif (kode ${code})` }); return; }

      seenInFile.add(lc);
      parsed.push({
        row: lineNo,
        code, description, category, unit, purchase_price, selling_price, stock, minimum_stock, barcode,
        brand, status, note, ext01, ext02,
      });
    });

    return { parsed, errors };
  };

  app.post('/api/products/import/preview', adminOnly, (req, res) => {
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
      if (rows.length === 0) return res.status(400).json({ message: 'Tidak ada baris untuk diproses' });
      const { parsed, errors } = normalizeImportRows(rows);
      res.json({
        total: rows.length,
        valid: parsed.length,
        invalid: errors.length,
        products: parsed,
        errors,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal memproses file' });
    }
  });

  app.post('/api/products/import', adminOnly, (req, res) => {
    try {
      const rows = Array.isArray(req.body.products)
        ? req.body.products
        : Array.isArray(req.body.rows)
        ? req.body.rows
        : [];
      if (rows.length === 0) return res.status(400).json({ message: 'Tidak ada produk untuk diimpor' });

      const { parsed, errors } = normalizeImportRows(rows);
      let success = 0;
      const insertErrors: string[] = [...errors.map((e) => `Baris ${e.row}: ${e.message}`)];

      for (const p of parsed) {
        try {
          db.createProduct({
            code: p.code,
            description: p.description,
            category: p.category,
            variant: null,
            thickness: null,
            unit: p.unit,
            purchase_price: p.purchase_price,
            selling_price: p.selling_price,
            stock: p.stock,
            minimum_stock: p.minimum_stock,
            barcode: p.barcode,
            qr_code: null,
            brand: p.brand,
            status: p.status,
            note: p.note,
            ext01: p.ext01,
            ext02: p.ext02,
            active: p.status === 'Aktif',
          } as any);
          success++;
        } catch (e: any) {
          insertErrors.push(`Kode ${p.code}: ${e.message}`);
        }
      }

      res.status(201).json({
        message: `${success} produk berhasil diimpor`,
        success,
        failed: insertErrors.length,
        errors: insertErrors,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal mengimpor produk' });
    }
  });

  // ---- Backup (Batch 1: backup/download only; restore is a separate batch) ----
  const DB_FILE = path.join(__dirname, 'data', 'kasirku.db');
  const BACKUP_DIR = path.join(__dirname, 'data', 'backups');

  const ensureBackupDir = () => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  };

  const listBackups = () => {
    ensureBackupDir();
    try {
      return fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.toLowerCase().endsWith('.db'))
        .map((f) => {
          const st = fs.statSync(path.join(BACKUP_DIR, f));
          return { filename: f, size_bytes: st.size, created_at: st.mtime.toISOString() };
        })
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    } catch {
      return [];
    }
  };

  // Developer-style stats (also used by the Backup admin page)
  app.get('/api/developer/db-stats', adminOnly, (req, res) => {
    try {
      const st = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE) : null;
      res.json({ size_bytes: st ? st.size : 0, path: DB_FILE });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/developer/transaction-count', adminOnly, (req, res) => {
    try {
      // Metrik bisnis ("Total Transaksi"): transaksi testing/E2E (is_test=1) dikecualikan.
      const row = db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM transactions WHERE is_test IS NULL OR is_test = 0'
      );
      res.json({ count: row?.count || 0 });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // List existing backups
  app.get('/api/backups', adminOnly, (req, res) => {
    res.json({ backups: listBackups() });
  });

  // Create a backup (copies the current DB file into data/backups/)
  app.post('/api/developer/backup', adminOnly, (req, res) => {
    try {
      if (!fs.existsSync(DB_FILE)) {
        return res.status(404).json({ message: 'File database tidak ditemukan' });
      }
      ensureBackupDir();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `kasirku-backup-${stamp}.db`;
      const dest = path.join(BACKUP_DIR, filename);
      fs.copyFileSync(DB_FILE, dest);
      const st = fs.statSync(dest);
      logAudit(req, 'backup', 'database', filename, { filename, size_bytes: st.size });
      res.status(201).json({
        message: `Backup berhasil dibuat: ${filename}`,
        filename,
        size_bytes: st.size,
        created_at: st.mtime.toISOString(),
      });
    } catch (error: any) {
      console.error('Backup error:', error);
      res.status(500).json({ message: error.message || 'Gagal membuat backup' });
    }
  });

  // Download a specific backup file
  app.get('/api/backups/:filename', adminOnly, (req, res) => {
    try {
      // Prevent path traversal
      const filename = path.basename(req.params.filename);
      if (!filename.toLowerCase().endsWith('.db')) {
        return res.status(400).json({ message: 'File tidak valid' });
      }
      const full = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(full)) {
        return res.status(404).json({ message: 'Backup tidak ditemukan' });
      }
      res.download(full, filename);
    } catch (error: any) {
      res.status(500).json({ message: error.message || 'Gagal mengunduh backup' });
    }
  });

  // ---- Zona Berbahaya: Reset data transaksi (ADMIN ONLY) -----------------
  // Deletes transactions (+ their transaction_items and related
  // stock_movements), optionally restoring product stock. Products, users,
  // roles, discounts, settings and the audit log are NEVER touched.
  const buildResetScope = (body: any): { scope: string; start: string | null; end: string | null; error?: string } => {
    const scope = body?.scope === 'range' ? 'range' : body?.scope === 'all' ? 'all' : null;
    if (!scope) return { scope: 'all', start: null, end: null, error: 'Cakupan tidak valid' };
    if (scope === 'all') return { scope, start: null, end: null };
    const start = validDay(body?.start_date);
    const end = validDay(body?.end_date);
    if (!start || !end) return { scope, start: null, end: null, error: 'Tanggal mulai & selesai wajib berformat YYYY-MM-DD' };
    if (start > end) return { scope, start, end, error: 'Tanggal mulai tidak boleh setelah tanggal selesai' };
    return { scope, start, end };
  };

  const resetTargets = (scope: string, start: string | null, end: string | null) => {
    if (scope === 'range' && start && end) {
      const b = localDayBounds(start);
      const e = localDayBounds(end);
      return db.all<any>(
        'SELECT id FROM transactions WHERE date_time >= ? AND date_time <= ?',
        [b.start, e.end]
      ).map((r: any) => r.id);
    }
    return db.all<any>('SELECT id FROM transactions').map((r: any) => r.id);
  };

  // Count what would be deleted (used by the confirmation dialog).
  app.post('/api/admin/reset-transactions/preview', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    try {
      const { scope, start, end, error } = buildResetScope(req.body);
      if (error) return res.status(400).json({ message: error });
      const ids = resetTargets(scope, start, end);
      const ph = ids.map(() => '?').join(',');
      const txCount = ids.length;
      const itemCount = txCount
        ? Number(db.get<any>(`SELECT COUNT(*) AS c FROM transaction_items WHERE transaction_id IN (${ph})`, ids)?.c || 0)
        : 0;
      const movementCount = txCount
        ? Number(db.get<any>(`SELECT COUNT(*) AS c FROM stock_movements WHERE reference_id IN (${ph})`, ids)?.c || 0)
        : 0;
      res.json({
        scope,
        start_date: start,
        end_date: end,
        transaction_count: txCount,
        item_count: itemCount,
        movement_count: movementCount,
      });
    } catch (error: any) {
      console.error('Reset preview error:', error);
      res.status(500).json({ message: error.message || 'Gagal menghitung transaksi' });
    }
  });

  // Execute the reset. Requires the literal confirmation word "HAPUS".
  app.post('/api/admin/reset-transactions', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    try {
      if (String(req.body?.confirm || '').trim().toUpperCase() !== 'HAPUS') {
        return res.status(400).json({ message: 'Konfirmasi tidak valid: ketik HAPUS untuk melanjutkan' });
      }
      const { scope, start, end, error } = buildResetScope(req.body);
      if (error) return res.status(400).json({ message: error });
      const restoreStock = req.body?.restore_stock !== false;

      const ids = resetTargets(scope, start, end);
      if (ids.length === 0) {
        return res.status(400).json({ message: 'Tidak ada transaksi pada cakupan tersebut' });
      }

      // 1) Backup current DB file BEFORE deleting anything.
      ensureBackupDir();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `kasirku-backup-${stamp}.db`;
      fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, backupFilename));

      const ph = ids.map(() => '?').join(',');

      // 2) Collect item quantities so stock can be restored.
      const itemRows = db.all<any>(
        `SELECT product_id, quantity FROM transaction_items WHERE transaction_id IN (${ph})`,
        ids
      );

      // 3) Delete related stock movements, then items, then transactions.
      let movementsDeleted = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const cph = chunk.map(() => '?').join(',');
        const before = Number(db.get<any>(`SELECT COUNT(*) AS c FROM stock_movements WHERE reference_id IN (${cph})`, chunk)?.c || 0);
        db.run(`DELETE FROM stock_movements WHERE reference_id IN (${cph})`, chunk);
        movementsDeleted += before;
      }
      let itemsDeleted = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const cph = chunk.map(() => '?').join(',');
        const before = Number(db.get<any>(`SELECT COUNT(*) AS c FROM transaction_items WHERE transaction_id IN (${cph})`, chunk)?.c || 0);
        db.run(`DELETE FROM transaction_items WHERE transaction_id IN (${cph})`, chunk);
        itemsDeleted += before;
      }
      db.run(`DELETE FROM transactions WHERE id IN (${ph})`, ids);

      // 3b) Sweep rows left dangling by transactions deleted earlier (e.g. a
      // manual cleanup that removed only the transactions row). Those sales
      // already deducted stock, so their qty is restored too. Only SALE
      // movements are touched, so manual stock-in rows (type 'IN',
      // reference_id NULL) always survive.
      const orphanItemRows = db.all<any>(
        'SELECT product_id, quantity FROM transaction_items WHERE transaction_id NOT IN (SELECT id FROM transactions)'
      );
      const orphanItems = orphanItemRows.length;
      db.run('DELETE FROM transaction_items WHERE transaction_id NOT IN (SELECT id FROM transactions)');
      const orphanMovements = Number(db.get<any>(
        "SELECT COUNT(*) AS c FROM stock_movements WHERE type = 'SALE' AND reference_id NOT IN (SELECT id FROM transactions)"
      )?.c || 0);
      db.run("DELETE FROM stock_movements WHERE type = 'SALE' AND reference_id NOT IN (SELECT id FROM transactions)");

      // 4) Restore product stock (sum of sold qty per product).
      let productsUpdated = 0;
      if (restoreStock) {
        const qtyByProduct = new Map<number, number>();
        for (const r of [...itemRows, ...orphanItemRows]) {
          const pid = Number(r.product_id);
          if (!Number.isFinite(pid)) continue;
          qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + (Number(r.quantity) || 0));
        }
        for (const [pid, qty] of qtyByProduct) {
          if (qty <= 0) continue;
          const before = Number(db.get<any>('SELECT stock FROM products WHERE id = ?', [pid])?.stock);
          if (!Number.isFinite(before)) continue;
          db.run('UPDATE products SET stock = ? WHERE id = ?', [before + qty, pid]);
          productsUpdated++;
        }
      }

      // 5) Audit trail (db.run/writeAudit persist to file via this.save()).
      logAudit(req, 'reset_transactions', 'transactions', null, {
        scope,
        start_date: start,
        end_date: end,
        deleted_transactions: ids.length,
        deleted_items: itemsDeleted,
        deleted_stock_movements: movementsDeleted,
        orphan_items_deleted: orphanItems,
        orphan_movements_deleted: orphanMovements,
        stock_restored: restoreStock,
        products_stock_updated: productsUpdated,
        backup_filename: backupFilename,
        actor: admin.username,
      });

      res.json({
        message: `${ids.length} transaksi berhasil dihapus`,
        scope,
        start_date: start,
        end_date: end,
        deleted_transactions: ids.length,
        deleted_items: itemsDeleted,
        deleted_stock_movements: movementsDeleted,
        orphan_items_deleted: orphanItems,
        orphan_movements_deleted: orphanMovements,
        stock_restored: restoreStock,
        products_stock_updated: productsUpdated,
        backup_filename: backupFilename,
      });
    } catch (error: any) {
      console.error('Reset transactions error:', error);
      res.status(500).json({ message: error.message || 'Gagal mereset data transaksi' });
    }
  });

  // ---- Dashboard helpers -------------------------------------------------
  // Transactions store date_time as UTC ISO strings. The business day is the
  // LOCAL day (WIB). These helpers turn a local YYYY-MM-DD into the inclusive
  // UTC bounds [start, end] used for string-range filtering.
  // Dashboard/report date helpers are defined at module level (see below the
  // startup try-block) so BOTH the in-try routes and the module-level
  // /api/transactions route can use them.

  // Summary for TODAY vs YESTERDAY (single response).
  app.get('/api/dashboard/summary', (req, res) => {
    try {
      const now = new Date();
      const today = toLocalDay(now);
      const yesterdayDate = new Date(now);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = toLocalDay(yesterdayDate);

      const todayMetrics = computeDayMetrics(today);
      const yesterdayMetrics = computeDayMetrics(yesterday);

      const pctChange = (curr: number, prev: number): number | null => {
        if (prev === 0) return curr === 0 ? 0 : null; // null = "no baseline"
        return ((curr - prev) / prev) * 100;
      };

      res.json({
        today: {
          date: today,
          ...todayMetrics,
        },
        yesterday: {
          date: yesterday,
          ...yesterdayMetrics,
        },
        change: {
          revenue: pctChange(todayMetrics.revenue, yesterdayMetrics.revenue),
          totalTransactions: pctChange(todayMetrics.totalTransactions, yesterdayMetrics.totalTransactions),
          itemsSold: pctChange(todayMetrics.itemsSold, yesterdayMetrics.itemsSold),
          grossProfit: pctChange(todayMetrics.grossProfit, yesterdayMetrics.grossProfit),
        },
      });
    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({ message: 'Error building summary', error: error.message });
    }
  });

  // Per-day sales & profit for the last N days (including today).
  app.get('/api/dashboard/chart', (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 90);
      const now = new Date();
      const out: { date: string; total_sales: number; total_profit: number }[] = [];

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStr = toLocalDay(d);
        const m = computeDayMetrics(dayStr);
        out.push({
          date: dayStr,
          total_sales: m.revenue,
          total_profit: m.grossProfit,
        });
      }

      res.json({ days, data: out });
    } catch (error) {
      console.error('Dashboard chart error:', error);
      res.status(500).json({ message: 'Error building chart', error: error.message });
    }
  });

  // Top-selling products by quantity (period configurable).
  app.get('/api/dashboard/top-products', (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 365);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5, 1), 50);
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - (days - 1));
      const { start } = localDayBounds(toLocalDay(from));

      const rows = db.all<any>(
        `SELECT ti.product_id AS product_id,
                ti.product_code AS product_code,
                ti.product_name AS product_name,
                SUM(ti.quantity) AS qty_sold,
                SUM(ti.subtotal) AS revenue
           FROM transaction_items ti
           JOIN transactions t ON t.id = ti.transaction_id
          WHERE t.status = 'completed' AND (t.is_test IS NULL OR t.is_test = 0) AND t.date_time >= ?
          GROUP BY ti.product_id, ti.product_code, ti.product_name
          ORDER BY qty_sold DESC
          LIMIT ?`,
        [start, limit]
      );

      res.json({
        days,
        products: rows.map((r: any) => ({
          product_id: r.product_id,
          product_code: r.product_code,
          product_name: r.product_name,
          qty_sold: Number(r.qty_sold) || 0,
          revenue: Number(r.revenue) || 0,
        })),
      });
    } catch (error) {
      console.error('Dashboard top-products error:', error);
      res.status(500).json({ message: 'Error building top products', error: error.message });
    }
  });

  // Products with stock at or below their minimum_stock.
  app.get('/api/dashboard/low-stock', (req, res) => {
    try {
      const rows = db.all<any>(
        `SELECT id, code, description, stock, minimum_stock, unit
           FROM products
          WHERE active = 1 AND stock <= minimum_stock
          ORDER BY (stock - minimum_stock) ASC, stock ASC`
      );
      res.json({ products: rows });
    } catch (error) {
      console.error('Dashboard low-stock error:', error);
      res.status(500).json({ message: 'Error building low stock', error: error.message });
    }
  });

  // ---- Stock IN (Tambah Stok) -------------------------------------------
  app.post('/api/stock-in', (req, res) => {
    try {
      const productId = Number(req.body.product_id);
      const quantity = Number(req.body.quantity);
      const purchasePrice =
        req.body.purchase_price === '' || req.body.purchase_price == null
          ? undefined
          : Number(req.body.purchase_price);
      const note = req.body.note ? String(req.body.note) : undefined;
      const userId = req.body.user_id || null;

      if (!Number.isInteger(productId)) return res.status(400).json({ message: 'Produk tidak valid' });
      if (!Number.isInteger(quantity) || quantity < 1)
        return res.status(400).json({ message: 'Jumlah stok harus bilangan bulat >= 1' });
      if (purchasePrice != null && (!Number.isFinite(purchasePrice) || purchasePrice < 0))
        return res.status(400).json({ message: 'Harga beli tidak valid' });

      const result = db.addStock(productId, quantity, {
        purchase_price: purchasePrice,
        note,
        user_id: userId,
      });

      // NOTIFIKASI — stok benar-benar berubah (addStock selalu menambah > 0).
      try {
        const m = result.movement as any;
        const actor = resolveActorName(req);
        notificationService?.notifyStockChange({
          description: result.product.description,
          code: result.product.code,
          before: Number(m?.stock_before ?? result.product.stock - quantity),
          after: Number(m?.stock_after ?? result.product.stock),
          unit: result.product.unit,
          actor,
        });
        notificationService?.notifyStockLevel({
          description: result.product.description,
          code: result.product.code,
          stock: Number(result.product.stock),
          minimum_stock: Number(result.product.minimum_stock),
          unit: result.product.unit,
        });
      } catch (notifErr: any) {
        console.error('[notif] stock-in gagal (stock tetap sukses):', notifErr?.message || notifErr);
      }

      res.status(201).json({
        movement: result.movement,
        product: result.product,
      });
    } catch (error: any) {
      console.error('Stock-in failed:', error);
      res.status(400).json({ message: error.message || 'Gagal menambah stok' });
    }
  });

  // Recent stock movements (for the right-hand panel)
  app.get('/api/stock-movements', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 200);
      const productId = req.query.product_id ? Number(req.query.product_id) : undefined;
      const rows = db.getStockMovements(productId, limit);
      // enrich with product name/code
      const products = db.getProducts();
      const byId = new Map(products.map((p: any) => [p.id, p]));
      const enriched = rows.map((m: any) => {
        const p: any = byId.get(m.product_id);
        return {
          ...m,
          product_code: p?.code || null,
          product_name: p?.description || null,
          unit: p?.unit || null,
        };
      });
      res.json({ movements: enriched });
    } catch (error) {
      console.error('Stock movements error:', error);
      res.status(500).json({ message: 'Error fetching stock movements', error: error.message });
    }
  });

  // ---- Reports (Laporan) ------------------------------------------------
  // Range helpers are defined at module level (see below the try-block).

  app.get('/api/reports/summary', (req, res) => {
    try {
      const startQ = validDay(req.query.start);
      const endQ = validDay(req.query.end);
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 1, 1), 366);
      let range = startQ && endQ ? { start: startQ, end: endQ } : rangeFromDays(days);
      if (range.start > range.end) range = { start: range.end, end: range.start };
      const metrics = computeRangeMetrics(range.start, range.end);
      res.json(metrics);
    } catch (error) {
      console.error('Reports summary error:', error);
      res.status(500).json({ message: 'Error building report summary', error: error.message });
    }
  });

  // Daily series within a range (for the report bar chart).
  app.get('/api/reports/chart', (req, res) => {
    try {
      const startQ = validDay(req.query.start);
      const endQ = validDay(req.query.end);
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 366);
      let range = startQ && endQ ? { start: startQ, end: endQ } : rangeFromDays(days);
      if (range.start > range.end) range = { start: range.end, end: range.start };

      const out: { date: string; total_sales: number; total_profit: number }[] = [];
      const startD = new Date(`${range.start}T00:00:00`);
      const endD = new Date(`${range.end}T00:00:00`);
      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        const dayStr = toLocalDay(d);
        const m = computeDayMetrics(dayStr);
        out.push({ date: dayStr, total_sales: m.revenue, total_profit: m.grossProfit });
      }
      res.json({ start_date: range.start, end_date: range.end, data: out });
    } catch (error) {
      console.error('Reports chart error:', error);
      res.status(500).json({ message: 'Error building report chart', error: error.message });
    }
  });

  // ---- Profit per product / category ------------------------------------
  app.get('/api/profit/by-product', (req, res) => {
    try {
      const startQ = validDay(req.query.start);
      const endQ = validDay(req.query.end);
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 366);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
      let range = startQ && endQ ? { start: startQ, end: endQ } : rangeFromDays(days);
      if (range.start > range.end) range = { start: range.end, end: range.start };
      const start = new Date(`${range.start}T00:00:00`).toISOString();
      const end = new Date(`${range.end}T23:59:59.999`).toISOString();

      const rows = db.all<any>(
        `SELECT ti.product_id AS product_id, ti.product_code AS product_code, ti.product_name AS product_name,
                p.category AS category,
                SUM(ti.quantity) AS qty_sold,
                SUM(ti.subtotal) AS revenue,
                SUM((ti.unit_price - COALESCE(p.purchase_price,0)) * ti.quantity) AS profit
           FROM transaction_items ti
           JOIN transactions t ON t.id = ti.transaction_id
           LEFT JOIN products p ON p.id = ti.product_id
          WHERE t.status = 'completed' AND (t.is_test IS NULL OR t.is_test = 0) AND t.date_time >= ? AND t.date_time <= ?
          GROUP BY ti.product_id, ti.product_code, ti.product_name, p.category
          ORDER BY profit DESC
          LIMIT ?`,
        [start, end, limit]
      );

      // Category breakdown
      const catRows = db.all<any>(
        `SELECT COALESCE(p.category,'Tanpa Kategori') AS category,
                SUM(ti.quantity) AS qty_sold,
                SUM(ti.subtotal) AS revenue,
                SUM((ti.unit_price - COALESCE(p.purchase_price,0)) * ti.quantity) AS profit
           FROM transaction_items ti
           JOIN transactions t ON t.id = ti.transaction_id
           LEFT JOIN products p ON p.id = ti.product_id
          WHERE t.status = 'completed' AND (t.is_test IS NULL OR t.is_test = 0) AND t.date_time >= ? AND t.date_time <= ?
          GROUP BY COALESCE(p.category,'Tanpa Kategori')
          ORDER BY profit DESC`,
        [start, end]
      );

      const metrics = computeRangeMetrics(range.start, range.end);
      const margin = metrics.revenue > 0 ? (metrics.grossProfit / metrics.revenue) * 100 : 0;

      res.json({
        start_date: range.start,
        end_date: range.end,
        totals: {
          revenue: metrics.revenue,
          grossProfit: metrics.grossProfit,
          cogs: metrics.cogs,
          margin,
        },
        products: rows.map((r: any) => ({
          product_id: r.product_id,
          product_code: r.product_code,
          product_name: r.product_name,
          category: r.category,
          qty_sold: Number(r.qty_sold) || 0,
          revenue: Number(r.revenue) || 0,
          profit: Number(r.profit) || 0,
        })),
        categories: catRows.map((r: any) => ({
          category: r.category,
          qty_sold: Number(r.qty_sold) || 0,
          revenue: Number(r.revenue) || 0,
          profit: Number(r.profit) || 0,
        })),
      });
    } catch (error) {
      console.error('Profit by-product error:', error);
      res.status(500).json({ message: 'Error building profit report', error: error.message });
    }
  });

  // Distinct cashiers (for the Riwayat filter dropdown)
  app.get('/api/cashiers', (req, res) => {
    try {
      const rows = db.all<any>(
        "SELECT DISTINCT cashier_name FROM transactions WHERE cashier_name IS NOT NULL AND cashier_name != '' AND (is_test IS NULL OR is_test = 0) ORDER BY cashier_name"
      );
      res.json({ cashiers: rows.map((r: any) => r.cashier_name) });
    } catch (error) {
      console.error('Cashiers error:', error);
      res.status(500).json({ message: 'Error fetching cashiers', error: error.message });
    }
  });

  // ---- Roles (Batch 3) --------------------------------------------------
  const ALL_PERMISSIONS = [
    'dashboard', 'kiosk', 'products', 'stock-in', 'transactions', 'history',
    'reports', 'profit', 'discounts', 'tax', 'telegram', 'users', 'roles',
    'audit', 'import', 'backup', 'settings',
  ];

  app.get('/api/roles', adminOnly, (req, res) => {
    try {
      const roles = db.all<any>('SELECT * FROM roles ORDER BY is_system DESC, name ASC');
      res.json({ roles, all_permissions: ALL_PERMISSIONS });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const normalizePerms = (p: any): string => {
    if (p == null) return '';
    if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean).join(',');
    return String(p)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .join(',');
  };

  app.post('/api/roles', adminOnly, (req, res) => {
    try {
      const name = String(req.body.name || '').trim().toLowerCase();
      const description = req.body.description ? String(req.body.description) : null;
      const permissions = normalizePerms(req.body.permissions);
      if (!name) return res.status(400).json({ message: 'Nama role wajib diisi' });
      if (!/^[a-z0-9_-]+$/.test(name)) return res.status(400).json({ message: 'Nama role hanya huruf kecil, angka, - dan _' });
      const exists = db.get<any>('SELECT id FROM roles WHERE name = ?', [name]);
      if (exists) return res.status(400).json({ message: `Role "${name}" sudah ada` });
      db.run(
        'INSERT INTO roles (name, description, permissions, is_system, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
        [name, description, permissions, new Date().toISOString(), new Date().toISOString()]
      );
      const createdRole = db.get<any>('SELECT * FROM roles ORDER BY id DESC LIMIT 1');
      logAudit(req, 'create', 'role', createdRole?.id ?? null, createdRole);
      res.status(201).json({ role: createdRole });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal membuat role' });
    }
  });

  app.put('/api/roles/:id', adminOnly, (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.get<any>('SELECT * FROM roles WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ message: 'Role tidak ditemukan' });
      const description = req.body.description != null ? String(req.body.description) : existing.description;
      const permissions = req.body.permissions != null ? normalizePerms(req.body.permissions) : existing.permissions;
      // name is immutable for system roles; allow rename for custom roles
      let name = existing.name;
      if (existing.is_system !== 1 && req.body.name != null) {
        name = String(req.body.name).trim().toLowerCase();
        if (!name) return res.status(400).json({ message: 'Nama role wajib diisi' });
        if (name !== existing.name) {
          const dup = db.get<any>('SELECT id FROM roles WHERE name = ?', [name]);
          if (dup) return res.status(400).json({ message: `Role "${name}" sudah ada` });
          // keep users in sync if role name changes
          db.run('UPDATE users SET role = ? WHERE role = ?', [name, existing.name]);
        }
      }
      db.run('UPDATE roles SET name = ?, description = ?, permissions = ?, updated_at = ? WHERE id = ?', [
        name, description, permissions, new Date().toISOString(), id,
      ]);
      const updatedRole = db.get<any>('SELECT * FROM roles WHERE id = ?', [id]);
      logAudit(req, 'update', 'role', id, { before: existing, after: updatedRole });
      res.json({ role: updatedRole });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal mengupdate role' });
    }
  });

  app.delete('/api/roles/:id', adminOnly, (req, res) => {
    try {
      const id = Number(req.params.id);
      const role = db.get<any>('SELECT * FROM roles WHERE id = ?', [id]);
      if (!role) return res.status(404).json({ message: 'Role tidak ditemukan' });
      if (role.is_system === 1) return res.status(400).json({ message: 'Role bawaan tidak dapat dihapus' });
      const used = db.get<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE role = ?', [role.name]);
      if ((used?.count || 0) > 0) {
        return res.status(400).json({ message: `Role masih dipakai oleh ${used!.count} user` });
      }
      db.run('DELETE FROM roles WHERE id = ?', [id]);
      logAudit(req, 'delete', 'role', id, role);
      res.json({ message: 'Role dihapus' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menghapus role' });
    }
  });

  // ---- Users (Batch 3) --------------------------------------------------
  const publicUser = (u: any) => ({
    id: u.id, username: u.username, name: u.name, role: u.role,
    email: u.email || null, active: u.active, created_at: u.created_at,
  });

  app.get('/api/users', adminOnly, (req, res) => {
    try {
      const users = db.all<any>('SELECT id, username, name, role, email, active, created_at FROM users ORDER BY created_at ASC');
      res.json({ users: users.map(publicUser) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const ensureActiveAdmin = (excludeId?: string) => {
    const admins = db.all<any>("SELECT id FROM users WHERE role = 'admin' AND active = 1");
    const remaining = admins.filter((a) => a.id !== excludeId);
    return remaining.length > 0;
  };

  app.post('/api/users', adminOnly, (req, res) => {
    try {
      const username = String(req.body.username || '').trim();
      const name = String(req.body.name || '').trim();
      const role = String(req.body.role || '').trim();
      const email = req.body.email ? String(req.body.email).trim() : null;
      const password = String(req.body.password || '');
      const active = req.body.active === false ? 0 : 1;

      if (!username || !name || !role) return res.status(400).json({ message: 'Username, nama, dan role wajib diisi' });
      if (!password || password.length < 4) return res.status(400).json({ message: 'Password minimal 4 karakter' });
      const roleRow = db.get<any>('SELECT id FROM roles WHERE name = ?', [role]);
      if (!roleRow) return res.status(400).json({ message: `Role "${role}" tidak valid` });
      const dup = db.get<any>('SELECT id FROM users WHERE username = ?', [username]);
      if (dup) return res.status(400).json({ message: `Username "${username}" sudah dipakai` });

      const id = 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const hash = hashPassword(password);
      db.run(
        'INSERT INTO users (id, username, password_hash, role, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, username, hash, role, name, active, new Date().toISOString(), new Date().toISOString()]
      );
      // store email if column exists (added via migrate)
      if (email != null) {
        try { db.run('UPDATE users SET email = ? WHERE id = ?', [email, id]); } catch { /* email col may not exist */ }
      }
      const createdUser = publicUser(db.get<any>('SELECT id, username, name, role, email, active, created_at FROM users WHERE id = ?', [id]));
      logAudit(req, 'create', 'user', id, { username, name, role, active });
      res.status(201).json({ user: createdUser });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal membuat user' });
    }
  });

  app.put('/api/users/:id', adminOnly, (req, res) => {
    try {
      const id = String(req.params.id);
      const user = db.get<any>('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

      const name = req.body.name != null ? String(req.body.name).trim() : user.name;
      const role = req.body.role != null ? String(req.body.role).trim() : user.role;
      const active = req.body.active != null ? (req.body.active === false || req.body.active === 0 ? 0 : 1) : user.active;
      const email = req.body.email != null ? String(req.body.email).trim() : (user.email || null);
      const password = req.body.password ? String(req.body.password) : '';

      if (!name) return res.status(400).json({ message: 'Nama wajib diisi' });
      const roleRow = db.get<any>('SELECT id FROM roles WHERE name = ?', [role]);
      if (!roleRow) return res.status(400).json({ message: `Role "${role}" tidak valid` });

      // Safety: never allow removing the last active admin (self-lockout guard).
      const wasActiveAdmin = user.role === 'admin' && user.active === 1;
      const willRemainAdmin = role === 'admin' && active === 1;
      if (wasActiveAdmin && !willRemainAdmin && !ensureActiveAdmin(id)) {
        return res.status(400).json({ message: 'Harus ada minimal 1 admin aktif. Perubahan ditolak.' });
      }

      if (password) {
        if (password.length < 4) return res.status(400).json({ message: 'Password minimal 4 karakter' });
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), id]);
      }
      db.run('UPDATE users SET name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?', [
        name, role, active, new Date().toISOString(), id,
      ]);
      if (email != null) {
        try { db.run('UPDATE users SET email = ? WHERE id = ?', [email, id]); } catch { /* ignore */ }
      }
      const updatedUser = publicUser(db.get<any>('SELECT id, username, name, role, email, active, created_at FROM users WHERE id = ?', [id]));
      logAudit(req, 'update', 'user', id, {
        before: { name: user.name, role: user.role, active: user.active },
        after: { name, role, active },
        password_changed: !!password,
      });
      res.json({ user: updatedUser });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal mengupdate user' });
    }
  });

  app.delete('/api/users/:id', adminOnly, (req, res) => {
    try {
      const id = String(req.params.id);
      const user = db.get<any>('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
      if (user.role === 'admin' && user.active === 1 && !ensureActiveAdmin(id)) {
        return res.status(400).json({ message: 'Tidak bisa menghapus admin aktif terakhir' });
      }
      db.run('DELETE FROM users WHERE id = ?', [id]);
      logAudit(req, 'delete', 'user', id, { username: user.username, name: user.name, role: user.role });
      res.json({ message: 'User dihapus' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menghapus user' });
    }
  });

  // ---- Audit Log (Batch 4) ----------------------------------------------
  app.get('/api/audit-log', adminOnly, (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 200, 1), 1000);
      const username = req.query.username as string;
      const action = req.query.action as string;
      const entity = req.query.entity as string;
      const start = validDay(req.query.start);
      const end = validDay(req.query.end);

      let sql = 'SELECT * FROM audit_log WHERE 1=1';
      const params: any[] = [];
      if (username && username.trim()) { sql += ' AND username = ?'; params.push(username.trim()); }
      if (action && action.trim()) { sql += ' AND action = ?'; params.push(action.trim()); }
      if (entity && entity.trim()) { sql += ' AND entity = ?'; params.push(entity.trim()); }
      if (start && end) {
        const s = new Date(`${start}T00:00:00`).toISOString();
        const e = new Date(`${end}T23:59:59.999`).toISOString();
        sql += ' AND created_at >= ? AND created_at <= ?';
        params.push(s, e);
      }
      sql += ' ORDER BY id DESC LIMIT ?';
      params.push(limit);

      const logs = db.all<any>(sql, params);

      // Distinct values for filter dropdowns
      const usersList = db.all<any>("SELECT DISTINCT username FROM audit_log WHERE username IS NOT NULL ORDER BY username")
        .map((r: any) => r.username);
      const actions = db.all<any>('SELECT DISTINCT action FROM audit_log ORDER BY action').map((r: any) => r.action);
      const entities = db.all<any>('SELECT DISTINCT entity FROM audit_log ORDER BY entity').map((r: any) => r.entity);

      res.json({ logs, filters: { users: usersList, actions, entities } });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ---- App Settings (Batch 4) -------------------------------------------
  const APP_SETTING_KEYS = ['store_name', 'store_address', 'store_phone', 'receipt_footer', 'store_logo'];

  app.get('/api/settings', (req, res) => {
    try {
      const rows = db.all<any>('SELECT key, value FROM settings');
      const map: Record<string, string> = {};
      rows.forEach((r: any) => { map[r.key] = r.value; });
      res.json({ settings: map });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put('/api/settings', adminOnly, (req, res) => {
    try {
      const body = req.body || {};
      const changed: Record<string, string> = {};
      for (const key of APP_SETTING_KEYS) {
        if (body[key] != null) {
          const val = String(body[key]);
          // store_logo is a base64 data URL; cap at ~1MB to keep the DB small.
          if (key === 'store_logo' && val.length > 1_400_000) {
            return res.status(400).json({ message: 'Logo terlalu besar (maks ~1MB)' });
          }
          changed[key] = val;
        }
      }
      if (Object.keys(changed).length === 0) {
        return res.status(400).json({ message: 'Tidak ada pengaturan untuk disimpan' });
      }
      for (const [key, value] of Object.entries(changed)) {
        const existing = db.get<any>('SELECT key FROM settings WHERE key = ?', [key]);
        if (existing) {
          db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, new Date().toISOString(), key]);
        } else {
          db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, new Date().toISOString()]);
        }
      }
      logAudit(req, 'update', 'settings', 'app', changed);
      res.json({ message: 'Pengaturan disimpan', settings: changed });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menyimpan pengaturan' });
    }
  });

  app.post('/api/products', (req, res) => {
    try {
      const product = req.body;
      const description = String(product.description ?? product.name ?? '').trim();
      if (!description) return res.status(400).json({ message: 'Deskripsi produk wajib diisi' });
      const status = product.status === 'Tidak Aktif' ? 'Tidak Aktif' : 'Aktif';
      const newProduct = db.createProduct({
        code: product.code,
        description,
        category: product.category || null,
        variant: product.variant || null,
        thickness: product.thickness || null,
        unit: product.unit || 'pcs',
        purchase_price: Number(product.purchase_price) || 0,
        selling_price: Number(product.selling_price) || 0,
        stock: Number(product.stock) || 0,
        minimum_stock: Number(product.minimum_stock) || 5,
        barcode: product.barcode || null,
        qr_code: product.qr_code || null,
        brand: product.brand ? String(product.brand) : null,
        status,
        note: product.note ? String(product.note) : null,
        ext01: product.ext01 ? String(product.ext01) : null,
        ext02: product.ext02 ? String(product.ext02) : null,
        active: status === 'Aktif',
      });

      res.status(201).json({ product: newProduct });
      logAudit(req, 'create', 'product', newProduct.id ?? null, { code: newProduct.code, description: newProduct.description });

      // NOTIFIKASI PRODUK BARU (+ alert stok awal bila langsung menipis/habis).
      try {
        notificationService?.notifyNewProduct({
          description: newProduct.description,
          code: newProduct.code,
          brand: newProduct.brand,
          category: newProduct.category,
          unit: newProduct.unit,
          stock: Number(newProduct.stock),
          selling_price: Number(newProduct.selling_price),
        });
        if (Number(newProduct.stock) <= Number(newProduct.minimum_stock)) {
          notificationService?.notifyStockLevel({
            description: newProduct.description,
            code: newProduct.code,
            stock: Number(newProduct.stock),
            minimum_stock: Number(newProduct.minimum_stock),
            unit: newProduct.unit,
          });
        }
      } catch (notifErr: any) {
        console.error('[notif] produk baru gagal (create tetap sukses):', notifErr?.message || notifErr);
      }
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(400).json({ message: error.message || 'Failed to create product' });
    }
  });

  app.put('/api/products/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const before = db.getProductById(id);
      if (!before) return res.status(404).json({ message: 'Produk tidak ditemukan' });
      const b = req.body;
      const desc = b.description ?? b.name;
      const status = b.status === 'Tidak Aktif' ? 'Tidak Aktif' : b.status === 'Aktif' ? 'Aktif' : (before as any).status || 'Aktif';
      const updated = db.updateProduct(id, {
        code: b.code ?? (before as any).code,
        description: desc != null ? String(desc) : (before as any).description,
        category: b.category ?? (before as any).category,
        unit: b.unit ?? (before as any).unit,
        purchase_price: b.purchase_price != null ? Number(b.purchase_price) : (before as any).purchase_price,
        selling_price: b.selling_price != null ? Number(b.selling_price) : (before as any).selling_price,
        stock: b.stock != null ? Number(b.stock) : (before as any).stock,
        minimum_stock: b.minimum_stock != null ? Number(b.minimum_stock) : (before as any).minimum_stock,
        barcode: b.barcode !== undefined ? (b.barcode ? String(b.barcode) : null) : (before as any).barcode,
        brand: b.brand !== undefined ? (b.brand ? String(b.brand) : null) : (before as any).brand,
        status,
        note: b.note !== undefined ? (b.note ? String(b.note) : null) : (before as any).note,
        ext01: b.ext01 !== undefined ? (b.ext01 ? String(b.ext01) : null) : (before as any).ext01,
        ext02: b.ext02 !== undefined ? (b.ext02 ? String(b.ext02) : null) : (before as any).ext02,
        active: status === 'Aktif' ? 1 : 0,
      } as any);
      logAudit(req, 'update', 'product', id, {
        before: { description: (before as any).description, status: (before as any).status, selling_price: (before as any).selling_price, minimum_stock: (before as any).minimum_stock, stock: (before as any).stock },
        after: { description: updated?.description, status, selling_price: b.selling_price, minimum_stock: b.minimum_stock, stock: updated?.stock },
      });

      // NOTIFIKASI — hanya bila data benar-benar berubah (anti-spam).
      try {
        const actor = resolveActorName(req);
        const oldPrice = Number((before as any).selling_price);
        const newPrice = Number(updated?.selling_price);
        if (Number.isFinite(newPrice) && newPrice !== oldPrice) {
          notificationService?.notifyPriceChange({
            description: updated!.description,
            code: updated!.code,
            before: oldPrice,
            after: newPrice,
            actor,
          });
        }
        const oldStock = Number((before as any).stock);
        const newStock = Number(updated?.stock);
        if (Number.isFinite(newStock) && newStock !== oldStock) {
          notificationService?.notifyStockChange({
            description: updated!.description,
            code: updated!.code,
            before: oldStock,
            after: newStock,
            unit: updated!.unit,
            actor,
          });
          notificationService?.notifyStockLevel({
            description: updated!.description,
            code: updated!.code,
            stock: newStock,
            minimum_stock: Number(updated!.minimum_stock),
            unit: updated!.unit,
          });
        }
      } catch (notifErr: any) {
        console.error('[notif] update produk gagal (update tetap sukses):', notifErr?.message || notifErr);
      }

      res.json({ product: updated });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal mengupdate produk' });
    }
  });

  app.delete('/api/products/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const before = db.getProductById(id);
      if (!before) return res.status(404).json({ message: 'Produk tidak ditemukan' });
      db.deleteProduct(id);
      logAudit(req, 'delete', 'product', id, { code: (before as any).code, description: (before as any).description });
      res.json({ message: 'Produk dihapus' });
    } catch (error: any) {
      res.status(400).json({ message: error.message || 'Gagal menghapus produk' });
    }
  });

  app.post('/api/transactions', (req, res) => {
    // ---- IDEMPOTENCY CHECKOUT (header `Idempotency-Key`) ------------------
    // Satu aksi checkout = satu key. Request PERTAMA yang berhasil mengklaim
    // key membuat transaksi; request berikutnya dengan key yang sama TIDAK
    // membuat transaksi/stok/movement/notifikasi baru, melainkan menerima
    // replay respons transaksi pertama (status 201 + header
    // `Idempotency-Replayed: true`).
    // Tanpa header → perilaku lama dipertahankan (kompatibel dengan client lama).
    const idemKeyHeader = (req.get('Idempotency-Key') || req.get('idempotency-key') || '').trim();
    const idemKey = idemKeyHeader.length > 0 && idemKeyHeader.length <= 128 ? idemKeyHeader : null;
    let idemClaimed = false;

    try {
      console.log('=== BACKEND SERVER - RECEIVING TRANSACTION ===');
      console.log('Request Body:', req.body);

      if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
        return res.status(400).json({ message: 'Keranjang kosong' });
      }

      // FIX: the cashier is always the LOGGED-IN user from the auth token, so
      // a checkout can never be stored as "Unknown User"/"guest".
      const authUser = resolveAuthUser(req);
      if (!authUser) {
        return res.status(401).json({ message: 'Harap login sebagai kasir sebelum melakukan transaksi' });
      }
      req.authUser = authUser; // konsistensi audit: pelaku = sesi terverifikasi
      console.log('Cashier (from token):', { id: authUser.id, name: authUser.name });

      // Klaim idempotency SETELAH auth, SEBELUM validasi/pembuatan transaksi,
      // sehingga semua jalur gagal melepas klaim (retry tidak terblokir).
      if (idemKey) {
        const claim = db.claimIdempotency(idemKey);
        if (!claim.claimed) {
          const row = claim.row;
          if (row && row.status === 'done' && row.response) {
            console.log('[idempotency] replay transaksi:', row.transaction_id);
            res.set('Idempotency-Replayed', 'true');
            return res.status(201).json(JSON.parse(row.response));
          }
          // Request lain masih memproses key yang sama → tolak dengan aman
          // (tidak ada transaksi/stok/movement/notifikasi yang dibuat).
          console.log('[idempotency] key sedang diproses request lain:', idemKey);
          return res.status(409).json({
            message: 'Checkout dengan Idempotency-Key yang sama sedang diproses. Tidak ada transaksi baru yang dibuat.',
            duplicate: true,
          });
        }
        idemClaimed = true;
      }

      const items = req.body.items.map((input: any) => {
        const product = db.getProductById(Number(input.product_id));
        const quantity = Number(input.quantity);
        if (!product || !Number.isInteger(quantity) || quantity < 1) throw new Error('Item transaksi tidak valid');
        console.log('Processing item:', input, 'Product:', product.description);

        if (product.status === 'Tidak Aktif')
          throw new Error(`Produk ${product.description} tidak aktif dan tidak bisa dijual`);
        // Produk tanpa harga jual (data gudang belum diisi) TIDAK BOLEH dijual
        // Rp 0 tanpa sengaja — kasir harus mengisi harga dulu di Admin.
        if (!(Number(product.selling_price) > 0))
          throw new Error(`Harga jual ${product.description} belum diisi — lengkapi di menu Produk sebelum menjual`);
        if (product.stock < quantity) throw new Error(`Stok ${product.description} tidak mencukupi`);
        return {
          transaction_id: '',
          product_id: product.id!,
          product_code: product.code,
          product_name: product.description,
          quantity,
          unit_price: product.selling_price,
          subtotal: product.selling_price * quantity,
          discount_amount: 0,
          final_price: product.selling_price,
        };
      });
      const subtotal = items.reduce((sum: number, item: any) => sum + item.subtotal, 0);
      // Transaksi ditandai testing (is_test=1) HANYA bila SELURUH item berasal
      // dari produk testing (konvensi kode TMP-*). Transaksi produk normal tetap
      // is_test=0 sehingga metrik bisnis tidak tercemar.
      const isTestTransaction = items.length > 0 && items.every((it: any) => /^TMP-/i.test(String(it.product_code || '')));
      // Build scope-aware cart lines (category needed for category-scoped rules)
      const cartLines = items.map((it: any) => {
        const p = db.getProductById(Number(it.product_id));
        return {
          product_code: it.product_code,
          category: (p as any)?.category || null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          subtotal: it.subtotal,
        };
      });
      const discount = new DiscountService().calculateDiscount(cartLines);
      const taxable = subtotal - discount.discountAmount;
      const taxAmount = new TaxService().calculateTax(taxable);
      const grandTotal = taxable + taxAmount;
      const paymentAmount = Number(req.body.payment_amount);
      if (!Number.isFinite(paymentAmount) || paymentAmount < grandTotal) throw new Error('Uang pembayaran kurang');

        // Generate unique transaction ID using crypto.randomUUID() (no extra dependency needed)
        const transactionId = `TRX-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        
        const result = db.createTransaction({
          reference_no: transactionId,
          date_time: new Date().toISOString(),
          subtotal,
          discount_amount: discount.discountAmount,
          discount_type: discount.discountType,
          tax_amount: taxAmount,
          grand_total: grandTotal,
          payment_amount: paymentAmount,
          change_amount: paymentAmount - grandTotal,
          status: 'completed',
          user_id: authUser.id,
          cashier_name: authUser.name || authUser.username,
          is_test: isTestTransaction ? 1 : 0,
        } as any, items);
        
        console.log('=== TRANSACTION SAVED TO DATABASE ===');
        console.log('Transaction ID:', result.transaction.id);
        console.log('Cashier Name saved:', result.transaction.cashier_name);

        // NOTIFIKASI TELEGRAM — dibungkus try/catch: kegagalan notifikasi TIDAK
        // boleh menggagalkan transaksi yang sudah tersimpan.
        try {
          notificationService?.notifyCheckout({
            reference_no: result.transaction.reference_no || transactionId,
            date_time: result.transaction.date_time || new Date().toISOString(),
            cashier_name: result.transaction.cashier_name || authUser.name || authUser.username,
            grand_total: result.transaction.grand_total ?? grandTotal,
            items: items.map((it: any) => {
              const p = db.getProductById(Number(it.product_id));
              return { name: it.product_name, quantity: it.quantity, unit: (p as any)?.unit || null };
            }),
          });
          // Cek kondisi stok BARU tiap item (maks 1 alert per produk: habis > menipis)
          for (const it of items) {
            const p = db.getProductById(Number(it.product_id));
            if (!p) continue;
            notificationService?.notifyStockLevel({
              description: p.description,
              code: p.code,
              stock: Number(p.stock),
              minimum_stock: Number(p.minimum_stock),
              unit: p.unit,
            });
          }
        } catch (notifErr: any) {
          console.error('[notif] checkout notify gagal (transaksi tetap sukses):', notifErr?.message || notifErr);
        }

      const payload = {
        ...result,
        discount: {
          amount: discount.discountAmount,
          ruleName: discount.ruleName || null,
          scopeType: discount.scopeType || 'all',
          affectedProductCodes: discount.affectedProductCodes || [],
        },
      };

      // Tutup klaim idempotency SEBELUM respons dikirim: duplikat berikutnya
      // akan menerima payload ini kembali tanpa memproses ulang.
      if (idemKey && idemClaimed) {
        db.finishIdempotency(idemKey, result.transaction.id, payload);
        idemClaimed = false;
      }

      res.status(201).json(payload);
    } catch (error) {
      // Checkout GAGAL → lepaskan klaim supaya retry dengan key yang sama
      // tidak terblokir oleh percobaan yang gagal ini.
      if (idemClaimed && idemKey) db.releaseIdempotency(idemKey);
      console.error('Checkout failed:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Transaksi gagal' });
    }
  });

  app.post('/api/notifications/process', async (req, res) => {
    try {
      const result = await notificationService.processQueue();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/notifications/queue', (req, res) => {
    res.json({
      pending: notificationService?.getPendingCount() || 0,
      failed: notificationService?.getFailedCount() || 0,
    });
  });

  // Authentication endpoints
  // Token ditandatangani & kedaluwarsa (lihat createToken di atas).
  const generateToken = (user: any): string => createToken(user.username);

  // Resolve the menu permissions for a user's role. `admin` always gets ALL.
  const ALL_MENU_IDS = [
    'dashboard', 'kiosk', 'products', 'stock-in', 'transactions', 'history',
    'reports', 'profit', 'discounts', 'tax', 'telegram', 'users', 'roles',
    'audit', 'import', 'backup', 'settings',
  ];
  const resolvePermissions = (roleName: string): string[] => {
    if (roleName === 'admin') return [...ALL_MENU_IDS];
    try {
      const role = db.get<{ permissions: string }>('SELECT permissions FROM roles WHERE name = ?', [roleName]);
      if (!role || !role.permissions) return [];
      return role.permissions.split(',').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  };

  // Session check: mengembalikan user & permission TERBARU dari database.
  // Dipakai frontend saat boot supaya role/permission di localStorage tidak
  // bisa diedit manual lewat DevTools (localStorage/sessionStorage bypass).
  app.get('/api/auth/me', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: resolvePermissions(user.role),
      },
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Username and password required' });
      }

      // Satu-satunya sumber kebenaran: baris user di database.
      // - user harus ada DAN aktif (active = 1)
      // - TIDAK ada fallback hardcoded (admin/123456) atau pencocokan
      //   password terhadap nilai hash secara plaintext.
      const userResult = db.all<any>(
        "SELECT * FROM users WHERE username = ? AND active = 1",
        [username.trim()]
      );

      if (!userResult || userResult.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = userResult[0];

      if (!verifyPassword(password, user.password_hash)) {
        console.log(`Failed login attempt for user: ${username}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = generateToken(user);
      const userResponse = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: resolvePermissions(user.role),
      };

      console.log(`Successful login for user: ${username}, role: ${user.role}, perms: ${userResponse.permissions.length}`);

      db.writeAudit({
        user_id: user.id,
        username: user.username,
        action: 'login',
        entity: 'auth',
        entity_id: user.id,
        detail: { role: user.role },
      });

      res.json({
        success: true,
        token,
        user: userResponse,
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during authentication' });
    }
  });

  // Catatan: middleware global authMiddleware lama DIHAPUS — middleware itu
  // tidak pernah dipasang (tidak ada `app.use(authMiddleware)`) dan memverifikasi
  // token tanpa signature. Proteksi endpoint kini memakai adminOnly/authOnly
  // (berbasis verifyToken + lookup user aktif di database).

  // Start server
  console.log('');
  console.log('=' .repeat(50));
  console.log('SERVER RUNNING SUCCESSFULLY!');
  console.log('=' .repeat(50));
  console.log(`Port: ${PORT}`);
  console.log(`Database: ${path.join(__dirname, 'data', 'kasirku.db')}`);
  console.log('');
  
  if (telegramEnabled) {
    console.log('Telegram: ENABLED');
    console.log('Auto-sync: Every 60 seconds');
  } else {
    console.log('Telegram: DISABLED (local queue only)');
    console.log('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to enable');
  }
  
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('=' .repeat(50));
  console.log('');

} catch (error) {
  console.error('');
  console.error('=' .repeat(50));
  console.error('CRITICAL ERROR ON STARTUP');
  console.error('=' .repeat(50));
  console.error(error);
  console.error('');
  console.error('Check your configuration and dependencies.');
  console.error('');
  process.exit(1);
}

// Add transaction endpoints after error handling
  app.get('/api/transactions', authOnly, (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      const dateFilter = req.query.date as string; // e.g. "2026-09-24" from KioskHistoryPage
      const startQ = validDay(req.query.start);     // admin range start
      const endQ = validDay(req.query.end);         // admin range end
      const cashier = req.query.cashier as string;  // admin cashier filter
      
      let sql = "SELECT * FROM transactions WHERE 1=1";
      const params: any[] = [];
      
      if (status && ['completed', 'cancelled', 'pending'].includes(status)) {
        sql += " AND status = ?";
        params.push(status);
      }
      
      // FIX: Support the `date` query param sent by KioskHistoryPage.tsx.
      // Previously it was silently ignored -> date filter on Riwayat did nothing.
      // date_time is stored as UTC ISO (e.g. "2026-09-24T14:34:59.019Z").
      // The user picks a LOCAL calendar day, so we compute the local-day range
      // and convert to UTC ISO bounds. String comparison is safe because ISO-8601
      // sorts lexicographically. This avoids the naive toISOString().slice(0,10)
      // bug that mislabels transactions near midnight (e.g. 06:30 WIB = 23:30Z prev day).
      if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
        const startLocal = new Date(`${dateFilter}T00:00:00`); // parsed as LOCAL time (no Z)
        const endLocal = new Date(`${dateFilter}T23:59:59.999`);
        sql += " AND date_time >= ? AND date_time <= ?";
        params.push(startLocal.toISOString(), endLocal.toISOString());
      }

      // Admin range filter (start/end local days, inclusive)
      if (startQ && endQ && !dateFilter) {
        const s = new Date(`${startQ}T00:00:00`).toISOString();
        const e = new Date(`${endQ}T23:59:59.999`).toISOString();
        sql += " AND date_time >= ? AND date_time <= ?";
        params.push(s, e);
      }

      // Cashier filter
      if (cashier && cashier.trim()) {
        sql += " AND cashier_name = ?";
        params.push(cashier.trim());
      }
      
      // Exclude test transactions by default (is_test=1 are test/E2E data)
      sql += " AND (is_test IS NULL OR is_test = 0)";
      
      // Use correct column name from database schema
      sql += " ORDER BY date_time DESC LIMIT ?";
      params.push(limit);
      const transactions = db.all<any>(sql, params);
      console.log(`Found ${transactions.length} transactions`);
      
      // Fetch transaction items for each transaction
      const result = transactions.map((tx: any) => {
        try {
          const items = db.all<any>(
            "SELECT * FROM transaction_items WHERE transaction_id = ?",
            [tx.id]
          );
          
          return {
            ...tx,
            items,
          };
        } catch (itemError) {
          console.error(`Error fetching items for transaction ${tx.id}:`, itemError);
          return {
            ...tx,
            items: [],
          };
        }
      });
      
      console.log(`Returning ${result.length} transactions with items`);
      // FIX: Frontend expects { transactions: [...] } (matches /api/products
      // convention `res.json({ products })`). Returning the bare array caused
      // response.data.transactions === undefined -> pages showed 0 transactions.
      res.json({ transactions: result });
    } catch (error) {
      console.error('❌ ERROR fetching transactions:', error);
      console.error('Stack:', error.stack);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  app.get('/api/transactions/:id', authOnly, (req, res) => {
  try {
    // FIX: transaction id is a nanoid STRING (e.g. "mxdlfmm2klag9xv2bhyx7"), not an integer.
    // parseInt() on it yields NaN -> query never matches -> always 404.
    const id = req.params.id;
    const transaction = db.get<any>(
      "SELECT * FROM transactions WHERE id = ?",
      [id]
    );
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const items = db.all<any>(
      "SELECT * FROM transaction_items WHERE transaction_id = ?",
      [id]
    );
    
    res.json({
      ...transaction,
      items,
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---- Serve the built frontend (dist/) so ONE server runs everything --------
// Run `npm run build` to produce dist/. Then the backend serves both the API
// and the SPA on the same port (3000). Falls through harmlessly if dist is
// absent (dev mode with Vite on :5173 still works).
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback: any non-API GET returns index.html so client routing works.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`[OK] Serving frontend from ${DIST_DIR}`);
} else {
  console.log('[INFO] dist/ not found - only API is served (run `npm run build` for the web UI)');
}

console.log('BEFORE LISTEN');
const httpServer = app.listen(PORT, () => {
  console.log('SERVER STARTED ON PORT', PORT);
});

// Graceful shutdown: flush the in-memory DB to disk and release the lock so a
// restart never loses the latest writes.
const shutdown = (signal: string) => {
  console.log(`\n[SHUTDOWN] ${signal} received - flushing database...`);
  try {
    db.flush();
    db.close();
    console.log('[SHUTDOWN] Database flushed & lock released.');
  } catch (e: any) {
    console.error('[SHUTDOWN] Flush failed:', e.message);
  }
  httpServer.close(() => process.exit(0));
  // Failsafe: force-exit if close hangs
  setTimeout(() => process.exit(0), 3000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
