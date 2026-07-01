# ADR 0003 — One-shot dependency capture

Status: **Accepted** (2026-07-01; documents existing behavior)

## Context

Vue 3, Solid, and Angular signals all re-run an effect's tracker on
every execution: whatever reactive properties are read that time become
its dep set. Conditionally reading a signal only from the second run
onward still works — it's picked up when it happens.

Velin does not do this. `processPlugin`
(`src/velin-core.js:505`) pushes a `DepCapture` onto
`reactiveState.ø__depCaptures`, runs `plugin.track(...)` once, snapshots
`depCapture.deps` (`src/velin-core.js:598`), registers the effect in
`reactiveState.bindings` against each captured key, then pops the
capture (`src/velin-core.js:624`). The `depCapture.capturingDeps` flag
is flipped to `false` before the effect closure is even defined
(`src/velin-core.js:575`), so every subsequent re-run of that effect
reads through the proxy with **no capture active** — its dep set is
frozen from the initial track.

This became visible in the efficient-table demo. The header arrow bound
`vln-text="myTable.sortCol === col ? (myTable.sortDir === 'asc' ? '↑' : '↓') : ''"`.
Initial track ran with `sortCol=null`, the `===` short-circuited the
ternary, `sortDir` was never read, and the effect was registered only
against `sortCol`. Toggling direction on a subsequent click mutated
`sortDir` but had no listeners, so the arrow never updated.

## Findings

### F1. Deps are captured exactly once, in `processPlugin`

`processPlugin` is the only site that pushes a `DepCapture` (`src/velin-core.js:515`).
Nothing in the effect closure at `src/velin-core.js:577` re-establishes
a capture context on re-runs. Reads during re-runs still walk the proxy
get traps at `src/velin-core.js:1438,1491`, but those checks
`peek(reactiveState.ø__depCaptures)?.capturingDeps` — with no active
capture, the reads are inert.

### F2. Re-tracking would cost more than dep churn saves

A re-tracking model has to (a) tear down old dep registrations, (b)
push a fresh capture, (c) re-evaluate the tracker, (d) diff old vs new
deps, (e) rebuild bindings. In the hot-path templates Velin targets
(vln-loop over N rows, vln-text on each cell), the vast majority of
re-runs re-read exactly the same deps. The diff-and-rebuild work is
pure overhead for that case.

### F3. Short-circuit tracking bugs are a real footgun

The arrow bug above is a template-level ternary. The same pattern
recurs in JS: any conditional read (`if (a) b()`, `a && b`, `a ?? b`,
guard-clauses) risks missing a signal on the initial run. This is a
gap in the model the docs don't warn about
(`docs/plugins.md:80` says "set up dependency tracking" and stops).

## Decisions

### D1. Keep one-shot capture

The performance argument (F2) holds for the target workloads. Re-tracking
is not adopted.

### D2. Callers eager-touch their deps

Expressions that need a signal reactively must read it up front,
before any conditional. Idiomatic pattern is to assign every reactive
read to a local — a bare expression statement (`state.x;`) is at the
mercy of the JIT, but `const x = state.x;` cannot be dead-code-eliminated
because `x` is used later.

Property getters on state are the natural home for this discipline:
they centralize the eager reads and hide the rule from the template.
The efficient-table demo uses this for `sortarrow`, `sorttitle`,
`headerclass` — each getter reads `sortCol` and `sortDir` into locals
first, then returns a closure over them.

### D3. Document the rule

`docs/plugins.md` (`track` section) and `docs/directives.md` (top-level
reactivity note) get a "Eager-touch your deps" callout linking here.

## Consequences

Positive:
- Steady-state effect runs stay one function call — no diff, no
  re-registration.
- The dep set is stable and inspectable (register once, never mutate).
- The rule is simple to state: touch on the first run or you don't get
  it.

Negative:
- Users need to know the rule. Short-circuit ternaries and guard-clause
  reads silently break reactivity.
- Refactoring an expression to add a new conditional dep silently drops
  reactivity for anything the new branch guards.

Neutral:
- Vue/Solid users will find the model unfamiliar. The docs need to make
  the difference explicit rather than let them discover it via a bug.

## Alternatives considered

**Re-track on every run.** Rejected on F2. If the perf argument stops
holding for a common workload, we revisit.

**Auto-eager rewrite in `compile`.** The tokenizer could walk the AST
and hoist every `MemberExpression` on state to a pre-eval touch. Cheap
to do but changes eval semantics (getters with side effects would fire
in the wrong order), and doesn't help for deps read inside called
methods.

**Explicit `Velin.touch(...)` helper.** A no-op function that just
reads its args, e.g. `Velin.touch(sortDir); sortCol === col ? … : …`.
Redundant with `const sortDir = state.myTable.sortDir;` and adds an
API surface for no gain.
