# Velin vs. the alternatives

If you're evaluating Velin against a similar-shaped library, here's a
comparison. These are all good tools; they just make different trade-offs.

## At a glance

| Library    | Gzipped   | Reactivity                  | Build step | Default CSP-safe            | Templates live in | State lives in     |
|------------|-----------|-----------------------------|------------|------------------------------|-------------------|--------------------|
| **Velin**  | 9.8 KB    | Native Proxy                | No         | Yes                          | HTML attributes   | Plain JS objects   |
| Alpine.js  | ~15 KB    | Proxy (via @vue/reactivity) | No         | No (uses `new Function()`)   | HTML attributes   | `x-data` (in HTML) |
| petite-vue | ~7 KB     | Vue 3 reactivity            | No         | No (uses `new Function()`)   | HTML + `{{ }}`    | `v-scope` / setup  |
| htmx       | ~16 KB    | None (server-driven)        | No         | Partial                      | HTML attributes   | The server         |
| Stimulus   | ~10 KB    | None (manual)               | Optional   | Yes                          | HTML `data-*`     | Controller classes |
| Vue 3 (global CDN) | ~52 KB | Proxy + refs            | No         | No (in-browser template compile) | HTML + `{{ }}` | `reactive()` / refs |

Sizes are approximate, taken from bundlephobia for the latest published
version at the time of writing. Verify current numbers before citing.

## When to pick each

- **Velin** — you want reactivity like Vue/Alpine, but you need strict CSP
  without giving up features, you don't want a build step, and you want
  state to live in plain JS objects you can log, serialize, and step through.
- **Alpine.js** — the ecosystem you know, tons of examples, CSP isn't
  a hard constraint (or you're willing to trade features for it — see below).
- **petite-vue** — you already write Vue and want a no-build subset for a
  mostly-server-rendered page. Note that petite-vue is minimally
  maintained (last release 0.4.1).
- **htmx** — the server is authoritative, and interactivity is "swap chunks
  of HTML in response to events." No client state.
- **Stimulus** — Rails/Hotwire ecosystem, or you want the discipline of
  controllers over the freedom of directives-with-expressions.
- **Vue 3 global build** — you want the full Vue ecosystem in a script tag
  and don't mind the size or the `unsafe-eval` requirement.

## CSP, in more detail

Every library in this table except Stimulus and Velin uses `new Function()`
in its default build, which requires `unsafe-eval` in your CSP.

Escape hatches:

- **Alpine** ships `@alpinejs/csp`, but the CSP build restricts expression
  syntax: no arrow functions, destructuring, template literals, spread, or
  property assignments (e.g. `user.name = 'x'` is out). `x-html` is
  disabled and `x-model` is reported broken. Register components via
  `Alpine.data()` only.
- **htmx** has `htmx.config.allowEval = false`, which disables `hx-on`,
  trigger filter expressions, and `js:`/`javascript:` prefixes in
  `hx-vals` / `hx-headers`.
- **Vue 3** is CSP-safe if you use the runtime-only build with
  precompiled templates — which means a build step.

Velin's default build is CSP-safe with no feature loss — it ships a full
AST evaluator instead of leaning on `Function()`. That's where the "still
smaller than the alternatives" claim comes from.

## Other differences worth knowing

**Where state lives.** Alpine's `x-data="{ count: 0 }"` puts state in HTML.
Convenient for one-off widgets, less convenient when state grows, needs
reuse, or needs to be inspected in DevTools. Velin's state is a plain JS
object passed to `bind()` — `console.log(model)` shows the whole thing.

**Reactivity model.** Velin uses native `Proxy`. Assigning to a property is
enough — no `.value`, no setters, no `useState` tuple.

**Bundle sizing.** The 9.8 KB figure is for the "everything" bundle
(`velin-all`). Most apps only need the common bundle (core + directives)
at ~8.4 KB. See [bundles.md](./bundles.md) for the per-feature breakdown.
