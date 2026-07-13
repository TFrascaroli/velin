# ADR 0005 — In-page devtools & `__DEV__` analytics

Status: **Proposed** (2026-07-06)

## Context

Velin exposes no runtime introspection. When a user asks "why isn't
this node updating?" or "why is this expression evaluating twice per
keystroke?" the only tools are `console.log` and reading
`velin-core.js`. For a Proxy-based reactive system that hides its
wiring by design, this is the largest usability gap.

Two approaches were considered:

1. **Browser devtools extension.** Rejected — the maintenance surface
   (two stores, MV3 constraints, page↔panel bridge) is
   disproportionate for a 7 KB drop-in library whose users, by
   definition, are avoiding tooling.
2. **In-page devtools panel gated by `__DEV__`.** Chosen. Ships as a
   separate script the user opts into with a `<script>` tag,
   alongside `velin-all.dev.js`. Cannot ship to production by
   accident because it is a distinct file and every host binding
   inside `velin-core.js` is dead-code-eliminated when
   `__DEV__ === false`.

## Prime directive: the production build does not change

This is the non-negotiable constraint that every other decision in
this ADR bends to.

- The production artifacts (`dist/build/velin-*.min.js`) must be
  **byte-for-byte identical** before and after this feature lands.
- All instrumentation lives either (a) behind `__DEV__` traps that
  esbuild strips, or (b) in physically separate source files that
  the prod entrypoints never import.
- No new runtime cost, no new bundle bytes, no new global writes,
  no new property lookups on the hot path in prod.
- Enforced by CI, not by developer diligence — see the assertions
  in the `__DEV__` gate section below.

If you find yourself weighing a design choice against this
directive, the directive wins. The devtools are a strict superset
that appear in `.dev.js`, and the `.min.js` output is not this
feature's problem to touch.

## Goals (in priority order)

- **Zero production cost** — the prime directive above.
- **Independent load order.** The companion may load before or after
  `velin-all.js`; both cases must work.
- **No new core dependencies.** Companion is plain DOM + a few KB of
  handwritten code. No framework (not even Velin, to avoid observing
  ourselves observing).
- **Everything a user could reasonably ask.** Bindings, dependency
  graph, mutation log, effect trace, expression profiler, leak
  warnings, state tree. If core knows it, the panel can see it.

## Non-goals

- Time-travel / state snapshotting.
- Editing state from the panel beyond trivial primitive edits.
- A browser extension. A hook is exposed so a future extension
  *could* attach without a rewrite; none is planned.

## Architecture

Two layers with an intentionally narrow contract between them.

```
┌──────── velin-core.js ─────────────────────────────────────┐
│ setupState / triggerEffects / processPlugin / evaluateAst  │
│                          │                                 │
│                          │  if (__DEV__) hook.emit(…)      │
│                          ▼                                 │
│         Velin.ø__devtools   (dev builds only)              │
└──────────────────────────▲─────────────────────────────────┘
                           │  documented contract
┌──────────────────────────┼─────────────────────────────────┐
│                          ▼                                 │
│           velin-devtools.js   (opt-in companion)           │
│  ring buffer • aggregators • Shadow-DOM overlay • warnings │
└────────────────────────────────────────────────────────────┘
```

The companion never reaches into `Velin.ø__internal`. It consumes
only what `Velin.ø__devtools` exposes.

## The `__DEV__` gate and physical separation

`scripts/build.js` already defines `__DEV__` via esbuild
(`define: { __DEV__: 'true' | 'false' }`) and produces `.dev.js` /
`.min.js` for every entrypoint. `treeShaking` is on for `.min`.

Two mechanisms, used together:

**Mechanism 1 — DCE-stripped emit sites.**
Emission callsites in `velin-core.js` are single-expression trap
statements. When `__DEV__` folds to `false`, the entire `if` body
folds to nothing:

```js
if (__DEV__) hook.effect(prop, effect, reactiveState, dt);
```

