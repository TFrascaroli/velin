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
- Devtools: `long-task` signal, from the browser's longtask observer.
  The entry names the handler that ran, its writes grouped by path, and
  the bindings each write re-ran (runs per write, self time), with a
  batch suggestion for unbatched write loops. Devtools' own overhead is
  reported separately instead of billed to your code.
- Devtools: `hook.explainWindow(start, end)` and
  `hook.causalityTree(mutationSeq)`: attribution and write → bindings →
  child-writes cascades, with exclusive times that add up.
- `VLN022` dev warning when an unkeyed `vln-loop` moves items between
  rows (sort, unshift, delete from the middle). Edits to a moved item
  don't update its row in unkeyed loops; the warning names the keyed form.

### Changed

- Development builds no longer `console.log` every processed node, plugin
  application and dependency set (about 16 lines per list row).
- `Velin.getController()` accepts `this` inside a state method, including
  methods called from `vln-on` and from `vln-loop` rows. Before, the
  documented `Velin.getController(this).batch(…)` threw from any handler.
- Unkeyed `vln-loop` re-renders only rows whose item changed. Appending
  to a 50-row list no longer re-runs the 50 existing rows.
- Devtools `thrash` counts writes that re-ran bindings, not raw writes:
  batched loops and writes nobody reads no longer trigger it.
- Devtools inbox: one entry per long task (they were merged per second),
  every signal carries a time, and W003 no longer duplicates `thrash`.

### Removed

- Devtools: `long-effect` signal and W002 `slow-expression` warning.
  Both were per-expression thresholds standing in for frame-level jank;
  `long-task` measures it and names the cause. Signal consumers filtering
  on `kind === "long-effect"` must switch to `"long-task"`.
- `velin-events` bundle (`vln-evt-alias`, `vln-evt-contain`) and the
  `./events` subpath export. Neither directive was reactivity: alias
  is event renaming, contain is capture-phase `stopPropagation` —
  both a handful of lines of user plugin. Sharpens the reactivity-
  primitive positioning; drops the bundle from `velin-all`.
- `vln-router-scroll`. UX polish, not reactivity — reset-on-nav is
  a `vln-watch:handler="$__route.path"` one-liner. Docs show the
  recipe under `vln-route`.

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
