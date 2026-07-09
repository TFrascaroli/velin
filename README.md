# Velin

**A lightweight reactive library for building interactive UIs with a pure JavaScript model.**

**Status:** Velin core is in **beta** (`1.0.0-beta.0`) — the API surface is mostly settled, performance and usability are where I want them, only a few kinks left. The companion **Velin devtools is in alpha** (`0.1.0-alpha.0`) — it works and answers the questions it claims to, but expect rough visuals and shifting user journeys.

Velin is a fine-grained reactivity engine for plain HTML and JavaScript. It uses native Proxies to track state changes and surgically update the DOM, requiring no build step, no JSX, and no virtual DOM.

### Why Velin?

*   **CSP Friendly & Secure**: Built with an AST-based evaluator instead of `eval()` or `new Function()`. Drops into strict Content Security Policy environments without `unsafe-eval`.
*   **Logic in JS, View in HTML**: Velin keeps your business logic in standard, testable JavaScript objects rather than embedding it in HTML attributes.
*   **Fine-Grained Reactivity**: Changing a property only triggers updates for the specific DOM elements that depend on it.
*   **Scale Naturally**: Designed for interactive widgets and light-to-medium SPAs. You can modularize your state naturally as your project grows.
*   **Minimal Footprint**: 9.8 KB gz for the everything-included bundle, 8.4 KB gz for the everyday combo (core + directives). Load only what you use — see [bundles](docs/bundles.md).

## Getting Started

### Via CDN

Most apps only need core + directives — use `velin-common`:

```html
<script src="https://unpkg.com/velin/velin-common.min.js"></script>
```

If you want the kitchen sink (adds fragments, router, event helpers):

```html
<script src="https://unpkg.com/velin/velin-all.min.js"></script>
```

See [docs/bundles.md](docs/bundles.md) for the full table and size-per-feature guidance.

### The Velin Pattern

```html
<div id="app">
  <h1 vln-text="'Hello, ' + name + '!'"></h1>
  <input vln-input="name" />
</div>

<script>
  // State is a plain JS object
  const state = Velin.bind(document.getElementById('app'), {
    name: 'World'
  });
</script>
```

## Core Features

-   **Proxy-Based State**: Plain JS objects become reactive automatically.
-   **Directives**: Declarative HTML attributes for DOM binding (`vln-text`, `vln-if`, `vln-loop`, etc.).
-   **Component Pattern**: Use Templates and Fragments with native lifecycle events (`init`/`destroy`).
-   **Side-Effects**: Use `vln-watch` to bridge state changes to external logic.
-   **Eventing**: Native DOM bubbling for high-utility event orchestration.

## Roadmap

Velin is under active development. Current priorities:

-   **DevTools polish** - Devtools ships as an in-page companion (`./devtools`), currently in alpha; visual polish and clearer user journeys are next.
-   **Stable Plugin API** - Frozen `PluginContext` surface so third-party plugins survive core refactors.
-   **Async Patterns** - Standardized practices for loading and error states.

## Modular Architecture

Velin is split into modules for optimal bundle size:

-   **`velin-core.js`** (~5.5KB gzipped) - Core reactivity, expression evaluator, plugin system.
-   **`velin-standard.js`** (~2.0KB gzipped) - Standard directives (text, if, loop, input, on, attr, class, use, watch).
-   **`velin-templates-and-fragments.js`** (~1.0KB gzipped) - Template and Fragment support.
-   **`velin-events.js`** (~0.6KB gzipped) - Event orchestration (alias, contain).
-   **`velin-router.js`** (~1.1KB gzipped) - Optional state-driven hash router.
-   **`velin-all.js`** (~8.5KB gzipped) - Everything bundled (recommended).

## Development

### Run Tests
```bash
npm test
```

### Documentation
Full documentation is available in the [docs/](./docs/) directory.

- [Getting Started](./docs/getting-started.md)
- [Directives Guide](./docs/directives.md)
- [Templates & Components](./docs/templates.md)
- [API Reference](./docs/api-reference.md)
- [Creating Plugins](./docs/plugins.md)

## License

[Apache 2.0](./LICENSE)

© 2025 Timoteo Frascaroli ([@tfrascaroli](https://github.com/tfrascaroli))
