# Templates & Fragments

The Templates & Fragments module is an optional addon that provides reusable component-like functionality.

> **Note:** This module is included in `velin-all.js` but can be excluded if you only need core + standard directives.

## Overview

Templates allow you to define reusable HTML chunks and instantiate them with different data, similar to components in other frameworks but without the complexity.

## Basic Usage

### Define a Template

Use the standard HTML `<template>` tag with an `id` and declare required variables:

```html
<template id="userCard" vln-vars="user">
  <div class="card">
    <h3 vln-text="user.name"></h3>
    <p vln-text="user.email"></p>
  </div>
</template>
```

### Use the Template

Use `vln-fragment` to instantiate the template:

```html
<div vln-fragment="'userCard'" vln-var:user="currentUser"></div>
```

**Important:** Template names in `vln-fragment` are JavaScript expressions, so literal strings need quotes: `'userCard'`

## Template Variables

### Declaring Variables

Use `vln-vars="var1, var2"` on the `<template>` tag to declare required variables (comma-separated):

```html
<template id="productCard" vln-vars="product, onAddToCart">
  <div class="product">
    <h3 vln-text="product.name"></h3>
    <p vln-text="'$' + product.price"></p>
    <button vln-on:click="onAddToCart(product)">Add to Cart</button>
  </div>
</template>
```

### Providing Variables

Pass variables using `vln-var:variableName="expression"`:

```html
<div
  vln-fragment="'productCard'"
  vln-var:product="selectedProduct"
  vln-var:onAddToCart="handleAddToCart">
</div>
```

### Validation

Velin validates that all required variables are provided:

```html
<!-- ERROR: Missing 'onAddToCart' variable -->
<div vln-fragment="'productCard'" vln-var:product="selectedProduct"></div>
```

Console error:
```
[VLN009] Template 'productCard' requires missing variables: [onAddToCart].
Add them as: vln-var:onAddToCart="yourValue"
```

## Dynamic Template Selection

Since `vln-fragment` values are JavaScript expressions, you can dynamically select templates:

```html
<template id="adminCard" vln-vars="user">
  <div class="admin-card">
    <strong vln-text="user.name"></strong>
    <button>Delete User</button>
  </div>
</template>

<template id="guestCard" vln-vars="user">
  <div class="guest-card">
    <span vln-text="user.name"></span>
  </div>
</template>

<!-- Dynamically pick template based on role -->
<div vln-loop:user="users"
     vln-fragment="user.role + 'Card'"
     vln-var:user="user">
</div>
```

## Templates in Loops

Common pattern: using templates to render list items:

```html
<template id="todoItem" vln-vars="todo, actions">
  <li class="todo">
    <input type="checkbox" vln-input="todo.done" />
    <span vln-text="todo.text"></span>
    <button vln-on:click="actions.delete()">×</button>
  </li>
</template>

<ul>
  <li vln-loop:todo="todos"
      vln-fragment="'todoItem'"
      vln-var:todo="todo"
      vln-var:actions="createActions(todo)">
  </li>
</ul>

<script>
const vln = Velin.bind(root, {
  todos: [
    { id: 1, text: 'Learn Velin', done: false },
    { id: 2, text: 'Build something', done: false }
  ],

  createActions(todo) {
    return {
      delete: () => {
        this.todos = this.todos.filter(t => t !== todo);
      }
    };
  }
});
</script>
```

## Lifecycle Events

Templates and Fragments trigger native DOM events when they are created or destroyed. You can listen to these using standard `vln-on` listeners.

### `init`

Fired when a node and its entire subtree have been processed by Velin.

```html
<template id="chart">
  <canvas vln-on:init="renderChart(event.target)"></canvas>
</template>
```

### `destroy`

Fired when a node's reactive state is being cleaned up (e.g., when a fragment is swapped or a loop item removed).

```html
<template id="timer">
  <div vln-on:destroy="stopTimer()">
    Time: <span vln-text="time"></span>
  </div>
</template>
```

## Component Pattern

In Velin, **Templates ARE Components**. You don't need a separate registry. By combining templates, `vln-var`, and lifecycle events, you get full component functionality.

1. **The View**: Defined in a `<template>` tag.
2. **The Logic**: Defined in your central JavaScript state.
3. **The Interface**: Documented via `vln-vars` and `@vln-type`.
4. **The Lifecycle**: Managed via `vln-on:init` and `vln-on:destroy`.

## IDE IntelliSense & Type Safety

Velin provides a way to document the "interface" of your template so that IDEs (via the Velin VS Code extension) can provide autocomplete and type checking.

### `@vln-type`

Add a comment at the top of your `<template>` to link it to a JavaScript type (defined via JSDoc or TypeScript).

```javascript
// state.js
/**
 * @typedef {Object} UserProfile
 * @property {string} name
 * @property {string} role
 */
```

```html
<!-- index.html -->
<template id="userCard">
  <!-- @vln-type {UserProfile} -->
  <div class="card">
    <h3 vln-text="name"></h3>
    <span vln-text="role"></span>
  </div>
</template>
```

The IDE will now provide autocomplete for `name` and `role` inside the template expressions and when using `vln-var:name` on a fragment.

## Complete Example

