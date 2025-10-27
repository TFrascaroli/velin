# Templates & Fragments

The Templates & Fragments module is an optional addon that provides reusable component-like functionality.

> **Note:** This module is included in `velin-all.js` but can be excluded if you only need core + standard directives.

## Overview

Templates allow you to define reusable HTML chunks and instantiate them with different data, similar to components in other frameworks but without the complexity.

## Basic Usage

### Define a Template

Use the standard HTML `<template>` tag with an `id` and declare required variables:

```html
<template id="userCard" vln-var="user">
  <div class="card">
    <h3 vln-text="vln.user.name"></h3>
    <p vln-text="vln.user.email"></p>
  </div>
</template>
```

### Use the Template

Use `vln-fragment` to instantiate the template:

```html
<div vln-fragment="'userCard'" vln-var:user="vln.currentUser"></div>
```

**Important:** Template names in `vln-fragment` are JavaScript expressions, so literal strings need quotes: `'userCard'`

## Template Variables

### Declaring Variables

Use `vln-var="variableName"` on the `<template>` tag to declare required variables:

```html
<template id="productCard" vln-var="product" vln-var="onAddToCart">
  <div class="product">
    <h3 vln-text="vln.product.name"></h3>
    <p vln-text="'$' + vln.product.price"></p>
    <button vln-on:click="vln.onAddToCart(vln.product)">Add to Cart</button>
  </div>
</template>
```

### Providing Variables

Pass variables using `vln-var:variableName="expression"`:

```html
<div
  vln-fragment="'productCard'"
  vln-var:product="vln.selectedProduct"
  vln-var:onAddToCart="vln.handleAddToCart">
</div>
```

### Validation

Velin validates that all required variables are provided:

```html
<!-- ERROR: Missing 'onAddToCart' variable -->
<div vln-fragment="'productCard'" vln-var:product="vln.selectedProduct"></div>
```

Console error:
```
[VLN009] Template 'productCard' requires missing variables: [onAddToCart].
Add them as: vln-var:onAddToCart="vln.yourValue"
```

## Dynamic Template Selection

Since `vln-fragment` values are JavaScript expressions, you can dynamically select templates:

```html
<template id="adminCard" vln-var="user">
  <div class="admin-card">
    <strong vln-text="vln.user.name"></strong>
    <button>Delete User</button>
  </div>
</template>

<template id="guestCard" vln-var="user">
  <div class="guest-card">
    <span vln-text="vln.user.name"></span>
  </div>
</template>

<!-- Dynamically pick template based on role -->
<div vln-loop:user="vln.users"
     vln-fragment="vln.user.role + 'Card'"
     vln-var:user="vln.user">
</div>
```

## Templates in Loops

Common pattern: using templates to render list items:

```html
<template id="todoItem" vln-var="todo" vln-var="actions">
  <li class="todo">
    <input type="checkbox" vln-input="vln.todo.done" />
    <span vln-text="vln.todo.text"></span>
    <button vln-on:click="vln.actions.delete()">×</button>
  </li>
</template>

<ul>
  <li vln-loop:todo="vln.todos"
      vln-fragment="'todoItem'"
      vln-var:todo="vln.todo"
      vln-var:actions="vln.createActions(vln.todo)">
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

## Component Pattern

You can use templates with factory functions to create a component-like pattern:

```html
<template id="counter" vln-var="state">
  <div class="counter">
    <button vln-on:click="vln.state.decrement()">−</button>
    <span vln-text="vln.state.count"></span>
    <button vln-on:click="vln.state.increment()">+</button>
  </div>
</template>

<div vln-fragment="'counter'" vln-var:state="vln.counterState"></div>

<script>
function createCounter(initialCount = 0) {
  return {
    count: initialCount,
    increment() {
      this.count++;
    },
    decrement() {
      this.count--;
    }
  };
}

const vln = Velin.bind(root, {
  counterState: createCounter(5)
});
</script>
```

## Lifecycle Hooks (Optional)

Templates support optional lifecycle hooks via special variables:

### onMount

Executed after the template is rendered and processed:

```html
<template id="modal" vln-var="content">
  <div class="modal">
    <div vln-text="vln.content"></div>
  </div>
</template>

<div vln-if="vln.showModal"
     vln-fragment="'modal'"
     vln-var:content="vln.modalContent"
     vln-var:onMount="vln.setupModal()">
</div>

<script>
const vln = Velin.bind(root, {
  showModal: false,
  modalContent: 'Hello!',

  setupModal() {
    document.body.style.overflow = 'hidden';
    console.log('Modal mounted');
  }
});
</script>
```

### onUnmount

Executed before the template is removed or replaced:

```html
<div vln-if="vln.showModal"
     vln-fragment="'modal'"
     vln-var:content="vln.modalContent"
     vln-var:onMount="vln.setupModal()"
     vln-var:onUnmount="vln.cleanupModal()">
