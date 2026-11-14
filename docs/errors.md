# Error codes

Every message Velin logs or throws starts with a code. Development builds
print the full explanation after it. Production builds print only the code
and a link to its page here, so the text doesn't ship in your bundle:

```
dev:  [VLN014] Async mutation error: Property 'name' was mutated after …
prod: [VLN014] https://tfrascaroli.github.io/velin/e/VLN014
```

Each code below has a page at `https://tfrascaroli.github.io/velin/e/<CODE>`.
The section text is the page.

## VLN001

**vln-attr on a non-element.** `vln-attr:name` was placed on a node that
isn't an element (a text or comment node), so there is nothing to set the
attribute on. Move the directive to an element.

## VLN002

**vln-attr without a name.** Write `vln-attr:name="expr"`; the part after
the colon is the attribute to set.

## VLN003

**vln-class on a non-element.** `vln-class` needs an element with a
`classList`. Move it to an element.

## VLN004

**vln-on on a node that can't listen.** The node has no `addEventListener`.
Put `vln-on:event` on an element.

## VLN005

**vln-on without an event name.** Write `vln-on:click="handler()"`; the
part after the colon is the event.

## VLN006

**vln-input on an unsupported element.** `vln-input` works on `<input>`,
`<textarea>`, `<select>` and `contenteditable` elements only.

## VLN007

**vln-watch handler missing or not a function.** Write
`vln-watch:handlername="expr"`, and define `handlername` as a method on
your state. HTML lowercases attribute names, so the method name must be
lowercase: `vln-watch:onchange`, not `vln-watch:onChange`.

## VLN008

**Template or fragment id is missing or not a string.** `vln-template` and
`vln-fragment` take an expression that must evaluate to a string. The
usual cause is a missing pair of quotes: `vln-fragment="card"` looks up a
state property called `card` (which is `undefined`), while
`vln-fragment="'card'"` is the string `card`.

## VLN009

**Fragment is missing variables the template declared.** The template's
`vln-vars="['a', 'b']"` lists what it needs; the `vln-fragment` element
must provide them: `vln-vars="{ a: …, b: … }"`. If you passed a variable
instead of an object, spread it: `vln-vars="{ ...props }"`.

## VLN010

**Write during evaluation.** An expression assigned to state while Velin
was evaluating it for a binding (for example `vln-text="count = 5"`).
Bindings must be read-only. Make the change from an event handler
(`vln-on:click="count = 5"`) or from a state method.

## VLN011

**Internal state corruption.** A child scope was not found in its parent
when being removed. This is a Velin bug; please report it with a
reproduction.

## VLN012

**Two scope-creating directives on one element.** Directives that create a
child scope (`vln-loop`, `vln-if`, `vln-fragment`, `vln-use`) can't share
an element. Nest them: put one on a wrapper element.

## VLN013

**Same directive twice on one element.** Each directive and subcommand
pair (`vln-attr:title`, `vln-on:click`) can appear once per element.

## VLN014

**State written after its scope was torn down.** A handler (often `async`,
after an `await`) wrote to state whose element had been removed, or whose
root was unbound. Check that the scope still exists before writing, or
keep the data on a longer-lived parent state.

## VLN015

**Expression syntax error.** Velin's expression language is a subset of
JavaScript: literals, operators, member access, calls, object and array
literals, assignment, ternaries. No statements, no arrow functions, no
regex literals. The development message says which token was unexpected
and where.

## VLN016

**Expression can't be evaluated.** The expression parsed but can't run:
assigning to something that isn't a property (`1 = 2`, `fn() = 3`), or an
internal AST error.

## VLN017

**Your expression threw.** An expression raised an error while being
compiled, tracked, rendered, or evaluated. The error itself is logged
next to this code; the development message names the directive and the
expression.

## VLN018

**Identifier case mismatch.** An expression read a name that doesn't
exist, but its lowercase form does. HTML lowercases attribute names, so
`vln-loop:userItem="users"` binds the variable as `useritem`. Use
lowercase or kebab-case names in attributes.

## VLN019

**composeState() called wrong.** It needs an enclosing state and a plain
object whose values are `{ expr: '…' }` or `{ literal: … }`. This is a
plugin-author API; see [Creating Plugins](./plugins.md).

## VLN020

**Keyed vln-loop item has no key.** With `{ collection, key: 'id' }`,
every item must have its own `id` property.

## VLN021

**Keyed vln-loop has duplicate keys.** Two items share the same key value.
Keys must be unique within the collection.

## VLN022

**Retired.** This code warned that an unkeyed `vln-loop` had moved items
between rows, because edits to a moved item then didn't update its new
row. Rows now follow their item after a move, so the warning is gone and
the code is not reused. Key a loop (`{ collection: items, key: 'id' }`)
when rows must keep their DOM, focus or typed input across reorders. See
[vln-loop](./directives.md#vln-loop).

## VLN023

**getController() argument isn't a Velin state.** Pass the object returned
by `Velin.bind()`, or `this` inside a state method.

## VLN024

**getController() on a torn-down scope.** The `this` you passed came from
a handler that has already finished, or from an element that was removed.
Call `getController` while the handler is running, or hold the root
state instead.

## VLN025

**unbind() on a child state.** Child scopes (from `vln-loop`, `vln-if`,
`vln-fragment`, `composeState`) are owned by their parent and are torn
down with it. Call `Velin.unbind()` on the object `Velin.bind()` returned.

## VLN026

**Directive not registered.** `vln-<name>` was found in the DOM but no
plugin named `<name>` is registered. Load the bundle that provides it
(templates, router) before `Velin.bind()`, or check the spelling. The
development message lists what is registered.

## VLN027

**vln-template on the wrong element.** `vln-template` must be on a
`<template>` element.

## VLN028

**Template registered twice.** A second `<template vln-template="'id'">`
with the same id replaced the first. Last one wins; rename one of them if
that wasn't intended.

## VLN029

**Invalid vln-vars on a template.** On the declaring `<template>`,
`vln-vars` must be an array of names (`['a', 'b']`) or an object mapping
names to transformer functions.

## VLN030

**vln-fragment on a void element.** Elements like `<img>`, `<input>` and
`<br>` can't hold children. Use a container such as `<div>` or `<span>`.

## VLN031

**Template not registered.** No `<template vln-template="'id'">` with that
id was found. It must appear before the `vln-fragment` element in
document order and inside the same `Velin.bind()` root.

## VLN032

**Fragment children must be inlet templates.** Direct children of a
`vln-fragment` element must be `<template vln-inlet>` (or
`vln-inlet="'name'"`). Other children were dropped. See
[Templates & Fragments](./templates.md).

## VLN033

**vln-inlet in the wrong place.** `vln-inlet` must be on a `<template>`
that is a direct child of a `vln-fragment` element, and that template
can't carry other `vln-*` attributes (move them inside).

## VLN034

**Slot filled twice.** Two inlets target the same slot name (or both are
the default slot). Extras were dropped.

## VLN035

**vln-outlet outside a fragment.** `vln-outlet` only works inside a
template that was mounted with `vln-fragment`.

## VLN036

**Slot name isn't a string.** `vln-inlet` and `vln-outlet` names must
evaluate to a string; use quotes: `vln-inlet="'header'"`.
