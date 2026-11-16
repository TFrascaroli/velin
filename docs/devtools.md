# Velin Devtools

An in-page drawer for the questions you ask while debugging a Velin page:
what is this element bound to, who re-renders when this changes, what
froze the page, and what is still running for DOM that's gone.

**Status:** alpha. Ships inside the `@velinjs/all` package. Works on
development builds only.

## Running it

Devtools reads hooks that only exist in the development builds of Velin
(`velin-*.dev.js`); production bundles strip them. Load the development
build of your bundle, then the companion:

```html
<script src="https://unpkg.com/@velinjs/all/velin-all.dev.js"></script>
<script src="https://unpkg.com/@velinjs/all/velin-devtools.min.js"></script>
```

From npm the same two files are `@velinjs/all/dev` (or
`@velinjs/all/common/dev`, `@velinjs/all/core/dev`, …) and
`@velinjs/all/devtools`. Leave both out of production pages; the
production bundle has nothing for the companion to attach to.

**Devtools 101** in the playground is a guided walkthrough: a small task
list with five realistic bugs, and steps that find each one with the
drawer. From a checkout:

```bash
npm install
npm run serve:dev
# open http://localhost:3123/playground/ and pick "Devtools 101"
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
- **thrash**: writes to one path (or to the same field across a list,
  like `tasks[*].done`) re-ran their bindings more than 32 times within a
  single frame. Writes inside a `batch()` don't count, so batching the
  loop clears it.
- **orphan-spike**: bindings keep running for elements that were removed.
- **warn**: a warning from Velin core.

### Reading a long task

Open a `long-task` entry to see what ran while the page was frozen:

- **The bar** splits the task into your handlers and bindings,
  **recording** (the dev build's instrumentation, which runs whether or
  not the drawer is open), and everything else (layout, garbage
  collection, other scripts).
- **Each entry point** is tagged: **handler** (`vln-on`), **input**
  (`vln-input`), or **mount** (`Velin.bind` building the page). It shows
  the time spent in it and in Velin applying its writes, then its writes
  grouped by path. Writes to every item of a list group together
  (`tasks[*].done`). A handler that wrote nothing still shows up, with its
  time as its own JavaScript.
- **Each write** lists the bindings it re-ran: **runs** in total and
  **/write** (per write). Far above 1 per write means one write
  re-rendered many elements. When the same bindings re-ran after each of
  several writes, you get a batch suggestion with an estimate of what
  batching would save. Writes that each re-ran a *different* binding
  (one row each) don't get one: batching wouldn't help.
- **tree ›** opens the cascade of the costliest single write to that path:
  the bindings it re-ran, and any writes those bindings made in turn.
- Any binding opens in Explain.

Times are *self* times: a binding's own cost, not counting writes it
triggered. They add up: a cascade's total equals the sum of what it
contains.

Writes made outside any handler (after an `await`, in a timer, or from
code that writes state directly) are grouped under **outside handlers**.

## Things to know

- Everything is measured on a development build, which does extra
  checking on every binding and is several times slower than production
  for binding-heavy work. The bar's "recording" slice is only the
  instrumentation itself. Compare measurements with each other, not with production.
- Cascades come from the last 2000 writes. A long task older than that
  says it's partial.
- Writes in an `async` handler after its first `await` are attributed to
  "outside handlers", not to the handler.
- Velin batches only when you ask: `Velin.getController(this).batch(() => …)`
  inside a state method, or `Velin.getController(state)` on the object
  `Velin.bind()` returned.