These are the *only* devtools-related lines in `velin-core.js`.
They contain no data-shaping logic; all they do is forward
already-in-scope values.

**Mechanism 2 — physically separate hook module.**
The hook object itself — `createDevHook()`, ring buffer, `peek`,
`whyDidThisRun`, `enumerateBindings`, stats accumulators — lives
in a new file **`src/velin-devhook.js`**, imported from
`velin-core.js` under a `__DEV__` gate:

```js
// velin-core.js (dev-only import)
let hook = null;
if (__DEV__) {
  const mod = await import("./velin-devhook.js"); // build-time static import — see below
  hook = mod.createDevHook();
  Velin.ø__devtools = hook;
  if (typeof window !== "undefined") {
    window.__VELIN_DEVTOOLS_HOOK__ = hook;
  }
}
```

In practice the import is written as a static top-level import
wrapped in the DCE pattern esbuild recognises:

```js
import { createDevHook } from "./velin-devhook.js";

// ...

if (__DEV__) {
  const hook = createDevHook();
  Velin.ø__devtools = hook;
  if (typeof window !== "undefined") window.__VELIN_DEVTOOLS_HOOK__ = hook;
}
```

Because `createDevHook` is used only inside the `if (__DEV__)`
block, esbuild's tree-shaker drops the identifier *and* the import
from `.min.js`, so `velin-devhook.js` contributes zero bytes to
prod. This is stricter than relying on DCE to remove a large
function body inside the same file — the entire module is gone.

**Post-build assertions** (added to `scripts/build.js`; any
failure fails the build):

1. **Byte-identical prod build.** Before the build runs, `git show
   HEAD:dist/build/velin-*.min.js` is captured. After the build,
   the new `.min.js` files must be byte-identical to the captured
   snapshot. Any diff — even one byte — fails CI until the D1 PR
   has been merged and the snapshot lifecycled. This is the
   ultimate enforcement of the prime directive.
2. **String literal `__VELIN_DEVTOOLS_HOOK__`** must not appear in
   any `.min.js`.
3. **Property access `ø__devtools`** must not appear in any
   `.min.js`. (Property names survive minification because `Velin`
   is an exported object; dead-code elimination is what removes
   them, so this grep is what proves DCE worked.)
4. **`velin-devhook`** must not appear as a string in any
   `.min.js` — proves the dev-only module was tree-shaken.

The snapshot lifecycle for assertion #1: on the D1 merge, the
maintainer regenerates the snapshot in a single commit whose diff
is *only* the snapshot update, and CI must pass on that commit —
i.e., the new `.min.js` must equal the new snapshot. From that
point onward, every subsequent PR must not touch `.min.js` until
core itself is intentionally changed. The snapshot is checked
into `scripts/prod-build-snapshot/`.

## The hook object

`velin-core.js` exposes a single dev-only object.

