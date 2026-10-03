import XLSX from 'xlsx';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

async function main() {
  console.log('🔄 Starting balance.xlsx import process...\n');

  const excelPath = join(ROOT_DIR, 'balance.xlsx');

  if (!existsSync(excelPath)) {
    console.error(`❌ File not found: ${excelPath}`);
    return;
  }

  console.log('📖 Reading Excel file...');
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Read as array of arrays to preserve structure
  const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

  console.log(`✅ Found ${rawData.length} rows in Excel\n`);

  const products: any[] = [];
  let section = 'left'; // left, middle, or right
  
  for (let i = 4; i < rawData.length; i++) {
    const row = rawData[i] as string[] | number[];
    
    if (!row || row.length === 0) continue;
    
    // Detect new sections based on headers
    const cell1 = String(row[0] || '').toUpperCase();
    const cell7 = String(row[6] || '').toUpperCase();
    const cell13 = String(row[12] || '').toUpperCase();
    
    if (cell1.includes('NO. CODE') && !row[2]) {
      section = 'left';
      continue;
    }
    if (cell7.includes('NO. CODE') && !row[8]) {
      section = 'middle';
      continue;
    }
    if (cell13.includes('NO. CODE')) {
      section = 'right';
      continue;
    }
    
    // Process product data
    let code = '', name = '', stock = 0;
    
    if (section === 'left') {
      code = String(row[0]).trim();
      name = `${String(row[1]).trim()} (${row[2]}mm)`;
      stock = Number(row[4]) || 0;
    } else if (section === 'middle') {
      code = String(row[6]).trim();
      name = `${String(row[7]).trim()} (${row[8]}mm)`;
      stock = Number(row[10]) || 0;
    } else {
      code = String(row[12]).trim();
      name = `${String(row[13]).trim()} (${row[14]}mm)`;
      stock = Number(row[16]) || 0;
    }
    
    // Skip empty rows and headers
    if (!code || !name || code.includes('CODE')) continue;
    if (stock <= 0) continue;
    
    // Determine category
    let category = 'Other';
    if (code.includes('EV') || code.includes('TV')) {
      category = 'Flooring';
    } else if (code.startsWith('FDB') || code.startsWith('FDU')) {
      category = 'Wall Panel';
    } else if (code.includes('UV')) {
      category = 'UV Board';
    }
    
    // Extract thickness from name
    const thicknessMatch = name.match(/(\d+)mm/);
    const thickness = thicknessMatch ? thicknessMatch[1] + 'mm' : null;
    
    products.push({
      code: code.replace(/\s+/g, '').toUpperCase(),
      name: name.trim(),
      category: category,
      variant: null,
      thickness: thickness,
      unit: 'pcs',
      purchase_price: getCategoryPrice(category, 'buy'),
      selling_price: getCategoryPrice(category, 'sell'),
      stock: stock,
      minimum_stock: 5,
      barcode: null,
      qr_code: null,
      active: true,
    });
  }

  console.log(`✅ Parsed ${products.length} unique products\n`);
  
  // Group by category
  const categories = Array.from(new Set(products.map(p => p.category)));
  for (const cat of categories) {
    const count = products.filter(p => p.category === cat).length;
    const totalStock = products.filter(p => p.category === cat).reduce((sum, p) => sum + p.stock, 0);
    console.log(`   📦 ${cat}: ${count} products, ${totalStock} total stock`);
  }

  // Save parsed data
  const outputDir = join(ROOT_DIR, 'scripts');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = join(outputDir, 'parsed-products.json');
  writeFileSync(jsonPath, JSON.stringify(products, null, 2));
  console.log(`\n💾 Saved parsed data to: ${jsonPath}`);

  // Show sample products
  console.log('\n📋 Sample Products:');
  products.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i+1}. ${p.code} - ${p.name} [${p.category}] - Stock: ${p.stock}`);
  });

  console.log('\n✅ Import process completed successfully!\n');
}

function getCategoryPrice(category: string, type: 'buy' | 'sell'): number {
  const basePrices: Record<string, { buy: number; sell: number }> = {
    'Flooring': { buy: 50000, sell: 85000 },
    'Wall Panel': { buy: 80000, sell: 140000 },
    'UV Board': { buy: 100000, sell: 170000 },
    'Other': { buy: 30000, sell: 50000 },
  };

  const base = basePrices[category] || basePrices['Other'];
  return type === 'buy' ? base.buy : base.sell;
}

main().catch(console.error);
