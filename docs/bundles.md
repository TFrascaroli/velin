# Choosing a bundle

Velin ships seven bundles. Most pages don't need `velin-all`. Pick the
smallest one that covers your directives.

Sizes are minified / gzipped, current as of the last release.

| Bundle | Min | Gzip | Contents | Common use |
|---|---:|---:|---|---|
| **velin-core** | 16.6 KB | 6.2 KB | Reactive state, expression evaluator, plugin machinery — no directives. | You're writing your own plugins and don't need built-ins. |
| **velin-standard** | 6.9 KB | 2.7 KB | The nine everyday directives: `vln-text`, `vln-if`, `vln-attr`, `vln-class`, `vln-on`, `vln-input`, `vln-watch`, `vln-loop`, `vln-use`. **Requires core.** | Never used on its own — see `velin-common`. |
| **velin-common** | 23.5 KB | 8.4 KB | `velin-core` + `velin-standard`, prebundled. | **The default for most apps** — everyday interactive HTML without fragments/router/events. |
| **velin-templates-and-fragments** | 1.8 KB | 1.0 KB | `<template>` support and `vln-fragment` — reusable render islands. **Requires core.** | You have repeated sub-trees you want to keep in one place. |
| **velin-router** | 2.1 KB | 1.0 KB | `vln-router` and `vln-route` — hash-based SPA routing. **Requires core.** | You're building a single-page app with URL-driven views. |
| **velin-events** | 1.0 KB | 0.6 KB | `vln-evt-alias` and `vln-evt-contain` — advanced event routing. **Requires core.** | You need to rename events or contain propagation across a subtree. |
| **velin-all** | 28.3 KB | 9.8 KB | Everything above in one file. | You want a single script tag and don't want to think about it. |

## Sizing rules of thumb

- **A landing page or blog widget**: `velin-common` or even just `velin-core` + the two or three directives you use.
- **A CRUD form or dashboard**: `velin-common`. Add `velin-templates-and-fragments` if you're repeating row templates.
- **A single-page app with client-side routing**: `velin-common` + `velin-router`. Add fragments/events only if you use them.
- **Prototyping / examples / not sure yet**: `velin-all`. Optimize later.

## How to include a bundle

Every published bundle is an IIFE that self-attaches to `window.Velin`. You
can drop them in as script tags in any order, as long as `velin-core` (or
one of the bundles that includes core: `velin-common`, `velin-all`) loads
first.

### Script tag (CDN)

```html
<!-- The everyday combo -->
<script src="https://cdn.jsdelivr.net/npm/@velinjs/all/velin-common.min.js"></script>
```

```html
<!-- Compose your own: core once, then add-ons -->
<script src="https://cdn.jsdelivr.net/npm/@velinjs/all/velin-core.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@velinjs/all/velin-standard.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@velinjs/all/velin-router.min.js"></script>
```

```html
<!-- Kitchen sink -->
<script src="https://cdn.jsdelivr.net/npm/@velinjs/all/velin-all.min.js"></script>
```

unpkg works identically — swap `cdn.jsdelivr.net/npm` for `unpkg.com`.

### npm

```bash
npm install @velinjs/all
```

Each bundle is a subpath export:

```js
import 'velin';                // velin-all — kitchen sink
import 'velin/all';            // same
import 'velin/common';         // core + standard
import 'velin/core';           // core only
import 'velin/std';            // adds standard directives (needs core loaded first)
import 'velin/templates';      // adds vln-fragment (needs core)
import 'velin/router';         // adds vln-router / vln-route (needs core)
import 'velin/events';         // adds evt-alias / evt-contain (needs core)
```

Every subpath returns the same singleton on `window.Velin` — the imports
are load-order side effects, not module exports. `import Velin from '@velinjs/all'`
gives you the default export as a convenience for TypeScript users.

## Rules for combining

- **Load core first.** `velin-core`, `velin-common`, or `velin-all` — any of
  those bootstraps the runtime. Everything else no-ops without it.
- **Never load two "core-including" bundles.** Don't mix `velin-all` with
  `velin-core`, or `velin-common` with `velin-standard`. You'll get a
  registered-twice warning and duplicate work.
- **Add-on order doesn't matter.** `velin-router` and `velin-events` and
  `velin-templates-and-fragments` can load in any order after core.
