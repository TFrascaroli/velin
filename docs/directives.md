# Directives Guide

Complete reference for all built-in Velin directives.

## What are Directives?

Directives are special HTML attributes that start with `vln-`. They tell Velin how to reactively update the DOM based on your application state.

All directive values are **JavaScript expressions** evaluated in the context of your state (accessed via `vln`).

## Text and Content

### `vln-text`

Sets the text content of an element.

**Syntax:** `vln-text="expression"`

**Examples:**
```html
<!-- Simple variable -->
<span vln-text="username"></span>

<!-- String literal -->
<h1 vln-text="'Hello World'"></h1>

<!-- String concatenation -->
<p vln-text="'Hello, ' + name + '!'"></p>

<!-- Template literal -->
<div vln-text="`Welcome ${name}`"></div>

<!-- Expressions -->
<div vln-text="count * 2"></div>
<div vln-text="items.length + ' items'"></div>

<!-- Ternary operator -->
<span vln-text="isActive ? 'Active' : 'Inactive'"></span>

<!-- Function calls -->
<time vln-text="formatDate(timestamp)"></time>
```

**Notes:**
- Replaces all text content of the element
- Automatically escapes HTML (safe from XSS)
- Updates automatically when dependencies change

## Form Bindings

### `vln-input`

Creates two-way data binding with form elements.

**Syntax:** `vln-input="propertyPath"`

**Text Inputs:**
```html
<input vln-input="name" />
<input vln-input="email" type="email" />
<textarea vln-input="message"></textarea>
```

**Checkboxes:**
```html
<!-- Single checkbox (boolean) -->
<input type="checkbox" vln-input="agreed" />

<!-- Radio buttons -->
<input type="radio" name="size" value="small" vln-input="size" />
<input type="radio" name="size" value="medium" vln-input="size" />
<input type="radio" name="size" value="large" vln-input="size" />
```

**Select Dropdowns:**
```html
<select vln-input="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
  <option value="ca">Canada</option>
</select>
```

**ContentEditable:**
```html
<div contenteditable vln-input="content"></div>
```

**Complete Example:**
```html
<script>
const vln = Velin.bind(root, {
  name: '',
  agreed: false,
  size: 'medium',
  country: 'us',
  content: 'Edit me!'
});
</script>

<input vln-input="name" placeholder="Name" />
<p>Hello, <span vln-text="name"></span>!</p>

<label>
  <input type="checkbox" vln-input="agreed" />
  I agree to terms
</label>
<p vln-text="agreed ? 'Thank you!' : 'Please agree to continue'"></p>
```

## Conditional Rendering

### `vln-if`

Shows or hides an element based on a condition.

**Syntax:** `vln-if="expression"`

**Examples:**
```html
<!-- Simple boolean -->
<div vln-if="isLoggedIn">Welcome back!</div>

<!-- Negation -->
<div vln-if="!isLoggedIn">Please log in</div>

<!-- Comparison -->
<div vln-if="count > 0">You have items</div>
<div vln-if="status === 'error'">An error occurred</div>

<!-- Logical operators -->
<div vln-if="isAdmin && canEdit">Edit mode</div>
<div vln-if="isLoading || isSaving">Please wait...</div>

<!-- Truthy/falsy -->
<div vln-if="errorMessage">Error: <span vln-text="errorMessage"></span></div>
```

**How it works:**
- If expression is truthy: element is displayed (`style.display = ""`)
- If expression is falsy: element is hidden (`style.display = "none"`)
- Element remains in DOM, just hidden via CSS

**Else Pattern:**
```html
<div vln-if="isLoggedIn">
  Logged in content
</div>
<div vln-if="!isLoggedIn">
  Logged out content
</div>
```

## Lists

### `vln-loop`

Repeats an element for each item in an array.

**Syntax:** `vln-loop:varName="arrayExpression"`

**Basic Example:**
```html
<ul>
  <li vln-loop:item="items" vln-text="item"></li>
</ul>
```

**With Object Items:**
```html
<script>
const vln = Velin.bind(root, {
  users: [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
  ]
});
</script>

<div vln-loop:user="users">
  <h3 vln-text="user.name"></h3>
  <p vln-text="user.email"></p>
</div>
```