```ts
interface VelinDevHook {
  /** Set on setupState() AND composeState() so nested substates from
   *  vln-loop / vln-if / compose() are visible. Weakly held via a
   *  WeakRef-backed iterable; the panel iterates and drops dead refs. */
  readonly states: Iterable<ReactiveState>;

  /** Registered plugins, keyed by name. */
  readonly plugins: ReadonlyMap<string, VelinPlugin>;

  /** Existing WeakMap keyed by DOM node. */
  readonly pluginStates: WeakMap<Node, Record<string, any>>;

  /** Subscribe to the event stream. Returns an unsubscriber. Listener
   *  errors are caught and re-thrown asynchronously via
   *  queueMicrotask so a broken listener cannot break reactivity. */
  subscribe(listener: (ev: DevEvent) => void): () => void;

  /** Bounded ring buffer of the last N events (default 500). */
  readonly log: ReadonlyArray<DevEvent>;
  setLogCapacity(n: number): void;

  /** Live aggregated stats. */
  readonly stats: {
    updateCounter: number;                                             // effect invocations since start
    effectCount: number;                                               // Σ |bindings[path]| across states
    bindingsCount: number;                                             // Σ paths across states
    orphanedEffectsSinceStart: number;
    expressionEvalTime: Map<string, { calls: number; totalMs: number }>;
  };

  /** Panel utility: read a Proxy path WITHOUT registering a dependency.
   *  Implemented in core because the panel must not touch ø__control
   *  or ø__depCaptures directly. */
  peek(state: ReactiveState, path: string[]): unknown;

  /** For a given effect closure, return the last-N mutation paths that
   *  triggered it, newest first. Backed by effect.ø__debug.recentPaths. */
  whyDidThisRun(effect: Function, limit?: number): string[];

  /** Flat rows for the Bindings tab; exprs derived from each effect's
   *  ø__debug tag, not from interpolations. */
  enumerateBindings(): Array<{
    state: ReactiveState;
    path: string;
    effectCount: number;
    exprs: string[];              // deduped, may be empty for anonymous effects
    nodes: Node[];                // deduped, connected + disconnected
  }>;
}

type DevEvent =
  | { t: number; kind: "bind";     state: ReactiveState; rootNode: Node }
  | { t: number; kind: "compose";  parent: ReactiveState; child: ReactiveState }
  | { t: number; kind: "mutate";   state: ReactiveState; path: string;
                                    op: "set" | "arrayMethod";
                                    method?: "push"|"pop"|"shift"|"unshift"|"splice"|"sort"|"reverse";
                                    from?: unknown; to?: unknown }
  | { t: number; kind: "trigger";  state: ReactiveState; path: string; queued: boolean; effectCount: number }
  | { t: number; kind: "effect";   state: ReactiveState; path: string;
                                    node?: Node; expr?: string; pluginName?: string; durationMs: number }
  | { t: number; kind: "compile";  expr: string }
  | { t: number; kind: "evaluate"; expr: string; durationMs: number; ok: boolean; error?: string }
  | { t: number; kind: "plugin";   name: string; node: Node; expr: string; subkey: string | null;
                                    phase: "track" | "render" | "destroy" }
  | { t: number; kind: "cleanup";  state: ReactiveState; node?: Node }
  | { t: number; kind: "warn";     code: string; message: string; ref?: unknown };
```

Exposed as:

```js
if (__DEV__) {
  Velin.ø__devtools = createDevHook();
  if (typeof window !== "undefined") {
    // Mirror React's __REACT_DEVTOOLS_GLOBAL_HOOK__ convention so a
    // future extension can attach the same way.
    window.__VELIN_DEVTOOLS_HOOK__ = Velin.ø__devtools;
  }
}
```

No `version` field. Both files ship from the same repo tag; a version
check would be theatre. Add one when there is a second consumer.

## Instrumentation points in `velin-core.js`

Sites that get `if (__DEV__)` emissions. All existing
`if (__DEV__) console.log(...)` calls route through the hook
instead of the console.

| Site (line refs, current tree)                       | Event                                     |
|------------------------------------------------------|-------------------------------------------|
| End of `bind()` (`1870-1877`)                        | `{ kind: "bind" }`                        |
| End of `composeState()` (`1608+`, after `add(inner)`)| `{ kind: "compose" }`                     |
| `wrapObj` set trap, on the `triggerEffects` branch (`1471-1473`) | `{ kind: "mutate", op:"set", from: old, to: value }` **before** `triggerEffects` |
| `wrapArray` set trap, numeric branch (`1552-1559`)   | `{ kind: "mutate", op:"set", ... }`       |
| `wrapArray` set trap, `length` branch (`1560-1564`)  | `{ kind: "mutate", op:"set", ... }`       |
| `wrapArray` mutator methods (`1514-1520`)            | `{ kind: "mutate", op:"arrayMethod", method }` — no `from`/`to`; the array itself is the change |
| `triggerEffects()` entry (`1350-1354`)               | `{ kind: "trigger", queued, effectCount }`|
| Per-effect immediate invocation (`1364`)             | `{ kind: "effect", durationMs }`          |
| Per-effect batched invocation (`1395`)               | `{ kind: "effect", durationMs }`          |
| `processPlugin` after `compile(expr)` (`521`)        | `{ kind: "compile" }`                     |
| `processPlugin` `track()` call site (`568`)          | `{ kind: "plugin", phase:"track" }` (+ `warn W004` on throw) |
| Inside the effect closure, wrapping `plugin.render` (`580`) | `{ kind: "plugin", phase:"render" }` |
| `evaluateAst()` body                                 | `{ kind: "evaluate", durationMs, ok }` + accumulate into `stats.expressionEvalTime` |
| `cleanupState()` (`1670+`)                           | `{ kind: "cleanup" }`                     |

