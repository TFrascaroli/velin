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
  <script src="https://unpkg.com/velin/dist/velin-all.min.js"></script>
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

    <form vln-on:submit="event.preventDefault(); vln.handleSubmit()">
      <div class="field">
        <label>Email</label>
        <input
          vln-input="vln.email"
          vln-class="{ invalid: vln.touched.email && !vln.isEmailValid }"
          vln-on:blur="vln.touched.email = true"
          type="email"
        />
        <div vln-if="vln.touched.email && !vln.isEmailValid" class="error">
          Please enter a valid email address
        </div>
      </div>

      <div class="field">
        <label>Password</label>
        <input
          vln-input="vln.password"
          vln-class="{ invalid: vln.touched.password && !vln.isPasswordValid }"
          vln-on:blur="vln.touched.password = true"
          type="password"
        />
        <div vln-if="vln.touched.password && !vln.isPasswordValid" class="error">
          Password must be at least 8 characters
        </div>
      </div>

      <div class="field">
        <label>
          <input type="checkbox" vln-input="vln.agreed" />
          I agree to the terms and conditions
        </label>
        <div vln-if="vln.touched.agreed && !vln.agreed" class="error">
          You must agree to the terms
        </div>
      </div>

      <button
        type="submit"
        vln-attr:disabled="!vln.canSubmit || vln.loading">
        <span vln-if="!vln.loading">Sign Up</span>
        <span vln-if="vln.loading">Creating account...</span>
      </button>

      <div vln-if="vln.success" class="success">
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
  <form vln-on:submit="event.preventDefault(); vln.addTask()">
    <input vln-input="vln.newTask" placeholder="New task..." />
    <button type="submit">Add</button>
  </form>

  <!-- Read / Update / Delete -->
  <ul>
    <li vln-loop:task="vln.tasks">
      <div vln-if="vln.editingId !== vln.task.id">
        <input type="checkbox" vln-input="vln.task.done" />
        <span vln-text="vln.task.text"></span>
        <button vln-on:click="vln.startEdit(vln.task)">Edit</button>
        <button vln-on:click="vln.deleteTask(vln.task.id)">Delete</button>
      </div>

      <div vln-if="vln.editingId === vln.task.id">
        <input vln-input="vln.editText" />
        <button vln-on:click="vln.saveEdit(vln.task)">Save</button>
        <button vln-on:click="vln.cancelEdit()">Cancel</button>
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
    vln-input="vln.search"
    placeholder="Search users..."
    type="search"
  />

  <div>
    Showing <strong vln-text="vln.filteredUsers.length"></strong>
    of <strong vln-text="vln.users.length"></strong> users
  </div>

  <ul>
    <li vln-loop:user="vln.filteredUsers">
      <strong vln-text="vln.user.name"></strong>
      - <span vln-text="vln.user.email"></span>
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
  <button vln-on:click="vln.openModal()">Open Modal</button>

  <div
    vln-if="vln.isModalOpen"
    class="modal-overlay"
    vln-on:click="vln.closeModal()">
    <div class="modal-content" vln-on:click="event.stopPropagation()">
      <h2>Modal Title</h2>
      <p vln-text="vln.modalMessage"></p>
      <button vln-on:click="vln.closeModal()">Close</button>
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
      vln-loop:tab="vln.tabs"
      vln-text="vln.tab"
      vln-class="{ active: vln.activeTab === vln.tab }"
      vln-on:click="vln.activeTab = vln.tab">
    </button>
  </div>

  <div class="tab-content">
    <div vln-if="vln.activeTab === 'Home'">
      <h2>Home</h2>
      <p>Welcome to the home tab!</p>
    </div>

    <div vln-if="vln.activeTab === 'Profile'">
      <h2>Profile</h2>
      <p>Your profile information goes here.</p>
    </div>

    <div vln-if="vln.activeTab === 'Settings'">
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
  <div vln-loop:item="vln.items" class="accordion-item">
    <button
      vln-on:click="vln.toggle(vln.item.id)"
      class="accordion-header">
      <span vln-text="vln.item.title"></span>
      <span vln-text="vln.isOpen(vln.item.id) ? '−' : '+'"></span>
    </button>

    <div vln-if="vln.isOpen(vln.item.id)" class="accordion-content">
      <p vln-text="vln.item.content"></p>
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
  <input vln-input="vln.query" placeholder="Search..." />

  <div vln-if="vln.loading">Searching...</div>

  <ul vln-if="!vln.loading && vln.results.length">
    <li vln-loop:result="vln.results" vln-text="vln.result.name"></li>
  </ul>

  <div vln-if="!vln.loading && vln.query && !vln.results.length">
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
  if (vln.query !== lastQuery) {
    lastQuery = vln.query;

    if (vln.debounceTimer) {
      clearTimeout(vln.debounceTimer);
    }

    vln.debounceTimer = setTimeout(() => {
      vln.search();
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
    <div vln-loop:product="vln.products" class="product">
      <h3 vln-text="vln.product.name"></h3>
      <p vln-text="'$' + vln.product.price"></p>
      <button vln-on:click="vln.addToCart(vln.product)">Add to Cart</button>
    </div>
  </div>

  <div class="cart">
    <h2>Cart (<span vln-text="vln.cart.length"></span>)</h2>

    <div vln-if="vln.cart.length">
      <div vln-loop:item="vln.cart">
        <span vln-text="vln.item.name"></span>
        - $<span vln-text="vln.item.price"></span>
        <button vln-on:click="vln.removeFromCart(vln.item)">Remove</button>
      </div>

      <div>
        <strong>Total: $<span vln-text="vln.total"></span></strong>
      </div>
    </div>

    <div vln-if="!vln.cart.length">
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