**Complex Content:**
```html
<table>
  <tbody>
    <tr vln-loop:product="products">
      <td vln-text="product.name"></td>
      <td vln-text="'$' + product.price"></td>
      <td>
        <button vln-on:click="addToCart(product)">Add to Cart</button>
      </td>
    </tr>
  </tbody>
</table>
```

**Nested Loops:**
```html
<div vln-loop:category="categories">
  <h2 vln-text="category.name"></h2>
  <ul>
    <li vln-loop:item="category.items" vln-text="item.name"></li>
  </ul>
</div>
```

**With Index:**

Inside a loop, you can access the special `$index` variable which contains the current iteration index (0-based):

```html
<ul>
  <li vln-loop:item="items">
    <span vln-text="$index + 1"></span>: <span vln-text="item"></span>
  </li>
</ul>
```

**Using Index in Event Handlers:**
```html
<button vln-loop:item="items" vln-on:click="removeAt($index)">
  Remove <span vln-text="item"></span>
</button>
```

**Using Index for Styling:**
```html
<div vln-loop:item="items" vln-class="$index % 2 === 0 ? 'even' : 'odd'">
  <span vln-text="item"></span>
</div>
```

**Notes:**
- Variable name can be anything: `vln-loop:item`, `vln-loop:user`, `vln-loop:todo`, etc.
- The loop variable is scoped to that element and its children
- `$index` is automatically available in all loop iterations (0-based)
- Each nested loop has its own `$index` variable
- Reactive: adding/removing array items updates the DOM automatically

## Event Handling

### `vln-on:event`

Attaches event listeners to elements.

**Syntax:** `vln-on:eventName="expression"`

**Common Events:**
```html
<!-- Click -->
<button vln-on:click="handleClick()">Click me</button>

<!-- Submit -->
<form vln-on:submit="handleSubmit()">
  <button type="submit">Submit</button>
</form>

<!-- Input/Change -->
<input vln-on:input="handleInput()" />
<select vln-on:change="handleChange()"></select>

<!-- Keyboard -->
<input vln-on:keyup="handleKeyUp()" />
<input vln-on:keydown="handleKeyDown()" />

<!-- Mouse -->
<div vln-on:mouseenter="isHovering = true"
     vln-on:mouseleave="isHovering = false">
  Hover me
</div>

<!-- Focus -->
<input vln-on:focus="isFocused = true"
       vln-on:blur="isFocused = false" />
```

**Inline Expressions:**
```html
<!-- Increment counter -->
<button vln-on:click="count++">Increment</button>

<!-- Set value -->
<button vln-on:click="status = 'active'">Activate</button>

<!-- Call method -->
<button vln-on:click="save()">Save</button>

<!-- Multiple statements -->
<button vln-on:click="save(); close()">Save & Close</button>
```

**Prevent Default:**
```html
<form vln-on:submit="event.preventDefault(); handleSubmit()">
  <!-- form fields -->
  <button type="submit">Submit</button>
</form>

<!-- Or in the method -->
<script>
const vln = Velin.bind(root, {
  handleSubmit(event) {
    event.preventDefault();
    // handle submission
  }
});
</script>
```

**Accessing Event Object:**
```html
<input vln-on:keydown="lastKey = event.key" />
<div vln-text="'Last key: ' + lastKey"></div>
```

## Attributes

### `vln-attr:name`

Sets HTML attributes dynamically.

**Syntax:** `vln-attr:attributeName="expression"`

**Examples:**
```html
<!-- href -->
<a vln-attr:href="'/users/' + userId">View Profile</a>
<a vln-attr:href="'mailto:' + email" vln-text="email"></a>

<!-- src -->
<img vln-attr:src="imageUrl" vln-attr:alt="imageDescription" />

<!-- disabled -->
<button vln-attr:disabled="!isValid">Submit</button>
<input vln-attr:disabled="isLoading" />

<!-- title (tooltip) -->
<span vln-attr:title="helpText">❓</span>

<!-- data attributes -->
<div vln-attr:data-id="userId" vln-attr:data-role="role"></div>

<!-- Multiple attributes -->
<input
  vln-attr:placeholder="placeholderText"
  vln-attr:maxlength="maxLength"
  vln-attr:required="isRequired" />
```

