import { getDatabase } from '../lib/db';

// Batas percobaan pengiriman. Setelah ini, baris ditandai 'failed' dengan
// retry_count tinggi dan TIDAK dicoba lagi (mencegah infinite retry).
const MAX_RETRIES = 3;

// Pengaman system error notification (modul level, berlaku lintas instance).
const ERROR_COOLDOWN_MS = 5 * 60 * 1000; // error identik: maks 1 per 5 menit
const ERROR_RATE_WINDOW_MS = 10 * 60 * 1000; // jendela rate limit
const ERROR_RATE_MAX = 5; // maks 5 error notification per 10 menit
const errorGuardState = {
  lastByFingerprint: new Map<string, number>(),
  recentSends: [] as number[],
};

/**
 * Bersihkan teks error dari data sensitif sebelum dikirim ke Telegram.
 * Menghapus: bot token, password/pin, bearer/authorization, cookie, generic secret.
 */
export function sanitizeErrorText(error: unknown, botToken?: string): string {
  let text = '';
  try {
    if (error instanceof Error) text = error.message || String(error.name);
    else if (typeof error === 'string') text = error;
    else {
      try {
        text = JSON.stringify(error);
      } catch {
        text = String(error);
      }
    }
  } catch {
    text = 'Unknown error';
  }

  text = String(text);
  if (botToken) text = text.split(botToken).join('***TOKEN***');
  return text
    .replace(/bot\d+:[A-Za-z0-9_-]{20,}/g, 'bot***') // t.me bot token
    .replace(/(password|passwd|pwd|pin)\s*[:=]\s*\S+/gi, '$1=***')
    .replace(/scrypt\$[0-9a-f]+\$[0-9a-f]+/gi, 'scrypt$***') // password hash
    .replace(/kasirku_\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'kasirku_***') // session token
    .replace(/(authorization|cookie|set-cookie)\s*[:=]\s*[^\n,;]+/gi, '$1=***')
    .replace(/(api[_-]?key|secret|token|chat[_-]?id)\s*[:=]\s*[^\s\n,;]+/gi, '$1=***')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

export class NotificationService {
  private db;
  private TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  private TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.db = getDatabase();
    this.loadConfigFromSettings();
  }

  /**
   * Muat konfigurasi. Settings Admin menimpa .env bila ada, sehingga perubahan
   * Bot Token / Chat ID dari halaman Telegram langsung dipakai tanpa restart.
   */
  private loadConfigFromSettings(): void {
    try {
      const token = this.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'telegram_bot_token'");
      const chat = this.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'telegram_chat_id'");
      if (token && token.value) this.TELEGRAM_BOT_TOKEN = String(token.value).trim();
      if (chat && chat.value) this.TELEGRAM_CHAT_ID = String(chat.value).trim();
    } catch {
      // settings table may not exist yet
    }
  }

  /** Apakah kredensial tersedia (dari .env atau Settings Admin). */
  isConfigured(): boolean {
    this.loadConfigFromSettings();
    return Boolean(this.TELEGRAM_BOT_TOKEN && this.TELEGRAM_CHAT_ID);
  }

  private redact(text: string): string {
    // Jangan pernah kirim token/secret. Sensor bila tak sengaja muncul.
    let out = text;
    if (this.TELEGRAM_BOT_TOKEN) out = out.split(this.TELEGRAM_BOT_TOKEN).join('***TOKEN***');
    return out.replace(/bot\d+:[\w-]{20,}/g, 'bot***');
  }

  /** Effective config (for the admin page). Token is masked in the API layer. */
  getConfig(): { bot_token: string; chat_id: string } {
    this.loadConfigFromSettings();
    return { bot_token: this.TELEGRAM_BOT_TOKEN, chat_id: this.TELEGRAM_CHAT_ID };
  }

  /** Persist config to settings (also updates the in-memory values). */
  setConfig(botToken: string, chatId: string): void {
    const upsert = (key: string, value: string) => {
      const existing = this.db.get<{ key: string }>('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing) {
        this.db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, new Date().toISOString(), key]);
      } else {
        this.db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, new Date().toISOString()]);
      }
    };
    upsert('telegram_bot_token', botToken);
    upsert('telegram_chat_id', chatId);
    this.TELEGRAM_BOT_TOKEN = botToken;
    this.TELEGRAM_CHAT_ID = chatId;
  }

  /** Check Telegram connectivity via getMe + getChat. */
  async testConnection(): Promise<{ ok: boolean; message: string; bot?: any; chat?: any }> {
    this.loadConfigFromSettings();
    if (!this.TELEGRAM_BOT_TOKEN || !this.TELEGRAM_CHAT_ID) {
      return { ok: false, message: 'Bot token / chat ID belum dikonfigurasi' };
    }
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}/getMe`);
      const me = await meRes.json();
      if (!me.ok) {
        return { ok: false, message: `Token tidak valid: ${me.description || 'unknown'}` };
      }
      const chatRes = await fetch(
        `https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(this.TELEGRAM_CHAT_ID)}`
      );
      const chat = await chatRes.json();
      if (!chat.ok) {
        return { ok: false, message: `Chat ID tidak valid: ${chat.description || 'unknown'}`, bot: me.result };
      }
      return { ok: true, message: 'Terhubung', bot: me.result, chat: chat.result };
    } catch (e: any) {
      return { ok: false, message: `Gagal menghubungi Telegram: ${e.message}` };
    }
  }

  /**
   * Send a real message DIRECTLY to the configured chat (not just getMe),
   * then record the outcome in notifications_queue so it shows in the history.
   */
  async sendTestNotification(): Promise<{ ok: boolean; message: string; queuedId?: number }> {
    this.loadConfigFromSettings();
    if (!this.TELEGRAM_BOT_TOKEN || !this.TELEGRAM_CHAT_ID) {
      return { ok: false, message: 'Bot token / chat ID belum dikonfigurasi' };
    }

    const text = `Test notifikasi dari KasirKu - ${new Date().toISOString()}`;
    let ok = false;
    let detail = '';

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.TELEGRAM_CHAT_ID,
          text: escapeTelegramHtml(text),
          parse_mode: 'HTML',
        }),
      });
      const json: any = await response.json();
      ok = response.ok && json?.ok === true;
      detail = ok ? 'Pesan test berhasil dikirim' : (json?.description || `HTTP ${response.status}`);
    } catch (e: any) {
      detail = e.message;
    }

    // Record in the queue/history (as a processed row, not pending).
    try {
      this.db.run(
        "INSERT INTO notifications_queue (message, priority, status, retry_count, last_attempt, created_at) VALUES (?, 1, ?, ?, datetime('now'), datetime('now'))",
        [text, ok ? 'sent' : 'failed', ok ? 0 : 1]
      );
    } catch (e) {
      console.error('Failed to record test notification:', e);
    }

    const row = this.db.get<{ id: number }>(
      'SELECT id FROM notifications_queue ORDER BY id DESC LIMIT 1'
    );

    return { ok, message: this.redact(detail), queuedId: row?.id };
  }

  /**
   * Masukkan pesan ke queue. TIDAK PERNAH throw — kegagalan notifikasi tidak
   * boleh menggagalkan alur bisnis (checkout/stok/produk).
   */
  enqueueNotification(message: string, priority: number = 1): void {
    try {
      this.db.run(
        "INSERT INTO notifications_queue (message, priority, status, created_at) VALUES (?, ?, 'pending', datetime('now'))",
        [this.redact(message), priority]
      );
      console.log(`[notif] queued: ${message.split('\n')[0].substring(0, 60)}`);
    } catch (error: any) {
      console.error('[notif] failed to queue (diabaikan):', error?.message || error);
    }
  }

  // ---- Message builders (format mengikuti spesifikasi pemilik toko) -------

  notifyCheckout(t: {
    reference_no: string;
    date_time: string;
    cashier_name: string;
    grand_total: number;
    items: { name: string; quantity: number; unit?: string | null }[];
  }): void {
    const lines = [
      '🛒 <b>TRANSAKSI BARU</b>',
      '',
      `No. Transaksi: ${escapeTelegramHtml(t.reference_no)}`,
      `Waktu: ${escapeTelegramHtml(formatWaktu(t.date_time))}`,
      `Kasir: ${escapeTelegramHtml(t.cashier_name)}`,
      `Total: ${rupiah(t.grand_total)}`,
      '',
      'Item:',
      ...t.items.map((i) => `- ${escapeTelegramHtml(i.name)} × ${i.quantity}${i.unit ? ' ' + escapeTelegramHtml(i.unit) : ''}`),
    ];
    this.enqueueNotification(lines.join('\n'), 1);
  }

  notifyStockChange(p: {
    description: string;
    code: string;
    before: number;
    after: number;
    unit?: string | null;
    actor?: string | null;
  }): void {
    const delta = p.after - p.before;
    const lines = [
      '📦 <b>PERUBAHAN STOK</b>',
      '',
      `Produk: ${escapeTelegramHtml(p.description)}`,
      `Kode: ${escapeTelegramHtml(p.code)}`,
      `Sebelum: ${p.before}${p.unit ? ' ' + escapeTelegramHtml(p.unit) : ''}`,
      `Sesudah: ${p.after}${p.unit ? ' ' + escapeTelegramHtml(p.unit) : ''}`,
      `Perubahan: ${delta > 0 ? '+' : ''}${delta}`,
      `Oleh: ${escapeTelegramHtml(p.actor || 'sistem')}`,
    ];
    this.enqueueNotification(lines.join('\n'), 1);
  }

  /**
   * Alert stok berdasarkan kondisi BARU. Dipanggil hanya saat stok berubah.
   * stock = 0 → HABIS; 0 < stock <= min → MENIPIS; selain itu tidak ada alert.
   * Hanya SATU alert per perubahan (habis menang atas menipis).
   */
  notifyStockLevel(p: {
    description: string;
    code: string;
    stock: number;
    minimum_stock: number;
    unit?: string | null;
  }): void {
    if (Number(p.stock) === 0) {
      this.enqueueNotification(
        [
          '🚨 <b>STOK HABIS</b>',
          '',
          `Produk: ${escapeTelegramHtml(p.description)}`,
          `Kode: ${escapeTelegramHtml(p.code)}`,
          'Stok: 0',
          `Minimum: ${p.minimum_stock}${p.unit ? ' ' + escapeTelegramHtml(p.unit) : ''}`,
        ].join('\n'),
        2
      );
    } else if (Number(p.stock) <= Number(p.minimum_stock)) {
      this.enqueueNotification(
        [
          '⚠️ <b>STOK MENIPIS</b>',
          '',
          `Produk: ${escapeTelegramHtml(p.description)}`,
          `Kode: ${escapeTelegramHtml(p.code)}`,
          `Stok: ${p.stock}${p.unit ? ' ' + escapeTelegramHtml(p.unit) : ''}`,
          `Minimum: ${p.minimum_stock}${p.unit ? ' ' + escapeTelegramHtml(p.unit) : ''}`,
        ].join('\n'),
        2
      );
    }
  }

  notifyNewProduct(p: {
    description: string;
    code: string;
    brand?: string | null;
    category?: string | null;
    unit?: string | null;
    stock?: number;
    selling_price?: number;
  }): void {
    this.enqueueNotification(
      [
        '📦 <b>PRODUK BARU</b>',
        '',
        `Produk: ${escapeTelegramHtml(p.description)}`,
        `Kode: ${escapeTelegramHtml(p.code)}`,
        `Brand: ${escapeTelegramHtml(p.brand || '-')}`,
        `Kategori: ${escapeTelegramHtml(p.category || '-')}`,
        `Unit: ${escapeTelegramHtml(p.unit || '-')}`,
        `Stok awal: ${p.stock ?? 0}`,
        `Harga jual: ${p.selling_price != null && p.selling_price > 0 ? rupiah(p.selling_price) : 'belum diisi'}`,
      ].join('\n'),
      1
    );
  }

  notifyPriceChange(p: {
    description: string;
    code: string;
    before: number;
    after: number;
    actor?: string | null;
  }): void {
    this.enqueueNotification(
      [
        '💰 <b>PERUBAHAN HARGA</b>',
        '',
        `Produk: ${escapeTelegramHtml(p.description)}`,
        `Kode: ${escapeTelegramHtml(p.code)}`,
        `Harga sebelumnya: ${rupiah(p.before)}`,
        `Harga sekarang: ${rupiah(p.after)}`,
        `Oleh: ${escapeTelegramHtml(p.actor || 'sistem')}`,
      ].join('\n'),
      1
    );
  }

  notifySystemError(modul: string, pesan: string): void {
    this.enqueueNotification(
      [
        '🚨 <b>ERROR SISTEM KASIRKU</b>',
        '',
        `Modul: ${escapeTelegramHtml(modul)}`,
        `Waktu: ${escapeTelegramHtml(formatWaktu(new Date().toISOString()))}`,
        `Pesan: ${escapeTelegramHtml(this.redact(pesan).substring(0, 300))}`,
      ].join('\n'),
      3
    );
  }

  /**
   * System error notification yang AMAN:
   * - dedup + cooldown per error (hash pesan)
   * - rate limit global (maks ERROR_RATE_MAX per ERROR_RATE_WINDOW_MS)
   * - sanitize (buang token/secret/cookie/authorization) + truncate
   * - TIDAK pernah throw
   */
  notifySystemErrorSafe(source: string, error: unknown): void {
    try {
      const safeMessage = sanitizeErrorText(error, this.TELEGRAM_BOT_TOKEN);
      const fingerprint = `${source}|${safeMessage}`;
      const now = Date.now();

      // 1) Dedup + cooldown: error identik dalam cooldown diabaikan.
      const last = errorGuardState.lastByFingerprint.get(fingerprint);
      if (last !== undefined && now - last < ERROR_COOLDOWN_MS) {
        console.warn(`[notif] system error dedup (cooldown ${ERROR_COOLDOWN_MS / 1000}s): ${safeMessage.substring(0, 80)}`);
        return;
      }
      errorGuardState.lastByFingerprint.set(fingerprint, now);

      // bersihkan fingerprint lama agar map tidak tumbuh tanpa batas
      if (errorGuardState.lastByFingerprint.size > 200) {
        for (const [k, t] of errorGuardState.lastByFingerprint) {
          if (now - t > ERROR_COOLDOWN_MS) errorGuardState.lastByFingerprint.delete(k);
        }
      }

      // 2) Rate limit global.
      errorGuardState.recentSends = errorGuardState.recentSends.filter((t) => now - t < ERROR_RATE_WINDOW_MS);
      if (errorGuardState.recentSends.length >= ERROR_RATE_MAX) {
        console.warn('[notif] system error rate-limited (dilewati):', safeMessage.substring(0, 80));
        return;
      }
      errorGuardState.recentSends.push(now);

      const env = process.env.NODE_ENV || 'development';
      this.enqueueNotification(
        [
          '⚠️ <b>SYSTEM ERROR</b>',
          '',
          `Error: ${escapeTelegramHtml(safeMessage.substring(0, 300))}`,
          '',
          `Source: ${escapeTelegramHtml(source)}`,
          `Time: ${escapeTelegramHtml(formatWaktu(new Date().toISOString()))}`,
          '',
          'Server: KasirKu',
          `Environment: ${env === 'production' ? 'production' : 'development'}`,
        ].join('\n'),
        3
      );
    } catch (e: any) {
      // Jangan sampai error notification menyebabkan error baru.
      console.error('[notif] notifySystemErrorSafe gagal (diabaikan):', e?.message || e);
    }
  }

  /**
   * Ambil baris yang siap dikirim: 'pending', ATAU 'failed' yang masih di bawah
   * batas retry (supaya kegagalan sementara benar-benar dicoba ulang).
   */
  private fetchProcessable(limit = 50): any[] {
    return this.db.all<any>(
      `SELECT * FROM notifications_queue
        WHERE status = 'pending' OR (status = 'failed' AND retry_count < ?)
        ORDER BY priority DESC, created_at ASC
        LIMIT ?`,
      [MAX_RETRIES, limit]
    );
  }

  async processQueue(): Promise<{ sent: number; failed: number }> {
    this.loadConfigFromSettings(); // pakai token terbaru tanpa restart

    if (!this.TELEGRAM_BOT_TOKEN || !this.TELEGRAM_CHAT_ID) {
      console.warn('[notif] Telegram belum dikonfigurasi - queue tidak diproses');
      return { sent: 0, failed: 0 };
    }

    if (this.isProcessing) {
      return { sent: 0, failed: 0 };
    }

    this.isProcessing = true;
    let sent = 0;
    let failed = 0;
    let pendingNotifications: any[] = [];

    try {
      pendingNotifications = this.fetchProcessable();
      if (pendingNotifications.length) {
        console.log(`[notif] memproses ${pendingNotifications.length} notifikasi...`);
      }

      for (const notif of pendingNotifications) {
        try {
          const response = await fetch(`https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: this.TELEGRAM_CHAT_ID,
              // PENTING: jangan escape seluruh pesan — builder sudah menghasilkan
              // HTML (<b>...</b>) dan hanya data dinamis yang di-escape saat build.
              // Meng-escape di sini membuat tag tampil literal (&lt;b&gt;...).
              text: notif.message,
              parse_mode: 'HTML',
            }),
          });

          const json: any = await response.json().catch(() => ({}));
          if (response.ok && json?.ok !== false) {
            this.db.run(
              "UPDATE notifications_queue SET status = 'sent', last_attempt = datetime('now') WHERE id = ?",
              [notif.id]
            );
            sent++;
            await new Promise((resolve) => setTimeout(resolve, 1000)); // rate limit
          } else {
            throw new Error(json?.description || `HTTP ${response.status}`);
          }
        } catch (error: any) {
          failed++;
          const errMsg = this.redact(String(error?.message || error)).substring(0, 200);
          const nextRetry = (notif.retry_count || 0) + 1;
          console.error(`[notif] gagal kirim id=${notif.id} (percobaan ${nextRetry}): ${errMsg}`);

          // Simpan error + increment retry. status tetap 'failed' supaya masih
          // bisa diproses ulang selama retry_count < MAX_RETRIES.
          this.db.run(
            "UPDATE notifications_queue SET status = 'failed', retry_count = retry_count + 1, last_attempt = datetime('now') WHERE id = ?",
            [notif.id]
          );
        }
      }

      return { sent, failed };
    } catch (error: any) {
      console.error('[notif] queue processing error:', error?.message || error);
      return { sent, failed: failed || pendingNotifications.length };
    } finally {
      this.isProcessing = false;
    }
  }

  startAutoSync(intervalMs: number = 60000): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      // Reload config tiap tick: perubahan dari halaman Admin langsung berlaku.
      this.loadConfigFromSettings();
      if (!this.isConfigured()) return;
      const result = await this.processQueue();
      if (result.sent > 0 || result.failed > 0) {
        console.log(`[notif] auto-sync: ${result.sent} sent, ${result.failed} failed`);
      }
    }, intervalMs);

    console.log(`[notif] auto-sync aktif (setiap ${intervalMs / 1000}s)`);
    this.processQueue();
  }

  stopAutoSync(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[notif] auto-sync dihentikan');
    }
  }

  getPendingCount(): number {
    const result = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM notifications_queue WHERE status = 'pending'"
    );
    return (result as { count: number })?.count || 0;
  }

  getFailedCount(): number {
    const result = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM notifications_queue WHERE status = 'failed'"
    );
    return (result as { count: number })?.count || 0;
  }

  getAllNotifications(limit: number = 100): any[] {
    return this.db.all<any>(
      'SELECT * FROM notifications_queue ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }

  clearProcessedNotifications(): number {
    const result: any = this.db.run(
      "DELETE FROM notifications_queue WHERE status != 'pending'"
    );
    const changes = result?.changes || 0;
    console.log(`[notif] ${changes} notifikasi diproses dihapus`);
    return changes;
  }
}

// ---- Helpers --------------------------------------------------------------

/**
 * Escape untuk parse_mode HTML Telegram. WAJIB supaya underscore pada kode
 * produk (mis. EV_2001) TIDAK berubah jadi italic, dan karakter <, >, & aman.
 */
export function escapeTelegramHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rupiah(n: number): string {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function formatWaktu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Format lokal ringkas: DD/MM/YYYY HH:mm
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default NotificationService;
