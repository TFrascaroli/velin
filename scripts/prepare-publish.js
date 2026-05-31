// prepare-publish.js
// Copies only the files needed for npm publish into ./publish directory
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publishDir = path.join(root, 'publish');
const distBuild = path.join(root, 'dist', 'build');
const distTypes = path.join(root, 'dist', 'types');

const filesToCopy = [
  // JS bundles
  'velin-all.min.js',
  'velin-core.min.js',
  'velin-std.min.js',
  'velin-templates-and-fragments.min.js',
  // Source maps
  'velin-all.min.js.map',
  'velin-core.min.js.map',
  'velin-std.min.js.map',
  'velin-templates-and-fragments.min.js.map',
];

const typeFiles = [
  'velin-all.d.ts',
  'velin-core.d.ts',
  'velin-std.d.ts',
  'velin-templates-and-fragments.d.ts',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFiles(files, from, to) {
  ensureDir(to);
  files.forEach(f => {
    const src = path.join(from, f);
    const dest = path.join(to, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${src} -> ${dest}`);
    } else {
      console.warn(`Missing: ${src}`);
    }
  });
}

// Clean publish dir
if (fs.existsSync(publishDir)) fs.rmSync(publishDir, { recursive: true });
ensureDir(publishDir);

// Copy JS and maps
copyFiles(filesToCopy, distBuild, publishDir);
// Copy types
copyFiles(typeFiles, distTypes, publishDir);
// Copy README and LICENSE
['README.md', 'LICENSE'].forEach(f => {
  const src = path.join(root, f);
  const dest = path.join(publishDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
});

console.log('Prepared publish directory.');