**Notes on the mutation events:**

- `from`/`to` are the raw values from the set trap. `old` is already
  captured locally (`const old = target[prop]`), so no re-read is
  needed. The trap sees wrapped values when the caller reads through
  the Proxy; that's the same view the panel would get if it read the
  same path, so it's the right thing to emit.
- Array mutator methods (`push`, `splice`, …) do not have a coherent
  `from`/`to` pair — they trigger `path` (the array) rather than
  `path[i]`. The event carries the method name; the panel shows a
  read-back of the array in the Log tab if the user wants details.
- Emission is **synchronous and before** the corresponding
  `triggerEffects`. This preserves causality in the Log tab:
  `mutate → trigger → effect{k}`.

## Effect ↔ node/expression attribution

`processPlugin` creates each effect closure in a scope that knows
`node`, `expr`, `plugin.name`, `subkey`. In dev builds, tag the
closure:

```js
if (__DEV__) {
  effect.ø__debug = {
    node, expr, pluginName: plugin.name, subkey,
    recentPaths: [],                     // ring, capacity DEBUG_PATH_RING (16)
    ø__pathRingHead: 0,
  };
}
```

Effects created outside `processPlugin` (none today, but the API is
public via `ø__internal.triggerEffects` etc.) have no tag; they
appear as "anonymous" in the panel.

## `whyDidThisRun` — precise mechanism

At the top of the loop in `triggerEffects` (before either invoking or
queuing the effect):

```js
if (__DEV__ && effect.ø__debug) {
  const dbg = effect.ø__debug;
  dbg.recentPaths[dbg.ø__pathRingHead] = prop;
  dbg.ø__pathRingHead = (dbg.ø__pathRingHead + 1) % DEBUG_PATH_RING;
}
```

Batched effects accrue multiple entries (one per queue insertion),
which is exactly the "union of triggering paths" the user wants.
`hook.whyDidThisRun(effect, n)` reads the ring newest-first and
returns up to `n` unique entries.

Rejected alternative: a formal `effect → deps` reverse index kept
in sync with `bindings`. Doubles memory and creates a second source
of truth. The ring costs one array write per trigger.

## Non-tracking Proxy read (`hook.peek`)

The panel must read state to render the State tab without registering
dependencies. Dep capture is controlled by
`reactiveState.ø__depCaptures` (a stack) with each capture's
`capturingDeps` flag. The safe bypass lives in core (not the panel):

```js
function peek(reactiveState, pathParts) {
  const caps = reactiveState.ø__depCaptures;
  // Push a no-op capture that swallows any adds during the walk.
  const shim = { capturingDeps: false, deps: new Set() };
  caps.push(shim);
  try {
    let cur = reactiveState.state;
    for (const p of pathParts) cur = cur?.[p];
    return cur;
  } finally {
    caps.pop();
  }
}
```

`capturingDeps: false` is redundant with the shim being ignored by
`peek(reactiveState.ø__depCaptures)` (see `wrapObj.get`), but the
push/pop discipline guarantees no *other* concurrent capture in the
stack is touched by the read. An invariant test (below) asserts
`reactiveState.bindings.size` is unchanged after a full State-tab
expansion.

