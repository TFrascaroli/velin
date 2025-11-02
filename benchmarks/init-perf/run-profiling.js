#!/usr/bin/env node

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function createServer(port = 8767) {
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
  const port = 8767;
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

    // Run all tests
    await page.evaluate(() => runAll());

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract results
    const resultsHTML = await page.evaluate(() => {
      return document.getElementById('results').innerHTML;
    });

    // Parse and display results
    const sections = resultsHTML.split('<h2>').slice(1);

    sections.forEach(section => {
      const titleMatch = section.match(/^(.+?)<\/h2>/);
      if (!titleMatch) return;

      const title = titleMatch[1].replace(/<[^>]*>/g, '');
      console.log(`\n📊 ${title}`);
      console.log('─'.repeat(80));

      const phaseMatches = section.matchAll(/<div class="phase">(.+?)<\/div>/g);
      for (const match of phaseMatches) {
        const content = match[1];
        const textContent = content.replace(/<[^>]*>/g, '');

        // Color code based on class
        let output = textContent;
        if (content.includes('class="slow"')) {
          output = `  \x1b[31m⚠ ${textContent}\x1b[0m`; // Red
        } else if (content.includes('class="time"')) {
          output = `  \x1b[33m→ ${textContent}\x1b[0m`; // Yellow
        } else if (content.includes('class="fast"')) {
          output = `  \x1b[32m✓ ${textContent}\x1b[0m`; // Green
        } else {
          output = `  ${textContent}`;
        }

        console.log(output);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Interpretation:');
    console.log('  \x1b[32m✓ Green (< 0.5ms):\x1b[0m Fast, well optimized');
    console.log('  \x1b[33m→ Yellow (0.5-1ms):\x1b[0m Acceptable, room for improvement');
    console.log('  \x1b[31m⚠ Red (> 1ms):\x1b[0m Slow, potential bottleneck');
    console.log('\n' + '='.repeat(80));
    console.log('✅ Profiling complete!\n');

  } catch (error) {
    console.error('❌ Profiling failed:', error.message);
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
