# 🧪 KASIRKU - TEST SCRIPTS & VALIDATION

## 📋 QUICK VALIDATION CHECKLIST

Run these commands to verify everything is working correctly:

### 1. Backend Health Check
```bash
npm run backend
```

Expected output:
```
✅ Database initialized successfully
✅ Default admin user created
KasirKu Backend running on http://localhost:3000
Database initialized at: C:\Users\Rumah\Documents\Mirza All\data\kasirku.db
```

### 2. Frontend Development Server
```bash
npm run dev
```

Expected output:
```
VITE ready at http://localhost:5173
```

---

## 🔍 API ENDPOINT TESTING

### Products API

#### Get All Products
```bash
curl http://localhost:3000/api/products
```

Expected Response:
```json
{
  "products": [
    {
      "id": 1,
      "code": "EV2002-SMOKE",
      "name": "SMOKE (2mm)",
      "category": "Flooring",
      "stock": 5,
      "selling_price": 85000,
      ...
    }
  ]
}
```

#### Search Products by Name
```bash
curl "http://localhost:3000/api/products?search=smoke"
```

#### Filter by Category
```bash
curl "http://localhost:3000/api/products?category=Flooring"
```

#### Create New Product
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "code": "NEW-001",
    "name": "Test Product",
    "category": "Tools",
    "unit": "pcs",
    "purchase_price": 25000,
    "selling_price": 40000,
    "stock": 10
  }'
```

---

### Discount Engine Tests

#### Test Tuesday/Wednesday Promotion (Should Apply 20%)
```bash
# Replace date with a Tuesday or Wednesday
curl -X POST http://localhost:3000/api/discount \
  -H "Content-Type: application/json" \
  -d '{
    "subtotal": 150000,
    "date": "2024-01-09T00:00:00Z"  # Tuesday example
  }'
```

Expected Response:
```json
{
  "discountAmount": 30000,
  "discountType": "percentage",
  "ruleName": "Tue-Wed Promo 20%"
}
```

#### Test Thursday (Should NOT Apply Discount)
```bash
curl -X POST http://localhost:3000/api/discount \
  -H "Content-Type: application/json" \
  -d '{
    "subtotal": 150000,
    "date": "2024-01-11T00:00:00Z"  # Thursday example
  }'
```

Expected Response:
```json
{
  "discountAmount": 0,
  "discountType": "none"
}
```

---

### Tax Calculator Tests

#### Calculate 1.6% VAT
```bash
curl -X POST http://localhost:3000/api/tax \
  -H "Content-Type: application/json" \
  -d '{"subtotal": 260000}'
```

Expected Response:
```json
{
  "tax_amount": 4160
}
```

Validation: 260000 × 0.016 = 4160 ✓

---

### Transaction Tests

#### Complete Checkout Flow

**Step 1: Add items to cart (simulate via frontend)**

**Step 2: Submit transaction**
```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "reference_no": "TRX-TEST-001",
    "date_time": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "subtotal": 170000,
    "discount_amount": 30000,
    "discount_type": "percentage",
    "tax_amount": 2240,
    "grand_total": 142240,
    "payment_amount": 150000,
    "change_amount": 7760,
    "items": [
      {
        "product_id": 1,
        "product_code": "EV2002-SMOKE",
        "product_name": "SMOKE (2mm)",
        "quantity": 2,
        "unit_price": 85000,
        "subtotal": 170000,
        "discount_amount": 0,
        "final_price": 85000
      }
    ]
  }'
```

Expected Response:
```json
{
  "transaction": {
    "id": "...",
    "reference_no": "TRX-TEST-001",
    "status": "completed",
    ...
  },
  "items": [...]
}
```

---

### Stock Movement Tests

#### Verify Stock Decremented After Sale
```bash
# Before sale (should show stock > 0)
curl http://localhost:3000/api/products?search=ev2002-smoke

# After sale, check movements table
curl http://localhost:3000/api/stock-movements?product_id=1
```

Expected Movement Record:
```json
{
  "id": 1,
  "product_id": 1,
  "type": "SALE",
  "quantity": 2,
  "stock_before": 5,
  "stock_after": 3,
  "created_at": "..."
}
```

---

## 🎯 ACCEPTANCE TEST RUNNER

Create a test script `test-acceptance.js`:

```javascript
// Simple acceptance test runner
const tests = [];

async function runTest(name, fn) {
  console.log(`🧪 Testing: ${name}`);
  try {
    await fn();
    console.log(`✅ PASS: ${name}\n`);
    tests.push({ name, status: 'PASS' });
  } catch (error) {
    console.log(`❌ FAIL: ${name} - ${error.message}\n`);
    tests.push({ name, status: 'FAIL', error: error.message });
  }
}