## The companion: `velin-devtools.js`

New source file `src/velin-devtools.js`, picked up by the existing
build glob, producing `dist/build/velin-devtools.dev.js` and
`.min.js` — a separate artifact with a separate build output path.
It is never imported by any `velin-*` entrypoint. The prod bundles
have no way to reach it even if someone tried.

Note the inversion: this companion file's own `.min.js` is the
"production" copy of the *devtools*, but it still only does
anything when the *core* it attaches to is a `.dev.js` build
(because that's the only build that installs
`window.__VELIN_DEVTOOLS_HOOK__`). Loading it against a prod core
is a silent no-op. That's a feature.

Users load the companion in dev with one script tag; see the
Getting Started section below.

### Attach lifecycle

1. On load, check `window.__VELIN_DEVTOOLS_HOOK__`.
2. If missing, install a one-shot `Object.defineProperty` setter on
   `window` so the companion activates the moment `velin-core.js`
   assigns the hook (handles either load order).
3. If still missing after `DOMContentLoaded` + one microtask,
   log a single warning:
   `[Velin devtools] Velin was not built with __DEV__=true; devtools cannot attach.`
   Exit cleanly.
4. **Idempotent.** The companion sets
   `window.__VELIN_DEVTOOLS_COMPANION__ = { version, dispose }`.
   On second load it detects the existing companion and returns
   immediately.

Because `window.__VELIN_DEVTOOLS_HOOK__` only exists in dev builds,
loading the companion against a production Velin is a no-op.

### UI

Fixed-position, resizable panel in the bottom-right, mounted into
its own Shadow DOM host so page styles cannot bleed in or out. All
rendering is plain DOM + `textContent`. Toggled with `Ctrl+Shift+V`,
suppressed by `?velin-devtools=off` or
`localStorage.velinDevtools = "off"`.

**Tabs:**

1. **State** — lazy tree over `hook.states`. Each root/substate is a
   collapsible section. Values read via `hook.peek`. Each row shows
   value, type, and subscriber count for that path (from
   `state.bindings`). Multi-`bind()` and SSR/hydration-multi-root
   pages Just Work because `states` is a set.
2. **Bindings** — flat table from `enumerateBindings()`. Sortable by
   path, effect count, or expression. Click to pin a highlight
   outline on the associated DOM nodes.
3. **Log** — the ring buffer, filterable by `kind`. Rows are
   collapsible; expanding shows the payload. The most important
   tab; it makes the invisible reactivity visible.
4. **Effects** — grouped by `pluginName`/node, with per-effect run
   count, cumulative time, and `whyDidThisRun` last-N paths.
5. **Perf** — top-N slowest expressions from
   `stats.expressionEvalTime`, refreshed once per second. Hot paths
   (mutated > N/s) and thrashing effects (> N runs/s).
6. **Warnings** — see below.

### Highlight-on-update

Toggle in the panel header. Each `effect` event whose
`ø__debug.node` is `document.contains(...)` enqueues that node into
a `Set<Node>` drained on the next `requestAnimationFrame`, where
each node briefly gets a Shadow-adjacent class that CSS-animates
an outline. rAF batching avoids layout thrash under high effect
rates.

### Warnings

Emitted from core as `{ kind: "warn", code, message, ref }` and
surfaced in the panel:

- **W001 `dangling-effect`** — an `effect` event whose
  `ø__debug.node` fails `document.contains`. Indicates a missing
  `cleanupState` in a plugin. Rate-limited: one warning per
  (nodeId, path) pair.
- **W002 `slow-expression`** — any `evaluate` with `durationMs > 8`
  (configurable).
- **W003 `mutation-thrash`** — > N `mutate` events on the same path
  within one animation frame. Likely a missing `ctrl.batch()`.
- **W004 `track-throw`** — plugin `track()` threw. Currently
  `console.error`'d by `processPlugin`; additionally emit as
  `warn` with the error.
