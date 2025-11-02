#!/usr/bin/env node

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function createServer(port = 8765) {
  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '../..', req.url === '/' ? '/benchmarks/init-perf/index.html' : req.url);

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
      console.log(`Server running at http://localhost:${port}/`);
      resolve(server);
    });
  });
}

async function runBenchmark() {
  const port = 8765;
  const server = await createServer(port);

  console.log('\n🚀 Starting automated benchmark...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Listen to console logs from the page
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('loaded') || text.includes('ready')) {
        console.log('  [Browser]', text);
      }
    });

    console.log(`📄 Loading benchmark page...`);
    await page.goto(`http://localhost:${port}/benchmarks/init-perf/index.html`, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for Velin to load
    await page.waitForFunction(() => window.Velin !== undefined, { timeout: 5000 });
    console.log('✓ Velin loaded');

    // Wait for Alpine to load
    await page.waitForFunction(() => window.Alpine !== undefined, { timeout: 5000 });
    console.log('✓ Alpine loaded\n');

    // Run benchmarks with different configurations
    const configs = [
      { domSize: 1000, density: 0, iterations: 5, name: '1K elements, 0% reactive (pure overhead)' },
      { domSize: 1000, density: 0.1, iterations: 5, name: '1K elements, 10% reactive (realistic)' },
      { domSize: 3000, density: 0.1, iterations: 3, name: '3K elements, 10% reactive (Alpine issue #566 scenario)' },
      { domSize: 5000, density: 0.05, iterations: 3, name: '5K elements, 5% reactive (large page)' },
    ];

    for (const config of configs) {
      console.log(`\n📊 Test: ${config.name}`);
      console.log('─'.repeat(80));

      // Set form values
      await page.evaluate((cfg) => {
        document.getElementById('domSize').value = cfg.domSize;
        document.getElementById('density').value = cfg.density;
        document.getElementById('iterations').value = cfg.iterations;
      }, config);

      // Click run button
      await page.click('#runTest');

      // Wait for results
      await page.waitForFunction(
        () => document.getElementById('results').style.display !== 'none',
        { timeout: 120000 }
      );

      // Extract results
      const results = await page.evaluate(() => {
        const velinAvg = parseFloat(document.querySelector('#resultsTable tbody tr:nth-child(1) td:nth-child(2)').textContent);
        const velinMin = parseFloat(document.querySelector('#resultsTable tbody tr:nth-child(1) td:nth-child(3)').textContent);
        const velinMax = parseFloat(document.querySelector('#resultsTable tbody tr:nth-child(1) td:nth-child(4)').textContent);
        const alpineAvg = parseFloat(document.querySelector('#resultsTable tbody tr:nth-child(2) td:nth-child(2)').textContent);
        const alpineMin = parseFloat(document.querySelector('#resultsTable tbody tr:nth-child(2) td:nth-child(3)').textContent);
        const alpineMax = parseFloat(document.querySelector('#resultsTable tbody tr:nth-child(2) td:nth-child(4)').textContent);
        const analysis = document.getElementById('analysis').textContent.trim();

        return { velinAvg, velinMin, velinMax, alpineAvg, alpineMin, alpineMax, analysis };
      });

      // Display results
      const speedup = results.alpineAvg / results.velinAvg;
      const winner = speedup > 1 ? 'Velin' : 'Alpine';
      const winnerColor = speedup > 1 ? '\x1b[32m' : '\x1b[33m';
      const reset = '\x1b[0m';

      console.log(`\n  Velin:   ${results.velinAvg.toFixed(2)}ms (min: ${results.velinMin.toFixed(2)}ms, max: ${results.velinMax.toFixed(2)}ms)`);
      console.log(`  Alpine:  ${results.alpineAvg.toFixed(2)}ms (min: ${results.alpineMin.toFixed(2)}ms, max: ${results.alpineMax.toFixed(2)}ms)`);
      console.log(`\n  ${winnerColor}Winner: ${winner} (${speedup > 1 ? speedup.toFixed(2) : (1/speedup).toFixed(2)}x faster)${reset}`);

      // Small delay between tests
      await page.evaluate(() => {
        document.getElementById('results').style.display = 'none';
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Benchmark completed!\n');

  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    throw error;
  } finally {
    await browser.close();
    server.close();
  }
}

// Run the benchmark
runBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
