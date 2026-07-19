// Site shell: router, page loader, examples + docs catalogs, helpers.

// -- Data catalogs ---------------------------------------------------------

// Example categories, in display order.
const EXAMPLE_CATEGORIES = [
  { id: 'basics',      name: 'Basics',       blurb: 'Start here.' },
  { id: 'forms',       name: 'Forms',        blurb: 'Inputs, validation, submission.' },
  { id: 'data',        name: 'Data',         blurb: 'Lists, CRUD, search, filtering.' },
  { id: 'ui',          name: 'UI patterns',  blurb: 'Modals, tabs, accordions, theming.' },
  { id: 'navigation',  name: 'Navigation',   blurb: 'Routing and lifecycle.' },
  { id: 'performance', name: 'Performance',  blurb: 'Stress tests and virtual scrolling.' },
  { id: 'debugging',   name: 'Debugging',    blurb: 'Poking at directives and state.' },
];

// Every example the site knows about. `type` decides how the demo mounts:
//   'runner'     — fragment + optional state module, hosted in /runner.html
//   'standalone' — full HTML page in /playground/, embedded directly
function makeExample(overrides) {
  const base = {
    id: '', title: '', category: 'basics', blurb: '',
    type: 'runner', markup: '', state: '', standalone: '', files: [],
  };
  const ex = Object.assign({}, base, overrides);
  if (!ex.files.length) {
    if (ex.type === 'runner') {
      if (ex.markup) ex.files.push({ name: fileName(ex.markup), url: ex.markup, lang: 'html' });
      if (ex.state)  ex.files.push({ name: fileName(ex.state),  url: ex.state,  lang: 'js'   });
    } else if (ex.type === 'standalone') {
      ex.files.push({ name: fileName(ex.standalone), url: ex.standalone, lang: 'html' });
    }
  }
  return ex;
}
function fileName(url) { return url.split('/').pop(); }

const EXAMPLES = [
  makeExample({
    id: 'hello-world',
    title: 'Hello, world',
    category: 'basics',
    blurb: 'The minimal Velin app — one input, one binding.',
    type: 'standalone',
    standalone: 'playground/hello-world.html',
  }),
  makeExample({
    id: 'form',
    title: 'Form validation',
    category: 'forms',
    blurb: 'Reactive form with per-field validation and submit state.',
    markup: 'playground/examples/form.html',
    state:  'playground/examples/form.js',
  }),
  makeExample({
    id: 'crud',
    title: 'CRUD',
    category: 'data',
    blurb: 'Task manager: create, read, update, delete.',
    markup: 'playground/examples/crud.html',
    state:  'playground/examples/crud.js',
  }),
  makeExample({
    id: 'search',
    title: 'Search & filter',
    category: 'data',
    blurb: 'Real-time filtering with a custom highlight plugin.',
    markup: 'playground/examples/search.html',
    state:  'playground/examples/search.js',
    files: [
      { name: 'search.html',        url: 'playground/examples/search.html',        lang: 'html' },
      { name: 'search.js',          url: 'playground/examples/search.js',          lang: 'js'   },
      { name: 'search-plugin.js',   url: 'playground/examples/search-plugin.js',   lang: 'js'   },
    ],
  }),
  makeExample({
    id: 'cart',
    title: 'Shopping cart',
    category: 'data',
    blurb: 'Add and remove items; totals recompute automatically.',
    markup: 'playground/examples/cart.html',
    state:  'playground/examples/cart.js',
  }),
  makeExample({
    id: 'modal',
    title: 'Modal dialog',
    category: 'ui',
    blurb: 'Overlay modal with backdrop click-to-dismiss.',
    markup: 'playground/examples/modal.html',
    state:  'playground/examples/modal.js',
  }),
  makeExample({
    id: 'tabs',
    title: 'Tabs',
    category: 'ui',
    blurb: 'Tabbed interface with dynamic content.',
    markup: 'playground/examples/tabs.html',
    state:  'playground/examples/tabs.js',
  }),
  makeExample({
    id: 'accordion',
    title: 'Accordion',
    category: 'ui',
    blurb: 'Expandable sections with toggle state.',
    markup: 'playground/examples/accordion.html',
    state:  'playground/examples/accordion.js',
  }),
  makeExample({
    id: 'themes',
    title: 'Theme switcher',
    category: 'ui',
    blurb: 'Blog rendered through four interchangeable templates.',
    markup: 'playground/examples/themes.html',
    state:  'playground/examples/themes.js',
  }),
  makeExample({
    id: 'router',
    title: 'Router & lifecycle',
    category: 'navigation',
    blurb: 'Positional routes, sub-routes, 404, mount/unmount hooks.',
    type: 'standalone',
    standalone: 'playground/router.html',
  }),
  makeExample({
    id: 'virtual-table',
    title: 'Virtual table (500k rows)',
    category: 'performance',
    blurb: 'Windowed rendering over half a million rows.',
    type: 'standalone',
    standalone: 'playground/benchmarks/virtual-table.html',
  }),
  makeExample({
    id: 'directive-inspector',
    title: 'Directive inspector',
    category: 'debugging',
    blurb: 'Four-quadrant view of directive parse, evaluate, and render.',
    type: 'standalone',
    standalone: 'playground/directive-inspector.html',
  }),
];

