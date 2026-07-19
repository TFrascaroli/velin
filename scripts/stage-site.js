// Stages the deployable Pages artifact into dist/site/.
//
// The hand-rolled site references cross-directory paths (/logo.svg, /docs/*,
// /playground/*), so a GH Pages artifact of just `site/` would 404. This script
// assembles a single self-contained root that mirrors what scripts/serve.js
// serves locally.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'dist', 'site');

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });

// Site itself at the root.
copyDir(path.join(repoRoot, 'site'), outDir);

// Cross-directory assets the site references by absolute path.
copyFile(path.join(repoRoot, 'logo.svg'), path.join(outDir, 'logo.svg'));
copyDir(path.join(repoRoot, 'docs'), path.join(outDir, 'docs'));
copyDir(path.join(repoRoot, 'playground'), path.join(outDir, 'playground'));

console.log(`[stage-site] wrote ${path.relative(repoRoot, outDir)}`);
