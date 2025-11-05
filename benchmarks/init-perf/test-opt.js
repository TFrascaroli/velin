const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

function createServer(port = 8769) {
  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '../..', req.url === '/' ? '/benchmarks/init-perf/test-optimizations.html' : req.url);
    const extname = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
    }[extname] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('404');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

(async () => {
  const server = await createServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('http://localhost:8769/benchmarks/init-perf/test-optimizations.html');
  await new Promise(r => setTimeout(r, 1000));

  const results = await page.evaluate(() => {
    return {
      test1: document.getElementById('test1').textContent,
      test2: document.getElementById('test2').textContent,
      test3: document.getElementById('test3').textContent,
      test4: document.getElementById('test4').textContent,
    };
  });

  console.log('\n🔬 Optimization Candidates\n');
  console.log('═'.repeat(80));
  console.log('\nTest 1: Array.from(attributes) vs Direct Iteration');
  console.log('─'.repeat(80));
  console.log(results.test1);
  console.log('\n\nTest 2: Array.from(children) vs Direct Iteration');
  console.log('─'.repeat(80));
  console.log(results.test2);
  console.log('\n\nTest 3: Sorting Overhead (Skip when <=1 item)');
  console.log('─'.repeat(80));
  console.log(results.test3);
  console.log('\n\nTest 4: Early Exit Optimization');
  console.log('─'.repeat(80));
  console.log(results.test4);
  console.log('\n' + '═'.repeat(80));

  await browser.close();
  server.close();
})();
