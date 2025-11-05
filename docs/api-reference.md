# API Reference

Complete API documentation for Velin.

---

## Basic APIs

For everyday use when building applications with Velin.

### `Velin.bind(root, initialState)`

Binds a reactive state to a DOM element and its children.

**Parameters:**
- `root` (Element | DocumentFragment, optional): The root element to bind. Defaults to `document.body`.
- `initialState` (Object, optional): Initial state object. Defaults to `{}`.

**Returns:** Reactive proxy of the state

**Example:**
```javascript
const vln = Velin.bind(document.getElementById('app'), {
  count: 0,
  name: 'Alice'
});

// Later, update state
vln.count++;
vln.name = 'Bob';
```

### Reactive State

The object returned by `Velin.bind()` is a reactive proxy. Any property access or modification is tracked.

#### Supported Operations

**Reading:**
```javascript
const value = vln.property;
const nested = vln.user.name;
const item = vln.items[0];
```

**Writing:**
```javascript
vln.property = 'new value';
vln.user.name = 'Alice';
vln.items[0] = 'updated';
```

**Arrays:**
```javascript
vln.items.push('new');
vln.items.pop();
vln.items.splice(0, 1);
vln.items.sort();
vln.items.reverse();
```

**Objects:**
```javascript
vln.user = { name: 'Bob', age: 30 };
delete vln.config.someKey;
```

#### Computed Properties

Use JavaScript getters for computed values:

```javascript
const vln = Velin.bind(root, {
  firstName: 'John',
  lastName: 'Doe',

  get fullName() {
    return this.firstName + ' ' + this.lastName;
  }
});
```

Computed properties automatically track their dependencies and update when dependencies change.

#### Methods

Regular methods work as expected:

```javascript
const vln = Velin.bind(root, {
  count: 0,

  increment() {
    this.count++;
  },

  reset() {
    this.count = 0;
  }
});
```

```html
<button vln-on:click="increment()">+</button>
<button vln-on:click="reset()">Reset</button>
```

#### Async Methods

Async/await works naturally:

