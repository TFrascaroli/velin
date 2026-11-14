# ADR 0006 — Re-capture dependencies on structural writes

Status: **Accepted** (2026-11-15). Amends [ADR 0003](./0003-one-shot-dependency-capture.md).

## Context

ADR 0003 captures a binding's dependencies once, when its tracker first
runs, and never again. The argument was cost: in Velin's target workloads
(a `vln-loop` over N rows, a `vln-text` per cell) almost every re-run reads
exactly the same paths, so tearing down and rebuilding the dep set on each
run is pure overhead.

Dogfooding the devtools (2026-10/11) found three symptoms of the same
hole. A binding that iterates a collection is subscribed to the items that
existed, in the slots they were in, at first run:

1. **Getters over a growing array go stale.** `get doneCount() { return
   this.tasks.filter(t => t.done).length }` subscribes to `tasks`,
   `tasks[0].done`, `tasks[1].done`. A pushed task re-runs it (the push
   triggers `tasks`), but ticking that new task writes `tasks[2].done`,
   which nobody listens to. The standard todo counter breaks for every
   item added after first render.
2. **Unkeyed loop rows go stale after a move.** Item proxies bake their
   path at first wrap (`root.items[0]`), so after `unshift` the item in
   slot 1 still writes to `root.items[0].n`. The row rendering slot 1 is
   subscribed to `root.items[1].n` and never hears about it.
3. **Readers of a replaced object miss its new fields.** A method that
   enumerates `this.user` is subscribed to the fields `user` had; after
   `state.user = {…, age}` it re-runs (the replacement triggers `user`),
   but a later `user.age = 4` is unheard.

The eager-touch rule from ADR 0003 (read everything up front) cannot help
here: the paths did not exist to be read.

## Decision

### D1. Structural writes re-capture; primitive writes stay one-shot

A write is **structural** when it swaps an object or array in or out of a
path (`old` or `value` is an object, including `null`), when it is a
mutating array method (`push`, `pop`, `shift`, `unshift`, `splice`,
`sort`, `reverse`), or when it sets an array's `length`. A write of a
primitive over a primitive is not.

`triggerEffects` carries a `recapture` flag. An effect run with it pushes
its capture frame again, runs its tracker, then rebinds: paths it no
longer reads are dropped from `bindings` (and the state's
`ø__innerBindings`), new paths are added. Effects run without the flag
behave exactly as before.

The boundary is principled, not heuristic: the *shape* of what a binding
reads can only change when something that contains those reads changes
(a container got new elements, a different object sits at the path). A
primitive write cannot create new paths to read. The one exception is a
primitive guarding a branch (`flag ? a : b`), and that remains ADR 0003's
eager-touch rule.

### D2. Plugins can ask for a re-capture

The `triggerEffects(prop, recapture)` helper takes the flag. `vln-loop`
passes `true` when a positional slot now holds a different item, so the
row re-captures against the item that moved in. Keyed loops need nothing:
their rows are bound to the item's baked paths, which move with it.

### D3. The devtools show the current capture

`effect.ø__debug.reads` is refreshed on every rebind, so Inspect reflects
the latest dependency set, not the first one.

## Alternatives considered

**Re-capture only when the trigger path is above an existing dep** ("the
array changed and this effect was reading inside it"). Catches 1 and 3
but not 2 after the second move: a moved row's deps are the baked paths
of whatever item sat there before (`root.items[0].n`), which bear no
relation to the slot path (`root.items[1]`) that wakes it. It also needs
a per-effect prefix scan on every trigger. The structural-write test is
cheaper and covers the loop case through D2.

**Re-track on every run** (Vue, Solid). Rejected in ADR 0003 for cost;
still rejected. Primitive writes are the hot path (typing, toggles,
counters) and gain nothing from a re-capture.

**Recreate an unkeyed row when its slot changes item.** Correct by
construction, but churns DOM and drops focus and typed input in moved
rows, and does nothing for symptoms 1 and 3.

**Resolve the loop item once per render and hand rows the value.**
Fixes 2 and the getter-loop fan-out, but changes interpolation semantics
(two-way bindings on primitive items need the slot expression) and
leaves 1 and 3 open.

## Consequences

Positive:
- The three symptoms are fixed and pinned by tests
  (`test/unit/core/recapture.spec.ts`, `test/unit/std/loop-moved-rows.spec.ts`).
- The `VLN022` "items moved between rows" warning is retired; unkeyed
  loops are correct after moves. Keyed loops remain the answer for rows
  that must keep DOM, focus or input across reorders.
- `bindings` no longer accumulates dead paths from removed items.

Negative:
- `velin-all` grows 161 B gzipped (10,190 → 10,351).
- Effects woken by a structural write pay a capture (Set adds during the
  tracker run) plus a Set diff. Those runs already re-evaluate a
  collection, so the capture is a fraction of the run. Not measured in a
  browser yet; the jsdom suite including the loop-cost tests is unchanged.
- Adding a field *in place* to an object (`user.city = 'x'`) is still
  unobservable to a binding that enumerated `user`: nothing listens to
  `root.user.city`. Replace the object instead.

Neutral:
- Each effect now holds its current dep set (one `Set` per binding).
- Loops over a filtering getter still fan out every row on every write
  (symptom 2 of `.plans/loop-row-deps.md`, perf only). Separate decision.
