const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3123;
const isDev = process.argv.includes('--dev');

const repoRoot       = path.join(__dirname, '..');
const siteDir        = path.join(repoRoot, 'site');
const playgroundDir  = path.join(repoRoot, 'playground');
const docsDir        = path.join(repoRoot, 'docs');

if (isDev) {
  // Copy the devtools companion into playground/vendor/ so /playground/vendor/velin-devtools.js works.
  const src = path.join(repoRoot, 'dist/build/velin-devtools.dev.js');
  const dest = path.join(playgroundDir, 'vendor', 'velin-devtools.js');
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('[serve:dev] copied velin-devtools.dev.js -> playground/vendor/velin-devtools.js');
  } else {
    console.warn('[serve:dev] velin-devtools.dev.js not found — did the build run?');
  }
}

// Rewrite any live <script src="https://unpkg.com/@velinjs/…"></script> to the
// local dev bundle. Requires a real <script tag; escaped snippets in <pre><code>
// documentation (which read `&lt;script src="https://unpkg.com/…`) never match
// and are left alone. Anchored on the exact @velinjs scope so unrelated unpkg
// scripts (marked, tailwind, etc.) aren't touched.
const UNPKG_VELIN = /(<script\b[^>]*\bsrc=)(["'])https:\/\/unpkg\.com\/@velinjs\/[^"']+\2/g;
const LOCAL_BUNDLE = '/playground/vendor/velin.js';
const DEVTOOLS_TAG = '\n<script src="/playground/vendor/velin-devtools.js"></script>\n';

function transformHtml(html) {
  let out = html.replace(UNPKG_VELIN, (_m, prefix, quote) => `${prefix}${quote}${LOCAL_BUNDLE}${quote}`);
  if (isDev) {
    out = out.includes('</body>') ? out.replace('</body>', DEVTOOLS_TAG + '</body>') : out + DEVTOOLS_TAG;
  }
  return out;
}

function serveHtml(baseDir) {
  return (req, res, next) => {
    if (!req.path.endsWith('.html') && req.path !== '/') return next();
    const rel = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
    const file = path.join(baseDir, rel);
    fs.readFile(file, 'utf8', (err, html) => {
      if (err) return next();
      res.type('html').send(transformHtml(html));
    });
  };
}

// Playground: canonicalize trailing slash so relative asset URLs resolve, then
// transform html, then let express.static serve everything else.
app.use('/playground', (req, res, next) => {
  if (req.path === '/' && !req.originalUrl.endsWith('/')) {
    return res.redirect(301, req.originalUrl + '/');
  }
  next();
});
app.use('/playground', serveHtml(playgroundDir));
app.use('/playground', express.static(playgroundDir));

// Site: transform html at the root, then static.
app.use('/', serveHtml(siteDir));
app.use('/', express.static(siteDir));

// Docs served raw for Phase 2 (vln-md fetches these).
app.use('/docs', express.static(docsDir));

// Root-level assets the site references (e.g. /logo.svg).
app.get('/logo.svg', (req, res) => res.sendFile(path.join(repoRoot, 'logo.svg')));

const benchmarks = [{
    name: 'angular',
    dist: 'benchmarks/angular/dist/angular-reactive-benchmark/browser',
},{
  name: 'alpine',
  dist: 'benchmarks/alpine/cdn',
},{
  name: 'react',
  dist: 'benchmarks/react/build',
}];

benchmarks.forEach(framework => {
  const distPath = path.join(repoRoot, framework.dist);
  app.use(`/${framework.name}`, express.static(distPath));
});

app.listen(port, () => {
  console.log(`Site:       http://localhost:${port}/`);
  console.log(`Playground: http://localhost:${port}/playground/${isDev ? '  (devtools enabled — Ctrl+Shift+V)' : ''}`);
});
