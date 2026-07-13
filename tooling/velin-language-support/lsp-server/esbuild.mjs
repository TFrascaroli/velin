import { build, context } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const config = {
  entryPoints: [path.join(__dirname, 'src/server.ts')],
  outfile: path.join(__dirname, 'dist/server.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify,
  logLevel: 'info',
  // Shebang so the `velin-lsp` bin runs directly under Node.
  banner: { js: '#!/usr/bin/env node' },
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('esbuild watching lsp-server...');
} else {
  await build(config);
  console.log('esbuild done (lsp-server).');
}
