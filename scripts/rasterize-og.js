// Rasterizes og-image.svg → site/og-image.png at 1280×640.
// Used both locally (`npm run og:image`) and by the Pages deploy workflow.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const repoRoot = path.resolve(__dirname, '..');
const src = path.join(repoRoot, 'og-image.svg');
const dest = path.join(repoRoot, 'site', 'og-image.png');

if (!fs.existsSync(src)) {
  console.error(`[og-image] source not found: ${src}`);
  process.exit(1);
}

const svg = fs.readFileSync(src, 'utf8');

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1280 },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'DejaVu Sans',
  },
  background: 'transparent',
});

fs.mkdirSync(path.dirname(dest), { recursive: true });
const png = resvg.render().asPng();
fs.writeFileSync(dest, png);

const kb = (png.length / 1024).toFixed(1);
console.log(`[og-image] wrote ${path.relative(repoRoot, dest)} (${kb} KB)`);
