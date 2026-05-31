# Velin

**A lightweight reactive library for building interactive UIs with a pure JavaScript model.**

Velin is a fine-grained reactivity engine for plain HTML and JavaScript. It uses native Proxies to track state changes and surgically update the DOM, requiring no build step, no JSX, and no virtual DOM.

### Why Velin?

*   **Logic in JS, View in HTML**: Velin keeps your business logic in standard, testable JavaScript objects rather than embedding it in HTML attributes.
*   **CSP Friendly & Secure**: Built with an AST-based evaluator instead of `eval()` or `new Function()`. It is fully compatible with strict Content Security Policies (CSP) and ready for enterprise environments.
*   **Fine-Grained Reactivity**: Changing a property only triggers updates for the specific DOM elements that depend on it.
*   **Scale Naturally**: Designed for interactive widgets and light-to-medium SPAs. You can modularize your state naturally as your project grows.
*   **Minimal Footprint**: ~6KB gzipped for the standard library.

## Getting Started

### Via CDN

Add this to your HTML `<head>`:

```html
<script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
```

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

-   **Velin Router** - Minimal, state-driven client-side routing.
-   **DevTools** - Browser extension for direct state inspection.
-   **Async Patterns** - Standardized practices for loading and error states.

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
