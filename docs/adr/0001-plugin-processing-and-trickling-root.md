# ADR 0001 — Finalize plugin processing rewrite and fix nested trickling roots

Status: **Implemented** (landed in commit `8ae2568 fix(core): stack trickling roots, finalize plugin injection refactor`)

## Context

Two related concerns triggered this ADR while building the `efficient-table`
example (`playground/benchmarks/virtual-table.{html,js,tpl.html}`):

1. The example needed a way for an application plugin (`vln-table`) to expand
   into a small set of plumbing directives (`vln-var:tabledata`, `vln-fragment`)
   on the same node. The currently in-progress refactor in `velin-core.js`
   added a `PluginControl.plugins` field and rewrote `processNode` to walk a
   linked list, so a plugin can inject extra directives into the chain.

2. While poking at the example, a suspicion was raised that "too many" effects
   were being registered above a loop's trickling root. Specifically, the row
   array seemed to have one effect per cell, even though the cells should only
   depend on individual array elements once the loop's trickling root kicks in.

Concern (2) is the more dangerous one — it would silently turn loops into
O(rows × cols) re-renders on any array mutation. This ADR captures both and
proposes a finalization plan.

## Findings

### F1. Nested-loop substates lose the outer trickling root (CONFIRMED)

A reactive substate is created via `composeState(parent, interpolations)`
(`velin-core.js:1440`). The new substate is a shallow spread of the parent:

```js
const inner = { ...reactiveState, interpolations: ..., ø__innerBindings: ..., ... };
```

So `tricklingRoot` is inherited by value. Then `vln-loop` overwrites it on the
iteration substate (`velin-standard.js:465` and `velin-standard.js:493`):

```js
substate.tricklingRoot = expr;
```

For nested loops, this means the **inner loop replaces** the outer loop's
trickling root. The outer one is gone for everything happening below the
inner loop.

Confirmed with `test/unit/core/trickling-root-nested.spec.ts`:

```
<tr vln-loop:row="rows">
  <td vln-loop:col="cols" vln-text="row[col]"></td>
</tr>
```

With 2 rows × 3 cols, `bindings.get("root.rows").size === 7`
(6 cells + 1 outer-loop tracker). Expected: **1**.

Mechanism per cell:
- Cell's substate has `tricklingRoot = "cols"` (the inner loop's array).
- Cell expression `row[col]` interpolates `row → rows[i]`.
- Evaluating `rows[i]` accesses `state.rows` through the array proxy
  (`velin-core.js:1319`), which pushes `root.rows` into the dep capture.
- The trickling-root filter (`velin-core.js:464`) keeps `root.rows` because
  `root.cols` (normalized) does not start with `root.rows`.
- Effect registered on `root.rows`.

This matches the user's "I saw 8 effects on the array" observation almost
exactly (efficient-table has 7 cols × 1 row + the row-loop tracker).

### F2. The in-progress plugin processing refactor has rough edges

The `f98f336 inprog` commit replaces `processNode`'s inline plugin loop with
a linked-list walk and introduces `PluginControl.plugins` for dynamic
injection. The shape is right, but there are issues:

1. **`consumeAttribute` runs for injected plugins** (`velin-core.js:1671`).
   For injected entries (e.g. `vln-fragment` returned from the `table` plugin)
   the attribute does not exist on the DOM node, so `removeAttribute` is a
   no-op but `setAttribute("reflect-vln-fragment", ...)` then adds a spurious
   `reflect-*` attribute. We should only "consume" attributes that came from
   the node itself.

2. **Dedup key uses the attribute name instead of the plugin name**
   (`velin-core.js:1622`):
   ```js
   `${parsedPlugin.name}${parsedPlugin.subcommand ? ":" + parsedPlugin.subcommand : ""}`
   ```
   `parsedPlugin.name` is already the raw attribute (e.g. `vln-loop:item`),
   so appending `:item` again produces `vln-loop:item:item`. Still unique per
   attribute, so it doesn't currently misbehave — but it's a regression from
   the previous semantic of "uniqueness on `<plugin>:<subcommand>`" and it
   would behave oddly if a plugin injected the same logical directive twice
   with different subcommands.

3. **Linked-list construction is heavier than it needs to be**. The chain is
   built once from the array and then maintained as nodes are inserted.
   `applicable.splice(currentIndex + 1, 0, ...newPlugins)` with a plain index
   walk would do the same thing in fewer lines.

4. **`parsePluginFromAttribute` has stale indentation** — the body inside the
   function is indented as if it were still in the original `for` loop.
   Cosmetic, but it makes diff review harder.

