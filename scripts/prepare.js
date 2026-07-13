const fs = require('fs');
const path = require('path');

// Check for --dev argument
const isDev = process.argv.includes('--dev');
const sourceFile = isDev ? 'velin-all.dev.js' : 'velin-all.min.js';
const mapFile = isDev ? 'velin-all.dev.js.map' : 'velin-all.min.js.map';

const devtoolsSource = isDev ? 'velin-devtools.dev.js' : 'velin-devtools.min.js';
const devtoolsMap = isDev ? 'velin-devtools.dev.js.map' : 'velin-devtools.min.js.map';

const filesToCopy = [
  { src: `dist/build/${sourceFile}`, dest: 'playground/vendor/velin.js' },
  { src: `dist/build/${sourceFile}.map`, dest: `playground/vendor/${mapFile}` },
  { src: `dist/build/${devtoolsSource}`, dest: 'playground/vendor/velin-devtools.js' },
  { src: `dist/build/${devtoolsSource}.map`, dest: `playground/vendor/${devtoolsMap}` },
];

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = path.resolve(__dirname, '..', src);
  const destPath = path.resolve(__dirname, '..', dest);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} to ${dest}`);
  } else {
    console.warn(`Warning: ${src} not found, skipping`);
  }
});