- **W005 `orphaned-binding`** — swept lazily when the Bindings tab
  is opened: paths whose effect set is non-empty but *every*
  effect's `ø__debug.node` is detached.

Deliberately **not** included: "you set a path with no bindings" —
too noisy during initial state population, no reliable way to
distinguish typo from future-use.

## Performance and safety invariants

1. Every hook call site is gated by `__DEV__`. Prod builds contain
   zero devtools bytes. Enforced by the post-build grep.
2. The ring buffer is a fixed-length array with a write index; no
   per-event allocations beyond the event object itself. Default
   capacity 500, configurable via `setLogCapacity`.
3. `stats.expressionEvalTime` is a `Map` keyed by the raw expression
   source string. `compile()` is not cached, so dynamic expressions
   would leak into this map; the hook caps distinct keys at 1024
   and starts dropping the least-recently-called entries beyond
   that. (This is a hook-side bound, not a change to `compile`.)
4. Highlight-on-update uses `requestAnimationFrame` batching.
5. **Read-must-not-track.** Reading state from the panel must not
   create new bindings. Enforced by a vitest+jsdom test that
   snapshots `bindings.size` per state, opens & fully expands the
   State tab, and re-asserts equality.
6. **Listener error containment.** `hook.subscribe` wraps listener
   invocations in `try/catch`; a caught error is re-thrown via
   `queueMicrotask` so it surfaces on `window.onerror` without
   breaking the reactive path.

## Testing

- `test/devtools.spec.js`:
  - Hook is present under `__DEV__=true`, absent under `false`.
  - Ring buffer wraps at capacity; oldest entries drop.
  - `whyDidThisRun` returns the most recent unique triggering paths
    for both immediate and batched flows.
  - `enumerateBindings` row count matches `Σ bindings.size` across
    `hook.states`.
  - `peek` does not add to `bindings`.
  - Listener throwing does not break subsequent `mutate` →
    `triggerEffects` flow.
  - Multiple `bind()` calls produce two entries in `hook.states`;
    `composeState` produces `compose` events and adds to `states`.
- `test/devtools-build.spec.js`: reads
  `dist/build/velin-core.min.js`, asserts neither
  `__VELIN_DEVTOOLS_HOOK__` nor `ø__devtools` appears. Also asserts
  that `velin-devtools.min.js` exists and mentions the hook name.
- `playground/devtools-smoke.html`: manual dev aid, not a test.

## Distribution & npm

Velin's target user drops a `<script>` tag into a server-rendered
template. They are not running `npm install`. That fact drives the
distribution choice.

- **Primary channel: CDN via jsDelivr / unpkg.** The companion
  ships as a plain file at
  `https://cdn.jsdelivr.net/npm/velin@<ver>/dist/build/velin-devtools.min.js`.
  This is how the target user actually consumes it.
- **npm: same package, subpath export — not a separate package.**
  Add `"./devtools"` to `package.json` `exports` pointing at
  `dist/build/velin-devtools.min.js`. Reasons:
  - Version alignment is free (single tag governs core + hook +
    companion; no `-devtools@x.y.z` drift risk).
  - CDN URLs work via the same npm publish; no additional
    infrastructure.
  - `import "velin"` continues to give core and nothing else.
    Devtools are opt-in via the subpath, or (much more likely) via
    a script tag on the CDN URL.
  - A separate `velin-devtools` npm package would pollute the
    dependency graph and create a second version-coordination
    problem for zero gain.
- **`.dev.js` bundles are already published** (they're referenced
  from `playground/`). Include `velin-devhook.dev.js` and
  `velin-devtools.{dev,min}.js` in the `files` glob. Do **not**
  publish `velin-devhook.min.js` — a `.min.js` for a dev-only
  module is a category error; if someone imports the minified
  version thinking it's the prod path, they get a surprise.
  Ship only the `.dev.js`.

