# @velin/lsp-server

Language Server Protocol implementation for
[Velin](https://github.com/TFrascaroli/velin) HTML directives.

Powers IntelliSense, F12, semantic tokens, and directive-placement
diagnostics for `vln-*` attributes.

This is the same server that ships bundled inside the official VS Code
extension. It is published standalone so you can wire it into any editor
with an LSP client — neovim, Helix, Zed, Sublime, Kate, etc.

## Install

```sh
npm install -g @velin/lsp-server
```

That places a `velin-lsp` binary on your `PATH`. The server speaks LSP
over stdio.

## Schema comments

The server can't guess what your state looks like — you tell it with a
comment above the region:

```html
<!-- @velin-schema: ./state.ts#AppState -->
<div id="app">
  <span vln-text="user.name"></span>
</div>
```

or inline:

```html
<!-- @velin-schema: script -->
<div id="app">…</div>
<script>
  const state = { user: { name: 'Alice' } };
  Velin.bind(document.getElementById('app'), state);
</script>
```

or point at a linked script by id — the server reads the referenced file
and runs the same `Velin.bind()` inference against it:

```html
<!-- @velin-schema: script#state -->
<div id="app">…</div>
<script id="state" src="./state.js"></script>
```

Bare `script` picks the nearest `<script>` tag; `script#id` selects one
explicitly, which is required when several script tags coexist.

If the runtime `<script src="">` points at a bundled asset that the
server can't usefully read (a minified vendor bundle, a rollup output),
name the compile-time source directly:

```html
<!-- @velin-schema: ./src/app.ts -->
<script src="./dist/bundle.min.js"></script>
```

The comment path wins; the HTML `src` is left alone.

Global bare-name references (`@velin-schema: AppState`) trigger a
project-wide type search.

## Editor wiring

### Neovim (nvim-lspconfig)

```lua
local configs = require('lspconfig.configs')
local lspconfig = require('lspconfig')

if not configs.velin then
  configs.velin = {
    default_config = {
      cmd = { 'velin-lsp', '--stdio' },
      filetypes = { 'html' },
      root_dir = lspconfig.util.root_pattern('package.json', '.git'),
      settings = {},
    },
  }
end

lspconfig.velin.setup {}
```

Semantic tokens are on by default in modern neovim; if you want the
Velin colours, make sure your colorscheme maps the LSP token types
`method`, `property`, `parameter`, and `variable`.

### Helix (`~/.config/helix/languages.toml`)

```toml
[language-server.velin]
command = "velin-lsp"
args = ["--stdio"]

[[language]]
name = "html"
language-servers = ["velin", "vscode-html-language-server"]
```

Listing Velin alongside the built-in HTML server gives you both plain
HTML support and Velin-aware completions inside `vln-*` attributes.

### Zed

Register it in your `settings.json`:

```json
{
  "lsp": {
    "velin": {
      "binary": { "path": "velin-lsp", "arguments": ["--stdio"] }
    }
  },
  "languages": {
    "HTML": { "language_servers": ["velin", "..."] }
  }
}
```

## What the server provides

- `textDocument/completion` — schema-aware member completion inside any
  `vln-*="..."` expression, plus directive-name completion after typing
  `vln-`.
- `textDocument/definition` — F12 walks through property access, call
  return types, and index access.
- `textDocument/semanticTokens/full` — identifiers coloured by role
  (property vs method vs loop-var).
- `textDocument/publishDiagnostics` — flags misplaced directives
  (`vln-vars` outside `<template>`, `vln-var:*` without `vln-fragment`).

## Building from source

```sh
git clone https://github.com/TFrascaroli/velin
cd velin/tooling/velin-language-support
npm install
npm run build
node lsp-server/dist/server.js --stdio
```

## License

MIT
