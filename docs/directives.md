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
<span vln-text="vln.username"></span>

<!-- String literal -->
<h1 vln-text="'Hello World'"></h1>

<!-- String concatenation -->
<p vln-text="'Hello, ' + vln.name + '!'"></p>

<!-- Template literal -->
<div vln-text="`Welcome ${vln.name}`"></div>

<!-- Expressions -->
<div vln-text="vln.count * 2"></div>
<div vln-text="vln.items.length + ' items'"></div>

<!-- Ternary operator -->
<span vln-text="vln.isActive ? 'Active' : 'Inactive'"></span>

<!-- Function calls -->
<time vln-text="vln.formatDate(vln.timestamp)"></time>
```

**Notes:**
- Replaces all text content of the element
- Automatically escapes HTML (safe from XSS)
- Updates automatically when dependencies change

## Form Bindings

### `vln-input`

Creates two-way data binding with form elements.

**Syntax:** `vln-input="vln.propertyPath"`

**Text Inputs:**
```html
<input vln-input="vln.name" />
<input vln-input="vln.email" type="email" />
<textarea vln-input="vln.message"></textarea>
```

**Checkboxes:**
```html
<!-- Single checkbox (boolean) -->
<input type="checkbox" vln-input="vln.agreed" />

<!-- Radio buttons -->
<input type="radio" name="size" value="small" vln-input="vln.size" />
<input type="radio" name="size" value="medium" vln-input="vln.size" />
<input type="radio" name="size" value="large" vln-input="vln.size" />
```

**Select Dropdowns:**
```html
<select vln-input="vln.country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
  <option value="ca">Canada</option>
</select>
```

**ContentEditable:**
```html
<div contenteditable vln-input="vln.content"></div>
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

<input vln-input="vln.name" placeholder="Name" />
<p>Hello, <span vln-text="vln.name"></span>!</p>

<label>
  <input type="checkbox" vln-input="vln.agreed" />
  I agree to terms
</label>
<p vln-text="vln.agreed ? 'Thank you!' : 'Please agree to continue'"></p>
```

## Conditional Rendering

### `vln-if`

Shows or hides an element based on a condition.

**Syntax:** `vln-if="expression"`

**Examples:**
```html
<!-- Simple boolean -->
<div vln-if="vln.isLoggedIn">Welcome back!</div>

<!-- Negation -->
<div vln-if="!vln.isLoggedIn">Please log in</div>

<!-- Comparison -->
<div vln-if="vln.count > 0">You have items</div>
<div vln-if="vln.status === 'error'">An error occurred</div>

<!-- Logical operators -->
<div vln-if="vln.isAdmin && vln.canEdit">Edit mode</div>
<div vln-if="vln.isLoading || vln.isSaving">Please wait...</div>

<!-- Truthy/falsy -->
<div vln-if="vln.errorMessage">Error: <span vln-text="vln.errorMessage"></span></div>
```

**How it works:**
- If expression is truthy: element is displayed (`style.display = ""`)
- If expression is falsy: element is hidden (`style.display = "none"`)
- Element remains in DOM, just hidden via CSS

**Else Pattern:**
```html
<div vln-if="vln.isLoggedIn">
  Logged in content
</div>
<div vln-if="!vln.isLoggedIn">
  Logged out content
</div>
```

## Lists

### `vln-loop`

Repeats an element for each item in an array.

**Syntax:** `vln-loop:variableName="vln.arrayExpression"`

**Basic Example:**
```html
<ul>
  <li vln-loop:item="vln.items" vln-text="vln.item"></li>
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

<div vln-loop:user="vln.users">
  <h3 vln-text="vln.user.name"></h3>
  <p vln-text="vln.user.email"></p>
</div>
```

**Complex Content:**
```html
<table>
  <tbody>
    <tr vln-loop:product="vln.products">
      <td vln-text="vln.product.name"></td>
      <td vln-text="'$' + vln.product.price"></td>
      <td>
        <button vln-on:click="vln.addToCart(vln.product)">Add to Cart</button>
      </td>
    </tr>
  </tbody>
</table>
```

**Nested Loops:**
```html
<div vln-loop:category="vln.categories">
  <h2 vln-text="vln.category.name"></h2>
  <ul>
    <li vln-loop:item="vln.category.items" vln-text="vln.item.name"></li>
  </ul>
</div>
```

**With Index (using array methods):**
```html
<script>
const vln = Velin.bind(root, {
  items: ['Apple', 'Banana', 'Cherry'],

  get itemsWithIndex() {
    return this.items.map((item, index) => ({ item, index }));
  }
});
</script>

<div vln-loop:obj="vln.itemsWithIndex">
  <span vln-text="vln.obj.index + 1"></span>: <span vln-text="vln.obj.item"></span>
</div>
```

**Notes:**
- Variable name can be anything: `vln-loop:item`, `vln-loop:user`, `vln-loop:todo`, etc.
- Array must be accessed via `vln.` prefix
- The loop variable is scoped to that element and its children
- Reactive: adding/removing array items updates the DOM automatically

## Event Handling

### `vln-on:event`

Attaches event listeners to elements.

**Syntax:** `vln-on:eventName="expression"`

**Common Events:**
```html
<!-- Click -->
<button vln-on:click="vln.handleClick()">Click me</button>

<!-- Submit -->
<form vln-on:submit="vln.handleSubmit()">
  <button type="submit">Submit</button>
</form>

<!-- Input/Change -->
<input vln-on:input="vln.handleInput()" />
<select vln-on:change="vln.handleChange()"></select>

<!-- Keyboard -->
<input vln-on:keyup="vln.handleKeyUp()" />
<input vln-on:keydown="vln.handleKeyDown()" />