```javascript
const vln = Velin.bind(root, {
  data: null,
  loading: false,

  async fetchData() {
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

---

## Advanced APIs

For creating custom plugins and directives.

### `Velin.plugins`

Plugin manager object.

#### `Velin.plugins.registerPlugin(definition)`

Registers a custom plugin.

**Parameters:**
- `definition` (Object): Plugin definition
  - `name` (string): Plugin name (used in `vln-{name}` directives)
  - `priority` (number, optional): Plugin priority (higher = runs first)
  - `track` (Function, optional): Dependency tracking function
  - `render` (Function): Render function
  - `destroy` (Function, optional): Cleanup function

**Example:**
```javascript
Velin.plugins.registerPlugin({
  name: 'uppercase',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    node.textContent = String(tracked).toUpperCase();
  }
});
```

See [Creating Plugins](./plugins.md) for detailed information.

#### `Velin.plugins.get(name)`

Gets a registered plugin by name.

**Parameters:**
- `name` (string): Plugin name

**Returns:** Plugin definition or undefined

#### `Velin.plugins.priorities`

Standard plugin priority constants:

```javascript
{
  LATE: -1,        // Process last
  OVERRIDABLE: 10, // Can be overridden
  STOPPER: 50      // Stops processing children
}
```

### `Velin.trackers`

Helper functions for dependency tracking in custom plugins. These are the most commonly used tracking patterns.

#### `Velin.trackers.expressionTracker({ reactiveState, expr })`

Evaluates an expression and automatically tracks all reactive dependencies. This is used by most display directives like `vln-text`, `vln-if`, `vln-class`, and `vln-attr`.

**Parameters:**
- `reactiveState` (ReactiveState): The reactive state object
- `expr` (string): Expression to evaluate and track

**Returns:** Result of the expression

**How it works:** When the tracked expression is evaluated, Velin records which state properties it accessed. When any of those properties change, the plugin's `render` function is automatically called again with the new `tracked` value.

**Real example from `vln-text` plugin:**
```javascript
Velin.plugins.registerPlugin({
  name: 'text',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    node.textContent = tracked ?? '';
  }
});
```

**Real example from `vln-if` plugin:**
```javascript
Velin.plugins.registerPlugin({
  name: 'if',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    if (node instanceof HTMLElement)
      node.style.display = tracked ? '' : 'none';
  }
});
```

When you use `<div vln-text="firstName + ' ' + lastName"></div>`, the plugin will:
1. Evaluate the expression and track dependencies on `firstName` and `lastName`
2. Call `render` with the result
3. Automatically re-render whenever `firstName` or `lastName` changes

#### `Velin.trackers.setterTracker({ reactiveState, expr })`

Returns a setter function for an expression instead of evaluating it. This is rarely used - most plugins use `getSetter()` directly.

**Parameters:**
- `reactiveState` (ReactiveState): The reactive state object
- `expr` (string): Property path expression

**Returns:** Setter function

### `Velin.evaluate(reactiveState, expr, allowMutations)`

Evaluates a JavaScript expression in the context of the reactive state without tracking dependencies. This is used when you need to evaluate expressions that should trigger side effects, like event handlers or lifecycle hooks.

**Parameters:**
- `reactiveState` (ReactiveState): Internal reactive state object
- `expr` (string): JavaScript expression to evaluate
- `allowMutations` (boolean, optional): If true, allows function calls to mutate state. Defaults to false for read-only evaluation.

**Returns:** Result of the expression

**Key difference from trackers:** `evaluate()` doesn't set up dependency tracking or re-rendering. It's a one-time evaluation.

**Real example from `vln-on` plugin:**
```javascript
Velin.plugins.registerPlugin({
  name: 'on',
  render: ({ reactiveState, expr, node, subkey }) => {
    const handler = () => Velin.evaluate(reactiveState, expr, true);
    node.addEventListener(subkey, handler);
    return { state: { handler } };
  }
});
```

This allows `<button vln-on:click="count++">` to modify state when clicked.

**Real example from template lifecycle hooks:**
```javascript
// Execute onMount hook after template is inserted
if (lifecycle.onMount) {
  try {
    Velin.evaluate(innerState, lifecycle.onMount);
  } catch (err) {
    console.error('Error in onMount hook:', err);
  }
}
```

**When to use:**
- Event handlers that need to modify state
- Lifecycle hooks (onMount, onUnmount)
- One-time expression evaluation
- Side effects that shouldn't trigger re-renders

### `Velin.getSetter(reactiveState, expr)`

Returns a setter function for a property expression, bypassing the read-only evaluation restriction. This is essential for two-way binding plugins like `vln-input` that need to update state in response to user input.

**Parameters:**
- `reactiveState` (ReactiveState): Internal reactive state object
- `expr` (string): Property path expression (e.g., `'user.name'`, `'items[0]'`)

**Returns:** Function `(value) => void` that sets the property to the given value

**Why it exists:** During expression evaluation, Velin prevents direct property assignment to catch bugs. Setters provide a controlled way to update state from event handlers.

**Real example from `vln-input` plugin:**
```javascript
Velin.plugins.registerPlugin({
  name: 'input',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked, expr, reactiveState, pluginState = {} }) => {
    const setter = Velin.getSetter(reactiveState, expr);

    if (!pluginState.initialized) {
      // Set up event listener on first render
      node.addEventListener('input', (e) => {
        switch (e.target.type) {
          case 'checkbox':
            setter(e.target.checked);
            break;
          default:
            setter(e.target.value);
        }
      });
    }

    // Update DOM when state changes
    if (node.value !== tracked) {
      node.value = tracked;
    }

    return { state: { initialized: true } };
  }
});
```

Now `<input vln-input="email">` creates true two-way binding:
- Typing in the input calls `setter(e.target.value)` to update `state.email`
- Changing `state.email` in code triggers re-render to update the input's value

### `Velin.processNode(node, reactiveState)`

Processes a DOM node and all its children, applying all applicable Velin directives. This is used internally when initializing a Velin app, and in plugins that dynamically create new DOM elements.

**Parameters:**
- `node` (Node): DOM node to process
- `reactiveState` (ReactiveState): Reactive state to bind to

**Returns:** void

**How it works:**
1. Scans the node for all `vln-*` attributes
2. Finds matching registered plugins
3. Calls each plugin's `track` and `render` functions
4. Recursively processes all child nodes (unless a plugin returns `halt: true`)

**Example - Dynamically adding reactive elements:**
```javascript
// Add a new element and make it reactive
const newDiv = document.createElement('div');
newDiv.setAttribute('vln-text', 'message');
document.body.appendChild(newDiv);
Velin.processNode(newDiv, Velin.ø__internal.boundState.root);
```

**Real example from `vln-loop` plugin:**
```javascript
// After cloning template for each array item
for (let i = 0; i < tracked.length; i++) {
  const clone = template.cloneNode(true);
  const substate = Velin.composeState(reactiveState, interpolations);

  placeholder.parentNode.insertBefore(clone, lastInserted.nextSibling);
  Velin.processNode(clone, substate);  // Make the clone reactive
}
```

**Real example from `vln-fragment` plugin:**
```javascript
// After inserting template content
const innerState = Velin.composeState(reactiveState, interpolations);
Array.from(clone.childNodes).forEach(child => {
  node.appendChild(child);
  Velin.processNode(child, innerState);  // Process each child with scoped state
});
```

**Common use cases:**
- Plugins that clone templates (`vln-loop`, `vln-fragment`)
- Dynamically creating reactive elements in JavaScript
- Lazy-loading content that needs reactivity

---

## Danger Zone

For structure-altering plugins like `vln-loop` or `vln-fragment` that create scoped child states. These APIs manage the parent-child state hierarchy and are critical for preventing memory leaks.

### `Velin.composeState(reactiveState, interpolations)`

Creates a child reactive state that inherits from a parent state but adds new scoped variables (interpolations). This is how `vln-loop` creates the `item` variable and how `vln-fragment` creates template parameters.

**Parameters:**
- `reactiveState` (ReactiveState): Parent reactive state to inherit from
- `interpolations` (Map<string, string>): Map of variable names to expressions
  - Key: variable name (e.g., `'item'`, `'$index'`)
  - Value: expression in parent scope (e.g., `'items[0]'`, `'0'`)

**Returns:** New child reactive state with combined scope

**How it works:**
1. Creates a new reactive state that links to the parent
2. Adds interpolation mappings so expressions can access scoped variables
3. Tracks the parent-child relationship for cleanup
4. Child can access both its interpolations and parent's state

**Real example from `vln-loop` plugin:**
```javascript
// For each item in the array
for (let i = 0; i < tracked.length; i++) {
  const clone = template.cloneNode(true);

  // Create scoped state with 'item' and '$index' variables
  const interpolations = new Map();
  interpolations.set(subkey, `${expr}[${i}]`);     // item = todos[0]
  interpolations.set('$index', `${i}`);             // $index = 0

  const substate = Velin.composeState(reactiveState, interpolations);

  // Now expressions in this scope can use 'item' and '$index'
  placeholder.parentNode.insertBefore(clone, lastInserted.nextSibling);
  Velin.processNode(clone, substate);
}
```

When you write:
```html
<li vln-loop:todo="todos">
  <span vln-text="todo.text"></span>
  <span vln-text="$index + 1"></span>
