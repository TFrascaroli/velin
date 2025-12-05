# Velin

**A lightweight reactive library for building interactive UIs with clean architecture.**

Velin brings fine-grained reactivity to plain HTML and JavaScript. No build step, no JSX, no virtual DOM. Your state lives in JavaScript where you can test and maintain it, while your views stay declarative in HTML.

```html
<input vln-input="name" placeholder="Enter your name" />
<h1 vln-text="'Hello ' + name"></h1>

<script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
<script>
  const state = Velin.bind(document.body, {
    name: "World"
  });
</script>
```

## Why Velin?

### Two Approaches to Reactivity

**Inline state** - Some reactive libraries embed state directly in HTML for maximum convenience (in this example Alpine):

```html
<div x-data="{ items: [], count: 0 }">
  <div x-data="{ open: false }">
    <!-- State and behavior defined inline -->
  </div>
</div>
```

This is, honestly, good enough for quick prototypes and small interactions. However, as applications grow, you may want:
- Centralized state that's easy to find and debug
- Unit tests for your business logic
- IDE support (autocomplete, refactoring, type checking)
- Separation between your data model and presentation

**Separate state** - Velin takes a different (yet widespread) approach: your model lives in JavaScript, your view lives in HTML.

### Model-View Separation

Your model lives in JavaScript. Your view lives in HTML. Changes to the model automatically update the view through fine-grained reactive dependency tracking. This is nothing new, conceptually, but Velin's approach is simpler, more understandable, yet powerful enough to scale to the size of whole SPAs.

```javascript
// state/cart.js - Your model, testable and maintainable
export const cart = Velin.bind(document.querySelector('#cart'), {
  products: [],        // From your API/database
  quantities: new Map(), // View-specific state

  addToCart(productId, qty = 1) {
    const current = this.quantities.get(productId) || 0;
    this.quantities.set(productId, current + qty);
  },

  removeFromCart(productId) {
    this.quantities.delete(productId);
  },

  get total() {
    return Array.from(this.quantities).reduce((sum, [id, qty]) => {
      const product = this.products.find(p => p.id === id);
      return sum + (product?.price || 0) * qty;
    }, 0);
  },

  get itemCount() {
    return Array.from(this.quantities.values())
      .reduce((sum, qty) => sum + qty, 0);
  }
});

// Now you can test it
import { cart } from './state/cart.js';
cart.addToCart('product-123', 2);
assert(cart.itemCount === 2);
```

```html
<!-- Your view - clean, declarative, maintainable -->
<div id="cart">
  <h2>Shopping Cart (<span vln-text="itemCount"></span>)</h2>

  <div vln-loop:product="products" class="product">
    <h3 vln-text="product.name"></h3>
    <p vln-text="'$' + product.price"></p>
    <button vln-on:click="addToCart(product.id)">Add to Cart</button>
  </div>

  <div class="total">
    Total: $<span vln-text="total.toFixed(2)"></span>
  </div>
</div>
```

### Why This Architecture?

This separation gives you:

1. **Testable**: Unit test your state logic without touching the DOM
2. **Debuggable**: State lives in one place, easy to inspect and understand
3. **Maintainable**: Your IDE can refactor JavaScript properly (rename symbols, find references, etc.)
4. **Scalable**: Import/export state modules as your app grows
5. **IDE-Friendly**: Full autocomplete, type checking, and inline documentation

### Still Lightweight

No heavy framework required:
- ✅ Single script tag - no build tools needed
- ✅ Plain JavaScript objects - no special component syntax
- ✅ Standard HTML - no JSX or template compilers
- ✅ 6KB gzipped - smaller than most frameworks

Write JavaScript modules when you want them, or keep it simple with inline scripts. Velin works both ways.

## Installation

**CDN** (for quick prototyping) (release date TBD):
```html
<script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
```

**NPM** (for real projects) (release date TBD):
```bash
npm install velin
```

Then in your JavaScript:
```javascript
import Velin from 'velin';
```

## Core Concepts

### Fine-Grained Reactivity

Velin tracks exactly which properties each directive depends on. Updates only affect the directives that actually use the changed property.

```html
<span vln-text="user.name"></span>   <!-- Only updates when user.name changes -->
<span vln-text="user.email"></span>  <!-- Only updates when user.email changes -->
<span vln-text="user.age"></span>    <!-- Only updates when user.age changes -->
```

```javascript
state.user.name = 'Bob';  // Only the first span updates
```

This is fine-grained reactivity - Velin knows exactly what needs to update and only updates those specific DOM elements.

### Computed Properties

Use native JavaScript getters for derived state:

```javascript
const state = Velin.bind(element, {
  firstName: 'Alice',
  lastName: 'Smith',

  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
});

// fullName automatically updates when firstName or lastName change
```

Computed properties participate in the dependency tracking system - Velin knows exactly which properties they depend on.

### Scoped State

Each `Velin.bind()` call creates an isolated reactive scope. Build multi-widget pages where each widget manages its own state:

