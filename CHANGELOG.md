# Changelog

All notable changes to `@velinjs/all`. Follows
[Semantic Versioning](https://semver.org/); format loosely tracks
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `vln-inlet[="'name'"]` + `vln-outlet[="'name'"]` for slot
  composition on templates. Direct children of a `vln-fragment`
  host must be `<template vln-inlet>` elements (bare = default, or
  named). Inlet content binds against the **caller's** scope.
  Outlets are reactive on their slot, so dynamic template selection
  with slots (`vln-fragment="whichCard"` swapping templates at
  runtime) is a supported first-class case. No teleport; no
  scoped-slot data flow (pass callbacks via `vln-vars`).
- Opt-in enter/leave transitions on `vln-if`, `vln-loop`, `vln-route`,
  and `vln-fragment` (including template-swap on fragments). Mounting
  elements get `.vln-entering` for two animation frames; unmounting
  elements get `.vln-leaving` and are held for the CSS
  `transition-duration` (max of all properties) + 50 ms slack.
  Interaction semantics by directive:
  - `vln-if`/`vln-route`: fast re-toggle cancels the leave and revives
    the same node (bindings intact; CSS reverses back to natural state).
  - `vln-fragment`/`vln-route`: swaps are out-in — the new
    template/route waits for the outgoing subtree to finish leaving,
    then mounts. Rapid swaps collapse to the latest target. Reverting
    to the outgoing target mid-leave revives it.
  - `vln-loop`: with a keyed loop, a removed row animates from its
    original slot; survivors don't shift until the leaving row is gone.
    Rapid updates fast-forward any still-leaving ghosts.

  Ships as a separate `velin-transitions` module
  (`@velinjs/all/transitions`); bundled by `@velinjs/all`, deliberately
  omitted from `velin-common`. Standalone plugin bundles no-op
  transitions when the module isn't loaded.
  `Velin.transitions.awaitLeave(node, done)` returns a `{ cancel }`
  handle for use in custom mount/unmount plugins; `markEnter(node)` is
  also exposed.

## [1.0.0-beta.4] — 2026-08-03

### Added

- `<template vln-template="'id'">` + `vln-fragment="'id'"` with a single
  `vln-vars="{ … }"` object for values. Declaration side accepts
  `vln-vars="['a','b']"` or `vln-vars="{ a: fn }"`.
- Object spread `{...x}` in directive expressions.
- Runtime warns on unresolved identifiers and suggests any lowercased
  chain match.
- `composeState` accepts an object form directly (no wrapper needed).

### Changed

- `vln-if` unmounts on falsey values instead of toggling
  `display: none`. Preserved DOM/input state across toggles is gone.
- `vln-var:*` removed; use `vln-vars="{ … }"` on the `vln-fragment`
  consumer. Runtime errors loudly with a migration hint.

### Fixed

- `vln-loop` preserves focus and text selection across keyed reorders.

## [1.0.0-beta.3] — 2026-07-30

### Fixed

- Postfix chains after `Call` and computed `Member` parse correctly
  (`getUser().name`, `items[0].x`).

## [1.0.0-beta.2] — 2026-07-26

### Fixed

- `vln-on` handlers keep their event scope across `await`.

## [1.0.0-beta.1] — 2026-07-22

Initial public beta.
