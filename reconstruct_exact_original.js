const fs = require('fs');
const path = require('path');

const transcriptPath = 'C:\\Users\\tando\\.gemini\\antigravity\\brain\\bad6412d-7aea-4dfb-bfea-323d93a7d09b\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.split('\n');

const fileLines = {};

function processText(text) {
  const textLines = text.split('\n');
  let inPageFile = false;
  textLines.forEach(line => {
    const clean = line.replace(/\r/g, '');
    if (clean.includes('File Path:') && clean.includes('page.tsx')) {
      inPageFile = true;
    } else if (clean.includes('Showing lines') || clean.includes('Total Lines:')) {
      // ignore
    } else if (inPageFile) {
      const match = clean.match(/^(\d+):\s(.*)$/);
      if (match) {
        const num = parseInt(match[1]);
        const code = match[2];
        // Clean up common escapes if found in JSON
        let unescaped = code
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\')
          .replace(/\\t/g, '\t');

        fileLines[num] = unescaped;
      }
    }
  });
}

lines.forEach(line => {
  if (!line.trim()) return;
  try {
    const obj = JSON.parse(line);
    if (obj.content) processText(obj.content);
    if (obj.result && obj.result.output) processText(obj.result.output);
  } catch (e) {
    processText(line);
  }
});

const sorted = Object.keys(fileLines).map(Number).sort((a, b) => a - b);
console.log(`Reconstructed lines: ${sorted.length}`);
console.log(`Min: ${sorted[0]}, Max: ${sorted[sorted.length - 1]}`);

let fileContent = '';
for (let i = 1; i <= 1666; i++) {
  if (fileLines[i] !== undefined) {
    fileContent += fileLines[i] + '\n';
  } else {
    fileContent += `// MISSING LINE ${i}\n`;
  }
}

fs.writeFileSync('original_page.tsx', fileContent);
console.log("Saved original_page.tsx");
