// Error-code pages: one static page per code, generated from docs/errors.md.
//
// Production builds log "[VLN014] https://tfrascaroli.github.io/velin/e/VLN014".
// The base URL lives in src/velin-core.js (ERROR_DOCS_URL); the pages are
// written by scripts/stage-site.js under dist/site/e/<CODE>/index.html and
// served on the fly by scripts/serve.js at /e/<CODE>. Keep the three in step.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const SOURCE = path.join(repoRoot, 'docs', 'errors.md');

/** @returns {Array<{code: string, title: string, body: string}>} */
function readCatalog() {
  const md = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
  const out = [];
  const parts = md.split(/^## (VLN\d{3})\s*$/m);
  // parts: [preamble, code, body, code, body, …]
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1].trim();
    const t = body.match(/^\*\*(.+?)\*\*/);
    out.push({ code: parts[i], title: t ? t[1].replace(/\.$/, '') : parts[i], body });
  }
  return out;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Enough markdown for errors.md: paragraphs, fenced code, inline code,
// bold, links. Links to sibling docs become site doc routes.
function inline(s, up) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(\.\/([a-z-]+)\.md(#[^)]*)?\)/g, (m, text, doc, hash) => `<a href="${up}#/docs/${doc}${hash ? hash : ''}">${text}</a>`)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
}
function mdToHtml(md, up) {
  const blocks = md.split(/\n{2,}/);
  return blocks.map((b) => {
    const fence = b.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
    if (fence) return `<pre><code>${esc(fence[1])}</code></pre>`;
    return `<p>${inline(b.replace(/\n/g, ' '), up)}</p>`;
  }).join('\n');
}

const SHELL = (title, main, depth) => {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Velin</title>
  <link rel="icon" href="${up}logo.svg">
  <link rel="stylesheet" href="${up}styles.css">
  <style>
    .err-page { max-width: 42rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.55; }
    .err-page h1 code { font-size: 1.1em; }
    .err-page pre { padding: .75rem 1rem; overflow: auto; }
    .err-page .meta { opacity: .7; font-size: .9em; margin-top: 2.5rem; }
    .err-list li { margin: .3rem 0; }
  </style>
</head>
<body>
  <main class="err-page">
${main}
  <p class="meta"><a href="${up}">Velin</a> · <a href="${up}#/docs/errors">all error codes</a> · <a href="https://github.com/TFrascaroli/velin/blob/main/docs/errors.md">edit this page</a></p>
  </main>
</body>
</html>
`;
};

function renderCode(entry, depth = 2) {
  return SHELL(entry.code, `  <h1><code>${entry.code}</code> ${esc(entry.title)}</h1>\n${mdToHtml(entry.body.replace(/^\*\*(.+?)\*\*\s*/, ''), '../'.repeat(depth))}`, depth);
}
function renderIndex(catalog, depth = 1) {
  const items = catalog.map((e) => `    <li><a href="${e.code}/"><code>${e.code}</code></a> ${esc(e.title)}</li>`).join('\n');
  return SHELL('Error codes', `  <h1>Velin error codes</h1>\n  <p>Production builds print a code and a link here; development builds print the full message.</p>\n  <ul class="err-list">\n${items}\n  </ul>`, depth);
}

/** Write e/index.html and e/<CODE>/index.html under `outDir`. */
function writePages(outDir) {
  const catalog = readCatalog();
  const base = path.join(outDir, 'e');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'index.html'), renderIndex(catalog));
  for (const entry of catalog) {
    const dir = path.join(base, entry.code);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderCode(entry));
  }
  return catalog.length;
}

module.exports = { readCatalog, renderCode, renderIndex, writePages };