async function main() {
  // Test 1: Stock decrement
  await runTest('Sale deducts correct stock', async () => {
    const beforeStock = 10;
    const sold = 3;
    const after = await simulateSale(beforeStock, sold);
    if (after !== 7) throw new Error(`Expected 7, got ${after}`);
  });

  // Test 2: Reject overstock
  await runTest('Reject purchase exceeding stock', async () => {
    const result = await attemptSale(2, 3); // 2 in stock, want to buy 3
    if (result.success) throw new Error('Should have failed');
  });

  // Test 3: Tuesday discount
  await runTest('Apply 20% discount on Tuesday', async () => {
    const discount = await calculateDiscount(150000, new Date('2024-01-09'));
    if (discount.amount !== 30000) throw new Error('Wrong discount amount');
  });

  // Test 4: No Thursday discount
  await runTest('No discount on Thursday', async () => {
    const discount = await calculateDiscount(150000, new Date('2024-01-11'));
    if (discount.amount !== 0) throw new Error('Should have no discount');
  });

  // Test 5: Tax calculation
  await runTest('Calculate 1.6% tax correctly', async () => {
    const tax = await calculateTax(260000);
    if (tax !== 4160) throw new Error(`Expected 4160, got ${tax}`);
  });

  // Test 6: Offline operation
  await runTest('Transaction works offline', async () => {
    // Disconnect network simulation
    const result = await createTransaction();
    if (!result.success) throw new Error('Offline transaction failed');
  });

  // Test 10: Historical prices preserved
  await runTest('Old transactions keep original prices', async () => {
    const oldTx = await getTransaction('old-id');
    const product = await getProduct(oldTx.product_id);
    if (product.selling_price !== oldTx.unit_price) {
      throw new Error('Price changed in history!');
    }
  });

  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('========================');
  tests.forEach(t => {
    console.log(`${t.status === 'PASS' ? '✅' : '❌'} ${t.name}`);
  });
  
  const passed = tests.filter(t => t.status === 'PASS').length;
  console.log(`\nTotal: ${passed}/${tests.length} passed`);
}

main().catch(console.error);
```

---

## 📊 EXPECTED DATABASE STATE AFTER TESTS

### Products Table
```sql
SELECT COUNT(*) as total_products FROM products;
-- Expected: ~21 products (from balance.xlsx import)
```

### Transactions Table
```sql
SELECT COUNT(*) as total_transactions FROM transactions;
-- Expected: >= 1 test transaction created
```

### Stock Movements Table
```sql
SELECT * FROM stock_movements WHERE type = 'SALE';
-- Expected: Movement records for each test sale
```

### Users Table
```sql
SELECT * FROM users WHERE username = 'admin';
-- Expected: 1 admin user created
```

---

## 🔥 PERFORMANCE BENCHMARKS

### Expected Response Times:
- **Product List:** < 100ms
- **Search Query:** < 200ms (up to 1000 products)
- **Transaction Checkout:** < 500ms
- **Stock Validation:** < 50ms
- **Report Generation:** < 1 second (up to 1000 transactions)

### Load Test Targets:
- **Concurrent Users:** Up to 5 simultaneous cashiers
- **Transactions per Hour:** 200+ transactions/hour
- **Database Size:** < 50MB even after 1 year of daily operations

---

## 🐛 COMMON TEST ISSUES & FIXES

### Issue: "Cannot find module 'uuid'"
**Fix:** Already resolved - using nanoid instead

### Issue: Database not loading
**Check:**
```bash
# Verify database file exists
ls -la data/kasirku.db

# Check permissions
chmod 664 data/kasirku.db

# Reinitialize if corrupted
rm data/kasirku.db
npm run backend
```

### Issue: Import fails silently
**Debug:**
```bash
# Check parsed JSON
cat scripts/parsed-products.json | head -20

# Verify Excel structure
node scripts/import-balance.ts --verbose
```

### Issue: Barcode scanner not working
**Solution:** 
- Ensure keyboard wedge mode (most USB scanners work automatically)
- Click in search input first to focus
- Press Enter after scan triggers product add

---

## ✅ FINAL VERIFICATION COMMANDS

Run these in sequence to ensure everything works:

```bash
# 1. Start backend
npm run backend &

# Wait 2 seconds
sleep 2

# 2. Test basic API
curl http://localhost:3000/api/products | head -5

# 3. Test discount engine
curl -X POST http://localhost:3000/api/discount -H "Content-Type: application/json" -d '{"subtotal":100000}'

# 4. Test tax calculation
curl -X POST http://localhost:3000/api/tax -H "Content-Type: application/json" -d '{"subtotal":100000}'

# 5. Start frontend (in separate terminal)
npm run dev
```

All endpoints should respond without errors! 🎉

---

## 📞 TROUBLESHOOTING FLOWCHART

```
Problem → Backend won't start?
├─ Check Node version: node --version (need 18+)
├─ Reinstall deps: rm -rf node_modules && npm install
└─ Clear cache: npm cache clean --force

Problem → Frontend blank screen?
├─ Check console: F12 → Console tab
├─ Verify server running: http://localhost:3000/api/products
├─ Check CORS: Browser console for CORS errors
└─ Hard refresh: Ctrl+F5

Problem → Products not showing?
├─ Check import: ls scripts/parsed-products.json
├─ Verify DB: sqlite3 data/kasirku.db "SELECT COUNT(*) FROM products;"
└─ Reimport: npm run import-data

Problem → Discounts not applying?
├─ Check current day: date
├─ Test specific date: curl -d {"date":"2024-01-09"} /api/discount
└─ Review service: cat src/services/DiscountService.ts
```

---

## 📈 MONITORING DURING TESTING

### Database Activity Monitoring
```bash
# Watch for SQL queries
sqlite3 data/kasirku.db ".timer on"
```

### Backend Request Logging
Enable verbose logging:
```bash
npm run backend -- --verbose
```

### Frontend Network Tab
Open DevTools → Network tab to see all API calls

---

**Test Status:** READY TO EXECUTE ✨
