# Changelog

All notable changes to `@velinjs/all`. Follows
[Semantic Versioning](https://semver.org/); format loosely tracks
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `vln-on` handlers run their synchronous part in one batch. A handler
  that hides the `vln-if` block it lives in (`this.popover = ''`) and keeps
  writing no longer throws VLN014 halfway through, and a handler that
  writes several times renders once. Writes after an `await` behave as
  before.
- `vln-attr:value` also assigns the `value` property on controls that have
  one, so a `<select>`, a range input or a `<progress>` follows state after
  first render and after the user has typed.
- VLN017 names the expression and the callee (`Number is not a function`
  in `vln-text="label(Number(x))"`) instead of `AST:Call Not a function`.
- VLN023 says when the argument is the object given to `Velin.bind()`
  rather than the one it returned (development builds).
- The npm manifest no longer declares `sideEffects: false`; bundlers
  dropped `import '@velinjs/all'` as dead code.
- `velin-all` is 10,661 B gzipped (was 10,461): the batched handlers, the
  radio role, the `value` property, the named callee, the key guard, array
  spread and the fragment root.

### Added

- Spread inside array literals (`[...items, extra]`), which the contract
  already listed as frozen syntax.
- `Velin.bind()` accepts a `DocumentFragment` and binds its elements, as
  the API reference said; before, it silently did nothing.
- VLN038: expressions cannot read or write `constructor`, `__proto__` or
  `prototype`, as identifiers, member keys or object-literal keys. Before,
  `constructor.constructor('…')()` on any state reached `Function` wherever
  no Content Security Policy blocked it.
- VLN037 (development builds): a binding re-ran and read an input it did
  not read when its dependencies were captured, which is how a getter or
  ternary that short-circuits on its first run goes stale. Warned once per
  binding, with the directive and the path.

### Fixed

- `vln-input` on radio buttons. The group's checked member now follows
  `model === value`, and clicking a member writes its `value`. Before, the
  model string was written to every member's `checked` (the last one won)
  and clicks wrote `true` and `false`.

## [1.0.0-beta.5] — 2026-11-16

Release candidate for 1.0. [docs/contract.md](docs/contract.md) states
what 1.0 freezes and what a version bump means.

### Added

- The npm package ships the development build of every bundle
  (`velin-*.dev.js`; subpaths `@velinjs/all/dev`, `@velinjs/all/common/dev`,
  …) and the devtools companion (`velin-devtools.min.js`,
  `@velinjs/all/devtools`). Devtools no longer needs a checkout: load the
  development build and the companion from unpkg or npm.
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

### Changed

- Every error and warning now carries a code (`VLN001`–`VLN036`), and
  production builds print only the code and a link to its page
  (`[VLN014] https://tfrascaroli.github.io/velin/e/VLN014`) instead of
  the full text. Development builds still print the explanation. The
  catalog is [docs/errors.md](docs/errors.md). `velin-all` drops from
  11.9 KB to 10.5 KB gzipped; sizes in the README and docs are updated
  to measured values.
- Development builds no longer `console.log` every processed node, plugin
  application and dependency set (about 16 lines per list row).
- `Velin.getController()` accepts `this` inside a state method, including
  methods called from `vln-on` and from `vln-loop` rows. Before, the
  documented `Velin.getController(this).batch(…)` threw from any handler.
- Bindings re-capture their dependencies when the write that re-ran them
  replaced an object or array, or mutated an array (`push`, `splice`,
  `sort`, …). A getter over a list now follows items added after first
  render (`get doneCount() { return this.tasks.filter(t => t.done).length }`
  updates when a new task is ticked), rows of an unkeyed `vln-loop` follow
  the item that moved into them, and readers of an object pick up keys
  added to it (`user.age = 3`), keys deleted from it (`delete user.name`,
  which was invisible to reactivity before) and slots written past the end
  of an array. Writes to primitives stay one-shot, so the rule from
  [ADR 0003](docs/adr/0003-one-shot-dependency-capture.md) still applies
  to branches guarded by a primitive: read what you depend on up front.
  Decision record: [ADR 0006](docs/adr/0006-recapture-on-structural-writes.md).
  Costs 260 B gzipped on `velin-all` (10.2 → 10.5 KB).
- Plugin helpers: `triggerEffects(prop, recapture)` takes an optional
  second argument; `true` makes the woken bindings re-capture.
- Unkeyed `vln-loop` re-renders only rows whose item changed. Appending
  to a 50-row list no longer re-runs the 50 existing rows.
- Devtools `thrash` counts writes that re-ran bindings, not raw writes:
  batched loops and writes nobody reads no longer trigger it.
- Devtools inbox: one entry per long task (they were merged per second),
  every signal carries a time, and W003 no longer duplicates `thrash`.

### Fixed

- Expressions: a method call's receiver ran twice (`api.get().run()`
  called `get()` twice), unary `+` returned `undefined`, and a nested
  object inside an object literal (`{ u: user }`) was a copy with an extra
  `constructor` key, so later writes to `user` didn't show through it. All
  three now match JavaScript. The rewritten evaluator is also 260 B
  smaller gzipped.

### Removed

- The `vln-var:*` migration error plugin (removed in beta.4, kept as a
  loud error since) and the `Velin.debug.templates()` console helper.
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
