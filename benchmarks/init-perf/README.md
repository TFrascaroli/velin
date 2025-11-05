# Initialization Performance Benchmark: Velin vs Alpine

This benchmark compares DOM initialization overhead between Velin and Alpine.js.

## What It Tests

**Key Difference:**
- **Velin**: Uses scoped binding `Velin.bind(container, state)` - only processes the specified subtree
- **Alpine**: Uses global initialization `Alpine.start()` - scans the entire document with `querySelectorAll('[x-data]')`

## The Alpine Issue

From [Alpine.js Issue #566](https://github.com/alpinejs/alpine/issues/566):
> "Just by embedding Alpine.js (without even using it) the performance gets slow when using 'many' DOM elements. Rendering took **11s with Alpine vs. 3s without Alpine** for 3,000 DOM elements."

The problem: Alpine runs `querySelectorAll` on the entire DOM during initialization, even for elements that don't use Alpine.

## Test Methodology

1. **Generate DOM**: Create a large DOM tree with configurable size
2. **Add Reactive Elements**: Sprinkle reactive elements at specified density (0-100%)
3. **Measure Initialization**:
   - Velin: `Velin.bind(container, state)` - scoped to container only
   - Alpine: `Alpine.initTree(container)` - still has discovery overhead
4. **Calculate Stats**: Average, min, max, standard deviation across multiple iterations

## Benchmark Files

### 1. `index.html` - Comprehensive Performance Test
Full benchmark with configurable parameters, statistical analysis, and detailed results.

### 2. `scoped-vs-global.html` - Visual Demonstration
Simple, interactive demo showing the real-world scenario: small reactive widget in a page with large 3rd-party DOM.

## How to Run

1. Build Velin first:
   ```bash
   npm run build
   ```

2. Serve the benchmark:
   ```bash
   # From project root
   npx http-server -p 8080
   ```

3. Open in browser:
   ```
   http://localhost:8080/benchmarks/init-perf/index.html
   # or
   http://localhost:8080/benchmarks/init-perf/scoped-vs-global.html
   ```

4. For `index.html`, configure test parameters:
   - **Total DOM Elements**: How many elements to create (100-10,000)
   - **Reactive Element Density**: What % should have reactive bindings
   - **Iterations**: How many times to run (for averaging)

5. Click "Run Benchmark"

## Expected Results

### With 0% Density (Overhead Test)
Tests pure initialization overhead when no reactive elements exist.

**Expected**: Velin should be significantly faster since it only iterates children and checks attributes, while Alpine has querySelectorAll overhead.

### With 10-25% Density (Realistic)
Most real-world apps have reactive elements scattered throughout the page.

**Expected**: Both frameworks should be fast, but Velin's scoped approach may show advantages with larger DOMs.

### With 100% Density (Stress Test)
Every element is reactive.

**Expected**: Similar performance since both frameworks need to process every element. The difference is in the discovery mechanism.

## Real-World Implications

**Velin's Advantage:**
- Can bind multiple isolated components: `Velin.bind(widget1)`, `Velin.bind(widget2)`
- Won't scan unrelated DOM trees
- No performance penalty from large non-reactive DOMs

**Alpine's Limitation:**
- Global `Alpine.start()` scans entire document
- Adding Alpine to a page with large 3rd-party widgets (charts, grids) incurs penalty
- Can't easily scope to specific subtrees
