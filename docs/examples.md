# Examples & Patterns

Common patterns and real-world examples using Velin.

## Table of Contents

1. [Form Validation](#form-validation)
2. [CRUD Operations](#crud-operations)
3. [Search and Filter](#search-and-filter)
4. [Modal Dialogs](#modal-dialogs)
5. [Tabs](#tabs)
6. [Accordion](#accordion)
7. [Infinite Scroll](#infinite-scroll)
8. [Debounced Search](#debounced-search)
9. [Shopping Cart](#shopping-cart)
10. [Authentication](#authentication)

---

## Form Validation

Complete form with validation, error messages, and submission:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/velin/dist/build/velin-all.min.js"></script>
  <style>
    .error { color: red; font-size: 0.875rem; }
    .field { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.25rem; }
    input { padding: 0.5rem; border: 1px solid #ccc; width: 100%; }
    input.invalid { border-color: red; }
    .success { color: green; padding: 1rem; background: #e7f5e7; }
  </style>
</head>
<body>
  <div id="app">
    <h1>Sign Up</h1>

    <form vln-on:submit="event.preventDefault(); handleSubmit()">
      <div class="field">
        <label>Email</label>
        <input
          vln-input="email"
          vln-class="{ invalid: touched.email && !isEmailValid }"
          vln-on:[^=]+="touched.email = true"
          type="email"
        />
        <div vln-if="touched.email && !isEmailValid" class="error">
          Please enter a valid email address
        </div>
      </div>

      <div class="field">
        <label>Password</label>
        <input
          vln-input="password"
          vln-class="{ invalid: touched.password && !isPasswordValid }"
          vln-on:[^=]+="touched.password = true"
          type="password"
        />
        <div vln-if="touched.password && !isPasswordValid" class="error">
          Password must be at least 8 characters
        </div>
      </div>

      <div class="field">
        <label>
          <input type="checkbox" vln-input="agreed" />
          I agree to the terms and conditions
        </label>
        <div vln-if="touched.agreed && !agreed" class="error">
          You must agree to the terms
        </div>
      </div>

      <button
        type="submit"
        vln-attr:disabled="!canSubmit || loading">
        <span vln-if="!loading">Sign Up</span>
        <span vln-if="loading">Creating account...</span>
      </button>

      <div vln-if="success" class="success">
        Account created successfully!
      </div>
    </form>
  </div>

  <script>
    const vln = Velin.bind(document.getElementById('app'), {
      email: '',
      password: '',
      agreed: false,
      loading: false,
      success: false,
      touched: {
        email: false,
        password: false,
        agreed: false
      },

      get isEmailValid() {
        return this.email.includes('@') && this.email.includes('.');
      },

      get isPasswordValid() {
        return this.password.length >= 8;
      },

      get canSubmit() {
        return this.isEmailValid &&
               this.isPasswordValid &&
               this.agreed;
      },

      async handleSubmit() {
        this.touched = { email: true, password: true, agreed: true };

        if (!this.canSubmit) return;

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
            this.agreed = false;
            this.touched = { email: false, password: false, agreed: false };
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

---

## CRUD Operations

Managing a list with create, read, update, delete:

```html
<div id="app">
  <h1>Task Manager</h1>

  <!-- Create -->
  <form vln-on:submit="event.preventDefault(); addTask()">
    <input vln-input="newTask" placeholder="New task..." />
    <button type="submit">Add</button>
  </form>

  <!-- Read / Update / Delete -->
  <ul>
    <li vln-loop:[^=]+="tasks">
      <div vln-if="editingId !== task.id">
        <input type="checkbox" vln-input="task.done" />
        <span vln-text="task.text"></span>
        <button vln-on:[^=]+="startEdit(task)">Edit</button>
        <button vln-on:[^=]+="deleteTask(task.id)">Delete</button>
      </div>

      <div vln-if="editingId === task.id">
        <input vln-input="editText" />
        <button vln-on:[^=]+="saveEdit(task)">Save</button>
        <button vln-on:[^=]+="cancelEdit()">Cancel</button>
      </div>
    </li>
  </ul>
</div>

<script>
let nextId = 1;

const vln = Velin.bind(document.getElementById('app'), {
  tasks: [],
  newTask: '',
  editingId: null,
  editText: '',

  addTask() {
    if (this.newTask.trim()) {
      this.tasks.push({
        id: nextId++,
        text: this.newTask,
        done: false
      });
      this.newTask = '';
    }
  },

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
  },

  startEdit(task) {
    this.editingId = task.id;
    this.editText = task.text;
  },

  saveEdit(task) {
    task.text = this.editText;
    this.editingId = null;
    this.editText = '';
  },

  cancelEdit() {
    this.editingId = null;
    this.editText = '';
  }
});
</script>
```

---

## Search and Filter

Real-time search with filtering:

```html
<div id="app">
  <input
    vln-input="search"
    placeholder="Search users..."
    type="search"
  />

  <div>
    Showing <strong vln-text="filteredUsers.length"></strong>
    of <strong vln-text="users.length"></strong> users
  </div>

  <ul>
    <li vln-loop:[^=]+="filteredUsers">
      <strong vln-text="user.name"></strong>
      - <span vln-text="user.email"></span>
    </li>
  </ul>
</div>

<script>
const vln = Velin.bind(document.getElementById('app'), {
  search: '',
  users: [
    { name: 'Alice Johnson', email: 'alice@example.com' },
    { name: 'Bob Smith', email: 'bob@example.com' },
    { name: 'Charlie Brown', email: 'charlie@example.com' },
    { name: 'Diana Prince', email: 'diana@example.com' }
  ],

  get filteredUsers() {
    const query = this.search.toLowerCase().trim();
    if (!query) return this.users;

    return this.users.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  }
});
</script>
```

---

## Modal Dialogs

Reusable modal pattern:

```html
<div id="app">
  <button vln-on:[^=]+="openModal()">Open Modal</button>

  <div
    vln-if="isModalOpen"
    class="modal-overlay"
    vln-on:[^=]+="closeModal()">
    <div class="modal-content" vln-on:click="event.stopPropagation()">
      <h2>Modal Title</h2>
      <p vln-text="modalMessage"></p>
      <button vln-on:[^=]+="closeModal()">Close</button>
    </div>
  </div>
</div>

<style>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
}
</style>

<script>
const vln = Velin.bind(document.getElementById('app'), {
  isModalOpen: false,
  modalMessage: 'This is a modal dialog!',

  openModal() {
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    this.isModalOpen = false;
    document.body.style.overflow = '';
  }
});
</script>
```

---

## Tabs

Tab navigation component:

```html
<div id="app">
  <div class="tabs">
    <button
      vln-loop:[^=]+="tabs"
      vln-text="tab"
      vln-class="{ active: activeTab === tab }"
      vln-on:[^=]+="activeTab = vln.tab">
    </button>
  </div>

  <div class="tab-content">
    <div vln-if="activeTab === 'Home'">
      <h2>Home</h2>
      <p>Welcome to the home tab!</p>
    </div>

    <div vln-if="activeTab === 'Profile'">
      <h2>Profile</h2>
      <p>Your profile information goes here.</p>
    </div>

    <div vln-if="activeTab === 'Settings'">
      <h2>Settings</h2>
      <p>Adjust your settings here.</p>
    </div>
  </div>
</div>

<style>
.tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid #ddd;
  margin-bottom: 1rem;
}

.tabs button {
  padding: 0.75rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}

.tabs button.active {
  border-bottom-color: blue;
  font-weight: bold;
}
</style>

<script>
const vln = Velin.bind(document.getElementById('app'), {
  tabs: ['Home', 'Profile', 'Settings'],
  activeTab: 'Home'
});
</script>
```

---

## Accordion

Expandable/collapsible sections:

```html
<div id="app">
  <div vln-loop:[^=]+="items" class="accordion-item">
    <button
      vln-on:[^=]+="toggle(item.id)"
      class="accordion-header">
      <span vln-text="item.title"></span>
      <span vln-text="isOpen(item.id) ? '−' : '+'"></span>
    </button>

    <div vln-if="isOpen(item.id)" class="accordion-content">
      <p vln-text="item.content"></p>
    </div>
  </div>
</div>

<style>
.accordion-item {
  border: 1px solid #ddd;
  margin-bottom: 0.5rem;
}

.accordion-header {
  width: 100%;
  padding: 1rem;
  border: none;
  background: #f5f5f5;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
}

.accordion-content {
  padding: 1rem;
}
</style>

<script>
const vln = Velin.bind(document.getElementById('app'), {
  openIds: [],
  items: [
    { id: 1, title: 'Section 1', content: 'Content for section 1' },
    { id: 2, title: 'Section 2', content: 'Content for section 2' },
    { id: 3, title: 'Section 3', content: 'Content for section 3' }
  ],

  isOpen(id) {
    return this.openIds.includes(id);
  },

  toggle(id) {
    if (this.isOpen(id)) {
      this.openIds = this.openIds.filter(i => i !== id);
    } else {
      this.openIds.push(id);
    }
  }
});
</script>
```

---

## Debounced Search

Search with debouncing to reduce API calls:

```html
<div id="app">
  <input vln-input="query" placeholder="Search..." />

  <div vln-if="loading">Searching...</div>

  <ul vln-if="!loading && results.length">
    <li vln-loop:[^=]+="results" vln-text="result.name"></li>
  </ul>

  <div vln-if="!loading && query && !results.length">
    No results found
  </div>
</div>

<script>
const vln = Velin.bind(document.getElementById('app'), {
  query: '',
  results: [],
  loading: false,
  debounceTimer: null,

  async search() {
    if (!this.query.trim()) {
      this.results = [];
      return;
    }

    this.loading = true;

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(this.query)}`);
      this.results = await response.json();
    } catch (error) {
      console.error('Search failed:', error);
      this.results = [];
    } finally {
      this.loading = false;
    }
  }
});

// Watch query changes with debouncing
let lastQuery = vln.query;
setInterval(() => {
  if (query !== lastQuery) {
    lastQuery = vln.query;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    vln.debounceTimer = setTimeout(() => {
      search();
    }, 300);
  }
}, 50);
</script>
```

---

## Shopping Cart

Product listing with cart:

```html
<div id="app">
  <h1>Shop</h1>

  <div class="products">
    <div vln-loop:[^=]+="products" class="product">
      <h3 vln-text="product.name"></h3>
      <p vln-text="'$' + product.price"></p>
      <button vln-on:[^=]+="addToCart(product)">Add to Cart</button>
    </div>
  </div>

  <div class="cart">
    <h2>Cart (<span vln-text="cart.length"></span>)</h2>

    <div vln-if="cart.length">
      <div vln-loop:[^=]+="cart">
        <span vln-text="item.name"></span>
        - $<span vln-text="item.price"></span>
        <button vln-on:[^=]+="removeFromCart(item)">Remove</button>
      </div>

      <div>
        <strong>Total: $<span vln-text="total"></span></strong>
      </div>
    </div>

    <div vln-if="!cart.length">
      Cart is empty
    </div>
  </div>
</div>

<script>
const vln = Velin.bind(document.getElementById('app'), {
  products: [
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 14.99 },
    { id: 3, name: 'Doohickey', price: 19.99 }
  ],
  cart: [],

  get total() {
    return this.cart.reduce((sum, item) => sum + item.price, 0).toFixed(2);
  },

  addToCart(product) {
    this.cart.push({ ...product });
  },

  removeFromCart(item) {
    const index = this.cart.indexOf(item);
    if (index > -1) {
      this.cart.splice(index, 1);
    }
  }
});
</script>
```

---

## More Patterns

For more examples, check out:
- The `playground/` folder in the Velin repository
- The `benchmarks/` folder for comparison implementations
- Community examples (link TBD)