</div>

<script>
const vln = Velin.bind(root, {
  showModal: false,
  modalContent: 'Hello!',

  setupModal() {
    document.body.style.overflow = 'hidden';
  },

  cleanupModal() {
    document.body.style.overflow = '';
    console.log('Modal unmounted');
  }
});
</script>
```

**Note:** Lifecycle hooks are optional variables and don't need to be declared with `vln-var` on the template.

## Alternative: `vln-use`

`vln-use` is an alias for `vln-fragment`. Some developers prefer this naming:

```html
<!-- These are equivalent -->
<div vln-fragment="'userCard'" vln-var:user="vln.currentUser"></div>
<div vln-use="'userCard'" vln-var:user="vln.currentUser"></div>
```

## Complete Example

Here's a complete example of a user management interface using templates:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/velin/dist/velin-all.min.js"></script>
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
  <template id="userCard" vln-var="user" vln-var="actions">
    <div class="user-card">
      <h3 vln-text="vln.user.name"></h3>
      <p vln-text="vln.user.email"></p>
      <button vln-on:click="vln.actions.edit()">Edit</button>
      <button vln-on:click="vln.actions.delete()">Delete</button>
    </div>
  </template>

  <!-- App -->
  <div id="app">
    <h1>Users</h1>

    <div vln-loop:user="vln.users"
         vln-fragment="'userCard'"
         vln-var:user="vln.user"
         vln-var:actions="vln.createUserActions(vln.user)">
    </div>
  </div>

  <script>
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

### Good Use Cases

✅ **Repeated complex structures**
```html
<!-- Product cards with lots of markup -->
<template id="productCard" vln-var="product">
  <!-- 20 lines of HTML -->
</template>
```

✅ **Dynamic component selection**
```html
<!-- Different layouts based on data -->
<div vln-fragment="vln.item.type + 'Layout'" ...></div>
```

✅ **Reusable UI patterns**
```html
<!-- Same card used in multiple places -->
<template id="userCard">...</template>

<!-- In dashboard -->
<div vln-fragment="'userCard'" ...></div>

<!-- In search results -->
<div vln-fragment="'userCard'" ...></div>
```

### When NOT to Use Templates

❌ **Simple repeated items**
```html
<!-- Just use vln-loop directly -->
<li vln-loop:item="vln.items" vln-text="vln.item.name"></li>
```

❌ **Server-rendered pages**
```html
<!-- Use server-side partials instead -->
<!-- Django: {% include 'user_card.html' %} -->
<!-- Rails: <%= render 'user_card' %> -->
```

❌ **One-off components**
```html
<!-- Just write the HTML inline -->
<div class="card">
  <h3 vln-text="vln.user.name"></h3>
</div>
```

## Best Practices

### 1. Keep templates small and focused

**Good:**
```html
<template id="userAvatar" vln-var="user">
  <img vln-attr:src="vln.user.avatar" vln-attr:alt="vln.user.name" />
</template>
```

**Avoid:**
```html
<template id="entirePage" vln-var="pageData">
  <!-- 200 lines of HTML -->
</template>
```

### 2. Use descriptive variable names

**Good:**
```html
<template id="productCard" vln-var="product" vln-var="onAddToCart">
```

**Avoid:**
```html
<template id="productCard" vln-var="p" vln-var="fn">
```

### 3. Pass functions for actions

**Good:**
```html
<template id="card" vln-var="item" vln-var="actions">
  <button vln-on:click="vln.actions.delete()">Delete</button>
</template>

vln-var:actions="vln.createActions(vln.item)"
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

## Limitations

- **No CSS encapsulation**: Styles are global (use CSS Modules, BEM, or scoped classes)
- **No slot system**: Unlike Web Components, no `<slot>` support
- **No props validation**: Beyond required variable checking
- **Template must exist in DOM**: Can't be dynamically created from strings

## Comparison to Other Frameworks

| Feature | Velin Templates | React | Vue | Web Components |
|---------|----------------|-------|-----|----------------|
| Build step | No | Yes | Optional | No |
| CSS encapsulation | No | No | Yes (scoped) | Yes (Shadow DOM) |
| Props validation | Basic | PropTypes/TS | Yes | No |
| Lifecycle hooks | onMount/onUnmount | Many | Many | Many |
| Dynamic selection | Yes | Yes | Yes | No |
| Learning curve | Flat | Steep | Moderate | Moderate |

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
