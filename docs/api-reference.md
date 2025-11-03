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

Helper functions for common tracking patterns.

#### `Velin.trackers.expressionTracker({ reactiveState, expr })`

Tracks dependencies by evaluating an expression.

**Returns:** Result of the expression

**Example:**
```javascript
Velin.plugins.registerPlugin({
  name: 'myPlugin',
  track: Velin.trackers.expressionTracker,
  render: ({ tracked }) => {
    // 'tracked' contains the evaluated expression result
  }
});
```

#### `Velin.trackers.setterTracker({ reactiveState, expr })`

Returns a setter function for an expression.

**Returns:** Setter function

**Example:**
```javascript
Velin.plugins.registerPlugin({
  name: 'myInput',
  track: Velin.trackers.setterTracker,
  render: ({ node, tracked: setter }) => {
    node.addEventListener('input', (e) => {
      setter(e.target.value);
    });
  }
});
```

### `Velin.evaluate(reactiveState, expr, allowMutations)`

Evaluates a JavaScript expression in the context of the reactive state.

**Parameters:**
- `reactiveState` (ReactiveState): Internal reactive state object
- `expr` (string): JavaScript expression to evaluate
- `allowMutations` (boolean, optional): If true, allows function calls to mutate state. Defaults to false for read-only evaluation.

**Returns:** Result of the expression

**Example:**
```javascript
// Read-only evaluation (default)
const result = Velin.evaluate(reactiveState, 'count + 10');

// Allow mutations (for event handlers)
Velin.evaluate(reactiveState, 'increment()', true);
```

Display directives use read-only mode, while event handlers (`vln-on`) use mutation mode.

### `Velin.getSetter(reactiveState, expr)`

Returns a setter function for a property expression.

**Parameters:**
- `reactiveState` (ReactiveState): Internal reactive state object
- `expr` (string): Property path expression (e.g., `'user.name'`)

**Returns:** Function that sets the value

**Example:**
```javascript
const setName = Velin.getSetter(reactiveState, 'user.name');
setName('Charlie'); // equivalent to: user.name = 'Charlie'
```

### `Velin.processNode(node, reactiveState)`

Processes a DOM node, applying all applicable Velin directives.

**Parameters:**
- `node` (Node): DOM node to process
- `reactiveState` (ReactiveState): Reactive state to bind to

**Returns:** void

**Example:**
```javascript
// Add a new element and make it reactive
const newDiv = document.createElement('div');
newDiv.setAttribute('vln-text', 'message');
document.body.appendChild(newDiv);
Velin.processNode(newDiv, Velin.ø__internal.boundState.root);
```

---

## Internal APIs

For structure-altering plugins like `vln-loop` or `vln-fragment` that create scoped child states.

### `Velin.plugins.processPlugin(plugin, reactiveState, expr, node, attributeName, subkey)`

Processes a plugin on a node.

**Parameters:**
- `plugin` (Object): Plugin definition
- `reactiveState` (ReactiveState): Reactive state object
- `expr` (string): Expression to evaluate
- `node` (Node): DOM node
- `attributeName` (string): Full attribute name
- `subkey` (string, optional): Subkey from attribute (e.g., `click` in `vln-on:click`)

**Returns:** void

### `Velin.composeState(reactiveState, interpolations)`

Creates a child reactive state with additional interpolations (variable mappings).

**Parameters:**
- `reactiveState` (ReactiveState): Parent reactive state
- `interpolations` (Map<string, string>): Map of variable names to expressions

**Returns:** New child reactive state

**Example:**
```javascript
const innerState = Velin.composeState(
  reactiveState,
  new Map([['item', 'items[0]']])
);
```

Used by `vln-loop` and `vln-fragment` for scoped variables.

### `Velin.cleanupState(parentState, innerState)`

Cleans up a child reactive state, removing bindings and finalizers.

**Parameters:**
- `parentState` (ReactiveState): Parent reactive state
- `innerState` (ReactiveState): Child state to clean up

**Returns:** void

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

Velin includes TypeScript definitions. To use them:

```typescript
import Velin, { VelinCore, ReactiveState } from 'velin';

interface AppState {
  count: number;
  name: string;
}

const vln = Velin.bind<AppState>(root, {
  count: 0,
  name: 'Alice'
});

// TypeScript knows vln.count is a number
vln.count++;
```

**Note:** Type definitions are located in `dist/types/`.
