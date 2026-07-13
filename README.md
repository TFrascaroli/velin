# Velin

**Reactive UIs without a build step, a virtual DOM, or `.value` ceremony.**

**[Try it live →](https://tfrascaroli.github.io/velin/)** &nbsp;·&nbsp; [Docs](./docs/) &nbsp;·&nbsp; [Bundles guide](./docs/bundles.md)

### Why Velin?

I built Velin because I got tired of state being scattered across a dozen framework abstractions. When you're debugging and your model lives half in a hook, half in a store, half in a component prop, and half in a local ref — something has gone wrong. The **M** in MVC deserves the same respect we've always given the **V** and the **C**: it should be a plain object you can read, log, and step through.

Reactivity shouldn't need `useState` tuples with their return-set functions, or "signals" bolted onto a framework that wasn't designed for them. A property is a property; assigning to it should be enough. Velin uses native Proxies so that's the whole story — no `.value`, no setters, no ceremony:

```html
<script src="https://unpkg.com/@velinjs/all/velin-common.min.js"></script>

<div id="app">
  <h1 vln-text="'Hello, ' + name + '!'"></h1>
  <input vln-input="name" />
</div>

<script>
  Velin.bind(document.getElementById('app'), { name: 'World' });
</script>
```

That's the whole setup story: one script tag, one `bind` call, one plain object. For anything more interesting than this, head to the [playground](https://tfrascaroli.github.io/velin/) — it's got a form, CRUD, a router, a virtual table with 500k rows, and more.

I also dislike magic. Naming conventions that decide routing behavior, component I/O by convention, obscure attribute syntax you have to Google — all of it makes code harder to read for anyone who wasn't there the day it was written. And state doesn't belong in your HTML: the template is the **V**, not the **M**. Velin keeps state in JavaScript objects and directives short, declarative, and boring.

And the bloat. Velin ships a full CSP-compliant AST evaluator instead of leaning on `eval()` or `new Function()` — and it's *still* smaller than the alternatives. **9.8 KB gzipped for the everything bundle, 8.4 KB gzipped for the everyday combo** (core + directives). Load only what you use — see [bundles](docs/bundles.md).

**Status:** Velin core is in **beta** (`1.0.0-beta.0`) — the API surface is mostly settled, performance and usability are where I want them, only a few remaining edges to smooth. The companion **Velin devtools is in alpha** (`0.1.0-alpha.0`) — it works and answers the questions it claims to, but expect rough visuals and shifting user journeys.

## Getting Started

### Via CDN

Most apps only need core + directives — use `velin-common`:

```html
<script src="https://unpkg.com/@velinjs/all/velin-common.min.js"></script>
```

If you want the kitchen sink (adds fragments, router, event helpers):

```html
<script src="https://unpkg.com/@velinjs/all/velin-all.min.js"></script>
```

### Via npm

```bash
npm install @velinjs/all
```

Every bundle ships at the package root. Serve whichever one you need:

```html
<script src="/node_modules/@velinjs/all/velin-common.min.js"></script>
```

See [docs/bundles.md](docs/bundles.md) for the full table and size-per-feature guidance.

## Roadmap

Velin is under active development. Current priorities:

-   **DevTools polish** - Devtools ships as an in-page companion (`./devtools`), currently in alpha; visual polish and clearer user journeys are next.
-   **Stable Plugin API** - Frozen `PluginContext` surface so third-party plugins survive core refactors.
-   **Async Patterns** - Standardized practices for loading and error states.

## Modular Architecture

Velin is split into modules for optimal bundle size:

-   **`velin-core.js`** (~6.2 KB gzipped) - Core reactivity, expression evaluator, plugin system.
-   **`velin-standard.js`** (~2.7 KB gzipped) - Standard directives (text, if, loop, input, on, attr, class, use, watch).
-   **`velin-templates-and-fragments.js`** (~1.0 KB gzipped) - Template and Fragment support.
-   **`velin-events.js`** (~0.6 KB gzipped) - Event orchestration (alias, contain).
-   **`velin-router.js`** (~1.0 KB gzipped) - Optional state-driven hash router.
-   **`velin-all.js`** (~9.8 KB gzipped) - Everything bundled.

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

### Editor Support (experimental)

A VS Code extension with LSP-backed IntelliSense for `vln-*` directives lives in [`tooling/velin-language-support/`](./tooling/velin-language-support/). It's a work in progress and **not** published to the Marketplace yet. If you want to try it, build and install locally:

```bash
cd tooling/velin-language-support
npm install
npm run build
npm run package:vscode
# Then in VS Code: Extensions → ... menu → Install from VSIX
```

## License

[Apache 2.0](./LICENSE)

© 2026 Timoteo Frascaroli ([@tfrascaroli](https://github.com/tfrascaroli))
