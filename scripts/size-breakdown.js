const fs = require('fs');
const path = require('path');

function analyze(file) {
  const src = fs.readFileSync(file, 'utf8');
  const items = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const m = rest.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) { i++; continue; }
    const name = m[1];
    const start = i;
    let j = start;
    while (j < src.length && src[j] !== '{') j++;
    let depth = 1;
    j++;
    let inStr = null;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (inStr) {
        if (c === '\\') { j += 2; continue; }
        if (c === inStr) inStr = null;
      } else {
        if (c === '"' || c === "'" || c === '`') inStr = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      j++;
    }
    items.push({ name, size: j - start, start });
    i = j;
  }
  items.sort((a, b) => b.size - a.size);
  console.log('\n=== ' + path.basename(file) + ' (' + src.length + ' bytes) ===');
  const showSnippet = process.argv.includes('--snippets');
  for (const it of items) {
    console.log(String(it.size).padStart(6), it.name);
    if (showSnippet) console.log('       ' + src.slice(it.start, it.start + 120).replace(/\n/g, ' ') + '...\n');
  }
}

for (const f of process.argv.slice(2)) if (!f.startsWith('--')) analyze(f);