**Boolean Attributes:**
```html
<!-- For boolean attributes, use truthy/falsy -->
<input vln-attr:disabled="isDisabled" />
<input vln-attr:readonly="isReadonly" />
<details vln-attr:open="isOpen"></details>
```

**Removing Attributes:**
```html
<!-- Set to null or undefined to remove -->
<div vln-attr:title="tooltip || null"></div>
```

## Styling

### `vln-class`

Dynamically adds/removes CSS classes.

**Syntax:** `vln-class="expression"`

**String (single class):**
```html
<div vln-class="theme"></div>
<!-- If vln.theme = 'dark', adds class="dark" -->
```

**Object (multiple conditional classes):**
```html
<div vln-class="{ active: isActive, disabled: !isEnabled, error: hasError }"></div>

<!-- If isActive=true, isEnabled=false, hasError=true, renders:
     class="active disabled error"
-->
```

**Expression:**
```html
<!-- Ternary -->
<div vln-class="isActive ? 'text-green' : 'text-red'"></div>

<!-- Computed -->
<div vln-class="status === 'error' ? 'alert-danger' : 'alert-success'"></div>
```

**Complete Example:**
```html
<style>
.active { background: green; color: white; }
.disabled { opacity: 0.5; pointer-events: none; }
.error { border: 2px solid red; }
</style>

<script>
const vln = Velin.bind(root, {
  isActive: true,
  isEnabled: true,
  hasError: false
});
</script>

<div vln-class="{ active: isActive, disabled: !isEnabled, error: hasError }"
     class="base-class">
  Status indicator
</div>
```

**Combining with static classes:**
```html
<!-- Static classes stay, reactive classes are added/removed -->
<div class="container" vln-class="{ 'dark-mode': isDark }"></div>
```

## Advanced Usage

### Combining Directives

You can use multiple directives on the same element:

```html
<button
  vln-text="loading ? 'Loading...' : 'Submit'"
  vln-attr:disabled="loading"
  vln-class="{ 'btn-primary': !loading, 'btn-disabled': loading }"
  vln-on:click="handleSubmit()">
</button>
```

### Expressions Can Be Complex

```html
<!-- Array methods -->
<div vln-text="items.filter(i => i.active).length + ' active'"></div>

<!-- Object methods -->
<div vln-text="Object.keys(data).join(', ')"></div>

<!-- Inline functions -->
<div vln-text="((x) => x * 2)(count)"></div>

<!-- JSON -->
<pre vln-text="JSON.stringify(data, null, 2)"></pre>
```

### Access Global Functions

You can access global functions and browser APIs:

```html
<!-- Math -->
<div vln-text="Math.round(price * 1.15)"></div>

<!-- Date -->
<div vln-text="new Date().toLocaleDateString()"></div>

<!-- encodeURIComponent -->
<a vln-attr:href="'/search?q=' + encodeURIComponent(query)">Search</a>
```

## Best Practices

### 1. Keep expressions simple

**Good:**
```html
<div vln-text="fullName"></div>
```

```javascript
get fullName() {
  return this.firstName + ' ' + this.lastName;
}
```

**Avoid:**
```html
<div vln-text="firstName + ' ' + lastName"></div>
```

### 2. Use methods for complex logic

**Good:**
```html
<button vln-on:click="handleSubmit()">Submit</button>
```

**Avoid:**
```html
<button vln-on:click="loading = true; fetch('/api').then(r => r.json()).then(d => { vln.data = d; vln.loading = false; })">
```

### 3. Use getters for computed values

**Good:**
```javascript
get filteredItems() {
  return this.items.filter(i => i.active);
}
```

```html
<div vln-loop:item="filteredItems">...</div>
```

---

## See Also

- **[Getting Started](./getting-started.md)** - Learn the basics and see common patterns
- **[Interactive Examples](../playground/examples.html)** - See these directives in action
- **[API Reference](./api-reference.md)** - JavaScript API for working with directives programmatically
- **[Creating Plugins](./plugins.md)** - Create your own custom directives
- **[Documentation Hub](./README.md)** - Navigate all Velin documentation
