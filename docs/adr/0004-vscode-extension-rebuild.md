# ADR 0004 — VS Code language-support extension: rebuild plan

Status: **Proposed** (2026-07-02)

## Context

`tooling/velin-language-support/` ships (or intends to ship) a VS Code
extension that provides syntax highlighting, IntelliSense, and schema-aware
completion for Velin's `vln-*` HTML directives. It has never worked in
practice — no user has successfully installed a working `.vsix`.

Investigation on 2026-07-02 uncovered a stack of independent defects
spanning build, packaging, grammar, activation, and LSP substance. Any
one of them is fatal; together they explain the silence. This ADR
enumerates them and lays out the sequence to fix them.

## Findings

### F1. The workspace does not build

`tooling/velin-language-support/package.json` root `build` script:

```
"build": "npm run build -w lsp-server && npm run build -w vscode-extension"
```

`shared/` is omitted. `build.sh` builds it correctly; the npm script does
not. `.github/workflows/release-extension.yml` uses the npm script, so CI
has never produced a functioning artifact.

### F2. The LSP server has type errors

Even after building `shared/`, `lsp-server` fails `tsc`:

```
src/server.ts(305,30): Property 'getJSDocCompletions' does not exist on
  type 'TypeScriptService'. Did you mean 'getCompletions'?
src/typescript-service.ts(33,34): Property 'getWorkspaceRoot' does not
  exist on type 'TypeScriptService'.
src/typescript-service.ts(69,34): Property 'getWorkspaceRoot' does not
  exist on type 'TypeScriptService'.
```

Two methods are called but never defined. No `dist/` has ever been
produced.

### F3. The LSP is unreachable from a packaged VSIX

`vscode-extension/src/extension.ts:14-16` resolves the server module at:

```ts
context.asAbsolutePath(path.join('..', 'lsp-server', 'dist', 'server.js'))
```

That path escapes the extension root. `.vscodeignore:15` then excludes
`../lsp-server/` from packaging. Even if F1/F2 were fixed, a `vsce
package` VSIX contains no server — the LSP client would fail to spawn.

### F4. The language contribution hijacks all `.html` files

`vscode-extension/package.json:32-38` declares a new language `html-velin`
claiming `.html`. This collides with VS Code's built-in `html`, and — in
practice — swaps out Emmet, formatter, and the HTML language service for
a barely-defined derivative language. Peer projects (Vetur, Volar,
Svelte, Astro, Alpine) all use TextMate **injection** into
`text.html.basic` / `text.html.derivative` for exactly this reason.

### F5. The TextMate grammar is broken and stale

`vscode-extension/syntaxes/html-velin.tmLanguage.json`:

- Directive list hardcodes `text|input|if|class|attr|on|loop|use|fragment`.
  `src/velin-*.js` uses **16** directives; missing: `watch, var, vars,
  table, evt, route, router`.
- `velin-expression` uses `"match": ".*"` with `"include":
  "source.js#expression"`. `#expression` is not a valid anchor in VS
  Code's JavaScript grammar — the include silently no-ops. Zero JS
  highlighting inside directive quotes.
- The `:subkey` in `vln-on:click` / `vln-attr:src` / `vln-loop:item` /
  `vln-var:foo` is not distinguished as its own scope.
- Schema-comment rule matches only `@velin-schema:`. The parser also
  accepts `@vln-type`, `@vln-schema`, `@velin-type`. Grammar and parser
  disagree.

### F6. No `activationEvents`

`package.json` declares none. Implicit activation via
`contributes.languages` only fires **after** the file is identified as
`html-velin`, and given the F4 collision that identification is fragile.
Combined with F3, `client.start()` may never run in production installs.

### F7. LSP substance problems

- `TypeScriptService.analyzeScopeAtLine` reads the document via
  `fs.readFileSync` instead of the LSP-synced `TextDocument`. Content is
  wrong while the user is editing.
