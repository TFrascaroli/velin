# Changelog

All notable user-facing changes to the `@velinjs/all` package. This
project follows [Semantic Versioning](https://semver.org/); the format
loosely tracks [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Site, tooling (LSP/VS Code extension), CI, and documentation-only
changes are intentionally omitted — they don't affect what ships in
the npm bundle.

## [Unreleased]

## [1.0.0-beta.4] — 2026-08-03

### Added

- **Templates: unified `vln-template` + `vln-vars` API.** Declare a
  template with `<template vln-template="'id'">` and consume it with
  `vln-fragment="'id'"`. Values pass through a single
  `vln-vars="{ … }"` object on the consumer (or a `vln-vars="['a','b']"`
  / `vln-vars="{ a: fn }"` declaration on the template itself). The
  legacy `vln-var:*` sibling-attribute mechanism is gone; the plugin
  stays registered only to error loudly with a migration hint.
- **Parser: object spread in expressions.** `{...base, x: 1}` now parses
  in directive expressions.
- **Evaluator: helpful identifier-miss warning.** When an identifier
  isn't found, the runtime warns and suggests any lowercased chain
  match (catches `User.name` when only `user.name` exists).
- **Core: `composeState` accepts an object form directly**, so callers
  don't have to hand-roll the wrapper.

### Changed

- **`vln-if` now unmounts the subtree** on falsey values instead of
  toggling `display: none`. Cleanly disposes child bindings, event
  listeners, and nested plugins. Users relying on preserved DOM state
  across toggles need to move that state up.
- **Core scope lookup uses the prototype chain**, and
  `interpolation.transform` is exposed for downstream plugins.

### Fixed

- **`vln-loop` preserves focus and text selection** across keyed
  reorders — inputs no longer lose their caret when the underlying
  array shuffles.
- **Scope plugin `render()` failures raise through an error boundary**
  instead of silently corrupting the DOM.

## [1.0.0-beta.3] — 2026-07-30

### Fixed

- **Parser: postfix chains after `Call` and computed `Member`.**
  Expressions like `getUser().name` and `items[0].x` now chain
  correctly.

## [1.0.0-beta.2] — 2026-07-26

### Fixed

- **`vln-on`: event scope survives across async handlers.** Handlers
  that `await` no longer see a stale/torn-down scope on resume.

## [1.0.0-beta.1] — 2026-07-22

Initial public beta. Ships the full framework (all seven bundles:
`velin-all`, `velin-common`, `velin-core`, `velin-standard`,
`velin-templates-and-fragments`, `velin-router`, `velin-events`),
TypeScript declarations, and the hand-rolled Velin-powered site.
