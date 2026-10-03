# 📚 KASIRKU - Desktop POS Application for Building Material Store

## 🎯 OVERVIEW

**KasirKu** adalah aplikasi Point of Sale (POS) desktop lokal-first yang dibangun untuk toko bangunan. Aplikasi ini berfungsi offline dan hanya memerlukan internet untuk fitur eksternal seperti notifikasi Telegram dan backup synchronization.

### Core Technologies
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: TailwindCSS + Framer Motion
- **Backend Runtime**: Node.js Express (Development), Tauri (Production)
- **Database**: SQLite (sql.js)
- **Validation**: Zod
- **Charts**: Recharts
- **State Management**: Zustand (optional)

---

## 📁 PROJECT STRUCTURE

```
KasirKu/
├── src-tauri/                # Tauri backend (production build)
│   ├── src/
│   │   ├── main.rs           # Entry point
│   │   └── lib.rs            # Library exports
│   └── Cargo.toml            # Rust dependencies
│
├── src/                      # React frontend
│   ├── lib/
│   │   ├── db/
│   │   │   └── index.ts      # Database layer (SQL.js)
│   │   ├── validators.ts     # Zod schemas
│   │   └── types.ts          # TypeScript types
│   ├── services/
│   │   ├── DiscountService.ts    # Promotion/discount logic
│   │   ├── TaxService.ts         # VAT calculation
│   │   ├── InventoryService.ts   # Stock management
│   │   └── NotificationService.js # Telegram notifications
│   ├── pages/
│   │   ├── KioskPage.tsx       # Cashier interface
│   │   ├── AdminPage.tsx       # Product & inventory management
│   │   └── DeveloperPage.tsx   # Backup & system tools
│   └── components/             # Reusable UI components
│
├── scripts/
│   ├── import-balance.ts     # Excel to JSON converter
│   └── parsed-products.json  # Migrated inventory data
│
├── data/                       # SQLite database location
│   └── kasirku.db              # Production database file
│
├── server.ts                   # Express backend server
├── package.json               # Dependencies & scripts
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite bundler config
├── tailwind.config.js        # Tailwind CSS configuration
└── tauri.conf.json           # Tauri app configuration
```

---

## 🚀 GETTING STARTED

### Prerequisites
1. **Node.js** 18+ installed
2. **npm** or **yarn** package manager
3. Git (for cloning, if needed)

### Installation Steps

1. **Install Dependencies**
```bash
cd C:\Users\Rumah\Documents\Mirza All\kasirku
npm install
```

2. **Import Initial Inventory from Excel**
```bash
npm run import-data
```

This will:
- Read `balance.xlsx`
- Parse products into structured format
- Save to `scripts/parsed-products.json`

3. **Start Backend Server**
```bash
npm run backend
```

Server will start at: `http://localhost:3000`

4. **Start Frontend Development Server**
```bash
npm run dev
```

App will open at: `http://localhost:5173`

---

## 🗄️ DATABASE SCHEMA

### Products Table
```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,           -- Product SKU
  name TEXT NOT NULL,                  -- Product name
  category TEXT,                        -- e.g., Flooring, Wall Panel
  variant TEXT,                         -- Product variant
  thickness TEXT,                       -- e.g., "8mm"
  unit TEXT DEFAULT 'pcs',              -- Unit of measure
  purchase_price REAL NOT NULL,         -- Cost price
  selling_price REAL NOT NULL,          -- Selling price
  stock INTEGER NOT NULL DEFAULT 0,     -- Current stock
  minimum_stock INTEGER DEFAULT 5,      -- Low stock alert threshold
  barcode TEXT UNIQUE,                  -- Barcode scanner value
  qr_code TEXT,                         -- QR code image/data
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Transactions Table
```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,                 -- UUID
  reference_no TEXT UNIQUE NOT NULL,   -- e.g., TRX-1234567890-abcd
  date_time TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  discount_type TEXT CHECK IN ('percentage', 'fixed', 'none'),
  tax_amount REAL DEFAULT 0,
  grand_total REAL NOT NULL,
  payment_amount REAL NOT NULL,
  change_amount REAL NOT NULL,
  status TEXT DEFAULT 'completed'      -- pending, completed, cancelled
);
```

### Transaction Items Table
```sql
CREATE TABLE transaction_items (
  id TEXT PRIMARY KEY,                 -- UUID
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,           -- Price at time of sale
  subtotal REAL NOT NULL,
  discount_amount REAL DEFAULT 0,
  final_price REAL NOT NULL
);
```

### Stock Movements Table
```sql
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK IN ('IN', 'OUT', 'SALE', 'RETURN', 'ADJUSTMENT'),
  quantity INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reference_id TEXT,                   -- Link to transaction or other source
  user_id TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔧 BUSINESS LOGIC