</li>
```

Each `<li>` gets its own substate where:
- `todo` maps to `todos[0]`, `todos[1]`, etc.
- `$index` maps to `'0'`, `'1'`, etc.

**Real example from `vln-fragment` plugin:**
```javascript
// Build interpolations from vln-var:* attributes
const interpolations = new Map();
for (const [varName, varExpr] of Object.entries(tracked.varValues)) {
  interpolations.set(varName, varExpr);
}

// Create scoped state for template
const innerState = Velin.composeState(reactiveState, interpolations);

// Process template with scoped variables
Array.from(clone.childNodes).forEach(child => {
  node.appendChild(child);
  Velin.processNode(child, innerState);
});
```

### `Velin.cleanupState(parentState, innerState)`

Cleans up a child reactive state, removing all reactive bindings, calling finalizers, and breaking the parent-child link. **Critical for preventing memory leaks** when removing elements.

**Parameters:**
- `parentState` (ReactiveState): Parent reactive state
- `innerState` (ReactiveState): Child state to clean up

**Returns:** void

**What it cleans:**
1. Clears all interpolation mappings
2. Removes all dependency bindings (so property changes stop triggering re-renders)
3. Calls all registered finalizers (cleanup functions)
4. Recursively cleans up any nested child states
5. Removes the child from parent's tracking

**Real example from `vln-loop` destroy hook:**
```javascript
destroy: ({ pluginState, reactiveState }) => {
  const parent = pluginState?.placeholder?.parentNode;
  if (parent && pluginState) {
    // Clean up all child states
    if (pluginState.substates) {
      pluginState.substates.forEach((substate) => {
        if (substate) {
          Velin.cleanupState(reactiveState, substate);
        }
      });
    }

    // Remove DOM nodes
    if (pluginState.children) {
      pluginState.children.forEach((child) => parent.removeChild(child));
    }
  }
}
```

**Real example from `vln-fragment` destroy hook:**
```javascript
destroy: ({ node, pluginState, reactiveState }) => {
  // Call lifecycle hook before cleanup
  if (pluginState?.lifecycle?.onUnmount) {
    try {
      Velin.evaluate(pluginState.innerState, pluginState.lifecycle.onUnmount);
    } catch (err) {
      console.error('[Velin Templates] Error in onUnmount hook:', err);
    }
  }

  // Clean up inner state
  if (pluginState?.innerState) {
    Velin.cleanupState(reactiveState, pluginState.innerState);
  }
}
```

**Why it matters:** Without proper cleanup, removed elements would continue to hold references to reactive state, causing memory leaks and potentially triggering re-renders on elements that no longer exist in the DOM.

### `Velin.plugins.processPlugin(plugin, reactiveState, expr, node, attributeName, subkey)`

Manually runs a plugin on a node. This is rarely needed, but can be useful for plugins that delegate to other plugins.

**Parameters:**
- `plugin` (Object): Plugin definition (from `Velin.plugins.get()`)
- `reactiveState` (ReactiveState): Reactive state object
- `expr` (string): Expression to evaluate
- `node` (Node): DOM node
- `attributeName` (string): Full attribute name (e.g., `'vln-text'`)
- `subkey` (string, optional): Subkey from attribute (e.g., `'click'` from `'vln-on:click'`)

**Returns:** void

**Real example - delegating between plugins:**
```javascript
// The 'vln-use' plugin is just an alias that delegates to 'vln-fragment'
Velin.plugins.registerPlugin({
  name: 'use',
  destroy: ({ node, pluginState, reactiveState, subkey }) => {
    const fragmentPlugin = Velin.plugins.get('fragment');
    if (fragmentPlugin?.destroy) {
      fragmentPlugin.destroy({ node, pluginState, reactiveState, subkey });
    }
  },
  render: (args) => {
    const fragmentPlugin = Velin.plugins.get('fragment');
    return fragmentPlugin.render(args);
  }
});
```

### `Velin.ø__internal`

Object containing internal state and utilities.

**Properties:**
- `pluginStates` (WeakMap): Plugin state storage
- `boundState` (Object): Contains the root reactive state
- `consumeAttribute` (Function): Marks an attribute as processed
- `triggerEffects` (Function): Manually triggers reactive updates

**Warning:** These APIs are subject to change. Use at your own risk.

---

## Error Codes

Velin uses error codes in console messages:

- `[VLN001]`: Cannot set attributes on non-HTML elements
- `[VLN002]`: No attribute specified for `vln-attr`
- `[VLN003]`: Cannot set classes on non-HTML elements
- `[VLN004]`: No event handler found
- `[VLN005]`: No event name specified for `vln-on`
- `[VLN006]`: Target is not a valid input element
- `[VLN007]`: (Reserved)
- `[VLN008]`: Template name not provided
- `[VLN009]`: Missing required template parameters
- `[VLN010]`: Attempted to set value during evaluation (use `Velin.getSetter`)

## TypeScript Support

Velin includes comprehensive TypeScript definitions for type-safe reactive applications.

### Basic Usage

Type your state object for full autocomplete and type checking:

```typescript
import Velin from 'velin';

