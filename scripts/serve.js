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

  // Inject the devtools <script> tag into any HTML the playground serves.
  const inject = '\n<script src="/playground/vendor/velin-devtools.js"></script>\n';
  app.use('/playground', (req, res, next) => {
    if (!req.path.endsWith('.html') && req.path !== '/') return next();
    const rel = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
    const file = path.join(playgroundDir, rel);
    fs.readFile(file, 'utf8', (err, html) => {
      if (err) return next();
      const injected = html.includes('</body>')
        ? html.replace('</body>', inject + '</body>')
        : html + inject;
      res.type('html').send(injected);
    });
  });
}

// New front door: the site.
app.use('/', express.static(siteDir));

// Existing playground moves under /playground and keeps working.
app.use('/playground', express.static(playgroundDir));

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