### Discount Engine
Location: `src/services/DiscountService.ts`

**Current Rules:**
- Tuesday & Wednesday: 20% discount on purchases ≥ Rp 100,000
- Other days: No automatic discount (manual adjustment via admin)

**API Endpoint:**
```javascript
POST /api/discount
{
  "subtotal": 150000,
  "date": "2024-01-10T00:00:00Z" // Optional, defaults to now
}
```

Response:
```json
{
  "discountAmount": 30000,
  "discountType": "percentage",
  "ruleName": "Tue-Wed Promo 20%"
}
```

### Tax Engine
Location: `src/services/TaxService.ts`

**VAT Rate:** 1.6% (configurable constant `TaxService.VAT_RATE`)

**API Endpoint:**
```javascript
POST /api/tax
{
  "subtotal": 150000
}
```

Response:
```json
{
  "tax_amount": 2400
}
```

### Profit Calculation
Location: `src/services/ProfitService.ts`

Calculates profit based on difference between:
- Sale Price × Quantity = Revenue
- Purchase Price × Quantity = Cost
- Profit = Revenue - Cost
- Margin % = (Profit / Revenue) × 100

---

## 👥 USER ROLES (RBAC)

| Role | Access Level |
|------|--------------|
| **admin** | Full access to all modules, users, settings, reports |
| **cashier** | Kiosk mode only, can create transactions |
| **developer** | System maintenance, backup/restore, logs |

Default admin credentials:
- Username: `admin`
- Password: `$2b$10$default` (change immediately!)

---

## 📊 ACCEPTANCE TESTS IMPLEMENTATION STATUS

| Test | Requirement | Status | Implementation Detail |
|------|-------------|--------|----------------------|
| 1 | Sale deducts stock | ✅ | `decrementStock()` atomically updates stock & creates movement record |
| 2 | Reject overstock | ✅ | Server-side validation before transaction commit |
| 3 | Tue-Wed 20% discount | ✅ | DiscountEngine checks day-of-week |
| 4 | Thursday no discount | ✅ | Same engine, conditional activation |
| 5 | Tax 1.6% | ✅ | Constant `TAX_RATE = 0.016` |
| 6 | Offline checkout | ✅ | Local SQLite, no internet dependency |
| 7 | Queue offline alert | ⏳ | Queue table exists, implementation pending |
| 8 | Sync when online | ⏳ | Scheduled job required |
| 9 | Prevent overselling | ✅ | Database constraints + atomic operations |
| 10 | Historical prices | ✅ | Transaction stores snapshot prices |
| 11 | Stock adjust logged | ✅ | `InventoryService.adjustStock()` calls movement logger |
| 12 | Backup/restore | ⏳ | File copy mechanism in DeveloperPage |

---

## 🎨 FRONTEND FEATURES

### Kiosk Mode (`/`)
- Full-screen POS interface
- Barcode scanner input support (acts as keyboard input)
- Real-time product search (name, code, barcode)
- Shopping cart with quantity management
- Payment processing and receipt display
- Instant stock validation

### Admin Mode (`/admin`)
- Product CRUD operations
- Bulk import from Excel (`balance.xlsx`)
- Low stock alerts dashboard
- Sales analytics charts
- Transaction history viewer

### Developer Mode (`/developer`)
- Database statistics
- Backup creation (.db file copy)
- Restore from backup
- System logs viewer

---

## 📤 EXCEL IMPORT WORKFLOW

File: `scripts/import-balance.ts`

