# Getting Started with Velin

This guide will walk you through the basics of using Velin to add reactivity to your web applications.

## Installation

### Via CDN (Quickest)

Add this to your HTML `<head>`:

```html
<script src="https://unpkg.com/velin/dist/velin-all.min.js"></script>
```

### Via npm

```bash
npm install velin
```

Then in your JavaScript:

```javascript
import Velin from 'velin';
```

### Local Development

Download the files and include them locally:

```html
<script src="path/to/velin-all.min.js"></script>
```

## Your First Velin App

Create an HTML file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My First Velin App</title>
  <script src="https://unpkg.com/velin/dist/velin-all.min.js"></script>
</head>
<body>
  <div id="app">
    <h1 vln-text="'Hello, ' + vln.name + '!'"></h1>
    <input vln-input="vln.name" placeholder="Enter your name" />
  </div>

  <script>
    const vln = Velin.bind(document.getElementById('app'), {
      name: 'World'
    });
  </script>
</body>
</html>
```

Open it in a browser and you'll see:
- A heading that says "Hello, World!"
- An input field
- As you type in the input, the heading updates automatically

## Understanding the Basics

### 1. Binding State

```javascript
const vln = Velin.bind(rootElement, initialState);
```

- `rootElement`: The DOM element to make reactive (usually `document.body` or a container)
- `initialState`: An object containing your application's data
- Returns: A reactive proxy of your state

### 2. Using Directives

Directives are HTML attributes that start with `vln-`:

```html
<div vln-text="vln.message"></div>
<input vln-input="vln.email" />
<button vln-on:click="vln.handleClick()">Click me</button>
```

### 3. Expressions are JavaScript

All directive values are JavaScript expressions:

```html
<!-- Simple variable -->
<span vln-text="vln.count"></span>

<!-- String literal -->
<h1 vln-text="'Hello World'"></h1>

<!-- Math -->
<div vln-text="vln.price * 1.1"></div>

<!-- Ternary -->
<div vln-text="vln.isActive ? 'Active' : 'Inactive'"></div>

<!-- Function calls -->
<div vln-text="vln.formatDate(vln.timestamp)"></div>
```

## Core Directives

### Text Content: `vln-text`

Sets the text content of an element:

```html
<p vln-text="vln.description"></p>
<h1 vln-text="'Welcome, ' + vln.username"></h1>
```

### Two-Way Binding: `vln-input`

Binds form inputs to state:

```html
<!-- Text input -->
<input vln-input="vln.name" />

<!-- Checkbox -->
<input type="checkbox" vln-input="vln.agreed" />

<!-- Select -->
<select vln-input="vln.country">
  <option value="us">USA</option>
  <option value="uk">UK</option>
</select>
```

### Conditional Display: `vln-if`

Shows/hides elements based on a condition:

```html
<div vln-if="vln.isLoggedIn">
  Welcome back!
</div>

<div vln-if="vln.error">
  Error: <span vln-text="vln.error"></span>
</div>
```

### Lists: `vln-loop`

Repeats an element for each item in an array:

```html
<ul>
  <li vln-loop:item="vln.items" vln-text="vln.item"></li>
</ul>
```

The syntax is `vln-loop:variableName="vln.arrayExpression"`.

### Event Handlers: `vln-on:event`

Responds to DOM events:

```html
<button vln-on:click="vln.count++">Increment</button>

<form vln-on:submit="vln.handleSubmit()">
  <!-- form fields -->
</form>

<input vln-on:keyup="vln.handleKeyPress($event)" />
```

### Attributes: `vln-attr:name`

Sets HTML attributes dynamically:

```html
<img vln-attr:src="vln.imageUrl" vln-attr:alt="vln.imageAlt" />
<button vln-attr:disabled="!vln.isValid">Submit</button>
<a vln-attr:href="vln.link">Click here</a>
```

### Classes: `vln-class`

Adds CSS classes dynamically:

```html
<!-- Single class name -->
<div vln-class="vln.theme"></div>

<!-- Object of class names and booleans -->
<div vln-class="{ active: vln.isActive, disabled: !vln.isEnabled }"></div>

