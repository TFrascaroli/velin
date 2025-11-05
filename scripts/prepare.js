const fs = require('fs');
const path = require('path');

// Check for --dev argument
const isDev = process.argv.includes('--dev');
const sourceFile = isDev ? 'velin-all.dev.js' : 'velin-all.min.js';

const filesToCopy = [
  { src: `dist/build/${sourceFile}`, dest: 'playground/velin.js' },
  { src: 'dist/build/velin-all.min.js.map', dest: 'playground/velin-all.min.js.map' }
];

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = path.resolve(__dirname, '..', src);
  const destPath = path.resolve(__dirname, '..', dest);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} to ${dest}`);
  } else {
    console.warn(`Warning: ${src} not found, skipping`);
  }
});