**Input Format (balance.xlsx):**
```
Row 1-3: Headers (skip)
Row 4+: Product data columns:
  - Column A: Product Code (e.g., EV 2002)
  - Column B: Product Name (e.g., SMOKE)
  - Column C: Thickness (e.g., 2mm)
  - Column E: Stock Balance
```

**Output:** `scripts/parsed-products.json`

```json
[
  {
    "code": "EV2002-SMOKE",
    "name": "SMOKE (2mm)",
    "category": "Flooring",
    "thickness": "2mm",
    "unit": "pcs",
    "purchase_price": 50000,
    "selling_price": 85000,
    "stock": 5,
    "minimum_stock": 5
  }
]
```

To import into database:
```bash
# After parsing, use the JSON directly or through API
curl -X POST http://localhost:3000/api/products/import \
  -H "Content-Type: application/json" \
  -d @scripts/parsed-products.json
```

---

## 🔐 SECURITY CONSIDERATIONS

1. **No External Dependencies**: All data stays local
2. **Password Hashing**: Use bcrypt for user passwords (implemented placeholder)
3. **Input Validation**: All inputs validated via Zod schemas
4. **Transaction Integrity**: Atomic operations prevent partial failures
5. **Backup Encryption**: Recommend adding encryption for backups

---

## 📦 BUILDING FOR PRODUCTION

### Option 1: Electron/Tauri Build (Recommended)
```bash
# Build Tauri desktop app
npm run tauri build
```
Output: `.msi` installer for Windows

### Option 2: Web App Deployment
```bash
npm run build
npm run preview
```
Then host dist folder on any web server

---

## 🛠️ CUSTOMIZATION GUIDE

### Changing VAT Rate
Edit: `src/services/TaxService.ts`
```typescript
export class TaxService {
  public static readonly VAT_RATE = 0.01; // Change to 0.01 for 1%
}
```

### Adding Discount Rules
Edit: `src/services/DiscountService.ts`
```typescript
// Add new promotion rule here
if (dayOfWeek === 5 && total >= 200000) { // Friday special
  return { discountAmount: Math.floor(total * 0.15), discountType: 'percentage', ruleName: 'Friday Special 15%' };
}
```

### Modifying Product Categories
Edit: `scripts/import-balance.ts`
```typescript
const categories = ['Flooring', 'Wall Panel', 'UV Board', 'Tools', 'Paint'];
```

---

## 🐛 TROUBLESHOOTING

### Issue: Database not loading
**Solution**: Check file permissions on `data/kasirku.db`, ensure read/write access

### Issue: Excel import fails
**Solution**: Verify column headers match expected format in `import-balance.ts`

### Issue: Stock shows negative values
**Solution**: This should never happen due to validation. Check if `decrementStock()` is being called correctly.

### Issue: Discount not applying on Tuesday/Wednesday
**Solution**: Verify system date/time is correct, check console logs for discount service output

---

## 📞 SUPPORT & MAINTENANCE

For issues or feature requests:
1. Check console logs (`npm run backend --verbose`)
2. Verify database integrity: `sqlite3 data/kasirku.db ".tables"`
3. Review `parsed-products.json` for data issues

---

## 📝 NEXT STEPS & RECOMMENDATIONS

1. **Immediate Priorities:**
   - [ ] Implement Telegram notification queue processor
   - [ ] Add password encryption for user accounts
   - [ ] Create automated nightly backups
   - [ ] Test on actual POS hardware with barcode scanner

2. **Future Enhancements:**
   - [ ] Customer loyalty program
   - [ ] Multi-store synchronization
   - [ ] Supplier integration API
   - [ ] Mobile companion app for owners
   - [ ] Cloud sync option for remote monitoring

3. **Performance Optimization:**
   - [ ] Index frequently queried fields
   - [ ] Implement connection pooling for high-volume periods
   - [ ] Cache product search results
   - [ ] Lazy-load charts and reports

---

## ✨ CREDITS

Built with ❤️ for Indonesian building material store owners.

**Core Principles:**
- Local-first architecture (no cloud dependency)
- Privacy-focused (data stays on your PC)
- Offline-capable (works even without internet)
- Simple & intuitive interface

---

**Version:** 1.0.0  
**Last Updated:** 2024-01  
**License:** Proprietary
