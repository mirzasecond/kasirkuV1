import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Product, Transaction, TransactionItem, StockMovement } from '../validators';
import { customAlphabet } from 'nanoid';
import { hashPassword } from '../password';
import { randomBytes } from 'crypto';

// Type declaration for sql.js modules
type SQLInit = typeof initSqlJs;
type SQLDatabase = any;
type SQLStatement = any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', '..', 'data', 'kasirku.db');
const LOCK_PATH = DB_PATH + '.lock';

// Baris klaim idempotency checkout.
// status = 'pending' → request pemilik key sedang memproses checkout.
// status = 'done'    → checkout selesai; `response` berisi respons JSON asli
//                      yang akan di-replay untuk request duplikat.
interface CheckoutIdempotencyRow {
  key: string;
  status: 'pending' | 'done';
  transaction_id: string | null;
  response: string | null;
  created_at: string;
  updated_at: string;
}

// Klaim 'pending' yang lebih tua dari ini dianggap yatim (proses crash di
// tengah checkout) dan boleh diambil alih request berikutnya.
const IDEMPOTENCY_PENDING_STALE_MS = 2 * 60 * 1000;
// Baris 'done' lebih tua dari ini dibersihkan otomatis agar tabel tidak tumbuh.
const IDEMPOTENCY_DONE_TTL_MS = 24 * 60 * 60 * 1000;

