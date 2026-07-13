# ADR 0002 — Plugin API redesign: flat args with pre-bound helpers

Status: **Implemented** (2026-06-29; all in-tree plugins migrated, full test suite green)

## Context

The current plugin API exposes the raw `ReactiveState` wrapper to every
plugin and forces plugins to thread it through every helper call. This was
flagged as "brittle" in `docs/plugin-api-design.md`; ADR-0001 finalized the
trickling-root stack and plugin injection refactor but deliberately left
the ergonomics question for a follow-up. This is that follow-up.

## Findings

### F1. `reactiveState` is implicit context but passed explicitly

`processPlugin` (`src/velin-core.js:386-489`) calls every plugin callback
with `{ reactiveState, ... }`, and the plugin then turns around and writes
`Velin.evaluate(reactiveState, expr)`, `Velin.getSetter(reactiveState, expr)`,
`vln.composeState(reactiveState, …)`. The `reactiveState` argument is
always the same value the plugin just received — pure boilerplate that
doubles as a footgun (pass the wrong substate, silent reactivity break).

### F2. The wrapper leaks eight mutable internal fields

`ReactiveState` exposes `ø__depCaptures`, `ø__finalizers`,
`ø__innerBindings`, `ø__innerStates`, `ø__control`, `bindings`,
`tricklingRoots`, `interpolations`. Any plugin can mutate any of them.

### F3. `Velin.ø__internal` is part of the plugin contract

`vln-loop` (`src/velin-standard.js:471, 476`) and `vln-route`
(`src/velin-router.js:123, 141`) reach for
`vln.ø__internal.triggerEffects` and `vln.ø__internal.consumeAttribute`.
The name implies "do not use"; the call sites prove the opposite.

### F4. Args shape changes are silent breaks

`attributeValue` was added to the `render` args in commit `8ae2568` with no
versioning or notice. The shape is undocumented as a stability contract.

### F5. `vln-loop` mutates substate arrays in place

`src/velin-standard.js:467, 497` write
`substate.tricklingRoots = [...substate.tricklingRoots, expr]`. Works only
because `composeState` happens to spread the parent into a plain object.
Any future change to the substate representation breaks this silently.

## Decisions

### D1. Flat args, no nested wrapper

Plugins continue to destructure args directly. No `ctx` / `api` / `vln`
nesting object is introduced:

```js
render: ({ node, tracked, evaluate, getSetter, compose, pluginState = {} }) => {
  // ...
}
```

Rationale: the user explicitly rejected nesting. The existing destructuring
ergonomic is the whole point of the args-object pattern; adding a wrapper
would make every plugin write `({ ctx: { node, … } })`.

### D2. Helpers are pre-bound to the substate and exposed as args fields

New fields on the args object:

| Field | Replaces | Notes |
|---|---|---|
| `state` | `reactiveState.state` | user-facing Proxy (see D4) |
| `evaluate(expr?, allowMutations?)` | `Velin.evaluate(reactiveState, …)` | `expr` defaults to the directive's `expr` |
| `evaluateAst(ast?)` | `Velin.evaluateAst(ast, reactiveState)` | `ast` defaults to `compiledExpression` |
| `getSetter(expr?)` | `Velin.getSetter(reactiveState, …)` | `expr` defaults to the directive's `expr` |
| `compose(init)` | `Velin.composeState(reactiveState, …)` | returns `ChildContext` (D6) |
| `consume(name?, value?)` | `Velin.ø__internal.consumeAttribute(node, …)` | defaults to the current attribute |
| `triggerEffects(prop)` | `Velin.ø__internal.triggerEffects(prop, reactiveState)` | |

`ChildContext` returned by `compose`:

| Field | Replaces |
|---|---|
| `state` | `child.state` |
| `anchor(expr)` | direct `tricklingRoots` mutation (D6) |
| `setInterpolation(key, interp)` | direct `interpolations.set(…)` |
| `processNode(node)` | `Velin.processNode(node, child)` |
| `cleanup(node?)` | `Velin.cleanupState(parent, child, node)` — parent captured implicitly |
| `triggerEffects(prop)` | `Velin.ø__internal.triggerEffects(prop, child)` |

### D3. `reactiveState` removed from args entirely

Hard break (see D9). The wrapper is no longer reachable from a plugin
without going through an explicit escape hatch (D8).

### D4. `state` on args is the user-facing Proxy

Not the wrapper. Reading goes through the Proxy → still dep-tracked when a
tracker is active. `vln-router` can write `state[key] = {…}` to bootstrap a
sub-tree, same as today (`src/velin-router.js:26-32`).

### D5. `compose()` accepts an explicit-tag map

No type-based detection (string → EXPR, object → LITERAL would be magic).
Explicit:

