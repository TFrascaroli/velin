# The 1.0 contract

What `@velinjs/all` 1.0 promises, what it does not, and what a version
number change means. Everything listed under "Frozen" keeps working,
unchanged, for the whole 1.x line.

## What a version bump means

Velin follows [Semantic Versioning](https://semver.org/).

- **Patch** (`1.0.x`): bug fixes only. If behaviour contradicted the
  documentation, the fix brings it in line with the documentation and is a
  patch even when it changes what a page did before.
- **Minor** (`1.x.0`): additions. New directives, new helpers, new error
  codes, new package subpaths, new expression syntax. Existing code keeps
  working. A minor may deprecate something; the deprecated thing then
  warns with a code and keeps working until the next major.
- **Major** (`2.0.0`): anything removed or changed in a way that breaks a
  page or a plugin written against these docs.

Bundle sizes are measured and quoted per release. They are information,
not a promise.

## Frozen

### Package and files

The npm package is `@velinjs/all`. Its subpaths are:

| Subpath | File | Contents |
|---|---|---|
| `.` or `./all` | `velin-all.min.js` | everything |
| `./common` | `velin-common.min.js` | core + standard directives |
| `./core` | `velin-core.min.js` | reactivity and plugin machinery, no directives |
| `./std` | `velin-standard.min.js` | the standard directives (needs core) |
| `./templates` | `velin-templates-and-fragments.min.js` | templates, fragments, slots (needs core) |
| `./router` | `velin-router.min.js` | `vln-router`, `vln-route` (needs core) |

Each has a `/dev` twin (`./dev`, `./common/dev`, …) that resolves to the
development build, `velin-<name>.dev.js`. Every bundle is an IIFE that
attaches to `window.Velin`, and every bundle has a `.d.ts` next to it.
The file names, the subpaths and the "load core first, never two
core-including bundles" rules in [bundles.md](./bundles.md) are frozen.

### Public JavaScript API

The members of `Velin` documented in the [API reference](./api-reference.md):

- `bind`, `unbind`, `getController`, `getSetter`
- `compile`, `evaluate`, `evaluateAst`, `processNode`
- `composeState`, `cleanupState`
- `plugins.registerPlugin`, `plugins.processPlugin`, `plugins.lookupPlugin`,
  `plugins.get`, `plugins.priorities`
- `trackers`

Their signatures and documented behaviour are frozen, as is the controller
returned by `getController` and its one method, `batch(fn)`. Anything whose name starts with `ø__`, including `Velin.ø__internal`
and any `ø__` key visible on a state, is internal and may change in a
patch.

### Reactivity semantics

State is a materialized object and the page follows it. The documented
rules are part of the contract:

- Writes to state update the DOM; writes inside `batch()` flush once.
- Dependencies are captured when a binding first runs. A write that
  replaces an object or array, mutates an array, or adds or deletes a key
  makes the bindings it wakes re-capture. A primitive write does not, so a
  branch guarded by a primitive must read what it depends on up front.
  (Decision records: [ADR 0003](./adr/0003-one-shot-dependency-capture.md),
  [ADR 0006](./adr/0006-recapture-on-structural-writes.md).)
- Getters are evaluated on read and are not cached.

### Plugin API

The plugin object (`name`, `priority`, `track`, `render`, `destroy`), the
fields of the arguments object passed to `track`, `render` and `destroy`,
the `PluginControl` return value (`pluginState`, `halt`, `scopedState`,
`plugins`), the `ChildContext` returned by `compose`, the three priority
levels (`LATE`, `OVERRIDABLE`, `STOPPER`) and the built-in trackers, all as
listed in [plugins.md](./plugins.md). A plugin written against that page
keeps working for all of 1.x.

### Directives and expressions

The directives and their documented syntax, including subkeys
(`vln-on:click`, `vln-attr:href`) and the `vln-vars` object form:

| Bundle | Directives |
|---|---|
| standard | `vln-text`, `vln-input`, `vln-if`, `vln-loop`, `vln-use:alias`, `vln-watch`, `vln-on:event`, `vln-attr:name`, `vln-class` |
| templates | `vln-template`, `vln-fragment`, `vln-vars`, `vln-inlet`, `vln-outlet` |
| router | `vln-router`, `vln-route` |

Directive values are JavaScript expressions. The accepted subset is
frozen: identifiers and member access (`a.b`, `a[i]`), calls, string,
number, boolean, `null` and `undefined` literals, array and object literals
including spread, the operators `+ - * / %`, `< <= > >= == != === !==`,
`&& || !`, unary `-` and `+`, the ternary, plain assignment (`a = b`) and
the comma sequence. Short-circuit operators evaluate both sides for
dependency capture. New syntax may arrive in a minor. Nothing listed here
is removed before 2.0.

### Error codes

Every error and warning carries a code, `VLN001` upwards. A code keeps its
meaning for good. A retired code is never reused. New codes arrive in
minors. The catalog is [errors.md](./errors.md). The message *text* that
development builds print is not frozen; the code is.

### TypeScript definitions

The `.d.ts` shipped for each bundle describes the frozen surface above.
Types for `ø__` internals may change at any time.

## Not covered

These ship with the package but are outside the contract. They may change
in a minor, and are not a reason for a major.

- **Devtools** (`@velinjs/all/devtools`): alpha. The drawer, its surfaces,
  the signals it emits, the hook it attaches to and its API.
- **Development builds**: the wording of messages and warnings, what the
  development build logs, and which misuse it reports. The development
  build runs the same Velin as the production build; only its reporting
  differs.
- **Internals**: anything named with an `ø__` prefix, the shape of
  compiled expression ASTs beyond what `evaluateAst` accepts, source file
  layout under `src/`, and the build and site scripts.
- **The playground and the website**: examples can change or disappear.
- **The VS Code extension**: versioned and released separately.

## Environment

Velin targets current versions of evergreen browsers. It requires `Proxy`
and runs under a Content Security Policy that forbids `eval` and
`new Function`. There is no transpiled or polyfilled build.
