const fs = require('fs');

const content = fs.readFileSync('reconstructed_all.tsx', 'utf8');
const lines = content.split('\n');

function findBlock(searchStr, endStr, label) {
  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchStr)) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === -1) {
    console.log(`Could not find start for: ${label}`);
    return;
  }
  
  // Find matching end
  let bracketCount = 0;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    // Simple block boundary checking
    if (line.includes(endStr)) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    endIndex = Math.min(lines.length - 1, startIndex + 150);
  }
  
  console.log(`--- ${label} (lines ${startIndex + 1} to ${endIndex + 1}) ---`);
  console.log(lines.slice(startIndex, endIndex + 1).join('\n'));
}

findBlock("activeTab === 'ledger'", "activeTab === 'suppliers'", "Ledger Tab");
findBlock("activeTab === 'suppliers'", "activeTab === 'expenses'", "Suppliers Tab");
findBlock("activeTab === 'expenses'", "activeTab === 'whatsapp'", "Expenses Tab");
findBlock("activeTab === 'whatsapp'", "viewState.type === 'customer'", "WhatsApp Tab");
findBlock("/* --- CUSTOMER DIRECTORY DETAIL VIEW --- */", "/* --- CONTRACT TIMELINE & DETAILS VIEW --- */", "Customer Detail View");
findBlock("/* --- CONTRACT TIMELINE & DETAILS VIEW --- */", "/* Action Modals */", "Contract Detail View");