**Should we publish this at all?** Yes, via subpath. The
alternative — "download the file from GitHub Releases yourself" —
would be worse for CDN caching and version coordination without
buying anything back. The strong version of the "not on npm"
argument is really "not a separate npm package," which is what
we're doing.

## Getting started (for engineers)

**One step.** Add one script tag to the HTML you're already using
in development:

```html
<script src="https://cdn.jsdelivr.net/npm/velin@0/dist/build/velin-devtools.min.js"></script>
```

That's it. Open the page and press `Ctrl+Shift+V`.

**Prerequisite (which you should already have in dev):** the page
must be loading a `.dev.js` build of Velin — for example
`velin-all.dev.js` — because that's the build that installs the
`__VELIN_DEVTOOLS_HOOK__` global. If you're loading
`velin-all.min.js` in your dev environment, switch to
`velin-all.dev.js` first; that switch is a general dev-environment
setup task, not devtools-specific, and is documented in
`docs/getting-started.md`.

Failure modes and their one-line explanations:

- Panel doesn't appear, console says
  `[Velin devtools] Velin was not built with __DEV__=true` —
  you're loading `velin-all.min.js`; swap to `.dev.js`.
- Panel doesn't appear, no console message — the script tag URL
  is wrong or blocked (check the network tab).
- Panel appears but no events flow — you loaded devtools before
  `velin-all.dev.js` on a page that never gets around to loading
  core. Devtools handles late-arriving core (via `defineProperty`
  hook install), so this only happens if core never loads at all.

## Rollout

**D1 — instrumentation and hook.**
Add the hook object with `states`, `log`, `stats`, `subscribe`,
`peek`, `whyDidThisRun`, `enumerateBindings`. Wire `bind`,
`compose`, `mutate` (all four Proxy sites), `trigger`, `effect`
(both invocation paths), `compile`, `evaluate`, `plugin` (track /
render / destroy), `cleanup`. Emit `W004` inline. Add the
post-build grep and `test/devtools-build.spec.js`. No UI yet.
D1 alone unblocks programmatic introspection from the console —
most power-user debugging is already possible here.

**D2 — companion skeleton.**
`src/velin-devtools.js`. Shadow-DOM panel with Log tab only,
keyboard toggle, attach/detach lifecycle, idempotency, load-order
handling.

**D3 — State + Bindings tabs.**
Includes the "reads do not track" vitest guard. Highlight-on-pin
outline for the Bindings tab.

**D4 — Effects, Perf, warnings.**
Adds `evaluate` timing accumulation, `whyDidThisRun` grouping,
W001/W002/W003/W005 emitters.

**D5 — Polish.**
Highlight-on-update, filters, panel size/tab persistence in
`localStorage`.

Each milestone is independently useful.

## Consequences

- **Prod artifact byte-identity is enforced by CI**, not by trust.
  Snapshot lives at `scripts/prod-build-snapshot/`; the lifecycle
  commit is a maintainer action, spelled out in the `__DEV__` gate
  section. This is the enforcement of the prime directive.
- `velin-core.js` source grows by a small number of one-line
  `if (__DEV__) hook.x(...)` calls. Every other new byte lives in
  `src/velin-devhook.js` (dev-only import) or
  `src/velin-devtools.js` (separate artifact). Neither reaches
  `.min.js`.
- `ø__debug` on effect closures is a new convention; documented
  here and referenced from any future plugin ADR that creates
  effect closures outside `processPlugin`.
- `hook.states` uses weak references so the panel does not pin
  torn-down substates. The Iterable contract skips collected
  entries transparently.
- **npm package remains single.** New subpath export
  `"./devtools"` is added; no separate `velin-devtools` package
  is created. Version coordination stays trivial (one tag governs
  everything).
- **Getting started is one script tag.** Prerequisite of "use the
  dev build in dev" is an existing part of the Velin workflow,
  not a devtools-specific ask.
- The React-shaped hook global means a future browser extension
  can attach with a content script and a `postMessage` bridge
  without any changes to core.
