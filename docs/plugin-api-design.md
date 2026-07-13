# Plugin API Design

## Status

Superseded by
[ADR-0002](./adr/0002-plugin-api-flat-args-with-prebound-helpers.md), which
captures the decisions on flat args + pre-bound helpers, the hard-break
migration, and the rename of `PluginControl.state` → `pluginState`.

ADR-0002 is **implemented** (2026-06-29) — all in-tree plugins use the new
shape, the brittleness described in the diagnosis below is resolved. The
text is preserved as historical context.

## Current state (as of 2026-06-28)

A plugin's `track` / `render` / `destroy` callbacks receive an args object
that exposes the raw `ReactiveState` wrapper directly:

```js
render({
  reactiveState,        // raw wrapper with ø__* internal fields visible
  compiledExpression,   // AST node
  node,                 // HTMLElement
  subkey,               // string | null
  tracked,              // return value from track()
  pluginState,          // persisted state for this node
  attributeName,        // raw attribute name ("vln-on:click")
  attributeValue,       // raw attribute value (same as expr today)
  expr,                 // expression string
})
```

`render` may return a `PluginControl`:

```js
{
  state?: any,                                   // persisted plugin state
  halt?: boolean,                                // stop processing this node
  scopedState?: ReactiveState,                   // scope for child nodes
  plugins?: Array<{name: string, value: string}> // injected directives, run next
}
```

## Known brittleness

1. **`reactiveState` leaks internals.** Plugins receive the full wrapper
   including `ø__depCaptures`, `ø__innerBindings`, `ø__innerStates`,
   `ø__finalizers`, `ø__control`, `bindings`, `tricklingRoots`, and
   `interpolations`. Any of these can be mutated by a misbehaving plugin and
   corrupt the reactive graph.
2. **Helper APIs take `reactiveState` positionally.** Plugins constantly write
   `Velin.evaluate(reactiveState, expr)`, `Velin.getSetter(reactiveState, expr)`,
   `Velin.composeState(reactiveState, …)`, `Velin.processNode(node, state)`.
   The `reactiveState` parameter is always the same value the plugin already
   has — pure boilerplate that doubles as a footgun.
3. **`ø__internal` is reachable from `Velin.ø__internal`.** Not used by
   in-tree plugins, but available to anything that imports `Velin`.
4. **`PluginControl` and the args object shape are not frozen.** Adding fields
   is fine; removing or renaming them is a silent break for third-party plugins.

## Direction

Introduce a stable `PluginContext` that:

- Pre-binds `evaluate`, `getSetter`, `compose`, `cleanup`, `processNode` so
  plugins don't pass `reactiveState` around.
- Exposes only `state` (the user-facing proxy) — not the wrapper — for the
  rare plugin that needs read access (e.g. `vln-router` bootstrapping `$route`).
- Keeps `compiledExpression` and `expr` available (the fragment and table
  plugins genuinely use the AST).
- Locks the shape of the context and the `PluginControl` return.

Migration is non-breaking by adding the new fields alongside the legacy
ones, then deprecating the legacy fields in a later release.