- `DirectiveParser`'s regex `["']([^"']*?)["']` breaks the moment an
  expression contains a quote (`vln-text="'Hello, ' + name"`). Silently
  disables completion in `examples/test.html:37,104`.
- `SchemaParser.findSchemaContext` uses whitespace-indentation decrease
  as the scope terminator. HTML nesting has no such semantic — a schema
  comment at column 0 followed by a `<div>` at column 4 with children
  deeper never resolves correctly.
- Hand-rolled `tokenizeExpression` in `server.ts:419` misses template
  literals, regex, ternaries, spread. `typescript` is already a
  dependency; use `createScanner`.
- `getBasicExpressionCompletions()` returns hardcoded fake `user`,
  `count` items — leaks into any doc without a schema comment.
- Every config change calls `velin.restartServer`, killing/forking the
  whole server (`extension.ts:81-86`).
- Info toast on every activation.

### F8. No tests

The extension has never been exercised by an automated test. All three
layers are testable:

- **Shared parsers**: pure functions; vitest (already a root dep).
- **Grammar**: `vscode-textmate` + `vscode-oniguruma` tokenize sample
  strings and assert scope stacks. Standard practice.
- **LSP server**: in-process duplex-stream `vscode-languageserver` test
  client sends `initialize`/`didOpen`/`completion`, asserts responses.
  No VS Code binary required.
- **End-to-end**: `@vscode/test-electron` boots headless VS Code, opens
  `test.html`, requests completions via the API.

## Decision

Rebuild the extension in five phases. Phases 1-2 unblock installation.
Phase 3 fixes the substance. Phase 4 prevents regression. Phase 5 is
Marketplace polish.

### Phase 1 — Make it build and ship

1. Root `build` script includes `shared`:
   `npm run build -w shared && npm run build -w lsp-server && npm run build -w vscode-extension`.
2. Implement missing `TypeScriptService.getWorkspaceRoot(uri)` (walk up
   until `package.json`/`tsconfig.json`, fallback to first workspace
   folder). Delete or stub `getJSDocCompletions` — track its real
   implementation as follow-up.
3. Bundle the LSP into the extension via `esbuild`. Emit
   `vscode-extension/dist/extension.js` and
   `vscode-extension/dist/server.js`. Rewrite the server path to
   `context.asAbsolutePath('dist/server.js')`.
4. Remove the `../lsp-server/` reference from `.vscodeignore`.
5. Add `"activationEvents": ["onLanguage:html"]`.

Exit criteria: `npm run package:vscode` produces a `.vsix` whose
`Extract-VSIX` contains `dist/server.js`, and the extension activates
on any `.html` file.

### Phase 2 — Grammar via injection

6. Delete `contributes.languages`. `.html` stays the built-in `html`
   language.
7. Rewrite grammar as an injection:

   ```json
   "grammars": [{
     "scopeName": "html-velin.injection",
     "path": "./syntaxes/html-velin.injection.json",
     "injectTo": ["text.html.basic", "text.html.derivative"],
     "embeddedLanguages": {
       "meta.embedded.expression.velin": "javascript"
     }
   }]
   ```

8. Grammar structure:
   - Injection selector `L:meta.tag - meta.embedded`.
   - Attribute-name rule captures `vln-[a-z]+` as
     `entity.other.attribute-name.velin` and the optional `:subkey` as
     `entity.other.attribute-name.velin.modifier`.
   - Attribute-value rule `begin/end` on quote,
     `contentName: "meta.embedded.expression.velin"`, `patterns:
     [{ include: "source.js" }]`.
   - Schema-comment rule matches the parser's regex verbatim:
     `<!--\s*@(?:vln|velin)-(?:type|schema)(?::|\s+)`.
9. Single source of truth for the directive list. Add
   `shared/src/directives.json` (or generate from it) and consume from
   both the parser (`VELIN_DIRECTIVES`) and the grammar (via a
   build-time codegen step that stamps the alternation into
   `html-velin.injection.json`).

Exit criteria: opening `examples/test.html` in an installed VSIX shows
JS highlighting inside every `vln-*="..."`; regular HTML tooling
(Emmet, format-on-save, built-in HTML IntelliSense) is unaffected.

### Phase 3 — LSP substance

10. Replace `fs.readFileSync` in `analyzeScopeAtLine` with the
    LSP-synced `TextDocument` passed in from the caller.
11. Use `typescript`'s `createScanner` for expression tokenization.
    Delete the hand-rolled `tokenizeExpression`.
12. Adopt `vscode-html-languageservice` for HTML parsing. Find the
    attribute at the cursor by walking the DOM, not by
    `line.indexOf('=', ...)`. Handles multi-line attributes and
    escaped quotes.
13. Rewrite `SchemaParser.findSchemaContext` to walk the parsed DOM:
    a schema comment applies to the subtree of its immediate following
    sibling element. No indentation heuristic.
14. Handle config changes without a restart. Use
    `workspace/configuration` refresh.
15. Delete `getBasicExpressionCompletions`. If no schema is found,
    return no completions — the built-in JS grammar tokens already
    guide typing.
16. Delete the activation toast. Keep the status-bar item; drive its
    text off LSP state (`starting` / `ready` / `error`).

### Phase 4 — Tests

17. `shared/test/*.spec.ts` (vitest). Cover `DirectiveParser` and
    `SchemaParser` exhaustively: expressions containing quotes,
    `vln-on:click`, dynamic subkeys, all four schema-comment forms,
    malformed inputs.
18. `vscode-extension/test/grammar.spec.ts` — load the grammar with
    `vscode-textmate` + `vscode-oniguruma`, tokenize a corpus (at
    minimum `examples/test.html`), snapshot expected scope stacks.
19. `lsp-server/test/completion.spec.ts` — in-process duplex-stream
    LSP. Feed `UserState.ts` + `test.html`; assert completions at
    known offsets contain `user`, `user.name`, `user.profile.avatar`,
    method call kinds.
20. `vscode-extension/test/e2e.spec.ts` via `@vscode/test-electron` —
    one smoke test: open `test.html`, invoke completion at `user.`,
    assert `name/email/isActive/profile` are returned.
21. `.github/workflows/release-extension.yml` runs `npm test` before
    `npm run package:vscode`. Add a `pull_request:` trigger running
    tests only.

### Phase 5 — Ship-quality polish

22. Write `vscode-extension/README.md`: features, screenshots, install,
    schema-comment syntax (all four forms), snippet examples.
23. Add `icon`, `galleryBanner`, `pricing: "Free"` to `package.json`.
24. Hover provider: on hover of a `vln-*` attribute name show the
    directive doc (reuse `getDirectiveDocumentation`).
25. Go-to-definition on identifiers inside expressions → jump to
    their declaration in the schema `.ts` (`ts.Symbol` →
    `getDeclarations()` gives the location).
26. Diagnostics via `connection.sendDiagnostics`: unknown directive,
    unknown property on schema, unresolvable schema reference.
27. Snippets file for common patterns.

## Consequences

- The extension goes from "does not compile" to "shippable and
  Marketplace-quality" without changing framework runtime code.
- Users of the built-in `html` language retain Emmet, HTML
  IntelliSense, and formatters. Velin is additive, not replacive.
- Directive list becomes drift-proof: adding a directive to
  `directives.json` regenerates the grammar and the parser
  simultaneously.
- Tests gate every release. The kind of "we tagged and nothing
  installed" failure that produced this ADR cannot recur silently.
- `@vscode/test-electron` adds ~30s to CI. Acceptable — it runs only
  on tag pushes.

## Non-goals

- **`.vue`-style single-file components.** Velin's model is HTML with
  attributes, not a new file format.
- **Type-checking of expressions inside directives.** Completions are
  in scope; full inference/diagnostics on the entire expression AST
  is future work (candidate for a follow-up ADR).
- **Web extension host** support. The LSP uses `typescript`'s Node
  APIs and will not run in browser-based VS Code.
