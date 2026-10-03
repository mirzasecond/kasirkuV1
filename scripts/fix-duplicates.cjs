// Script to fix duplicate product codes in parsed-products.json

const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'parsed-products.json');
const outputFile = path.join(__dirname, 'parsed-products-fixed.json');

console.log('📖 Reading products from:', inputFile);

const products = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
console.log('✅ Loaded', products.length, 'products');

// Find duplicate codes
const codeMap = new Map();
const duplicates = [];

products.forEach((product, index) => {
  const code = product.code;
  
  if (codeMap.has(code)) {
    duplicates.push({
      index,
      code,
      name: product.name,
      existingIndex: codeMap.get(code),
      existingName: products[codeMap.get(code)].name
    });
    
    // Fix: Add variant suffix to make code unique
    const variantSuffix = product.thickness ? `-${product.thickness.replace(/[^a-zA-Z0-9]/g, '')}` : `-${index}`;
    const newCode = `${code}${variantSuffix}`;
    
    console.log(`🔧 Fixing duplicate: ${code} -> ${newCode}`);
    console.log(`   Name: ${product.name}`);
    
    product.code = newCode;
  } else {
    codeMap.set(code, index);
  }
});

console.log('\n📊 Summary:');
console.log(`   Total products: ${products.length}`);
console.log(`   Duplicates found and fixed: ${duplicates.length}`);

if (duplicates.length > 0) {
  console.log('\n📝 Duplicate details:');
  duplicates.forEach((dupe, i) => {
    console.log(`   ${i + 1}. "${dupe.name}" (was duplicate of "${products[dupe.existingIndex].name}")`);
  });
}

// Save fixed products
fs.writeFileSync(outputFile, JSON.stringify(products, null, 2), 'utf-8');
console.log(`\n💾 Saved fixed products to: ${outputFile}`);

console.log('\n✨ Done!');
