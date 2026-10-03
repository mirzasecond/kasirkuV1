// Script to reset product stock to original values from parsed-products.json
// NOTE: This handles duplicate codes by using the FIRST occurrence of each code
// If you have products with same code but different variants (e.g., thickness),
// please fix parsed-products.json first or use parsed-products-fixed.json

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'data', 'kasirku.db');

async function resetStock(jsonFilePath) {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       PRODUCT STOCK RESET SCRIPT                      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Load JSON
    const filePath = jsonFilePath || path.join(__dirname, 'parsed-products.json');
    console.log(`[1/5] Loading products from ${path.basename(filePath)}...`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ERROR: File not found: ${filePath}`);
      process.exit(1);
    }

    const productsJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`✅ Loaded ${productsJson.length} products\n`);

    // 2. Deduplicate by code (keep first occurrence)
    const uniqueProducts = new Map();
    for (const p of productsJson) {
      const code = p.code.trim();
      if (!uniqueProducts.has(code)) {
        uniqueProducts.set(code, p);
      }
    }
    console.log(`✅ After deduplication: ${uniqueProducts.size} unique products\n`);

    // 3. Initialize database
    console.log('[2/5] Loading database...');
    const SQL = await initSqlJs();
    let db;
    
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      console.log(`✅ Loaded existing database\n`);
    } else {
      console.error(`❌ ERROR: Database not found: ${DB_PATH}`);
      process.exit(1);
    }

    // 4. Update stocks
    console.log('[3/5] Resetting stock values...\n');
    
    const results = [];
    let updatedCount = 0;

    for (const [code, product] of uniqueProducts.entries()) {
      const currentStock = product.stock;
      
      // FIX: Use db.exec() instead of db.run() for SELECT queries
      const dbResult = db.exec("SELECT code, stock FROM products WHERE code = ?", [code]);
      
      if (dbResult.length === 0 || !dbResult[0]) {
        console.warn(`⚠️  Product "${code}" not found - skipping`);
        continue;
      }

      const prevStock = dbResult[0].values[0][1];

      if (prevStock !== currentStock) {
        db.run("UPDATE products SET stock = ? WHERE code = ?", [currentStock, code]);
        
        results.push({
          code,
          prevStock,
          newStock: currentStock,
          changed: true
        });
        updatedCount++;
      }
    }

    console.log(`✅ Updated ${updatedCount} products\n`);

    // 5. Report
    if (results.length > 0) {
      console.log('[4/5] Stock Reset Report:\n');
      console.log('-'.repeat(70));
      console.log('%s\t%s\t%s\t%s', 
        'Kode Produk'.padEnd(20), 
        'Sebelum'.padStart(8), 
        'Sesudah'.padStart(8), 
        'Status'
      );
      console.log('-'.repeat(70));
      
      for (const item of results.filter(r => r.changed)) {
        const status = item.newStock >= item.prevStock ? '↑ Restock' : '↓ Decrease';
        console.log('%s\t%d\t%d\t%s', 
          item.code.padEnd(20),
          item.prevStock.toString().padStart(7),
          item.newStock.toString(),
          status
        );
      }
      console.log('-'.repeat(70));
      console.log(`Total Products Reset: ${updatedCount}\n`);
    } else {
      console.log('[4/5] All products already at original stock ✓\n');
    }

    // 6. Save
    console.log('[5/5] Saving database...');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    console.log(`✅ Saved successfully\n`);

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                   RESET COMPLETE                       ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`\n✓ Updated: ${updatedCount} products`);
    console.log(`✓ Transactions remain intact`);
    console.log(`✓ Other fields unchanged (name, price, category)`);
    console.log(`\nDatabase: ${DB_PATH}\n`);
    
    db.close();
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

resetStock(process.argv[2]);
