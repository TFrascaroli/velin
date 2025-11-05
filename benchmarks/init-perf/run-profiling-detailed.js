#!/usr/bin/env node

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function createServer(port = 8768) {
  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '../..', req.url === '/' ? '/benchmarks/init-perf/profile-init.html' : req.url);

    const extname = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.map': 'application/json',
    }[extname] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('404 Not Found');
        } else {
          res.writeHead(500);
          res.end('Server Error: ' + err.code);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

async function runProfiling() {
  const port = 8768;
  const server = await createServer(port);

  console.log('\n🔬 Velin Initialization Profiling\n');
  console.log('Isolating performance bottlenecks...');
  console.log('='.repeat(80) + '\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    await page.goto(`http://localhost:${port}/benchmarks/init-perf/profile-init.html`, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    await page.waitForFunction(() => window.Velin !== undefined, { timeout: 5000 });

    // Test 1: State Setup
    console.log('📊 Test 1: State Setup (Proxy Wrapping)');
    console.log('─'.repeat(80));
    await page.evaluate(() => profileStateSetup());
    await new Promise(r => setTimeout(r, 500));

    let results = await page.evaluate(() => {
      const phases = Array.from(document.querySelectorAll('.phase'));
      return phases.map(p => ({
        text: p.textContent.trim(),
        className: p.querySelector('span') ? p.querySelector('span').className : ''
      }));
    });

    results.forEach(r => {
      const color = r.className === 'slow' ? '\x1b[31m' : r.className === 'time' ? '\x1b[33m' : '\x1b[32m';
      const symbol = r.className === 'slow' ? '⚠' : r.className === 'time' ? '→' : '✓';
      console.log(`  ${color}${symbol} ${r.text}\x1b[0m`);
    });

    // Test 2: DOM Traversal
    console.log('\n📊 Test 2: DOM Traversal (processNode)');
    console.log('─'.repeat(80));
    await page.evaluate(() => profileDOMTraversal());
    await new Promise(r => setTimeout(r, 500));

    results = await page.evaluate(() => {
      const phases = Array.from(document.querySelectorAll('.phase'));
      return phases.map(p => ({
        text: p.textContent.trim(),
        className: p.querySelector('span') ? p.querySelector('span').className : ''
      }));
    });

    results.forEach(r => {
      const color = r.className === 'slow' ? '\x1b[31m' : r.className === 'time' ? '\x1b[33m' : '\x1b[32m';
      const symbol = r.className === 'slow' ? '⚠' : r.className === 'time' ? '→' : '✓';
      console.log(`  ${color}${symbol} ${r.text}\x1b[0m`);
    });

    // Test 3: Plugin Processing
    console.log('\n📊 Test 3: Plugin Processing (Expression Evaluation)');
    console.log('─'.repeat(80));
    await page.evaluate(() => profilePluginProcessing());
    await new Promise(r => setTimeout(r, 500));

    results = await page.evaluate(() => {
      const phases = Array.from(document.querySelectorAll('.phase'));
      return phases.map(p => ({
        text: p.textContent.trim(),
        className: p.querySelector('span') ? p.querySelector('span').className : ''
      }));
    });

    results.forEach(r => {
      const color = r.className === 'slow' ? '\x1b[31m' : r.className === 'time' ? '\x1b[33m' : '\x1b[32m';
      const symbol = r.className === 'slow' ? '⚠' : r.className === 'time' ? '→' : '✓';
      console.log(`  ${color}${symbol} ${r.text}\x1b[0m`);
    });

    // Test 4: ComposeState
    console.log('\n📊 Test 4: ComposeState (Loop Substates)');
    console.log('─'.repeat(80));
    await page.evaluate(() => profileComposeState());
    await new Promise(r => setTimeout(r, 500));

    results = await page.evaluate(() => {
      const phases = Array.from(document.querySelectorAll('.phase'));
      return phases.map(p => ({
        text: p.textContent.trim(),
        className: p.querySelector('span') ? p.querySelector('span').className : ''
      }));
    });

    results.forEach(r => {
      const color = r.className === 'slow' ? '\x1b[31m' : r.className === 'time' ? '\x1b[33m' : '\x1b[32m';
      const symbol = r.className === 'slow' ? '⚠' : r.className === 'time' ? '→' : '✓';
      console.log(`  ${color}${symbol} ${r.text}\x1b[0m`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Interpretation:');
    console.log('  \x1b[32m✓ Green:\x1b[0m Fast, well optimized');
    console.log('  \x1b[33m→ Yellow:\x1b[0m Acceptable, room for improvement');
    console.log('  \x1b[31m⚠ Red:\x1b[0m Slow, potential bottleneck');
    console.log('\n' + '='.repeat(80));
    console.log('✅ Profiling complete!\n');

  } catch (error) {
    console.error('❌ Profiling failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await browser.close();
    server.close();
  }
}

// Run the profiling
runProfiling().catch(err => {
  console.error(err);
  process.exit(1);
});