class KasirKuDatabase {
  private db: SQLDatabase | null = null;
  private sql: any;
  private nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 21);
  readonly ready: Promise<void>;
  private lockAcquired = false;

  constructor() {
    this.ready = this.initializeSchema();
  }

  /**
   * Acquire an exclusive single-instance lock on the DB file. Two server
   * processes sharing one sql.js in-memory DB would clobber each other on save
   * (each write persists the WHOLE in-memory snapshot), causing recent changes
   * to silently revert. We refuse to start a second instance.
   */
  private acquireLock(): void {
    try {
      if (fs.existsSync(LOCK_PATH)) {
        const raw = fs.readFileSync(LOCK_PATH, 'utf-8').trim();
        const pid = parseInt(raw, 10);
        let alive = false;
        if (Number.isInteger(pid)) {
          try {
            // Signal 0 only checks existence, does not kill.
            process.kill(pid, 0);
            alive = true;
          } catch {
            alive = false;
          }
        }
        if (alive && pid !== process.pid) {
          console.error(`\n❌ FATAL: Another KasirKu server is already running (PID ${pid}).`);
          console.error(`   Only ONE instance may open data/kasirku.db at a time,`);
          console.error(`   otherwise they overwrite each other and data reverts.`);
          console.error(`   Stop the other instance (or delete ${LOCK_PATH} if stale) and retry.`);
          process.exit(1);
        }
        // stale lock -> take over
      }
      fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf-8');
      this.lockAcquired = true;
    } catch (e: any) {
      console.warn('[WARN] Could not create DB lock:', e.message);
    }
  }

  private releaseLock(): void {
    try {
      if (this.lockAcquired && fs.existsSync(LOCK_PATH)) {
        const raw = fs.readFileSync(LOCK_PATH, 'utf-8').trim();
        if (raw === String(process.pid)) fs.unlinkSync(LOCK_PATH);
      }
    } catch { /* ignore */ }
  }

  private async initializeSchema(): Promise<void> {
    try {
      this.acquireLock();
      console.log('📦 Initializing sql.js with WebAssembly...');
      
      const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
      });
      
      this.sql = SQL;
      console.log('✅ sql.js WebAssembly loaded successfully');
      
      // Ensure data directory exists
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Check if database file exists and load it
      if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        this.db = new SQL.Database(buffer);
        console.log(`📂 Loaded existing database from ${DB_PATH}`);
      } else {
        this.db = new SQL.Database();
        console.log('🆕 Created new database');
      }

      this.createTables();
      this.migrateDatabase(); // Run migrations to add any missing columns
      this.seedDefaultData();
      
      // Save to file
      this.save();
      
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  private createTables(): void {
    try {
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          description TEXT NOT NULL,
          brand TEXT,
          status TEXT NOT NULL DEFAULT 'Aktif',
          note TEXT,
          ext01 TEXT,
          ext02 TEXT,
          category TEXT,
          variant TEXT,
          thickness TEXT,
          unit TEXT NOT NULL DEFAULT 'pcs',
          purchase_price REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT 0,
          minimum_stock INTEGER NOT NULL DEFAULT 5,
          barcode TEXT UNIQUE,
          qr_code TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          reference_no TEXT UNIQUE NOT NULL,
          date_time TEXT NOT NULL,
          subtotal REAL NOT NULL,
          discount_amount REAL NOT NULL DEFAULT 0,
          discount_type TEXT CHECK(discount_type IN ('percentage', 'fixed', 'none')) DEFAULT 'none',
          tax_amount REAL NOT NULL DEFAULT 0,
          grand_total REAL NOT NULL,
          payment_amount REAL NOT NULL,
          change_amount REAL NOT NULL,
          status TEXT CHECK(status IN ('pending', 'completed', 'cancelled')) DEFAULT 'completed',
          is_test INTEGER NOT NULL DEFAULT 0
        );
      `);

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS transaction_items (
          id TEXT PRIMARY KEY,
          transaction_id TEXT NOT NULL REFERENCES transactions(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          product_code TEXT NOT NULL,
          product_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          subtotal REAL NOT NULL,
          discount_amount REAL NOT NULL DEFAULT 0,
          final_price REAL NOT NULL
        );
      `);

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id),
          type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'SALE', 'RETURN', 'ADJUSTMENT')),
          quantity INTEGER NOT NULL,
          stock_before INTEGER NOT NULL,
          stock_after INTEGER NOT NULL,
          reference_id TEXT,
          user_id TEXT,
          note TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'developer')),
          name TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS discount_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          discount_type TEXT CHECK(discount_type IN ('percentage', 'fixed')),
          discount_value REAL NOT NULL,
          start_date TEXT,
          end_date TEXT,
          days_of_week TEXT,
          min_purchase REAL DEFAULT 0,
          max_discount REAL,
          active INTEGER DEFAULT 1,
          scope_type TEXT NOT NULL DEFAULT 'all',
          scope_value TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS notifications_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message TEXT NOT NULL,
          priority INTEGER DEFAULT 1,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
          retry_count INTEGER DEFAULT 0,
          last_attempt TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Generic key/value settings store (tax rate, store profile, telegram, ...)
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Roles (referenced by users.role). permissions = comma-separated menu ids.
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          permissions TEXT DEFAULT '',
          is_system INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Audit log: who did what, when. detail = JSON with before/after snapshot.
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          username TEXT,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entity_id TEXT,
          detail TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // CHECKOUT IDEMPOTENCY — mencegah transaksi ganda (double-click, retry
      // jaringan, dua request concurrent). Tabel BARU: tidak menyentuh tabel
      // yang sudah ada sehingga aman untuk database lama (CREATE IF NOT EXISTS).
      // PRIMARY KEY pada `key` adalah kunci keamanannya: hanya SATU request yang
      // bisa men-insert, request lain pasti kena constraint UNIQUE.
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS checkout_idempotency (
          key TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          transaction_id TEXT,
          response TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    } catch (error) {
      console.error('Failed to create tables:', error);
      throw error;
    }
  }

  private migrateDatabase(): void {
    try {
      console.log('Running database migrations...');
      
      const columns = this.db!.exec("PRAGMA table_info(transactions)");
      const hasUserId = columns.some((col: any) => col[1] === 'user_id');
      const hasCashierName = columns.some((col: any) => col[1] === 'cashier_name');
      const hasIsTest = columns.some((col: any) => col[1] === 'is_test');

      // is_test: penanda transaksi E2E/testing. Nilai 1 HANYA bila transaksi
      // dibuat dari produk TMP-* (semua item). Query metrik bisnis mengecualikan
      // is_test = 1 agar data testing tidak mencemari dashboard/laporan.
      if (!hasIsTest) {
        try {
          this.db!.run('ALTER TABLE transactions ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0');
          console.log('Added is_test column to transactions table');
        } catch (e: any) {
          console.log('is_test column already exists or migration failed:', e.message);
        }
      }
      
      if (!hasUserId) {
        try {
          this.db!.run("ALTER TABLE transactions ADD COLUMN user_id TEXT");
          console.log('Added user_id column to transactions table');
        } catch (e: any) {
          console.log('user_id column already exists or migration failed:', e.message);
        }
      } else {
        console.log('user_id column already exists');
      }
      
      if (!hasCashierName) {
        try {
          this.db!.run("ALTER TABLE transactions ADD COLUMN cashier_name TEXT DEFAULT 'Unknown User'");
          console.log('Added cashier_name column to transactions table');
        } catch (e: any) {
          console.log('cashier_name column already exists or migration failed:', e.message);
        }
      } else {
        console.log('cashier_name column already exists');
      }

      // users.email (Batch 3)
      const userCols = this.db!.exec("PRAGMA table_info(users)");
      const hasEmail = userCols.some((col: any) => col[1] === 'email');
      if (!hasEmail) {
        try {
          this.db!.run("ALTER TABLE users ADD COLUMN email TEXT");
          console.log('Added email column to users table');
        } catch (e: any) {
          console.log('email column already exists or migration failed:', e.message);
        }
      }

      // Batch 3: users.role had a hard CHECK(admin/cashier/developer) that
      // blocks custom roles. Rebuild the table WITHOUT that constraint while
      // preserving all existing rows (safe migration).
      const createSql = this.db!.exec(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
      );
      const sqlText = createSql?.[0]?.values?.[0]?.[0] || '';
      if (sqlText.includes("CHECK(role IN")) {
        try {
          console.log('Migrating users table to allow custom roles...');
          this.db!.run('PRAGMA foreign_keys=OFF');
          this.db!.run(`
            CREATE TABLE users_new (
              id TEXT PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL,
              name TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1,
              email TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
          `);
          this.db!.run(`
            INSERT INTO users_new (id, username, password_hash, role, name, active, email, created_at, updated_at)
            SELECT id, username, password_hash, role, name, active,
                   ${this.db!.exec("PRAGMA table_info(users)").some((c: any) => c[1] === 'email') ? 'email' : 'NULL'},
                   created_at, updated_at FROM users;
          `);
          this.db!.run('DROP TABLE users');
          this.db!.run('ALTER TABLE users_new RENAME TO users');
          this.db!.run('PRAGMA foreign_keys=ON');
          this.save();
          console.log('✅ users table migrated (custom roles enabled)');
        } catch (e: any) {
          console.error('users migration failed:', e.message);
        }
      }

      // discount_rules.scope_type / scope_value (product-scoped discounts).
      const discCols = this.db!.exec("PRAGMA table_info(discount_rules)");
      const hasScopeType = discCols.some((c: any) => c[1] === 'scope_type');
      const hasScopeValue = discCols.some((c: any) => c[1] === 'scope_value');
      if (!hasScopeType) {
        try {
          this.db!.run("ALTER TABLE discount_rules ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'all'");
          console.log("Added scope_type column to discount_rules");
        } catch (e: any) {
          console.log('scope_type migration:', e.message);
        }
      }
      if (!hasScopeValue) {
        try {
          this.db!.run("ALTER TABLE discount_rules ADD COLUMN scope_value TEXT");
          console.log('Added scope_value column to discount_rules');
        } catch (e: any) {
          console.log('scope_value migration:', e.message);
        }
      }

      // ---- Spesifikasi final pemilik toko: skema products --------------------
      // 1) RENAME name -> description (data lama dipertahankan apa adanya)
      // 2) TAMBAH brand, status (default 'Aktif'), note, ext01, ext02
      // Backup database dibuat DULU sebelum menyentuh apa pun.
      const productCols = this.db!.exec("PRAGMA table_info(products)");
      // exec() mengembalikan [{ columns, values }] — nama kolom ada di values[][1].
      const productColNames: string[] =
        productCols && productCols[0] && productCols[0].values
          ? productCols[0].values.map((v: any) => String(v[1]))
          : [];
      const hasNameCol = productColNames.includes('name');
      const hasDescriptionCol = productColNames.includes('description');
      const missingCols = ['brand', 'status', 'note', 'ext01', 'ext02'].filter(
        (c) => !productColNames.includes(c)
      );
      console.log(
        `[products] kolom saat ini: ${productColNames.join(', ')} | rename perlu: ${hasNameCol && !hasDescriptionCol} | kolom hilang: ${missingCols.join(',') || '-'}`
      );

      if ((hasNameCol && !hasDescriptionCol) || missingCols.length > 0) {
        // 0) Backup sebelum migrasi — pola sama dengan backup manual:
        //    data/backups/kasirku-backup-<ISO stamp>.db
        try {
          const backupDir = path.join(__dirname, '..', '..', '..', 'data', 'backups');
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          if (fs.existsSync(DB_PATH)) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `kasirku-backup-${stamp}.db`;
            fs.copyFileSync(DB_PATH, path.join(backupDir, backupName));
            console.log(`💾 Backup sebelum migrasi products: data/backups/${backupName}`);
          }
        } catch (e: any) {
          console.error('[migration] Backup sebelum migrasi GAGAL:', e.message);
        }

        // 1) Rename kolom name -> description (data isinya tidak berubah).
        if (hasNameCol && !hasDescriptionCol) {
          try {
            this.db!.run('ALTER TABLE products RENAME COLUMN name TO description');
            console.log('✅ products.name -> products.description (rename kolom)');
          } catch (e: any) {
            // Fallback: rebuild tabel (SQLite lama tanpa RENAME COLUMN).
            console.warn('RENAME COLUMN gagal, pakai rebuild:', e.message);
            try {
              this.db!.run('PRAGMA foreign_keys=OFF');
              this.db!.run(`
                CREATE TABLE products_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  code TEXT UNIQUE NOT NULL,
                  description TEXT NOT NULL,
                  category TEXT,
                  variant TEXT,
                  thickness TEXT,
                  unit TEXT NOT NULL DEFAULT 'pcs',
                  purchase_price REAL NOT NULL DEFAULT 0,
                  selling_price REAL NOT NULL DEFAULT 0,
                  stock INTEGER NOT NULL DEFAULT 0,
                  minimum_stock INTEGER NOT NULL DEFAULT 5,
                  barcode TEXT UNIQUE,
                  qr_code TEXT,
                  active INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
              `);
              this.db!.run(`
                INSERT INTO products_new (id, code, description, category, variant, thickness, unit,
                  purchase_price, selling_price, stock, minimum_stock, barcode, qr_code, active, created_at, updated_at)
                SELECT id, code, name, category, variant, thickness, unit,
                  purchase_price, selling_price, stock, minimum_stock, barcode, qr_code, active, created_at, updated_at
                FROM products;
              `);
              this.db!.run('DROP TABLE products');
              this.db!.run('ALTER TABLE products_new RENAME TO products');
              this.db!.run('PRAGMA foreign_keys=ON');
              console.log('✅ products.name -> products.description (rebuild tabel)');
            } catch (e2: any) {
              console.error('❌ Rebuild products GAGAL:', e2.message);
            }
          }
        }

        // 2) Kolom baru (ALTER ADD COLUMN dengan DEFAULT mengisi baris lama).
        for (const col of missingCols) {
          try {
            if (col === 'status') {
              this.db!.run("ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'Aktif'");
            } else {
              this.db!.run(`ALTER TABLE products ADD COLUMN ${col} TEXT`);
            }
            console.log(`Added products.${col} column`);
          } catch (e: any) {
            console.log(`products.${col} migration:`, e.message);
          }
        }

        // 3) Pastikan SEMUA produk lama berstatus 'Aktif' (hanya saat kolom
        //    status baru saja dibuat — jangan pernah mereset status user).
        if (missingCols.includes('status')) {
          try {
            this.db!.run("UPDATE products SET status = 'Aktif' WHERE status IS NULL OR status = ''");
            this.db!.run('UPDATE products SET active = 1 WHERE status = \'Aktif\'');
            console.log("✅ Semua produk lama diset status='Aktif'");
          } catch (e: any) {
            console.error('Set default status gagal:', e.message);
          }
        }

        this.save();
        console.log('✅ products schema migration selesai');
      }

      console.log('Database migrations complete');
    } catch (error) {
      console.error('Migration error:', error);
    }
  }

  private seedDefaultData(): void {
    if (!this.db) {
      console.warn('[WARN] Database not ready for seeding');
      return;
    }

    // Seed default roles matching the users.role CHECK constraint so existing
    // users never lose their role reference.
    try {
      const defaults = [
        { name: 'admin', description: 'Administrator - akses penuh', permissions: 'ALL', is_system: 1 },
        { name: 'cashier', description: 'Kasir - akses kiosk & transaksi', permissions: 'kiosk,transactions,history', is_system: 1 },
        { name: 'developer', description: 'Developer - tools teknis', permissions: 'backup,import,dashboard,reports', is_system: 1 },
      ];
      for (const r of defaults) {
        const exists = this.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [r.name]);
        if (!exists) {
          this.db!.run(
            'INSERT INTO roles (name, description, permissions, is_system) VALUES (?, ?, ?, ?)',
            [r.name, r.description, r.permissions, r.is_system]
          );
        }
      }
      this.save();
    } catch (error) {
      console.error('[ERROR] Failed to seed default roles:', error);
    }

    try {
      // Seed admin HANYA pada instalasi baru (tabel users benar-benar kosong).
      // Jika user admin dihapus/dinonaktifkan lewat User Management, ia TIDAK
      // akan dibuat ulang, dan tidak pernah ada password default hardcoded
      // (dulu: '$2b$10$default' + backdoor admin/123456 di server).
      const total = this.all("SELECT COUNT(*) as count FROM users");
      const userCount = total && total.length > 0 ? Number((total[0] as any)?.count || 0) : 0;

      if (userCount === 0) {
        const initialPassword = randomBytes(9).toString('base64url');
        this.run(
          "INSERT INTO users (id, username, password_hash, role, name) VALUES (?, ?, ?, ?, ?)",
          [this.nanoid(), 'admin', hashPassword(initialPassword), 'admin', 'Administrator']
        );
        console.log('✅ Default admin user created (password acak, dicetak sekali di console):');
        console.log('   username: admin');
        console.log(`   password: ${initialPassword}`);
        console.log('   -> Segera ganti password setelah login pertama.');
      }
    } catch (error) {
      console.error('[ERROR] Failed to seed default data:', error);
    }
  }

  /**
   * Record an audit log entry. `detail` may be an object (serialized to JSON).
   * Never throws — auditing must not break the main operation.
   */
  writeAudit(entry: {
    user_id?: string | null;
    username?: string | null;
    action: string;
    entity: string;
    entity_id?: string | number | null;
    detail?: any;
    created_at?: string;
  }): void {
    try {
      const detail =
        entry.detail == null
          ? null
          : typeof entry.detail === 'string'
          ? entry.detail
          : JSON.stringify(entry.detail);
      this.db!.run(
        "INSERT INTO audit_log (user_id, username, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          entry.user_id || null,
          entry.username || null,
          entry.action,
          entry.entity,
          entry.entity_id != null ? String(entry.entity_id) : null,
          detail,
          entry.created_at || new Date().toISOString(),
        ]
      );
      this.save();
    } catch (e: any) {
      console.error('[audit] failed to write log:', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // IDEMPOTENCY CHECKOUT
  // ---------------------------------------------------------------------------
  // Klaim memakai INSERT ber-PRIMARY KEY pada `key`. Karena hanya satu INSERT
  // yang bisa sukses, dua request concurrent dengan key yang sama TIDAK BISA
  // sama-sama memproses checkout — pemenang klaim memproses, yang kalah
  // membaca baris pemenang. Ini berbeda dari "cek transaksi terakhir" yang
  // bisa dilewati kedua request bila dicek sebelum ada yang menulis.
  claimIdempotency(key: string): { claimed: boolean; row: CheckoutIdempotencyRow | null } {
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.db!.run(
          `INSERT INTO checkout_idempotency (key, status, transaction_id, response, created_at, updated_at) VALUES (?, 'pending', NULL, NULL, ?, ?)`,
          [key, now, now]
        );
        // Bersihkan klaim lama hanya saat klaim sukses — satu save mencakup
        // keduanya sehingga tabel tidak tumbuh tanpa batas.
        try {
          const cutoff = new Date(Date.now() - IDEMPOTENCY_DONE_TTL_MS).toISOString();
          this.db!.run(`DELETE FROM checkout_idempotency WHERE status = 'done' AND updated_at <= ?`, [cutoff]);
        } catch (e: any) {
          console.error('[idempotency] prune gagal:', e.message);
        }
        this.save();
        return { claimed: true, row: null };
      } catch (e: any) {
        // UNIQUE violation = key sudah dipakai request lain.
        const row = this.get<CheckoutIdempotencyRow>(
          'SELECT * FROM checkout_idempotency WHERE key = ?',
          [key]
        );
        if (!row) continue; // baris raib di tengah jalan → ulangi klaim sekali
        if (row.status === 'done') return { claimed: false, row };
        // Masih 'pending'. Bila sudah tua (proses sebelumnya crash di tengah)
        // ambil alih agar key tidak terkunci selamanya.
        const age = Date.now() - Date.parse(row.updated_at || row.created_at || '');
        if (Number.isFinite(age) && age > IDEMPOTENCY_PENDING_STALE_MS) {
          this.db!.run(`DELETE FROM checkout_idempotency WHERE key = ? AND status = 'pending'`, [key]);
          this.save();
          continue;
        }
        return { claimed: false, row };
      }
    }
    return {
      claimed: false,
      row: this.get<CheckoutIdempotencyRow>('SELECT * FROM checkout_idempotency WHERE key = ?', [key]),
    };
  }

  // Tandai klaim selesai: simpan respons asli untuk di-replay pada duplikat.
  finishIdempotency(key: string, transactionId: string, response: unknown): void {
    try {
      this.db!.run(
        `UPDATE checkout_idempotency SET status = 'done', transaction_id = ?, response = ?, updated_at = ? WHERE key = ? AND status = 'pending'`,
        [transactionId, JSON.stringify(response), new Date().toISOString(), key]
      );
      this.save();
    } catch (e: any) {
      // Gagal menyimpan replay tidak boleh menggagalkan transaksi yang sudah
      // COMMIT — duplikat berikutnya hanya akan diproses ulang oleh klaim baru.
      console.error('[idempotency] finish gagal:', e.message);
    }
  }

  // Lepas klaim (dipanggil saat checkout GAGAL) supaya retry dengan key yang
  // sama tidak terblokir oleh percobaan sebelumnya.
  releaseIdempotency(key: string): void {
    try {
      this.db!.run(`DELETE FROM checkout_idempotency WHERE key = ? AND status = 'pending'`, [key]);
      this.save();
    } catch (e: any) {
      console.error('[idempotency] release gagal:', e.message);
    }
  }

  private save(): void {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      // Atomic write: write to a temp file then rename, so a crash during the
      // write can never leave a half-written/corrupt kasirku.db.
      const tmp = DB_PATH + '.tmp';
      fs.writeFileSync(tmp, buffer);
      // Di Windows, antivirus/indexer bisa sesaat memegang file .tmp atau
      // target sehingga rename gagal EPERM/EBUSY. Retry singkat supaya
      // penulisan tidak hilang (sebelumnya error ini menggagalkan 1 baris impor).
      let lastErr: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.renameSync(tmp, DB_PATH);
          return;
        } catch (e: any) {
          lastErr = e;
          if (!['EPERM', 'EBUSY', 'EACCES'].includes(e?.code)) break;
          const until = Date.now() + 50 * (attempt + 1);
          while (Date.now() < until) { /* busy-wait singkat */ }
        }
      }
      throw lastErr;
    }
  }

  run(sql: string, params: any[] = []): void {
    this.db!.run(sql, params);
    this.save();
  }

  get<T>(sql: string, params: any[] = []): T | null {
    if (!this.db) {
      console.error('Database not initialized');
      return null;
    }
    
    try {
      const result = this.db.exec(sql, params);
      if (result?.[0]?.values?.[0]) {
        const columns = result[0].columns as string[];
        const row = result[0].values[0];
        const obj: any = {};
        columns.forEach((column: string, index: number) => {
          obj[column] = row[index];
        });
        return obj as T;
      }
      return null;
    } catch (error) {
      console.error('SQL get error:', error);
      return null;
    }
  }

  all<T>(sql: string, params: any[] = []): T[] {
    if (!this.db) {
      console.error('Database not initialized');
      return [];
    }
    
    try {
      const result = this.db.exec(sql, params);
      if (!result || result.length === 0) {
        return [];
      }
      
      const columns = result[0].columns as string[];
      const values = result[0].values;
      
      return values.map((row: any[]) => {
        const obj: any = {};
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj as T;
      });
    } catch (error) {
      console.error('SQL all error:', error);
      return [];
    }
  }

  prepare(sql: string) {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: any[]): { changes: number } => {
        const result = stmt.run(...params);
        this.save();
        return result;
      },
    };
  }

  count(sql: string, params: any[] = []): number {
    if (!this.db) {
      console.error('Database not initialized');
      return 0;
    }
    
    try {
      const result = this.get<{count: number}>(sql, params);
      return result?.count || 0;
    } catch (error) {
      console.error('SQL count error:', error);
      return 0;
    }
  }

  createProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Product {
    const now = new Date().toISOString();
    const status = product.status === 'Tidak Aktif' ? 'Tidak Aktif' : 'Aktif';

    try {
      this.db!.run(
        "INSERT INTO products (code, description, brand, status, note, ext01, ext02, category, variant, thickness, unit, purchase_price, selling_price, stock, minimum_stock, barcode, qr_code, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          product.code,
          product.description,
          product.brand ?? null,
          status,
          product.note ?? null,
          product.ext01 ?? null,
          product.ext02 ?? null,
          product.category,
          product.variant,
          product.thickness,
          product.unit,
          product.purchase_price,
          product.selling_price,
          product.stock,
          product.minimum_stock,
          product.barcode,
          product.qr_code,
          status === 'Aktif' ? 1 : 0,
          now,
          now,
        ]
      );

      // Ambil id sebelum save(): save() mengekspor ulang DB ke disk lalu reload
      // state in-memory, sehingga last_insert_rowid() bisa hilang/ter-reset.
      const insertedId = this.db!.exec("SELECT last_insert_rowid() as id")[0].values[0][0];

      // Persist to disk. createProduct used the raw db.run above (no save),
      // so newly created/imported products disappeared on server restart.
      this.save();

      return { ...product, status, active: status === 'Aktif', id: insertedId, created_at: now, updated_at: now };
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  getProductById(id: number): Product | null {
    const row = this.get<Product>("SELECT * FROM products WHERE id = ?", [id]);
    return row;
  }

  getProducts(filter?: { search?: string; category?: string; active?: boolean; status?: string }): Product[] {
    let sql = "SELECT * FROM products WHERE 1=1";
    const params: any[] = [];

    if (filter?.search) {
      sql += " AND (description LIKE ? OR brand LIKE ? OR code LIKE ? OR barcode LIKE ?)";
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }

    if (filter?.category) {
      sql += " AND category = ?";
      params.push(filter.category);
    }

    // Filter status jual: dipakai Mode Kasir (hanya produk 'Aktif' yang boleh
    // tampil di grid kasir) dan bisa dipakai admin untuk menyaring.
    if (filter?.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }

    if (filter?.active !== undefined) {
      sql += " AND active = ?";
      params.push(filter.active ? 1 : 0);
    }

    sql += " ORDER BY description ASC";

    const rows = this.all<any>(sql, params);
    return rows.map((row: any) => ({
      ...row,
      brand: row.brand || null,
      status: row.status || 'Aktif',
      note: row.note || null,
      ext01: row.ext01 ?? null,
      ext02: row.ext02 ?? null,
      category: row.category || null,
      variant: row.variant || null,
      thickness: row.thickness || null,
      barcode: row.barcode || null,
      qr_code: row.qr_code || null,
      active: row.status ? row.status === 'Aktif' : row.active === 1,
      stock: row.stock ?? 0,
      minimum_stock: row.minimum_stock ?? 0,
      purchase_price: row.purchase_price ?? 0,
      selling_price: row.selling_price ?? 0,
    }));
  }

  updateProduct(id: number, updates: Partial<Product>): Product | null {
    const setParts: string[] = [];
    const params: any[] = [];

    for (const key of Object.keys(updates)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        setParts.push(`${key} = ?`);
        params.push(updates[key as keyof Product]);
      }
    }

    setParts.push(`updated_at = ?`);
    params.push(new Date().toISOString());

    const sql = `UPDATE products SET ${setParts.join(', ')} WHERE id = ?`;
    this.run(sql, [...params, id]);

    return this.getProductById(id);
  }

  deleteProduct(id: number): boolean {
    const result = this.db!.run("DELETE FROM products WHERE id = ?", [id]);
    this.save();
    return result.changes > 0;
  }

  decrementStock(product_id: number, quantity: number): boolean {
    try {
      const product = this.get<{ stock: number }>("SELECT stock FROM products WHERE id = ?", [product_id]);
      const stockBefore = product?.stock ?? 0;
      
      if (!product || stockBefore < quantity) {
        return false;
      }

      const newStock = stockBefore - quantity;
      const dateTime = new Date().toISOString();
      
      // Update stock
      this.db!.run(
        "UPDATE products SET stock = ?, updated_at = ? WHERE id = ?",
        [newStock, dateTime, product_id]
      );

      // Create movement record
      this.db!.run(
        "INSERT INTO stock_movements (product_id, type, quantity, stock_before, stock_after, reference_id, created_at) VALUES (?, 'SALE', ?, ?, ?, ?, ?)",
        [product_id, quantity, stockBefore, newStock, null, dateTime]
      );

      this.save();
      return true;
    } catch (error) {
      console.error('Stock decrement failed:', error);
      return false;
    }
  }

  // Add stock (IN). Atomically: bump products.stock (+ product price if given)
  // and record a stock_movements row of type 'IN'.
  addStock(
    product_id: number,
    quantity: number,
    opts?: { purchase_price?: number; note?: string; user_id?: string }
  ): { movement: StockMovement; product: Product } {
    if (!Number.isInteger(product_id)) throw new Error('Invalid product id');
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Jumlah stok harus bilangan bulat >= 1');

    const product = this.getProductById(product_id);
    if (!product) throw new Error('Produk tidak ditemukan');

    const dateTime = new Date().toISOString();
    const stockBefore = product.stock;
    const stockAfter = stockBefore + quantity;

    this.db!.run('BEGIN IMMEDIATE');
    try {
      const priceChanged =
        opts?.purchase_price != null && Number(opts.purchase_price) !== Number(product.purchase_price);
      if (priceChanged) {
        this.db!.run('UPDATE products SET stock = ?, purchase_price = ?, updated_at = ? WHERE id = ?', [
          stockAfter,
          Number(opts!.purchase_price),
          dateTime,
          product_id,
        ]);
      } else {
        this.db!.run('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?', [
          stockAfter,
          dateTime,
          product_id,
        ]);
      }
      if (this.db!.getRowsModified() !== 1) throw new Error('Gagal memperbarui stok');

      const referenceId = `IN-${Date.now()}-${this.nanoid().slice(0, 6).toUpperCase()}`;
      this.db!.run(
        "INSERT INTO stock_movements (product_id, type, quantity, stock_before, stock_after, reference_id, user_id, note, created_at) VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?)",
        [
          product_id,
          quantity,
          stockBefore,
          stockAfter,
          referenceId,
          opts?.user_id || null,
          opts?.note || null,
          dateTime,
        ]
      );

      this.db!.run('COMMIT');
      this.save();

      const movement = this.get<StockMovement>(
        'SELECT * FROM stock_movements WHERE reference_id = ? ORDER BY id DESC LIMIT 1',
        [referenceId]
      )!;
      return { movement, product: this.getProductById(product_id)! };
    } catch (error) {
      this.db!.run('ROLLBACK');
      throw error;
    }
  }

  createTransaction(
    transaction: Omit<Transaction, 'id' | 'created_at'> & { user_id?: string; cashier_name?: string },
    items: Omit<TransactionItem, 'id'>[]
  ): { transaction: Transaction; items: TransactionItem[] } {
    const transactionId = this.nanoid();
    const dateTime = new Date().toISOString();
    
    const productIds = items.map(i => i.product_id);
    if (productIds.some(id => !Number.isInteger(id))) throw new Error('Invalid product IDs');
    
    for (const item of items) {
      const product = this.getProductById(item.product_id);
      if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new Error(`Item transaksi tidak valid: ${item.product_id}`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Stok ${product.description} tidak mencukupi`);
      }
    }
    
    const itemsWithPrice = items.map(input => {
      const product = this.getProductById(Number(input.product_id));
      if (!product) throw new Error(`Produk tidak ditemukan: ${input.product_id}`);
      
      return {
        product_id: product.id!,
        product_code: product.code,
        product_name: product.description,
        quantity: input.quantity,
        unit_price: product.selling_price,
        subtotal: product.selling_price * input.quantity,
        discount_amount: 0,
        final_price: product.selling_price,
      };
    });
    
    const subtotal = itemsWithPrice.reduce((sum: number, item: any) => sum + item.subtotal, 0);
    
    this.db!.run('BEGIN IMMEDIATE');
    
    try {
      for (const item of itemsWithPrice) {
        this.db!.run(
          "INSERT INTO transaction_items (id, transaction_id, product_id, product_code, product_name, quantity, unit_price, subtotal, discount_amount, final_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [this.nanoid(), transactionId, item.product_id, item.product_code, item.product_name, item.quantity, item.unit_price, item.subtotal, item.discount_amount, item.final_price]
        );
        
        const product = this.get<Product>('SELECT * FROM products WHERE id = ?', [item.product_id])!;
        const stockAfter = product.stock - item.quantity;
        this.db!.run('UPDATE products SET stock = ?, updated_at = ? WHERE id = ? AND stock >= ?', [stockAfter, dateTime, item.product_id, item.quantity]);
        if (this.db!.getRowsModified() !== 1) throw new Error(`Stok ${product.description} berubah; ulangi transaksi`);
        this.db!.run(
          "INSERT INTO stock_movements (product_id, type, quantity, stock_before, stock_after, reference_id, created_at) VALUES (?, 'SALE', ?, ?, ?, ?, ?)",
          [item.product_id, item.quantity, product.stock, stockAfter, transactionId, dateTime]
        );
      }

      // Insert the main transaction record using values from computed transaction object
      this.db!.run(
        "INSERT INTO transactions (id, reference_no, date_time, subtotal, discount_amount, discount_type, tax_amount, grand_total, payment_amount, change_amount, status, user_id, cashier_name, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          transactionId, 
          transaction.reference_no, 
          dateTime, 
          transaction.subtotal, 
          transaction.discount_amount || 0, 
          transaction.discount_type || 'none', 
          transaction.tax_amount || 0, 
          transaction.grand_total, 
          transaction.payment_amount || transaction.grand_total, 
          transaction.change_amount || 0, 
          transaction.status || 'completed', 
          transaction.user_id || null, 
          transaction.cashier_name || 'Unknown User',
          (transaction as any).is_test ? 1 : 0
        ]
      );
      
      this.db!.run('COMMIT');
      this.save();
      
      return {
        transaction: { 
          ...transaction, 
          id: transactionId,
          cashier_name: transaction.cashier_name || 'Unknown User',
          user_id: transaction.user_id || null,
          is_test: (transaction as any).is_test ? 1 : 0
        } as Transaction,
        items: itemsWithPrice.map(item => ({ ...item, id: this.nanoid() })) as TransactionItem[],
      };
    } catch (error) {
      // Rollback everything on any failure to maintain atomicity
      this.db!.run('ROLLBACK');
      console.error('Transaction failed, rolled back:', error);
      throw error;
    }
  }

  getTransactions(limit: number = 50, filters?: { date?: string; status?: string }): Transaction[] {
    let sql = "SELECT * FROM transactions WHERE 1=1";
    const params: any[] = [];

    if (filters?.date) {
      sql += " AND date_time LIKE ?";
      params.push(`${filters.date}%`);
    }

    if (filters?.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }

    // Transaksi testing/E2E (is_test=1) tidak pernah ikut daftar laporan bisnis.
    sql += " AND (is_test IS NULL OR is_test = 0)";

    sql += " ORDER BY date_time DESC LIMIT ?";
    params.push(limit);

    return this.all<Transaction>(sql, params);
  }

  getTransactionById(id: string): Transaction | null {
    return this.get<Transaction>("SELECT * FROM transactions WHERE id = ?", [id]);
  }

  getTransactionItems(transactionId: string): TransactionItem[] {
    const rows = this.all<any>("SELECT * FROM transaction_items WHERE transaction_id = ?", [transactionId]);
    return rows.map((row: any) => ({
      ...row,
      discount_amount: row.discount_amount || 0,
    }));
  }

  getStockMovements(productId?: number, limit: number = 100): StockMovement[] {
    let sql = "SELECT * FROM stock_movements WHERE 1=1";
    const params: any[] = [];

    if (productId) {
      sql += " AND product_id = ?";
      params.push(productId);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.all<any>(sql, params);
    return rows.map((row: any) => ({
      ...row,
      reference_id: row.reference_id || null,
      user_id: row.user_id || null,
      note: row.note || null,
    }));
  }

  importFromExcel(rows: any[]): { success: number; errors: string[] } {
    const errors: string[] = [];
    let success = 0;

    for (const row of rows) {
      try {
        if (!row.description || !row.code) {
          errors.push(`Missing required field in row: ${JSON.stringify(row)}`);
          continue;
        }

        this.createProduct({
          code: String(row.code),
          description: String(row.description),
          category: row.category || null,
          variant: row.variant || null,
          thickness: row.thickness || null,
          unit: row.unit || 'pcs',
          purchase_price: Number(row.purchase_price) || 0,
          selling_price: Number(row.selling_price) || 0,
          stock: Number(row.stock) || 0,
          minimum_stock: Number(row.minimum_stock) || 5,
          barcode: row.barcode || null,
          qr_code: row.qr_code || null,
          brand: row.brand || null,
          status: row.status === 'Tidak Aktif' ? 'Tidak Aktif' : 'Aktif',
          note: row.note || null,
          ext01: row.ext01 || null,
          ext02: row.ext02 || null,
          active: true,
        });

        success++;
      } catch (err) {
        errors.push(`Failed to import row ${row.code}: ${(err as Error).message}`);
      }
    }

    return { success, errors };
  }

  /** Explicitly persist current in-memory state to disk. */
  flush(): void {
    this.save();
  }

  close(): void {
    this.save();
    this.db = null;
    this.releaseLock();
  }
}

// Singleton instance
let dbInstance: KasirKuDatabase | null = null;

export function getDatabase(): KasirKuDatabase {
  if (!dbInstance) {
    dbInstance = new KasirKuDatabase();
  }
  return dbInstance;
}

export function resetDatabase(): KasirKuDatabase {
  dbInstance?.close();
  dbInstance = new KasirKuDatabase();
  return dbInstance;
}

export default getDatabase;
