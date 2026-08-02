# Templates & Fragments

Optional add-on for reusing HTML chunks. Ships with `velin-all.js`.

Two directives:

- **`vln-template`** — registers a `<template>` under an id.
- **`vln-fragment`** — renders a registered template into the current scope,
  optionally providing values via `vln-vars`.

## Basic usage

### Define a template

```html
<template vln-template="'userCard'" vln-vars="['user']">
  <div class="card">
    <h3 vln-text="user.name"></h3>
    <p vln-text="user.email"></p>
  </div>
</template>
```

Both attribute values are **JavaScript expressions** — a string literal id
needs quotes: `vln-template="'userCard'"`. `vln-vars="['user']"` declares the
variables the template body reads.

### Use the template

```html
<div vln-fragment="'userCard'" vln-vars="{ user: currentUser }"></div>
```

`vln-fragment="'userCard'"` picks the template by id (JS expression again —
quote your literal). `vln-vars="{ user: currentUser }"` is the **provider**:
an object whose keys satisfy the template's declaration, evaluated in the
consumer's scope.

## Registration rule

A `<template vln-template="…">` registers when Velin walks it during
`bind()` — that means it must sit **inside the bound root** and **before**
any consumer in DOM order. Otherwise the fragment errors:

```
[Velin Templates] Template "foo" is not registered. Make sure a
<template vln-template="'foo'">…</template> appears BEFORE this
<div vln-fragment=…> in the DOM AND inside the same Velin.bind() root.
```

In practice: put templates at the top of the bound root.

`Velin.debug.templates()` returns `[{id, connected}, …]` for every live
registration — handy in the console when you hit the error.

## `vln-vars`: two roles, one attribute

Same attribute name on both sides; the meaning depends on where it sits.

### On `<template vln-template="…">`: declaration

**Array of names — pass-through:**

```html
<template vln-template="'userCard'" vln-vars="['user', 'onSave']">…</template>
```

**Object of transformers — per-key hook:**

```html
<template vln-template="'userCard'"
          vln-vars="{ user: requireUser, count: toNumber }">
  <span vln-text="user.name"></span>
  <span vln-text="count"></span>
</template>
```

The value passed for `user` flows through `requireUser(v)` on every read.
Transformers are **named function references** resolved in the template's
own scope — the CSP-safe evaluator does not support inline arrow functions.

**State-level constant — reusable declaration:**

```html
<!-- state.modalVars === { user: requireUser } -->
<template vln-template="'userCard'" vln-vars="modalVars">…</template>
```

**No declaration — auto-discovery:**

```html
<template vln-template="'loose'">
  <span vln-text="a"></span>
  <span vln-text="b"></span>
</template>
```

Whatever keys the consumer provides become in-scope. No validation.

### On the `vln-fragment` element: provider

An object literal whose keys must cover the declaration. Evaluated in the
consumer's scope:

```html
<div vln-fragment="'userCard'"
     vln-vars="{ user: currentUser, onSave: handleSave }"></div>
```

Spread works:

```html
<div vln-fragment="'userCard'" vln-vars="{ ...defaults, user: currentUser }"></div>
```

Missing keys error clearly:

```
[Velin Templates] Template "userCard" requires missing variables: [onSave].
Add them to vln-vars, e.g. vln-vars="{ onSave: yourValue, … }"
```

If the provider evaluates to a non-object (`null`, string, array), the
error appends a spread hint:

```
… (provider `user` evaluated to string — expected an object;
did you mean `{...user}`?)
```

## Dynamic template selection

```html
<template vln-template="'adminCard'" vln-vars="['user']">…</template>
<template vln-template="'guestCard'" vln-vars="['user']">…</template>

<div vln-loop:user="users"
     vln-fragment="user.role + 'Card'"
     vln-vars="{ user: user }"></div>
```

Same-name provider keys are safe — `vln-vars="{ user: user }"` under a
loop variable `user` resolves via JS closure semantics, not shadow
recursion.

## Templates in loops

```html
<template vln-template="'todoItem'" vln-vars="['todo', 'actions']">
  <li class="todo">
    <input type="checkbox" vln-input="todo.done" />
    <span vln-text="todo.text"></span>
    <button vln-on:click="actions.delete()">×</button>
  </li>
</template>

<ul>
  <li vln-loop:todo="todos"
      vln-fragment="'todoItem'"
      vln-vars="{ todo: todo, actions: createActions(todo) }"></li>
</ul>
```

## Lifecycle events

Standard init/destroy events on any inner element:

```html
<template vln-template="'chart'">
  <canvas vln-on:init="renderChart(event.target)"
          vln-on:destroy="disposeChart(event.target)"></canvas>
</template>
```

## Void elements are rejected

You cannot host a fragment on `<img>`, `<input>`, `<br>`, etc. — they can't
hold children. Use a container (`<div>`, `<span>`).

## Duplicate registrations

If two templates register under the same id, the **later one wins** and
Velin warns:

```
[Velin Templates] Template "foo" already registered — replacing.
```

Fine for hot-reload. If unintentional, the warning is your cue.

## Migration from the pre-rewrite API

The old sibling-attribute API (`<template id="…" vln-vars="a, b">` on the
template, `vln-var:a="…"` on the consumer) was removed. The deprecation
plugin errors loudly if you still use it.

Steps:

1. Rename `<template id="foo" vln-vars="a, b">` → `<template vln-template="'foo'" vln-vars="['a', 'b']">`. Comma-separated string is gone; use a real JS array.
2. Move the template inside the bound root, before its consumers.
3. Replace sibling `vln-var:a="…" vln-var:b="…"` with a single `vln-vars="{ a: …, b: … }"` on the fragment element.

## When to use templates

- Repeated non-trivial markup.
- Dynamic component selection based on runtime data.
- Reusable UI patterns rendered in more than one context.

## When NOT

- A simple repeated item — use `vln-loop` directly.
- Server-rendered pages — prefer your server's partial system.

## Debugging

- `Velin.debug.templates()` — what's registered right now.
- Reminder: `vln-fragment="foo"` looks up `state.foo`; use `'foo'` for a literal id.

## See also

- [Directives Guide](./directives.md)
- [Creating Plugins](./plugins.md) — how the fragment plugin works internally
- [API Reference](./api-reference.md#low-level-apis) — `compose()`, `cleanupState()`
- [Documentation Hub](./README.md)
