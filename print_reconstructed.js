const fs = require('fs');

const content = fs.readFileSync('reconstructed_all.tsx', 'utf8');
const lines = content.split('\n');

// We want to print lines 800 to 1430 (0-indexed: 799 to 1429)
let output = '';
for (let i = 799; i < Math.min(lines.length, 1430); i++) {
  output += `${i + 1}: ${lines[i]}\n`;
}

fs.writeFileSync('reconstructed_section.tsx', output);
console.log("Saved reconstructed_section.tsx");
