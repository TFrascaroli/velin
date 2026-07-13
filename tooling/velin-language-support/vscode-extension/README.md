# Velin Language Support

VS Code language support for [Velin](https://github.com/TFrascaroli/velin) —
the reactive HTML framework where markup drives the DOM without a build
step.

## Features

- **Syntax highlighting** for `vln-*` directives, injected into HTML.
  JavaScript grammar activates inside directive expressions.
- **Semantic tokens** — identifiers inside expressions get typed colours
  (methods, properties, loop-vars, parameters) via the TypeScript
  compiler, not regex heuristics.
- **IntelliSense** — `user.` inside `vln-text="user.name"` completes to
  the actual state shape.
- **Go to Definition (F12)** — jumps from an identifier in an expression
  to its declaration, through property access, call expressions, and
  index access (e.g. `getCurrentUser().name`, `users[0].email`).
- **Placement diagnostics** — `vln-vars` outside `<template>` and
  `vln-var:*` without a sibling `vln-fragment` are flagged.

## Telling the extension where your state lives

Add a comment above the region that binds to a Velin state:

```html
<!-- @velin-schema: ./state.ts#AppState -->
<div id="app">
  <span vln-text="user.name"></span>
</div>
```

or infer directly from a `<script>` — inline or linked, targeted by id:

```html
<!-- @velin-schema: script -->
<div id="app">…</div>
<script>
  const state = { user: { name: 'Alice' } };
  Velin.bind(document.getElementById('app'), state);
</script>

<!-- @velin-schema: script#state -->
<script id="state" src="./state.js"></script>
```

Global type references also work — `@velin-schema: AppState` will search
the project for a matching `interface`/`type`/`class`.

## Wiring the LSP into other editors

The same language server ships as a standalone npm package
[`@velin/lsp-server`](https://www.npmjs.com/package/@velin/lsp-server).
See its README for neovim / Helix / Zed configuration snippets.