Here's a complete example of a user management interface using the "Component Pattern":

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/@velinjs/all/velin-all.min.js"></script>
  <style>
    .user-card {
      border: 1px solid #ddd;
      padding: 1rem;
      margin-bottom: 0.5rem;
      border-radius: 4px;
    }
    .user-card h3 { margin: 0 0 0.5rem 0; }
    button { margin-right: 0.5rem; }
  </style>
</head>
<body>
  <!-- Template Definition -->
  <template id="userCard" vln-vars="user, actions">
    <!-- @vln-type {UserCardProps} -->
    <div class="user-card" vln-on:init="console.log('User card ready:', user.name)">
      <h3 vln-text="user.name"></h3>
      <p vln-text="user.email"></p>
      <button vln-on:click="actions.edit()">Edit</button>
      <button vln-on:click="actions.delete()">Delete</button>
    </div>
  </template>

  <!-- App -->
  <div id="app">
    <h1>Users</h1>

    <div vln-loop:user="users"
         vln-fragment="'userCard'"
         vln-var:user="user"
         vln-var:actions="createUserActions(user)">
    </div>
  </div>

  <script>
    /**
     * @typedef {Object} UserCardProps
     * @property {Object} user
     * @property {Object} actions
     */

    const vln = Velin.bind(document.getElementById('app'), {
      users: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com' }
      ],

      createUserActions(user) {
        return {
          edit: () => {
            const newName = prompt('Enter new name:', user.name);
            if (newName) {
              user.name = newName;
            }
          },
          delete: () => {
            if (confirm(`Delete ${user.name}?`)) {
              this.users = this.users.filter(u => u !== user);
            }
          }
        };
      }
    });
  </script>
</body>
</html>
```

## When to Use Templates

Reach for templates when the same non-trivial chunk of markup shows up in more than one place, or when the shape of a section depends on runtime data.

**Repeated complex structures** — e.g. a product card with twenty lines of markup used in a grid:

```html
<template id="productCard" vln-vars="product">
  <!-- 20 lines of HTML -->
</template>
```

**Dynamic component selection** — pick a layout at runtime based on the data:

```html
<div vln-fragment="item.type + 'Layout'" ...></div>
```

**Reusable UI patterns** — the same card rendered in a dashboard and a search result:

```html
<template id="userCard">...</template>

<div vln-fragment="'userCard'" ...></div>
```

## When NOT to Use Templates

For a simple repeated item, use `vln-loop` directly — a template adds indirection you don't need:

```html
<li vln-loop:item="items" vln-text="item.name"></li>
```

For server-rendered pages, prefer your server's partial system (Django `{% include %}`, Rails `render`, etc).

For one-off markup that only appears once, just write it inline.

## Best Practices

### 1. Keep templates small and focused

**Good:**
```html
<template id="userAvatar" vln-vars="user">
  <img vln-attr:src="user.avatar" vln-attr:alt="user.name" />
</template>
```

**Avoid:**
```html
<template id="entirePage" vln-vars="pageData">
  <!-- 200 lines of HTML -->
</template>
```

### 2. Use descriptive variable names

**Good:**
```html
<template id="productCard" vln-vars="product, onAddToCart">
```

**Avoid:**
```html
<template id="productCard" vln-vars="p, fn">
```

### 3. Pass functions for actions

**Good:**
```html
<template id="card" vln-vars="item, actions">
  <button vln-on:click="actions.delete()">Delete</button>
</template>

vln-var:actions="createActions(item)"
```

### 4. Use factory functions for component state

```javascript
function createCounter(initialValue = 0) {
  return {
    count: initialValue,
    increment() { this.count++; },
    decrement() { this.count--; }
  };
}

const vln = Velin.bind(root, {
  counterA: createCounter(0),
  counterB: createCounter(10)
});
```

## Comparison to Other Frameworks

| Feature | Velin Templates | React | Vue | Web Components |
|---------|----------------|-------|-----|----------------|
| Build step | No | Yes | Optional | No |
| CSS encapsulation | No | No | Yes (scoped) | Yes (Shadow DOM) |
| Props validation | Basic | PropTypes/TS | Yes | No |
| Dynamic selection | Yes | Yes | Yes | No |
| Learning curve | Flat | Steep | Moderate | Moderate |
| Native Lifecycle | Yes | Hooks | Hooks | Yes |

## Debugging

If templates aren't working:

1. **Check template exists:**
   ```javascript
   console.log(document.getElementById('myTemplate'));
   ```

2. **Check for typos in fragment name:**
   ```html
   <!-- Make sure the ID matches -->
   <template id="userCard">...</template>
   <div vln-fragment="'userCard'"><!-- Not 'usercard' --></div>
   ```

3. **Verify all variables are provided:**
   Look for `[VLN009]` errors in console

4. **Check quotes in expressions:**
   ```html
   <!-- Correct: quotes inside attribute value -->
   <div vln-fragment="'userCard'"></div>

   <!-- Wrong: no quotes -->
   <div vln-fragment="userCard"></div>
   ```

5. **Use browser DevTools:**
   Inspect the element to see if content was rendered


---

## See Also

- **[API Reference: Low-Level APIs](./api-reference.md#low-level-apis)** - Understanding state composition and cleanup
- **[Creating Plugins](./plugins.md)** - How `vln-fragment` works internally
- **[Directives Guide](./directives.md)** - Other directives to use with templates
- **[Getting Started](./getting-started.md)** - Basic concepts before using templates
- **[Documentation Hub](./README.md)** - Navigate all Velin documentation