```js
compose({
  user:   { expr: 'items[i]' },   // tracked expression
  $index: { literal: i },         // literal value, no tracking
})
```

The existing `Map<string, Interpolation>` shape is also accepted for the
rare case where a plugin already has one in hand.

### D6. `child.anchor(expr)` is fluent

Returns the child, enabling:

```js
const child = compose({ user: { expr: `${expr}[${i}]` }, $index: { literal: i } })
  .anchor(expr);
child.processNode(clone);
```

Internally pushes onto the trickling-root stack; the plugin never names
or sees the stack itself.

### D7. Helpers built once per substate, not per render

`setupState` and `composeState` each attach a small `_helpers` object whose
fields close over the substate. `processPlugin`'s `effect` spreads
`reactiveState._helpers` into the args object. Per-render allocation cost
is unchanged from today (one small args object); helper closures are
allocated once per substate, not once per render call.

For a table of N rows × M columns: N helper-object allocations under the
new design, vs N×M under a naive per-render rebuild.

### D8. No `Object.freeze` on args

Per user preference for maximum flexibility. Compensating mitigation:
dangerous internals (`bindings`, `ø__*`, raw substate references) are
simply absent from the args surface. A power-user plugin that genuinely
needs them reaches for an explicit escape hatch (working name
`Velin.unsafe` — final name decided at implementation time). The door is
labeled, not locked.

### D9. Hard break, single migration PR

Zero external consumers. All in-tree plugins (`velin-standard`,
`velin-templates-and-fragments`, `velin-events`, `velin-router`) move to
the new shape in one PR; old fields removed; docs + tests updated in the
same PR.

### D10. *Accepted* — Rename `PluginControl.state` → `PluginControl.pluginState`

Once `state` is an args field meaning "user data", the existing
`return { state: … }` shape (meaning "updated plugin scratchpad") becomes
confusing. Proposed rename to `pluginState` for in/out symmetry:

```js
render: ({ pluginState = {} }) => ({
  pluginState: { initialized: true },
});
```

Free since we're already breaking. **Confirmation needed before implementation.**

### D11. *Accepted* — Name of the user-data args field is `state`

D10 was accepted, so the in/out collision is resolved by `pluginState` on
return; the args field is simply `state`.

## Out of scope

- `Object.freeze(args)` — deferred indefinitely; revisit only if a
  third-party plugin ever ships and real mutation accidents are observed.
- Escape-hatch naming (`Velin.unsafe`, `Velin.dangerous`, `Velin.internal`,
  …) — pick at implementation time.
- Git history squash to "initial commit" — separate operation, do after
  this ADR lands and is implemented.

## Migration sketch (reference plugins)

**`vln-input`** (`src/velin-standard.js:255-330`):

```diff
- render: ({ node, tracked, expr, reactiveState, pluginState = {} }) => {
-   const setter = vln.getSetter(reactiveState, expr);
+ render: ({ node, tracked, getSetter, pluginState = {} }) => {
+   const setter = getSetter();
```

**`vln-loop`** (`src/velin-standard.js:478-509`):

```diff
- const substate = vln.composeState(reactiveState, interpolations);
- substate.tricklingRoots = [...(substate.tricklingRoots ?? []), expr];
- vln.processNode(clone, substate);
+ const child = compose({
+   [subkey]: { expr: `${expr}[${i}]` },
+   $index:   { literal: i },
+ }).anchor(expr);
+ child.processNode(clone);

  // later, on cleanup:
- vln.cleanupState(reactiveState, oldSubstates[i], childNode);
+ oldChildren[i].cleanup(childNode);
```

**`vln-router`** (`src/velin-router.js:25-32`):

```diff
- let routerState = reactiveState.state[expr];
- if (!routerState || typeof routerState !== 'object') {
-   reactiveState.state[expr] = {};
-   routerState = reactiveState.state[expr];
- }
+ if (!state[expr] || typeof state[expr] !== 'object') {
+   state[expr] = {};
+ }
+ let routerState = state[expr];
```

## References

- `src/velin-core.js:386-489` — `processPlugin` (where the args object is built)
- `src/velin-core.js:1437-1464` — `composeState`
- `src/velin-core.js:1700-1726` — `Velin` export with `ø__internal`
- `src/velin-standard.js:255-330` — `vln-input` boilerplate
- `src/velin-standard.js:467, 478-509` — `vln-loop` substate mutation
- `src/velin-router.js:25-32, 123, 141` — direct `reactiveState.state` writes + `ø__internal` use
- ADR-0001 — landed plugin-injection & trickling-root work this builds on
- `docs/plugin-api-design.md` — current-state diagnosis (superseded by this ADR)
- `.plans/honest-review.md` — original review that surfaced this work