<!-- Mouse -->
<div vln-on:mouseenter="vln.isHovering = true"
     vln-on:mouseleave="vln.isHovering = false">
  Hover me
</div>

<!-- Focus -->
<input vln-on:focus="vln.isFocused = true"
       vln-on:blur="vln.isFocused = false" />
```

**Inline Expressions:**
```html
<!-- Increment counter -->
<button vln-on:click="vln.count++">Increment</button>

<!-- Set value -->
<button vln-on:click="vln.status = 'active'">Activate</button>

<!-- Call method -->
<button vln-on:click="vln.save()">Save</button>

<!-- Multiple statements -->
<button vln-on:click="vln.save(); vln.close()">Save & Close</button>
```

**Prevent Default:**
```html
<form vln-on:submit="event.preventDefault(); vln.handleSubmit()">
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
<input vln-on:keyup="vln.lastKey = event.key" />
<div vln-text="'Last key: ' + vln.lastKey"></div>
```

## Attributes

### `vln-attr:name`

Sets HTML attributes dynamically.

**Syntax:** `vln-attr:attributeName="expression"`

**Examples:**
```html
<!-- href -->
<a vln-attr:href="'/users/' + vln.userId">View Profile</a>
<a vln-attr:href="'mailto:' + vln.email" vln-text="vln.email"></a>

<!-- src -->
<img vln-attr:src="vln.imageUrl" vln-attr:alt="vln.imageDescription" />

<!-- disabled -->
<button vln-attr:disabled="!vln.isValid">Submit</button>
<input vln-attr:disabled="vln.isLoading" />

<!-- title (tooltip) -->
<span vln-attr:title="vln.helpText">❓</span>

<!-- data attributes -->
<div vln-attr:data-id="vln.userId" vln-attr:data-role="vln.role"></div>

<!-- Multiple attributes -->
<input
  vln-attr:placeholder="vln.placeholderText"
  vln-attr:maxlength="vln.maxLength"
  vln-attr:required="vln.isRequired" />
```

**Boolean Attributes:**
```html
<!-- For boolean attributes, use truthy/falsy -->
<input vln-attr:disabled="vln.isDisabled" />
<input vln-attr:readonly="vln.isReadonly" />
<details vln-attr:open="vln.isOpen"></details>
```

**Removing Attributes:**
```html
<!-- Set to null or undefined to remove -->
<div vln-attr:title="vln.tooltip || null"></div>
```

## Styling

### `vln-class`

Dynamically adds/removes CSS classes.

**Syntax:** `vln-class="expression"`

**String (single class):**
```html
<div vln-class="vln.theme"></div>
<!-- If vln.theme = 'dark', adds class="dark" -->
```

**Object (multiple conditional classes):**
```html
<div vln-class="{ active: vln.isActive, disabled: !vln.isEnabled, error: vln.hasError }"></div>

<!-- If isActive=true, isEnabled=false, hasError=true, renders:
     class="active disabled error"
-->
```

**Expression:**
```html
<!-- Ternary -->
<div vln-class="vln.isActive ? 'text-green' : 'text-red'"></div>

<!-- Computed -->
<div vln-class="vln.status === 'error' ? 'alert-danger' : 'alert-success'"></div>
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

<div vln-class="{ active: vln.isActive, disabled: !vln.isEnabled, error: vln.hasError }"
     class="base-class">
  Status indicator
</div>
```

**Combining with static classes:**
```html
<!-- Static classes stay, reactive classes are added/removed -->
<div class="container" vln-class="{ 'dark-mode': vln.isDark }"></div>
```

## Advanced Usage

### Combining Directives

You can use multiple directives on the same element:

```html
<button
  vln-text="vln.loading ? 'Loading...' : 'Submit'"
  vln-attr:disabled="vln.loading"
  vln-class="{ 'btn-primary': !vln.loading, 'btn-disabled': vln.loading }"
  vln-on:click="vln.handleSubmit()">
</button>
```

### Expressions Can Be Complex

```html
<!-- Array methods -->
<div vln-text="vln.items.filter(i => i.active).length + ' active'"></div>

<!-- Object methods -->
<div vln-text="Object.keys(vln.data).join(', ')"></div>

<!-- Inline functions -->
<div vln-text="((x) => x * 2)(vln.count)"></div>

<!-- JSON -->
<pre vln-text="JSON.stringify(vln.data, null, 2)"></pre>
```

### Access Global Functions

You can access global functions and browser APIs:

```html
<!-- Math -->
<div vln-text="Math.round(vln.price * 1.15)"></div>

<!-- Date -->
<div vln-text="new Date().toLocaleDateString()"></div>

<!-- encodeURIComponent -->
<a vln-attr:href="'/search?q=' + encodeURIComponent(vln.query)">Search</a>
```

## Best Practices

### 1. Keep expressions simple

**Good:**
```html
<div vln-text="vln.fullName"></div>
```

```javascript
get fullName() {
  return this.firstName + ' ' + this.lastName;
}
```

**Avoid:**
```html
<div vln-text="vln.firstName + ' ' + vln.lastName"></div>
```

### 2. Use methods for complex logic

**Good:**
```html
<button vln-on:click="vln.handleSubmit()">Submit</button>
```

**Avoid:**
```html
<button vln-on:click="vln.loading = true; fetch('/api').then(r => r.json()).then(d => { vln.data = d; vln.loading = false; })">
```

### 3. Use getters for computed values

**Good:**
```javascript
get filteredItems() {
  return this.items.filter(i => i.active);
}
```

```html
<div vln-loop:item="vln.filteredItems">...</div>
```

### 4. Prefix all state access with `vln.`

**Good:**
```html
<div vln-text="vln.name"></div>
```

**Wrong:**
```html
<div vln-text="name"></div> <!-- Will throw error -->
```
