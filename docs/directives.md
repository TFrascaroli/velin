# Directives Guide

Complete reference for all built-in Velin directives.

## What are Directives?

Directives are special HTML attributes that start with `vln-`. They tell Velin how to reactively update the DOM based on your application state.

All directive values are **JavaScript expressions** evaluated in the context of your state (accessed via `vln`).

> ⚠ **Eager-touch your deps.** Velin captures an expression's reactive
> dependencies exactly once, on the initial track pass. Anything a
> ternary or short-circuit skips on that first run is **not** tracked,
> and later changes to it won't trigger updates. If your expression
> reads a value conditionally, hoist it to a state property getter
> that touches every dep up front. See
> [ADR-0003](./adr/0003-one-shot-dependency-capture.md).

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
<div vln-if="isLoggedIn">Welcome back!</div>
<div vln-if="!isLoggedIn">Please log in</div>
<div vln-if="count > 0">You have items</div>
```

**Mechanism:**
- If expression is truthy: element is displayed (`style.display = ""`)
- If expression is falsy: element is hidden (`style.display = "none"`)
- Element remains in the DOM.

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

**With Index:**

Inside a loop, you can access `$index` (0-based):

```html
<ul>
  <li vln-loop:item="items">
    <span vln-text="$index + 1"></span>: <span vln-text="item"></span>
  </li>
</ul>
```

**Notes:**
- The loop variable is scoped to that element and its children.
- `$index` is automatically provided.
- Reactive: adding/removing array items updates the DOM.

## Aliasing

### `vln-use:alias`

Creates a scoped alias for a property in the state. The alias is available to the element and its children and behaves like a reference to the original expression (reads and writes affect the underlying state).

**Syntax:** `vln-use:alias="expression"`

**Example:**
```html
<div vln-use:user="generalState.identity.local.currentUser">
  <h1 vln-text="user.name"></h1>
  <p vln-text="user.email"></p>
</div>
```

**Notes:**
- The alias (`user` in the example) is scoped to the element and its descendants.
- The alias points to the evaluated expression (`generalState.identity.local.currentUser`) — reading or writing through the alias updates the original value.
- Useful for creating short, context-specific names for deeply nested properties or avoiding naming collisions.


## Side-Effects

### `vln-watch`

Monitors an expression and calls a method in your state whenever it changes.

**Syntax:** `vln-watch:handlerpath="expression"`

**Example:**
```html
<script>
const vln = Velin.bind(root, {
  count: 0,
  logchange(newVal) {
    console.log('Count changed to:', newVal);
  }
});
</script>

<div vln-watch:logchange="count"></div>
<button vln-on:click="count++">Increment</button>
```

**Mechanism:**
- The **attribute value** is the expression whose dependencies are tracked.
- The **subkey** is the handler path, resolved against state (supports dotted paths like `handlers.onchange`).
- When any dependency of the expression changes, the handler is called with the newly evaluated value.
- The handler is also called once on initial bind with the initial value.
- ⚠ HTML parsers lowercase attribute names, so the subkey is always lowercase in the DOM. Use lowercase handler paths in state (`logchange`, not `logChange`).
- For debouncing or throttling, wrap your state method in plain JS.

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

## Routing

These directives are available in the optional `velin-router.js` module.
The router is hash-based (`location.hash`) and state-driven — there is no
separate route definition step.

### `vln-router`

Bootstraps a routing state object on the bound state at the given key, wires
up `hashchange`, and scopes everything inside the element as the active
router scope.

**Syntax:** `vln-router="stateKey"`

The plugin creates (or augments) `state[stateKey]` with:

```js
{
  path: string,     // current hash, e.g. '/users/42'
  params: object,   // populated by vln-route matches
  query: object,    // parsed location.search
  error: any|null,
  loading: boolean,
  navigateTo(path)  // sets location.hash = path
}
```

**Example:**
```html
<div vln-router="myRoute">
  <!-- vln-route directives inside use myRoute.path -->
  <a vln-on:click="myRoute.navigateTo('/')">Home</a>
  <a vln-on:click="myRoute.navigateTo('/about')">About</a>
</div>
```

### `vln-route`

Conditionally renders its element when the active router's `path` matches the
given pattern. Patterns support `:param` placeholders.

**Syntax:** `vln-route="'/pattern'"`

**Example:**
```html
<div vln-router="myRoute">
  <div vln-route="'/'">Home page</div>
  <div vln-route="'/users/:id'">
    User profile (id available in $__route.params once matched)
  </div>
</div>
```

**Notes:**
- The element is removed from the DOM when the route doesn't match (not just
  hidden) and re-cloned on match.
- Must be a descendant of a `vln-router` element.

### `vln-router-scroll`

Resets scroll position on the element it sits on every time the referenced
router's `path` changes. Put it on whichever element actually owns the scroll
for your layout — the `<html>` element for a normal page, or an inner scroll
container (e.g. `<main>` with `overflow: auto`) for app shells.

**Syntax:** `vln-router-scroll="stateKey"` — where `stateKey` is the same key
you passed to `vln-router`.

**Example:**
```html
<html vln-router-scroll="myRoute">
  <body>
    <nav>...</nav>
    <div vln-router="myRoute">
      <div vln-route="'/'">...</div>
      <div vln-route="'/about'">...</div>
    </div>
  </body>
</html>
```

**Notes:**
- Fires only when `path` actually changes, so reactive re-renders on the same
  route don't move the viewport.
- Does not fire on initial mount.
- Uses `scrollTo(0, 0)` when available, falls back to setting `scrollTop`/
  `scrollLeft`. For `<html>` / `<body>` targets it delegates to
  `window.scrollTo(0, 0)`.
- Not tied to nesting — the directive doesn't have to be an ancestor or
  descendant of the router, only in the same reactive scope so the router's
  state key resolves.

## Event Orchestration

These plugins are available in the optional `velin-events.js` module.

### `vln-evt-alias`

Listens for an existing DOM event and re-dispatches it as a new event name. Useful for mapping internal component events to parent expectations.

**Syntax:** `vln-evt-alias:newName="'sourceEvent'"`

**Example:**
```html
<!-- Listen for 'success' from a lib and fire it as 'saved' -->
<div vln-evt-alias:saved="'success'"></div>
```

### `vln-evt-contain`

Stops the propagation of specified events at the capture phase.

**Syntax:** `vln-evt-contain="expression"` where the expression evaluates to
either a single event name (string) or an array of event names.

**Examples:**
```html
<!-- Single event -->
<div class="modal" vln-evt-contain="'click'"></div>

<!-- Multiple events -->
<div class="modal" vln-evt-contain="['click', 'keypress']"></div>

<!-- Reactive: bind to state -->
<div class="modal" vln-evt-contain="containedEvents"></div>
```

The expression is tracked reactively — change the bound value and listeners
are rewired automatically.

---

## See Also

- **[Getting Started](./getting-started.md)** - Learn the basics and see common patterns
- **[Interactive Examples](../playground/index.html)** - See these directives in action
- **[API Reference](./api-reference.md)** - JavaScript API for working with directives programmatically
- **[Creating Plugins](./plugins.md)** - Create your own custom directives
- **[Documentation Hub](./README.md)** - Navigate all Velin documentation
