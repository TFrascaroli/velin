# Velin

A lightweight reactive JavaScript library for building interactive UIs with plain HTML and JavaScript. No build step, no compilation, no new syntax to learn.

> ⚠️ Alpha software — experimental and subject to change.

## What is Velin?

Velin adds reactivity to your HTML using custom `vln-*` attributes. Changes to your JavaScript state automatically update the DOM through fine-grained dependency tracking.

```html
<input vln-input="name" placeholder="Enter your name" />
<h1 vln-text="'Hello ' + name"></h1>

<script src="velin.js"></script>
<script>
  const state = Velin.bind(document.body, {
    name: "World"
  });
</script>
```

That's it. No JSX, no virtual DOM, no build tools. Your state is a plain JavaScript object with Proxy-based reactivity.

## Installation

CDN:
```html
<script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
```

NPM:
```bash
npm install velin
```

## Core Features

### Scoped Reactive State

Each call to `Velin.bind()` creates an isolated reactive scope. You can have multiple independent reactive regions on the same page.

```javascript
// Widget 1
const widget1 = Velin.bind(document.querySelector('#widget1'), {
  count: 0
});

// Widget 2 - completely independent
const widget2 = Velin.bind(document.querySelector('#widget2'), {
  items: []
});
```

### Fine-Grained Dependency Tracking

Velin tracks exactly which properties each directive depends on. Updates only trigger for directives that actually use the changed property.

```html
<span vln-text="user.name"></span>  <!-- Only updates when user.name changes -->
<span vln-text="user.email"></span> <!-- Only updates when user.email changes -->
```

### Direct Property Access

The state object returned by `Velin.bind()` is a reactive proxy. Modify it directly:

```javascript
const state = Velin.bind(element, { count: 0 });

state.count++;                    // Updates DOM automatically
state.user = { name: 'Alice' };   // Nested objects are reactive too
```

## Directives

### `vln-text` — Set text content

```html
<span vln-text="username"></span>
<h1 vln-text="'Hello ' + name"></h1>
```

### `vln-input` — Two-way binding

Supports text inputs, checkboxes, radios, selects, and contenteditable elements.

```html
<input vln-input="email" type="email" />
<input vln-input="agreed" type="checkbox" />
<select vln-input="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
```

### `vln-if` — Conditional visibility

Toggles `display: none` based on expression truthiness.

```html
<div vln-if="isLoggedIn">Welcome back!</div>
<div vln-if="!isLoggedIn">Please log in.</div>
```

### `vln-loop:varname` — Render arrays

Repeats the element for each item in an array. The variable name after the colon is scoped to the element and its children. Inside loops, you can access the special `$index` variable (0-based).

```html
<ul>
  <li vln-loop:item="items">
    <span vln-text="($index + 1) + '. ' + item.name"></span>
    <button vln-on:click="removeItem(item)">Remove</button>
  </li>
</ul>
```

### `vln-on:event` — Event handlers

Executes JavaScript expressions on events.

```html
<button vln-on:click="count++">
  Clicked <span vln-text="count"></span> times
</button>

<form vln-on:submit="handleSubmit()">
  <input vln-input="email" />
  <button type="submit">Submit</button>
</form>
```

### `vln-attr:name` — Set attributes

```html
<a vln-attr:href="'mailto:' + email"></a>
<img vln-attr:src="imageUrl" vln-attr:alt="imageAlt" />
<button vln-attr:disabled="!isValid">Submit</button>
```

### `vln-class` — Dynamic classes

Accepts strings, objects, or expressions.

```html
<!-- String -->
<div vln-class="theme"></div>

<!-- Object (keys with truthy values become classes) -->
<div vln-class="{ active: isActive, disabled: !isEnabled }"></div>

<!-- Expression -->
<div vln-class="isActive ? 'on' : 'off'"></div>

<!-- Space-separated strings work -->
<div vln-class="'btn ' + (isPrimary ? 'btn-primary' : 'btn-secondary')"></div>
```

## How It Works

### 1. Reactive State

When you call `Velin.bind()`, your state object is wrapped in a Proxy that intercepts property access and modifications. The proxy recursively wraps nested objects and arrays.

### 2. Dependency Tracking

When a directive evaluates an expression like `"user.name"`, Velin records that this directive depends on the `user.name` property.

### 3. Updates

When you modify `state.user.name = "Bob"`, Velin:
1. Detects the change via the Proxy setter
2. Looks up all directives that depend on `user.name`
3. Re-evaluates only those directives

This is fine-grained reactivity - only affected parts of the DOM update.

### 4. Expression Evaluation

Velin uses a custom JavaScript parser that converts expressions into an AST (Abstract Syntax Tree) and evaluates them safely. This allows inline expressions without `eval()` or `Function()`, maintaining Content Security Policy compliance.

