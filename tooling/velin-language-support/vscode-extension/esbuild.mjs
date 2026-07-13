import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify,
  logLevel: 'info',
};

const extensionBuild = {
  ...common,
  entryPoints: [path.join(__dirname, 'src/extension.ts')],
  outfile: path.join(__dirname, 'dist/extension.js'),
  external: ['vscode'],
};

const serverBuild = {
  ...common,
  entryPoints: [path.join(__dirname, '../lsp-server/src/server.ts')],
  outfile: path.join(__dirname, 'dist/server.js'),
  external: [],
};

if (watch) {
  const ctx1 = await (await import('esbuild')).context(extensionBuild);
  const ctx2 = await (await import('esbuild')).context(serverBuild);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('esbuild watching...');
} else {
  await Promise.all([build(extensionBuild), build(serverBuild)]);
  console.log('esbuild done.');
}