<!-- Conditional expression -->
<div vln-class="vln.status === 'error' ? 'text-red' : 'text-green'"></div>
```

## Building a Todo App

Let's build a simple todo app to practice:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/velin/dist/velin-all.min.js"></script>
  <style>
    .completed { text-decoration: line-through; opacity: 0.6; }
  </style>
</head>
<body>
  <div id="app">
    <h1>Todo List</h1>

    <form vln-on:submit="vln.addTodo()">
      <input vln-input="vln.newTodo" placeholder="What needs to be done?" />
      <button type="submit">Add</button>
    </form>

    <ul>
      <li vln-loop:todo="vln.todos" vln-class="{ completed: vln.todo.done }">
        <input type="checkbox" vln-input="vln.todo.done" />
        <span vln-text="vln.todo.text"></span>
        <button vln-on:click="vln.removeTodo(vln.todo)">×</button>
      </li>
    </ul>

    <div>
      <strong vln-text="vln.remaining"></strong> items left
    </div>
  </div>

  <script>
    const vln = Velin.bind(document.getElementById('app'), {
      newTodo: '',
      todos: [],

      get remaining() {
        return this.todos.filter(t => !t.done).length;
      },

      addTodo() {
        if (this.newTodo.trim()) {
          this.todos.push({
            text: this.newTodo,
            done: false
          });
          this.newTodo = '';
        }
      },

      removeTodo(todo) {
        const index = this.todos.indexOf(todo);
        if (index > -1) {
          this.todos.splice(index, 1);
        }
      }
    });
  </script>
</body>
</html>
```

## Reactivity Explained

Velin automatically tracks dependencies and updates the DOM when data changes:

```javascript
const vln = Velin.bind(root, {
  count: 0,
  user: { name: 'Alice' }
});

// This automatically updates any elements using vln.count
vln.count++;

// This automatically updates any elements using vln.user.name
vln.user.name = 'Bob';

// Array methods work too
vln.items.push({ name: 'New item' });
vln.items.splice(0, 1);
```

### Computed Properties

Use getters for derived state:

```javascript
const vln = Velin.bind(root, {
  firstName: 'John',
  lastName: 'Doe',

  get fullName() {
    return this.firstName + ' ' + this.lastName;
  }
});
```

```html
<div vln-text="vln.fullName"></div>
```

Now changing either `firstName` or `lastName` will update `fullName` automatically.

## Next Steps

- Read the [Directives Guide](./directives.md) for detailed information on each directive
- Check out the [API Reference](./api-reference.md) for advanced features
- Explore [Examples & Patterns](./examples.md) for common use cases
- Learn about [Creating Plugins](./plugins.md) to extend Velin

## Common Patterns

### Form Validation

```javascript
const vln = Velin.bind(form, {
  email: '',
  password: '',

  get isEmailValid() {
    return this.email.includes('@');
  },

  get isPasswordValid() {
    return this.password.length >= 8;
  },

  get canSubmit() {
    return this.isEmailValid && this.isPasswordValid;
  }
});
```

```html
<input vln-input="vln.email" />
<div vln-if="!vln.isEmailValid && vln.email">Invalid email</div>

<input vln-input="vln.password" type="password" />
<div vln-if="!vln.isPasswordValid && vln.password">Password too short</div>

<button vln-attr:disabled="!vln.canSubmit">Submit</button>
```

### Loading States

```javascript
const vln = Velin.bind(root, {
  loading: false,
  data: null,

  async loadData() {
    this.loading = true;
    try {
      const response = await fetch('/api/data');
      this.data = await response.json();
    } finally {
      this.loading = false;
    }
  }
});
```

```html
<button vln-on:click="vln.loadData()" vln-attr:disabled="vln.loading">
  <span vln-if="!vln.loading">Load Data</span>
  <span vln-if="vln.loading">Loading...</span>
</button>

<div vln-if="vln.data">
  <pre vln-text="JSON.stringify(vln.data, null, 2)"></pre>
</div>
```

### Search/Filter

```javascript
const vln = Velin.bind(root, {
  search: '',
  items: ['Apple', 'Banana', 'Cherry', 'Date'],

  get filteredItems() {
    return this.items.filter(item =>
      item.toLowerCase().includes(this.search.toLowerCase())
    );
  }
});
```

```html
<input vln-input="vln.search" placeholder="Search..." />

<ul>
  <li vln-loop:item="vln.filteredItems" vln-text="vln.item"></li>
</ul>
```