```javascript
// Header - user authentication state
const header = Velin.bind(document.querySelector('#header'), {
  user: null,
  isLoggedIn: false,

  async login(email, password) {
    const user = await api.login(email, password);
    this.user = user;
    this.isLoggedIn = true;
  }
});

// Search - search functionality
const search = Velin.bind(document.querySelector('#search'), {
  query: '',
  results: [],

  async search() {
    this.results = await api.search(this.query);
  }
});

// Cart - shopping cart state
const cart = Velin.bind(document.querySelector('#cart'), {
  items: [],

  addItem(product) {
    this.items.push(product);
  }
});
```

Each scope is completely independent. No global store, no prop drilling, no context providers.

## Directives Reference

### `vln-text` - Set text content

```html
<span vln-text="username"></span>
<h1 vln-text="'Hello ' + name"></h1>
<p vln-text="count + ' items'"></p>
```

### `vln-input` - Two-way binding

Supports text inputs, textareas, checkboxes, radio buttons, and select elements:

```html
<input vln-input="email" type="email" />
<input vln-input="agreed" type="checkbox" />
<textarea vln-input="message"></textarea>
<select vln-input="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
```

### `vln-if` - Conditional rendering

Toggles `display: none` based on expression truthiness:

```html
<div vln-if="isLoggedIn">Welcome back!</div>
<div vln-if="!isLoggedIn">Please log in</div>
<div vln-if="items.length === 0">Your cart is empty</div>
```

### `vln-loop:varname` - Render arrays

Repeats the element for each array item. Inside loops, access `$index` for the current index:

```html
<ul>
  <li vln-loop:item="items">
    <span vln-text="($index + 1) + '. ' + item.name"></span>
    <button vln-on:click="removeItem(item.id)">Remove</button>
  </li>
</ul>
```

### `vln-on:event` - Event handlers

Execute JavaScript expressions on any DOM event:

```html
<button vln-on:click="count++">Increment</button>
<button vln-on:click="addItem('New Item')">Add Item</button>
<form vln-on:submit="(event.preventDefault(), handleSubmit())">
  <input vln-input="email" />
  <button type="submit">Submit</button>
</form>
```

### `vln-attr:name` - Dynamic attributes

Set any HTML attribute dynamically:

```html
<a vln-attr:href="'mailto:' + email">Email Me</a>
<img vln-attr:src="imageUrl" vln-attr:alt="imageAlt" />
<button vln-attr:disabled="!isValid">Submit</button>
<input vln-attr:placeholder="'Search ' + category + '...'" />
```

### `vln-class` - Dynamic classes

Accepts strings or objects:

```html
<!-- String -->
<div vln-class="theme"></div>

<!-- Object: keys with truthy values become classes -->
<div vln-class="{ active: isActive, disabled: !isEnabled }"></div>

<!-- Ternary expression -->
<div vln-class="isActive ? 'bg-blue' : 'bg-gray'"></div>

<!-- Complex expression -->
<div vln-class="'btn ' + (isPrimary ? 'btn-primary' : 'btn-secondary')"></div>
```

### `vln-use` - Dynamic templates

Render a template by ID based on reactive state:

```html
<div vln-use="currentView"></div>

<template id="grid">
  <div class="grid">
    <div vln-loop:item="items" class="card">
      <h3 vln-text="item.title"></h3>
    </div>
  </div>
</template>

<template id="list">
  <ul>
    <li vln-loop:item="items" vln-text="item.title"></li>
  </ul>
</template>

<script>
  const state = Velin.bind(document.body, {
    currentView: 'grid',  // Change to 'list' to switch layout
    items: [...]
  });
</script>
```

### `vln-fragment` - Inline template selection

Alias for `vln-use`

```html
<div vln-loop:task="tasks">
  <!-- Switch between view and edit templates based on state -->
  <div vln-fragment="editingId === task.id ? 'task-edit' : 'task-view'"></div>
</div>

<template id="task-view">
  <span vln-text="task.text"></span>
  <button vln-on:click="startEdit(task.id)">Edit</button>
</template>

<template id="task-edit">
  <input vln-input="task.text" />
  <button vln-on:click="saveEdit()">Save</button>
</template>
```

## Real-World Examples

See [playground/examples.html](./playground/examples.html) for interactive examples:

- **Theme Switcher** - Four complete theme layouts with dynamic `vln-use` template switching
- **Search/Filter** - Real-time search with computed filters and custom `vln-highlight` plugin
- **CRUD Operations** - Task manager with edit/view mode switching using `vln-fragment`
- **Shopping Cart** - Add/remove items with computed totals
- **Form Validation** - Real-time validation with computed error states
- **Modal Dialog** - Show/hide with reactive state
- **Accordion** - Multiple collapsible sections with nested state
- **Tabs** - Tab interface with active state management

Each example demonstrates best practices: model in JavaScript, view in HTML, clean separation of concerns.

## Plugin System

Extend Velin with custom directives:

