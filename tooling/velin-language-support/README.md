# Velin Language Support

Language support for Velin HTML directives in VS Code.

## Features

- **Syntax highlighting** for Velin directives (`vln-text`, `vln-input`, etc.)
- **Auto-completion** for Velin directive names
- **Schema-aware IntelliSense** using `@vln-type` or `@velin-schema` comments
- **TypeScript integration** for type-safe completions
- **JSDoc support** for JavaScript projects
- **JSON Schema support** for configuration-driven completions

## Schema Comments

Add schema comments to your HTML for completions:

### TypeScript

```html
<!-- @vln-type {UserStateInterface} -->
<div class="user-profile">
  <h1 vln-text="user."></h1> <!-- Completions: name, email, isActive -->
  <button vln-on:click="updateUser()">Update</button>
</div>
```

```typescript
// types/UserState.ts
export interface UserStateInterface {
  user: {
    name: string;
    email: string;
    isActive: boolean;
  };
  updateUser(): void;
}
```

### JavaScript with JSDoc

```html
<!-- @vln-type {UserSchema} -->
<div class="user-profile">
  <h1 vln-text="user.name"></h1>
  <span vln-text="user.email"></span>
</div>
```

```javascript
// state/userState.js
/**
 * @typedef {Object} UserSchema
 * @property {Object} user
 * @property {string} user.name
 * @property {string} user.email
 * @property {boolean} user.isActive
 * @property {function(): void} updateUser
 */

export const userState = {
  user: { name: '', email: '', isActive: false },
  updateUser() { /* implementation */ }
};
```

### JSON Schema

```html
<!-- @velin-schema: ./schemas/user.schema.json -->
<div class="user-profile">
  <h1 vln-text="user.name"></h1>
</div>
```

```json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "object", 
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      }
    }
  }
}
```

### Inline Schema

```html
<!-- @velin-schema: { user: { name: string, email: string }, count: number } -->
<div class="user-profile">
  <h1 vln-text="user.name"></h1>
  <span vln-text="count"></span>
</div>
```

## Installation

### From Source

1. Clone the repository
2. Navigate to `tooling/velin-language-support/`
3. Run `npm install`
4. Run `npm run build`
5. Run `npm run package:vscode`
6. Install the generated `.vsix` file in VS Code

### Development

1. Open `tooling/velin-language-support/vscode-extension/` in VS Code
2. Press `F5` to start a new Extension Development Host
3. Open an HTML file with Velin directives to test

## Configuration

```json
{
  "velin.enable": true,
  "velin.trace.server": "off" // "off" | "messages" | "verbose"
}
```

## Commands

- `Velin: Restart Language Server` - Restart the language server

## Architecture

This extension uses the Language Server Protocol (LSP) architecture:

- **LSP Server** (`lsp-server/`): Core language support, IDE-agnostic
- **VS Code Extension** (`vscode-extension/`): VS Code-specific client
- **Shared** (`shared/`): Common types and utilities

This allows other editors (Neovim, Sublime Text, etc.) to implement their own clients while reusing the core language server.

## Other Editor Support

### Neovim

The LSP server can be used with Neovim's built-in LSP client:

```lua
require('lspconfig').velin.setup{
  cmd = {'node', '/path/to/lsp-server/dist/server.js', '--stdio'},
  filetypes = {'html'},
  root_dir = require('lspconfig').util.root_pattern('package.json', 'tsconfig.json', '.git'),
}
```

### Sublime Text

Use the LSP package for Sublime Text with this configuration:

```json
{
  "clients": {
    "velin": {
      "enabled": true,
      "command": ["node", "/path/to/lsp-server/dist/server.js", "--stdio"],
      "selector": "text.html"
    }
  }
}
```

### Emacs

With `lsp-mode`:

```elisp
(add-to-list 'lsp-language-id-configuration '(html-mode . "html"))
(lsp-register-client
 (make-lsp-client :new-connection (lsp-stdio-connection '("node" "/path/to/lsp-server/dist/server.js"))
                  :major-modes '(html-mode)
                  :server-id 'velin-ls))
```

## License

MIT