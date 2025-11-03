# Getting Started with Velin

This guide will walk you through the basics of using Velin to add reactivity to your web applications.

## Installation

### Via CDN (Quickest)

Add this to your HTML `<head>`:

```html
<script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
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
  <script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
</head>
<body>
  <div id="app">
    <h1 vln-text="'Hello, ' + name + '!'"></h1>
    <input vln-input="name" placeholder="Enter your name" />
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
<div vln-text="message"></div>
<input vln-input="email" />
<button vln-on:click="handleClick()">Click me</button>
```

### 3. Expressions are JavaScript

All directive values are JavaScript expressions:

```html
<!-- Simple variable -->
<span vln-text="count"></span>

<!-- String literal -->
<h1 vln-text="'Hello World'"></h1>

<!-- Math -->
<div vln-text="price * 1.1"></div>

<!-- Ternary -->
<div vln-text="isActive ? 'Active' : 'Inactive'"></div>

<!-- Function calls -->
<div vln-text="formatDate(timestamp)"></div>
```

## Core Directives

### Text Content: `vln-text`

Sets the text content of an element:

```html
<p vln-text="description"></p>
<h1 vln-text="'Welcome, ' + username"></h1>
```

### Two-Way Binding: `vln-input`

Binds form inputs to state:

```html
<!-- Text input -->
<input vln-input="name" />

<!-- Checkbox -->
<input type="checkbox" vln-input="agreed" />

<!-- Select -->
<select vln-input="country">
  <option value="us">USA</option>
  <option value="uk">UK</option>
</select>
```

### Conditional Display: `vln-if`

Shows/hides elements based on a condition:

```html
<div vln-if="isLoggedIn">
  Welcome back!
</div>

<div vln-if="error">
  Error: <span vln-text="error"></span>
</div>
```

### Lists: `vln-loop`

Repeats an element for each item in an array:

```html
<ul>
  <li vln-loop:item="items" vln-text="item"></li>
</ul>
```

The syntax is `vln-loop:varName="arrayExpression"`.

### Event Handlers: `vln-on:event`

Responds to DOM events:

```html
<button vln-on:click="count++">Increment</button>

<form vln-on:submit="handleSubmit()">
  <!-- form fields -->
</form>

<input vln-on:keypress="handleKeyPress($event)" />
```

### Attributes: `vln-attr:name`

Sets HTML attributes dynamically:

```html
<img vln-attr:src="imageUrl" vln-attr:alt="imageAlt" />
<button vln-attr:disabled="!isValid">Submit</button>
<a vln-attr:href="link">Click here</a>
```

### Classes: `vln-class`

Adds CSS classes dynamically:

```html
<!-- Single class name -->
<div vln-class="theme"></div>

<!-- Object of class names and booleans -->
<div vln-class="{ active: isActive, disabled: !isEnabled }"></div>

<!-- Conditional expression -->
<div vln-class="status === 'error' ? 'text-red' : 'text-green'"></div>
```

## Building a Todo App

Let's build a simple todo app to practice:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
  <style>
    .completed { text-decoration: line-through; opacity: 0.6; }
  </style>
</head>
<body>
  <div id="app">
    <h1>Todo List</h1>

    <form vln-on:submit="addTodo()">
      <input vln-input="newTodo" placeholder="What needs to be done?" />
      <button type="submit">Add</button>
    </form>

    <ul>
      <li vln-loop:todo="todos" vln-class="{ completed: todo.done }">
        <input type="checkbox" vln-input="todo.done" />
        <span vln-text="todo.text"></span>
        <button vln-on:click="removeTodo(todo)">×</button>
      </li>
    </ul>

    <div>
      <strong vln-text="remaining"></strong> items left
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

// This automatically updates any elements using count
vln.count++;

// This automatically updates any elements using user.name
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
<div vln-text="fullName"></div>
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
<input vln-input="email" />
<div vln-if="!isEmailValid && email">Invalid email</div>

<input vln-input="password" type="password" />
<div vln-if="!isPasswordValid && password">Password too short</div>

<button vln-attr:disabled="!canSubmit">Submit</button>
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
<button vln-on:click="loadData()" vln-attr:disabled="loading">
  <span vln-if="!loading">Load Data</span>
  <span vln-if="loading">Loading...</span>
</button>

<div vln-if="data">
  <pre vln-text="JSON.stringify(data, null, 2)"></pre>
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
<input vln-input="search" placeholder="Search..." />

<ul>
  <li vln-loop:item="filteredItems" vln-text="item"></li>
</ul>
```
