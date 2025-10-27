# Velin

**Velin** is a lightweight, runtime-only frontend reactivity engine designed for maximum flexibility and zero compilation. It enables expressive, declarative UIs directly in HTML using custom `vln-*` directives, and integrates seamlessly with vanilla JavaScript.

> ⚠️ Alpha software — experimental and subject to change.

## Why Velin?

- ✅ **Runtime-only** — no build step, no compilation, no bundler required
- ✅ **Lightweight** — core + standard plugins under 5KB gzipped
- ✅ **Flat learning curve** — if you know HTML and JavaScript, you know Velin
- ✅ **Fully reactive** — automatic dependency tracking and updates
- ✅ **Plugin-friendly** — extensible architecture for custom directives
- ✅ **Server-first friendly** — perfect for progressive enhancement of server-rendered pages

## Perfect For

- 🎯 Forms and CRUD interfaces
- 🎯 Adding reactivity to server-rendered apps (Django, Rails, Laravel, Express)
- 🎯 Internal tools and admin panels
- 🎯 Progressive enhancement of static HTML
- 🎯 Lightweight SPAs with mostly static content
- 🎯 Developers who want modern reactivity without modern complexity

## Quick Start

### Installation

Just include the script in your HTML:

```html
<script src="https://unpkg.com/velin/dist/velin-all.min.js"></script>
```

Or install via npm:

```bash
npm install velin
```

### Hello World

```html
<!DOCTYPE html>
<html>
<head>
  <script src="velin.js"></script>
</head>
<body>
  <input vln-input="vln.name" placeholder="Enter your name" />
  <h1 vln-text="'Hello ' + vln.name"></h1>

  <script>
    const vln = Velin.bind(document.body, {
      name: "World"
    });
  </script>
</body>
</html>
```

That's it! No build step, no JSX, no configuration.

## Core Concepts

### Reactive State

```javascript
const vln = Velin.bind(document.body, {
  count: 0,
  message: "Hello",
  user: {
    name: "Alice",
    email: "alice@example.com"
  }
});

// Changes automatically update the DOM
vln.count++;
vln.user.name = "Bob";
```

### Standard Directives

#### `vln-text` — Set text content

```html
<span vln-text="vln.username"></span>
<h1 vln-text="'Hello ' + vln.name"></h1>
```

#### `vln-input` — Two-way binding

```html
<input vln-input="vln.email" type="email" />
<input vln-input="vln.agreed" type="checkbox" />
<select vln-input="vln.country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
```

#### `vln-if` — Conditional visibility

```html
<div vln-if="vln.isLoggedIn">
  Welcome back!
</div>
<div vln-if="!vln.isLoggedIn">
  Please log in.
</div>
```

#### `vln-loop` — Loop over arrays

```html
<ul>
  <li vln-loop:item="vln.items" vln-text="vln.item.name"></li>
</ul>
```

#### `vln-on:event` — Event handlers

```html
<button vln-on:click="vln.count++">
  Clicked <span vln-text="vln.count"></span> times
</button>

<form vln-on:submit="vln.handleSubmit()">
  <input vln-input="vln.email" />
  <button type="submit">Submit</button>
</form>
```

#### `vln-attr:name` — Set attributes

```html
<a vln-attr:href="'mailto:' + vln.email" vln-text="vln.email"></a>
<img vln-attr:src="vln.imageUrl" vln-attr:alt="vln.imageAlt" />
<input vln-attr:disabled="!vln.isValid" />
```

#### `vln-class` — Dynamic classes

```html
<!-- String -->
<div vln-class="vln.theme"></div>

<!-- Object -->
<div vln-class="{ active: vln.isActive, disabled: !vln.isEnabled }"></div>

<!-- Expression -->
<div vln-class="vln.isActive ? 'on' : 'off'"></div>
```

## Real-World Example

### Interactive Form with Validation