5. **Injected plugins are inserted "after current" without being merged into
   the remaining priority order**. For the table-style use case this is what
   we want (the injection wraps the current node's behavior), but it should
   be a deliberate design statement, not an accident. Add a note in the
   plugin API doc.

6. **`processPlugin(plugin, reactiveState, value, node, name, value, subcommand)`**
   passes `value` as both `expr` and `attributeValue` (`velin-core.js:1662`).
   That is the intended behavior for normal DOM attributes (and matches what
   the `table` plugin reads), but it should be documented since it's a new
   parameter that didn't exist before this commit.

### F3. Two tests load from a path that no longer exists

`test/unit/std/use-alias.spec.ts` and `test/unit/std/event-handling.spec.ts`
both `readFileSync` from `playground/velin.js`. The current `scripts/prepare.js`
writes to `playground/vendor/velin.js`. Five test failures come from this
single path mismatch; the fix is a one-line path change in each test (and
the tests then need the build artifact, so `npm run build && npm run prepare`
must run first).

### F4. `bindings` Map is shared across substates (BY DESIGN)

`composeState` deliberately shares `bindings` with the root state and uses
per-substate `ø__innerBindings` for cleanup tracking. Not a bug — this is
how `cleanupState` removes only the substate's own effects on teardown. Worth
flagging only because it means the trickling-root filter is the ONLY thing
that prevents over-registration on root-level keys.

## Decision

Finalize the in-progress changes in this order:

### D1. Make the trickling root a stack, not a single value

Replace `reactiveState.tricklingRoot: string` with
`reactiveState.tricklingRoots: string[]`. `composeState` inherits the parent's
list. `vln-loop` (and any future plugin that wants to anchor a trickling root)
**appends** instead of overwriting:

```js
substate.tricklingRoots = [...(parent.tricklingRoots ?? []), expr];
```

The filter in `processPlugin` becomes:

```js
const roots = reactiveState.tricklingRoots;
const deps = roots?.length
  ? entries.filter(e => !roots.some(r => normalize(r).startsWith(e)))
  : entries;
```

`normalize(r)` is the existing `root.`-prefix logic, lifted into a helper.

Rejected alternatives:
- *Just don't overwrite in `vln-loop`* — same effect but hides the
  intent. The stack makes the model explicit and lets future plugins layer.
- *Walk a `parent` link instead of storing a list* — `composeState` already
  drops the parent reference, and substates can be cleaned up out of order;
  a flat list is simpler.

### D2. Fix the plugin processing refactor

- Distinguish injected from DOM-sourced plugins (e.g. a flag on the parsed
  plugin record), and only `consumeAttribute` for DOM-sourced ones.
- Fix the dedup key to use `parsedPlugin.plugin.name` (or `pluginKey`)
  instead of the raw attribute name.
- Replace the linked list with `applicable.splice(i + 1, 0, ...injected)`
  and continue iteration via index.
- Clean up indentation in `parsePluginFromAttribute`.
- Document `PluginControl.plugins` in `docs/plugin-api-design.md`: injected
  plugins run **immediately after the current plugin**, ahead of any
  remaining lower-priority plugins on the node.
- Document the new `attributeValue` argument on `render` in the same file.

### D3. Re-point the broken tests

Change `playground/velin.js` → `playground/vendor/velin.js` in
`use-alias.spec.ts` and `event-handling.spec.ts`. Add a top-of-file
`beforeAll` (or test setup) note that the artifact must be built; or, better,
import `src/velin-core` + `src/velin-standard` directly the way every other
spec does and stop relying on the bundled artifact.

### D4. Add regression tests

- Keep `test/unit/core/trickling-root-nested.spec.ts` (currently failing) and
  flip it to green once D1 lands.
- Add a test for `PluginControl.plugins` injection (table-style: one plugin
  expands into `vln-fragment` and a `vln-var:*`).

## Out of scope

- The bigger "should `bindings` be per-substate?" question. The shared-map
  design is fine; D1 is enough to restore the intended O(rows + cols)
  behavior in nested loops.
- The `inprog` commit's example/template changes (efficient-table, docs).
  Those land as-is once the core changes above are in.

## References

- `src/velin-core.js:464` — current trickling-root filter
- `src/velin-core.js:1561` — `parsePluginFromAttribute`
- `src/velin-core.js:1609` — `processNode` linked-list walk
- `src/velin-standard.js:465`, `:493` — `tricklingRoot` overwrite sites
- `src/velin-templates-and-fragments.js:46` — `vln-fragment` (priority `LATE`)
- `playground/benchmarks/virtual-table.{html,js,tpl.html}` — the motivating example
- `test/unit/core/trickling-root-nested.spec.ts` — repro