// Pre-grouped for the gallery: Velin's parser can't chain `[i]` or `.prop`
// after a function call, so vln-loop can't be driven by
// `examplesInCategory(cat.id)` inside a template. Precompute here.
const CATEGORIES_WITH_EXAMPLES = EXAMPLE_CATEGORIES
  .map(cat => Object.assign({}, cat, {
    items: EXAMPLES.filter(e => e.category === cat.id),
  }))
  .filter(cat => cat.items.length > 0);

// Docs catalog — each entry points at a markdown file under /docs/.
const DOCS = [
  { id: 'getting-started', title: 'Getting Started', blurb: 'Installation, first app, and core concepts.',    file: 'docs/getting-started.md' },
  { id: 'directives',      title: 'Directives',      blurb: 'Complete reference for every built-in vln-*.',   file: 'docs/directives.md' },
  { id: 'api-reference',   title: 'API Reference',   blurb: 'Public JavaScript API surface.',                 file: 'docs/api-reference.md' },
  { id: 'templates',       title: 'Templates & Fragments', blurb: 'Composition patterns for reusable views.', file: 'docs/templates.md' },
  { id: 'plugins',         title: 'Creating Plugins',blurb: 'Extend Velin with custom directives.',           file: 'docs/plugins.md' },
  { id: 'bundles',         title: 'Choosing a Bundle', blurb: 'Which bundle to load for which use case.',     file: 'docs/bundles.md' },
  { id: 'devtools',        title: 'Devtools',        blurb: 'The in-page inspector for state and updates.',   file: 'docs/devtools.md' },
];

// -- vln-page plugin: fetch a fragment and bind optional state -------------

Velin.plugins.registerPlugin({
  name: 'page',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked, pluginState = {} }) => {
    if (!tracked || !tracked.markup) return { halt: true };
    if (pluginState.loadedMarkup === tracked.markup) return { halt: true, pluginState };

    pluginState.loadedMarkup = tracked.markup;
    const marker = Symbol('page-req');
    pluginState.marker = marker;

    fetch(tracked.markup)
      .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(html => {
        if (pluginState.marker !== marker) return;
        node.innerHTML = html;
        const childState = tracked.state
          ? (typeof tracked.state === 'function' ? tracked.state() : tracked.state)
          : {};
        Velin.bind(node, childState);
      })
      .catch(err => {
        if (pluginState.marker !== marker) return;
        node.innerHTML = '<div class="page-error"><h2>Failed to load page</h2><pre>' +
          String(err) + '</pre></div>';
      });

    return { halt: true, pluginState };
  },
});

// -- Route helpers ---------------------------------------------------------

const KNOWN_ROUTES = [
  /^\/$/,
  /^\/learn(\/[^/]+)?$/,
  /^\/examples(\/[^/]+)?$/,
  /^\/docs(\/[^/]+)?$/,
  /^\/devtools$/,
  /^\/tooling\/vscode$/,
];

function pathSegments(path) {
  return (path || '').split('/').filter(Boolean);
}

// -- Top-level state -------------------------------------------------------

Velin.bind(document.getElementById('app'), {
  route: { path: '/', error: null, loading: false },

  categories:             EXAMPLE_CATEGORIES,
  categoriesWithExamples: CATEGORIES_WITH_EXAMPLES,
  examples:               EXAMPLES,
  docs:                   DOCS,

  pages: {
    landing:  { markup: 'pages/landing.html' },
    learn:    { markup: 'pages/learn.html' },
    devtools: { markup: 'pages/devtools.html' },
    vscode:   { markup: 'pages/vscode.html' },
  },

  startsWith(str, prefix) {
    return typeof str === 'string' && str.indexOf(prefix) === 0;
  },
  isKnownRoute(path) {
    if (!path) return true;
    return KNOWN_ROUTES.some(re => re.test(path));
  },
  segment(path, i) {
    return pathSegments(path)[i] || '';
  },

  // Example helpers (module-level refs — safe to call from any loop scope)
  examplesInCategory(catId) {
    return EXAMPLES.filter(e => e.category === catId);
  },
  getExample(id) {
    return EXAMPLES.find(e => e.id === id) || null;
  },
  demoUrlFor(ex) {
    if (!ex) return '';
    if (ex.type === 'standalone') return ex.standalone;
    const q = new URLSearchParams();
    if (ex.markup) q.set('markup', ex.markup);
    if (ex.state)  q.set('state', ex.state);
    return '/runner.html?' + q.toString();
  },
  hrefFor(ex) {
    return '#/examples/' + ex.id;
  },
  categoryName(id) {
    const cat = EXAMPLE_CATEGORIES.find(c => c.id === id);
    return cat ? cat.name : id;
  },

  // Docs helpers
  getDoc(id) {
    return DOCS.find(d => d.id === id) || null;
  },
});