```html
<!DOCTYPE html>
<html>
<head>
  <script src="velin.js"></script>
  <style>
    .error { color: red; }
    .success { color: green; }
  </style>
</head>
<body>
  <form vln-on:submit="vln.handleSubmit()">
    <div>
      <label>Email:</label>
      <input vln-input="vln.email" type="email" />
      <div vln-if="!vln.isEmailValid" class="error">
        Please enter a valid email
      </div>
    </div>

    <div>
      <label>Password:</label>
      <input vln-input="vln.password" type="password" />
      <div vln-if="!vln.isPasswordValid" class="error">
        Password must be at least 8 characters
      </div>
    </div>

    <button type="submit" vln-attr:disabled="!vln.canSubmit">
      <span vln-if="!vln.loading">Sign Up</span>
      <span vln-if="vln.loading">Signing up...</span>
    </button>

    <div vln-if="vln.success" class="success">
      Account created successfully!
    </div>
  </form>

  <script>
    const vln = Velin.bind(document.querySelector('form'), {
      email: '',
      password: '',
      loading: false,
      success: false,

      get isEmailValid() {
        return !this.email || this.email.includes('@');
      },

      get isPasswordValid() {
        return !this.password || this.password.length >= 8;
      },

      get canSubmit() {
        return this.isEmailValid &&
               this.isPasswordValid &&
               this.email &&
               this.password &&
               !this.loading;
      },

      handleSubmit: async () => {
        vln.loading = true;
        vln.success = false;

        try {
          const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: vln.email,
              password: vln.password
            })
          });

          if (response.ok) {
            vln.success = true;
            vln.email = '';
            vln.password = '';
          }
        } catch (error) {
          console.error('Signup failed:', error);
        } finally {
          vln.loading = false;
        }
      }
    });
  </script>
</body>
</html>
```

## Modular Architecture

Velin is split into modules you can mix and match:

### `velin-core.js` (~3KB)
Core reactivity engine, plugin system, and state management.

```html
<script src="velin-core.js"></script>
```

### `velin-std.js` (~2KB)
Standard directives: `vln-text`, `vln-if`, `vln-loop`, `vln-input`, `vln-on`, `vln-attr`, `vln-class`

```html
<script src="velin-core.js"></script>
<script src="velin-std.js"></script>
```

### `velin-templates-and-fragments.js` (~1KB)
Optional template/fragment system for reusable components.

```html
<script src="velin-core.js"></script>
<script src="velin-std.js"></script>
<script src="velin-templates-and-fragments.js"></script>
```

### `velin-all.js` (~6KB)
Everything bundled together.

```html
<script src="velin-all.js"></script>
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [API Reference](./docs/api-reference.md)
- [Directives Guide](./docs/directives.md)
- [Creating Plugins](./docs/plugins.md)
- [Templates & Fragments](./docs/templates.md)
- [Examples & Patterns](./docs/examples.md)

## Benchmarks

The `benchmarks/` folder contains real-world implementations comparing:
- React
- Angular
- Alpine.js
- Velin

To run benchmarks:

```bash
npm run prepare:benchmarks
npm run serve:benchmarks
```

## Testing

Velin uses [Vitest](https://vitest.dev/) for unit testing and JSDOM for DOM simulation.

```bash
npm test
```

## Building

```bash
npm run build
```

This generates:
- `dist/build/velin-core.min.js`
- `dist/build/velin-std.min.js`
- `dist/build/velin-templates-and-fragments.min.js`
- `dist/build/velin-all.min.js`

## Browser Support

Velin uses modern JavaScript features:
- Proxy
- WeakMap
- Set/Map
- Template literals
- Arrow functions

**Supported browsers:**
- Chrome 49+
- Firefox 18+
- Safari 10+
- Edge 12+

No IE11 support (by design).

## Philosophy

Velin is built on these principles:

1. **HTML-first** — Your markup should be readable and declarative
2. **JavaScript-native** — No new syntax to learn, just JavaScript expressions
3. **Progressive enhancement** — Works with server-rendered HTML
4. **Zero magic** — Explicit behavior, no hidden compilation or transformations
5. **Pay for what you use** — Modular architecture means small bundles

## Comparison

| Feature | jQuery | Alpine.js | Velin | Vue | React |
|---------|--------|-----------|-------|-----|-------|
| File size (min+gzip) | 30KB | 15KB | ~6KB | 50KB | 140KB |
| Build step required | No | No | No | Optional | Yes |
| Reactivity | Manual | Reactive | Reactive | Reactive | Reactive |
| Learning curve | Flat | Gentle | Flat | Moderate | Steep |
| Template syntax | None | HTML attrs | HTML attrs | HTML/JSX | JSX |
| Best for | DOM manipulation | Simple UIs | Forms/CRUD | SPAs | Complex SPAs |

## Contributing

This is alpha software and primarily a personal experiment. Feel free to open issues if something is **really important**, but please don't send pull requests at this time.

## License

[Apache 2.0](./LICENSE)

© 2025 Timoteo Frascaroli ([@tfrascaroli](https://github.com/tfrascaroli))

## Acknowledgments

Inspired by Alpine.js, Vue.js, and the simplicity of vanilla JavaScript.
