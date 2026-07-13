const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3123;
const isDev = process.argv.includes('--dev');

const playgroundDir = path.join(__dirname, '..', 'playground');

if (isDev) {
  // Copy the devtools companion into playground/vendor/ so /vendor/velin-devtools.js works.
  const src = path.join(__dirname, '..', 'dist/build/velin-devtools.dev.js');
  const dest = path.join(playgroundDir, 'vendor', 'velin-devtools.js');
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('[serve:dev] copied velin-devtools.dev.js -> playground/vendor/velin-devtools.js');
  } else {
    console.warn('[serve:dev] velin-devtools.dev.js not found — did the build run?');
  }

  // Inject the devtools <script> tag into any HTML the playground serves.
  const inject = '\n<script src="/vendor/velin-devtools.js"></script>\n';
  app.use((req, res, next) => {
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

app.use('/', express.static(playgroundDir));

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
  const distPath = path.join(__dirname, '..', framework.dist);
  app.use(`/${framework.name}`, express.static(distPath));
});

app.listen(port, () => {
  console.log(`Playground server running at http://localhost:${port}${isDev ? ' (devtools enabled — Ctrl+Shift+V)' : ''}`);
});
