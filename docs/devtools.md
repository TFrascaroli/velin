# Velin Devtools

An in-page drawer for the questions you ask while debugging a Velin page:
what is this element bound to, who re-renders when this changes, what
froze the page, and what is still running for DOM that's gone.

**Status:** `0.3.0-alpha.0`. Works on development builds only.

## Running it

Devtools reads hooks that only exist in development builds of Velin;
production bundles strip them. It is not in the npm package yet, so run
it from a checkout:

```bash
npm install
npm run serve:dev
# open http://localhost:3123/playground/ and pick "Devtools 101"
```

**Devtools 101** in the playground is a guided walkthrough: a small task
list with five realistic bugs, and steps that find each one with the
drawer.

To use it on your own page, run `npm run build` and load the two dev
bundles, Velin first:

```html
<script src="dist/build/velin-all.dev.js"></script>
<script src="dist/build/velin-devtools.dev.js"></script>
```

| Key | Does |
|---|---|
| `Ctrl+Shift+V` | Open or close the drawer |
| `Ctrl+Shift+P` | Pick an element to inspect |
| `Esc` | Step back one level, then close |

Turn it off for a page load with `?velin-devtools=off`, or for good with
`localStorage.velinDevtools = "off"`.

## Surfaces

The rail on the left switches surfaces. Rows drill in place; the
breadcrumb at the top walks back. Selecting the surface you're already on
returns to its top level.

| Surface | Question it answers |
|---|---|
| **Inspect** | What is this element bound to, what does each binding read, and what last changed it? |
| **Record** | Which bindings cost the most while I reproduce something? |
| **Query** | What re-renders if this path changes? |
| **Leaks** | Is anything still running for DOM that's been removed? |
| **Signals** | What did the runtime notice on its own? |

**Explain** is where every row leads: one binding's expression, what it
reads, its recent runs, and the writes that triggered them.

### Signals

The badge in the corner counts unread signals and turns amber for
warnings. Entries persist for the session.

- **long-task**: the browser blocked the main thread for more than 50ms.
  This is the browser's measurement, not an estimate. The entry names the
  handler that ran during it.
- **thrash**: writes to one path re-ran its bindings more than 32 times
  within a single frame. Writes inside a `batch()` don't count, so batching
  the loop clears it.
- **orphan-spike**: bindings keep running for elements that were removed.
- **warn**: a warning from Velin core.

### Reading a long task

Open a `long-task` entry to see what ran while the page was frozen:

- **The bar** splits the task into your handlers and bindings, devtools'
  own bookkeeping, and everything else (layout, garbage collection, other
  scripts).
- **Each handler** (`vln-on`, `vln-input`) shows the time spent in the
  handler and in Velin applying its writes, then its writes grouped by
  path.
- **Each write** lists the bindings it re-ran. **runs/write** is how many
  times a binding ran per write: far above 1 means one write re-rendered
  many elements. A write repeated in a loop whose bindings re-ran every
  time gets a batch suggestion.
- **tree ›** opens the cascade of that path's costliest single write: the
  bindings it re-ran, and any writes those bindings made in turn.
- Any binding opens in Explain.

Times are *self* times: a binding's own cost, not counting writes it
triggered. They add up: a cascade's total equals the sum of what it
contains.

Writes made outside any handler (after an `await`, in a timer, or from
code that writes state directly) are grouped under **outside handlers**.

## Things to know

- Devtools makes the page slower. Compare measurements taken with
  devtools to each other, not to production.
- Cascades come from the last 2000 writes. A long task older than that
  says it's partial.
- Writes in an `async` handler after its first `await` are attributed to
  "outside handlers", not to the handler.
- Velin batches only when you ask: `Velin.getController(this).batch(() => …)`
  inside a state method, or `Velin.getController(state)` on the object
  `Velin.bind()` returned.
