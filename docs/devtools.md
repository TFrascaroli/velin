# Velin Devtools

An in-page companion for inspecting Velin state, directive bindings, and
reactive updates as they fire. Ships separately from core so you only pay
for it when you want it.

**Status:** `0.1.0-alpha.0` — the tabs answer the questions they claim to,
but expect rough visuals and shifting user journeys. Polish is the focus of
the current milestone.

## Opening it

The site's dev server injects devtools into every `/playground/` page:

```bash
npm run serve:dev
# open http://localhost:3123/playground/hello-world.html
# press Ctrl+Shift+V to toggle the panel
```

To attach it to your own page, drop the script tag next to Velin:

```html
<script src="https://unpkg.com/@velinjs/all/velin-all.min.js"></script>
<script src="https://unpkg.com/@velinjs/all/velin-devtools.js"></script>
```

Devtools attaches to whichever Velin instance it finds on `window.Velin`.
The panel renders in a shadow root so it doesn't inherit your page's CSS.

## What each tab answers

Each tab is scoped to one question. If you can't figure out which tab to
open, the answer is probably the first one whose question matches yours.

| Tab | Question it answers |
|---|---|
| **Log** | What just happened, in order? |
| **State** | Where is my state tree and what DOM does it own? |
| **Bindings** | Which paths carry the most reactive work? |
| **Effects** | What just re-ran, and why? |
| **Perf** | Which expressions cost the most, or spike? |
| **Warnings** | What's suspicious? (deduped) |

### Log

A time-ordered stream of every event Velin emitted since the panel opened:
`bind`, `compose`, `mutate`, `trigger`, `effect`, `evaluate`, `compile`,
`plugin`, `cleanup`, `warn`. Newest at top. Read it when you don't yet
know what you're looking for and want to see the shape of what your page
is doing.

### State

The tree of every `ReactiveState` bound in the page, with parent → child
composition edges. Nodes with a bound DOM subtree are marked; click a row
to flash the owning nodes.

### Bindings

Paths (like `user.name` or `todos[0].done`) that have reactive effects
attached, sorted by how many effects each path feeds. This is where you
look when the page feels slow to see if one property is doing all the
work.

### Effects

The most recent effects that fired — the actual re-renders. Each row
carries the path that triggered it, the directive expression, the node,
and how long the effect took. Click a row to flash the node it updated.

### Perf

Per-expression call counts and total time spent in evaluation. Sorted by
total cost. Use it when Bindings tells you *what* is busy and you want to
know *what it costs*.

### Warnings

Deduplicated Velin warnings — orphaned effects, missing template
variables, unknown directives, expression evaluation errors. If nothing
is here, nothing is complaining.

## Snapshot cadence

The panel polls every 500ms and only snapshots the active tab. Switching
tabs takes one poll to fill in. If you're inspecting a stable state, the
panel is idle between ticks.

## Status and roadmap

Devtools is `0.1.0-alpha.0`. It works, but the visuals are rough and some
tabs still need better empty states, keyed loops, and per-expression max
timing. Track the internal roadmap at
[`.plans/devtools-improvements.md`](https://github.com/TFrascaroli/velin/blob/main/.plans/devtools-improvements.md)
in the repo.

Non-goals for this pass: cross-tab search, flame view, export/share,
theming.
