const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = 'src';
const distDir = 'dist/build';
const files = fs.readdirSync(srcDir).filter(f => f.startsWith('velin-') && f.endsWith('.js'));

const baseConfig = {
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  sourcemap: true,
  format: 'iife',
  bundle: true,
  platform: 'browser',
  target: 'es2020', // Allow modern syntax for smaller output
  legalComments: 'none', // Remove license comments
};

const buildFile = async (file, isDev) => {
  const config = {
    ...baseConfig,
    define: { __DEV__: isDev ? 'true' : 'false' },
    treeShaking: !isDev,
  };

  const baseName = file.replace('.js', '');
  const outfile = `${distDir}/${baseName}${isDev ? '.dev' : '.min'}.js`;

  const includesCore = ['velin-core', 'velin-all'].includes(baseName);

  return esbuild.build({
    ...config,
    entryPoints: [`${srcDir}/${file}`],
    outfile,
    external: includesCore ? [] : ['./src/velin-core.js'],
  });
};

(async () => {
  for (const file of files) {
    await buildFile(file, true);  // dev
    await buildFile(file, false); // prod
  }
})().catch(() => process.exit(1));
