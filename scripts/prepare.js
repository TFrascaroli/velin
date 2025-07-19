const fs = require('fs');
const path = require('path');

const filesToCopy = [
  { src: 'dist/build/velin-all.min.js', dest: 'playground/velin.js' },
  { src: 'dist/build/velin-all.min.js.map', dest: 'playground/velin-all.min.js.map' }
];

filesToCopy.forEach(({ src, dest }) => {
  fs.copyFileSync(path.resolve(__dirname, '..', src), path.resolve(__dirname, '..', dest));
});