interface AppState {
  count: number;
  name: string;
  todos: Array<{ id: number; text: string; done: boolean }>;
}

const vln = Velin.bind<AppState>(root, {
  count: 0,
  name: 'Alice',
  todos: []
});

// TypeScript knows the types
vln.count++;           // number
vln.name.toUpperCase(); // string
vln.todos.push({ id: 1, text: 'Task', done: false });
```

### Typing Methods and Getters

Methods and computed properties work naturally:

```typescript
interface CounterState {
  count: number;
  increment(): void;
  decrement(): void;
  readonly displayValue: string;
}

const vln = Velin.bind<CounterState>(root, {
  count: 0,

  increment() {
    this.count++;
  },

  decrement() {
    this.count--;
  },

  get displayValue() {
    return `Count: ${this.count}`;
  }
});

vln.increment(); // Type-safe method call
```

### Typing Custom Plugins

Create type-safe custom plugins:

```typescript
import { VelinPlugin } from 'velin';

const uppercasePlugin: VelinPlugin = {
  name: 'uppercase',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    if (node instanceof HTMLElement) {
      node.textContent = String(tracked).toUpperCase();
    }
  }
};

Velin.plugins.registerPlugin(uppercasePlugin);
```

### Advanced: Plugin Render Arguments

For more control, type the render function arguments:

```typescript
import type { PluginRenderArgs, PluginRenderResult } from 'velin';

