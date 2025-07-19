const express = require('express');
const path = require('path');

const app = express();
const port = 3123;

// Serve the main playground
app.use('/', express.static(path.join(__dirname, '..', 'playground')));

// Dynamically serve benchmark dist folders
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
  console.log(`Benchmark server running at http://localhost:${port}`);
});