## Complete Example

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
  <form vln-on:submit="handleSubmit()">
    <div>
      <label>Email:</label>
      <input vln-input="email" type="email" />
      <div vln-if="email && !isEmailValid" class="error">
        Please enter a valid email
      </div>
    </div>

    <div>
      <label>Password:</label>
      <input vln-input="password" type="password" />
      <div vln-if="password && !isPasswordValid" class="error">
        Password must be at least 8 characters
      </div>
    </div>

    <button type="submit" vln-attr:disabled="!canSubmit">
      <span vln-if="!loading">Sign Up</span>
      <span vln-if="loading">Signing up...</span>
    </button>

    <div vln-if="success" class="success">
      Account created successfully!
    </div>
  </form>

  <script>
    const state = Velin.bind(document.querySelector('form'), {
      email: '',
      password: '',
      loading: false,
      success: false,

      get isEmailValid() {
        return this.email.includes('@');
      },

      get isPasswordValid() {
        return this.password.length >= 8;
      },

      get canSubmit() {
        return this.isEmailValid &&
               this.isPasswordValid &&
               this.email &&
               this.password &&
               !this.loading;
      },

      async handleSubmit() {
        this.loading = true;
        this.success = false;

        try {
          const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: this.email,
              password: this.password
            })
          });

          if (response.ok) {
            this.success = true;
            this.email = '';
            this.password = '';
          }
        } catch (error) {
          console.error('Signup failed:', error);
        } finally {
          this.loading = false;
        }
      }
    });
  </script>
</body>
</html>
```

## Modular Build

Velin is split into modules:

### `velin-core.js` (~3KB gzipped)
Core reactivity engine, plugin system, expression evaluator, and state management.

### `velin-std.js` (~2KB gzipped)
Standard directives: `text`, `if`, `loop`, `input`, `on`, `attr`, `class`

### `velin-templates-and-fragments.js` (~1KB gzipped)
Optional directives for templates and fragments.

### `velin-all.js` (~6KB gzipped)
Everything bundled together. This is what most users want.

```html
<!-- Use individual modules -->
<script src="velin-core.js"></script>
<script src="velin-std.js"></script>

<!-- Or use the complete bundle -->
<script src="velin-all.js"></script>
```

## Advanced Usage

### Computed Properties

Use getters for derived state:

```javascript
const state = Velin.bind(element, {
  firstName: 'Alice',
  lastName: 'Smith',

  get fullName() {
    return this.firstName + ' ' + this.lastName;
  }
});

// fullName automatically updates when firstName or lastName change
```

### Methods

Define methods on your state object:

```javascript
const state = Velin.bind(element, {
  items: [],

  addItem(name) {
    this.items.push({ name, id: Date.now() });
  },

  removeItem(id) {
    this.items = this.items.filter(item => item.id !== id);
  }
});
```

Then call them from directives:

```html
<button vln-on:click="addItem('New Item')">Add</button>
<button vln-loop:item="items" vln-on:click="removeItem(item.id)">
  Remove <span vln-text="item.name"></span>
</button>
```

### Multiple Scopes

You can bind multiple independent scopes on the same page:

```javascript
// Header widget
Velin.bind(document.querySelector('#header'), {
  user: { name: 'Alice' },
  isLoggedIn: true
});

// Search widget
Velin.bind(document.querySelector('#search'), {
  query: '',
  results: []
});

// Cart widget
Velin.bind(document.querySelector('#cart'), {
  items: [],
  total: 0
});
```

Each scope is completely isolated with its own state and reactivity.

## Plugin System

Velin's plugin system lets you create custom directives. See [docs/plugins.md](./docs/plugins.md) for details.

Example custom directive:

```javascript
Velin.plugins.registerPlugin({
  name: "focus",
  render: ({ node, tracked }) => {
    if (tracked && node instanceof HTMLElement) {
      node.focus();
    }
  },
  track: Velin.trackers.expressionTracker
});
```

Usage:

```html
<input vln-focus="shouldFocus" />
```

## Documentation

- [Getting Started](./docs/getting-started.md) - Installation and basic usage
- [Directives Guide](./docs/directives.md) - Complete directive reference
- [API Reference](./docs/api-reference.md) - JavaScript API documentation
- [Creating Plugins](./docs/plugins.md) - Build custom directives
- [Templates & Fragments](./docs/templates.md) - Advanced template features
- [Examples & Patterns](./docs/examples.md) - Real-world examples

## Performance

Velin is fast:
- **Small bundle**: 6KB gzipped (2.5× smaller than Alpine.js)
- **Fast initialization**: Scoped binding means only your component is processed, not the entire document
- **Efficient updates**: Fine-grained dependency tracking means minimal re-rendering

See [benchmarks/init-perf/](./benchmarks/init-perf/) for detailed performance comparisons.

## Browser Support

Velin requires modern JavaScript features:
- Proxy
- WeakMap / Map / Set
- Template literals
- Arrow functions

**Supported browsers:**
- Chrome 49+
- Firefox 18+
- Safari 10+
- Edge 12+

No Internet Explorer support.

## Development

### Testing

```bash
npm test
```

Uses Vitest for unit tests with JSDOM for DOM simulation.

### Building

```bash
npm run build
```

Generates minified builds in `dist/build/`:
- `velin-core.min.js`
- `velin-std.min.js`
- `velin-templates-and-fragments.min.js`
- `velin-all.min.js`

### Benchmarks

```bash
npm run prepare:benchmarks
npm run serve:benchmarks
```

Compare Velin with React, Angular, and Alpine.js.

## Contributing

This is alpha software and primarily a personal experiment. Feel free to open issues for bugs or important missing features, but please don't send pull requests at this time.

## License

[Apache 2.0](./LICENSE)

© 2025 Timoteo Frascaroli ([@tfrascaroli](https://github.com/tfrascaroli))
