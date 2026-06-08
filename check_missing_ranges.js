const fs = require('fs');

const content = fs.readFileSync('reconstructed_all.tsx', 'utf8');
const lines = content.split('\n');

let missingStart = -1;
const ranges = [];

lines.forEach((line, index) => {
  const lineNum = index + 1;
  if (line.startsWith('// MISSING LINE ')) {
    if (missingStart === -1) {
      missingStart = lineNum;
    }
  } else {
    if (missingStart !== -1) {
      ranges.push([missingStart, lineNum - 1]);
      missingStart = -1;
    }
  }
});

if (missingStart !== -1) {
  ranges.push([missingStart, lines.length]);
}

console.log("Missing line ranges:");
ranges.forEach(r => {
  console.log(`Lines ${r[0]} to ${r[1]} (${r[1] - r[0] + 1} lines)`);
});
