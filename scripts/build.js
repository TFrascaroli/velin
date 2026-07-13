const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = 'src';
const distDir = 'dist/build';

// velin-devhook.js is a dev-only module imported by velin-core under an
// `if (__DEV__)` gate. It is not an entrypoint — esbuild bundles it into
// core.dev.js and tree-shakes it out of core.min.js. So we filter it out.
const excludedEntrypoints = new Set(['velin-devhook.js']);

const files = fs
  .readdirSync(srcDir)
  .filter(f => f.startsWith('velin-') && f.endsWith('.js') && !excludedEntrypoints.has(f));

const baseConfig = {
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  sourcemap: true,
  format: 'iife',
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  legalComments: 'none',
};

const buildFile = async (file, isDev) => {
  const config = {
    ...baseConfig,
    define: { __DEV__: isDev ? 'true' : 'false' },
    treeShaking: !isDev,
  };

  const baseName = file.replace('.js', '');
  const outfile = `${distDir}/${baseName}${isDev ? '.dev' : '.min'}.js`;

  const includesCore = ['velin-core', 'velin-all', 'velin-common', 'velin-devtools'].includes(baseName);

  return esbuild.build({
    ...config,
    entryPoints: [`${srcDir}/${file}`],
    outfile,
    external: includesCore ? [] : ['./src/velin-core.js'],
  });
};

function assertProdBuild() {
  const failures = [];
  const allMin = fs.readdirSync(distDir).filter(f => f.endsWith('.min.js'));
  // velin-devtools is itself devtools; the checks below apply only to core Velin artifacts.
  const coreMin = allMin.filter(f => f !== 'velin-devtools.min.js');

  const forbidden = [
    { needle: '__VELIN_DEVTOOLS_HOOK__', why: 'devtools hook name in prod build' },
    { needle: 'ø__devtools', why: 'ø__devtools property in prod build' },
    { needle: 'velin-devhook', why: 'velin-devhook reference in prod build' },
  ];

  for (const f of coreMin) {
    const content = fs.readFileSync(path.join(distDir, f), 'utf8');
    for (const { needle, why } of forbidden) {
      if (content.includes(needle)) failures.push(`${f}: contains "${needle}" (${why})`);
    }
  }

  // Sanity: the devtools companion .min.js must reference the hook name.
  const devtoolsMin = path.join(distDir, 'velin-devtools.min.js');
  if (fs.existsSync(devtoolsMin)) {
    const c = fs.readFileSync(devtoolsMin, 'utf8');
    if (!c.includes('__VELIN_DEVTOOLS_HOOK__')) {
      failures.push('velin-devtools.min.js: expected reference to __VELIN_DEVTOOLS_HOOK__');
    }
  }

  if (failures.length) {
    console.error('Post-build assertions failed:\n' + failures.map(x => '  - ' + x).join('\n'));
    process.exit(1);
  }
}

(async () => {
  for (const file of files) {
    await buildFile(file, true);
    await buildFile(file, false);
  }
  assertProdBuild();
})().catch((err) => { console.error(err); process.exit(1); });
