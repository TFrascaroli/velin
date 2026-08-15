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

### Removed

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
