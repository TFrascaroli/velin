// prepare-publish.js
// Copies only the files needed for npm publish into ./publish directory
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publishDir = path.join(root, 'publish');
const distBuild = path.join(root, 'dist', 'build');
// tsc lands types under dist/types/src/ because the tsconfig's `include`
// starts at src/**; not worth fighting the compiler over.
const distTypes = path.join(root, 'dist', 'types', 'src');

// All bundles are shipped together. Consumers pick the one that matches
// what they use (see docs/bundles.md).
const bundles = [
  'velin-all',                       // everything
  'velin-common',                    // core + standard
  'velin-core',                      // core only
  'velin-standard',                  // core-dependent std plugins
  'velin-templates-and-fragments',   // vln-fragment / <template>
  'velin-router',                    // vln-router / vln-route
  'velin-events',                    // event aliases + evt-contain
];

const filesToCopy = bundles.flatMap(b => [`${b}.min.js`, `${b}.min.js.map`]);
const typeFiles = bundles.map(b => `${b}.d.ts`);

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
// Copy LICENSE, NOTICE verbatim
['LICENSE', 'NOTICE'].forEach(f => {
  const src = path.join(root, f);
  const dest = path.join(publishDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
});

// README needs relative-link rewriting so it renders on npmjs.com,
// which has no ./docs/ or ./LICENSE to resolve to.
{
  const src = path.join(root, 'README.md');
  const dest = path.join(publishDir, 'README.md');
  const repoBlobBase = 'https://github.com/TFrascaroli/velin/blob/main/';
  // Rewrite relative markdown links: anything that isn't an absolute URL
  // (has `://`), a mailto:, or a same-doc anchor (#…) gets prefixed with
  // the GitHub blob URL so it resolves on npmjs.com.
  const readme = fs.readFileSync(src, 'utf8').replace(
    /\]\(([^)\s]+?)(#[^)]*)?\)/g,
    (m, target, hash = '') => {
      if (/^([a-z]+:|#|\/\/)/i.test(target)) return m;
      const clean = target.replace(/^\.?\//, '');
      return `](${repoBlobBase}${clean}${hash})`;
    }
  );
  fs.writeFileSync(dest, readme);
  console.log('Wrote publish/README.md with rewritten relative links');
}

// Write a dedicated package.json for the publish/ tarball. The root
// package.json's paths (dist/build/…) are for local dev; the published
// package puts every bundle at the tarball root, so exports resolve to
// bare filenames.
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundleToPath = (b) => `./${b}.min.js`;
const bundleToTypes = (b) => `./${b}.d.ts`;

const subpaths = {
  '.':          'velin-all',
  './all':      'velin-all',
  './common':   'velin-common',
  './core':     'velin-core',
  './std':      'velin-standard',
  './templates':'velin-templates-and-fragments',
  './router':   'velin-router',
  './events':   'velin-events',
};

const publishPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  keywords: rootPkg.keywords,
  homepage: rootPkg.homepage,
  repository: rootPkg.repository,
  bugs: rootPkg.bugs,
  license: rootPkg.license,
  author: rootPkg.author,
  main: 'velin-all.min.js',
  types: 'velin-all.d.ts',
  exports: Object.fromEntries(
    Object.entries(subpaths).map(([sub, b]) => [sub, {
      import: bundleToPath(b),
      types: bundleToTypes(b),
    }])
  ),
  sideEffects: false,
};

// Strip undefined keys so the JSON stays clean.
for (const k of Object.keys(publishPkg)) if (publishPkg[k] === undefined) delete publishPkg[k];

fs.writeFileSync(
  path.join(publishDir, 'package.json'),
  JSON.stringify(publishPkg, null, 2) + '\n'
);
console.log('Wrote publish/package.json');

console.log('Prepared publish directory.');