```javascript
// Create a custom focus directive
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

Real example from the search-filter demo - a custom highlight directive:

```javascript
Velin.plugins.registerPlugin({
  name: "highlight",
  render: ({ node, tracked, state }) => {
    const text = tracked || '';
    const searchTerm = state.search || '';

    if (!searchTerm) {
      node.textContent = text;
      return;
    }

    // Highlight matching text
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const highlighted = text.replace(regex, '<mark>$1</mark>');
    node.innerHTML = highlighted;
  },
  track: Velin.trackers.expressionTracker
});
```

See [docs/plugins.md](./docs/plugins.md) for detailed plugin documentation.

## Modular Architecture

Velin is split into modules for optimal bundle size:

- **`velin-core.js`** (~3KB gzipped) - Core reactivity, expression evaluator, plugin system
- **`velin-std.js`** (~2KB gzipped) - Standard directives (text, if, loop, input, on, attr, class)
- **`velin-templates-and-fragments.js`** (~1KB gzipped) - Template directives (use, fragment)
- **`velin-all.js`** (~6KB gzipped) - Everything bundled (recommended for most projects)

```html
<!-- Use individual modules for smallest bundle -->
<script src="velin-core.js"></script>
<script src="velin-std.js"></script>

<!-- Or use the complete bundle -->
<script src="velin-all.js"></script>
```

For comparison: Alpine.js is ~15KB gzipped, React + ReactDOM is ~45KB gzipped.

## How It Works

### Proxy-Based Reactivity

When you call `Velin.bind()`, your state object is wrapped in a JavaScript Proxy that intercepts property access and modifications. Nested objects and arrays are recursively wrapped.

```javascript
const state = Velin.bind(element, {
  user: { name: 'Alice', email: 'alice@example.com' }
});

// Proxy intercepts this assignment
state.user.name = 'Bob';
// Velin notifies all directives that depend on user.name
```

### Dependency Tracking

When a directive evaluates an expression like `user.name`, Velin records that this specific directive depends on the `user.name` property path.

When you modify `state.user.name`, Velin:
1. Detects the change via the Proxy setter
2. Looks up all directives that depend on `user.name`
3. Re-evaluates only those directives

This is fine-grained reactivity - only the minimal set of DOM updates occur.

### Expression Evaluation

Velin uses a custom JavaScript expression parser and evaluator. Expressions are parsed into an Abstract Syntax Tree (AST) and evaluated safely without `eval()` or `Function()`, maintaining Content Security Policy (CSP) compliance.

This allows you to write real JavaScript expressions in attributes:
```html
<span vln-text="items.filter(i => i.active).length + ' active'"></span>
```

## Performance

- **Small bundle**: 6KB gzipped (2.5× smaller than Alpine.js, 7.5× smaller than React)
- **Fast initialization**: Scoped binding processes only your component, not the entire document
- **Efficient updates**: Fine-grained dependency tracking means minimal DOM manipulation
- **No virtual DOM**: Direct DOM updates only where needed

See [benchmarks/init-perf/](./benchmarks/init-perf/) for detailed performance comparisons with React, Vue, and Alpine.js.

## Browser Support

Velin requires ES6 features:
- Proxy
- WeakMap, Map, Set
- Template literals
- Arrow functions

**Supported browsers:**
- Chrome 49+
- Firefox 18+
- Safari 10+
- Edge 12+

## Documentation

- [Getting Started](./docs/getting-started.md) - Installation, first steps, and basic patterns
- [Directives Guide](./docs/directives.md) - Complete directive reference with examples
- [API Reference](./docs/api-reference.md) - JavaScript API documentation
- [Creating Plugins](./docs/plugins.md) - Build custom directives
- [Templates & Fragments](./docs/templates.md) - Advanced template composition
- [Interactive Examples](./playground/examples.html) - Live examples you can modify

## Roadmap

Velin is under active development. Planned features:

- **Components** - Reusable, encapsulated UI components with props and slots
- **Router** - Client-side routing without a full SPA framework
- **Lifecycle Hooks** - Component mount/unmount callbacks
- **Async State** - Built-in patterns for loading/error states
- **Transformers** - easy, fast, pipable transformers
- **Aspects** reusable aspects, think templates but combinable
- **Data initializers** Not for everyday use, but powerful when combined with everything else around

## Development

### Run Tests
```bash
npm test
```

Uses Vitest for unit tests with JSDOM for DOM simulation.

### Build
```bash
npm run build
```

Generates minified builds in `dist/build/`.

### Run Benchmarks
```bash
npm run prepare:benchmarks
npm run serve:benchmarks
```

Compare runtime performance with React, Angular, and Alpine.js (further improvements are coming)

## Philosophy

Velin is built on these principles:

1. **Separation of concerns**: Models live in JavaScript, views in HTML
2. **Progressive enhancement**: Start simple, add complexity only when needed
3. **No magic**: Explicit state management, predictable updates
4. **Standards-based**: Uses native JavaScript, no custom syntax to learn
5. **No build required**: Drop in a script tag and start building

## Contributing

Velin is currently in alpha and primarily a personal project. Issues and feature discussions are welcome, but pull requests are not being accepted at this time as the API is still stabilizing.

## License

[Apache 2.0](./LICENSE)

© 2025 Timoteo Frascaroli ([@tfrascaroli](https://github.com/tfrascaroli))