Velin.plugins.registerPlugin({
  name: 'myPlugin',
  render: (args: PluginRenderArgs): PluginRenderResult => {
    const { node, tracked, reactiveState, pluginState } = args;

    // Full type checking on all arguments
    if (node instanceof HTMLElement) {
      node.textContent = String(tracked);
    }

    return { state: { initialized: true } };
  }
});
```

### Working with ReactiveState

When using advanced APIs, type the reactive state:

```typescript
import type { ReactiveState } from 'velin';

function myCustomTracker(reactiveState: ReactiveState, expr: string) {
  const result = Velin.evaluate(reactiveState, expr);
  // reactiveState is fully typed
  return result;
}
```

### Type Definitions Location

All type definitions are available in `dist/types/velin-core.d.ts`:

- `VelinCore` - Main Velin object interface
- `ReactiveState` - Internal reactive state structure
- `VelinPlugin` - Plugin definition interface
- `PluginRenderArgs` - Arguments passed to plugin render functions
- `PluginRenderResult` - Return type for plugin render functions
- `Trackers` - Type for tracker helper functions

### Tips

**Strict mode:** Enable `strict: true` in `tsconfig.json` for maximum type safety.

**Type inference:** In most cases, TypeScript can infer types from your state object:

```typescript
// Types are inferred automatically
const vln = Velin.bind(root, {
  count: 0,        // inferred as number
  name: 'Alice',   // inferred as string
  items: [] as Array<{ id: number; name: string }>  // explicit array type
});
```

**JSDoc for vanilla JS:** If you're not using TypeScript, you can still get type hints with JSDoc:

```javascript
/**
 * @typedef {Object} AppState
 * @property {number} count
 * @property {string} name
 */

/** @type {AppState} */
const vln = Velin.bind(root, {
  count: 0,
  name: 'Alice'
});
```


---

## See Also

- **[Getting Started](./getting-started.md)** - Learn how to use these APIs in practice
- **[Creating Plugins](./plugins.md)** - Practical guide to using Advanced and Danger Zone APIs
- **[Directives Guide](./directives.md)** - See how built-in plugins use these APIs
- **[TypeScript Definitions](../dist/types/)** - Full type definitions for all APIs
- **[Documentation Hub](./README.md)** - Navigate all Velin documentation
