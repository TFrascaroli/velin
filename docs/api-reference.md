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

#### `Velin.plugins.get(name)` / `Velin.plugins.lookupPlugin(name)`

Both return the plugin definition registered under `name`, or `undefined` /
`null` respectively if not found. `get` is the convenience alias on `Map`;
`lookupPlugin` is the internal lookup used by `processPlugin`.

#### `Velin.plugins.processPlugin(plugin, reactiveState, expr, node, attributeName, attributeValue, subcommand)`

Runs a single plugin instance manually. Used when one plugin wants to delegate
to another (rare). All seven arguments are required:

- `plugin` — the plugin definition.
- `reactiveState` — the wrapper the calling plugin received.
- `expr` — the expression string the inner plugin will see as `expr`.
- `node` — the target DOM element.
- `attributeName` — the synthetic attribute name (e.g. `'vln-text'`).
- `attributeValue` — the raw attribute value; usually identical to `expr`.
- `subcommand` — the part after the colon, or `null`.

#### Plugin return value: `PluginControl`

`render` may return an object to influence further processing of the node:

```typescript
interface PluginControl {
  pluginState?: any;             // persisted across renders as args.pluginState next time
  halt?: boolean;                // skip remaining plugins on this node and skip children
  scopedState?: ChildContext;    // child nodes will be processed against this child
  plugins?: Array<{ name: string; value: string }>;
  // ^ extra directives injected into this node's chain, run immediately after
  //   the current plugin. The injected entries do not leave a `reflect-*`
  //   breadcrumb on the DOM (they were never on the node to begin with).
}
```

Only one plugin per node may produce a `scopedState`; a second attempt throws
`VLN012`. `scopedState` should be a `ChildContext` obtained from
`args.compose(...)`; passing a raw `ReactiveState` (from `Velin.composeState`)
is also accepted for direct callers but discouraged in plugins.

The field was renamed from `state` to `pluginState` in ADR-0002 so the
return type is symmetric with the args field — no in/out collision with the
user-facing `state` Proxy.

### `Velin.trackers`

Helper functions for dependency tracking in custom plugins. These are the most commonly used tracking patterns.

#### `Velin.trackers.expressionTracker`

Evaluates the directive's expression and automatically tracks all reactive
dependencies. Used by most display directives (`vln-text`, `vln-if`,
`vln-class`, `vln-attr`).

**Returns:** Result of the expression — passed to `render` as `tracked`.

**How it works:** When the tracked expression is evaluated, Velin records
which state properties it accessed. When any of those properties change,
the plugin's `render` function is automatically called again with the new
`tracked` value.

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

When you use `<div vln-text="firstName + ' ' + lastName"></div>`, the plugin will:
1. Evaluate the expression and track dependencies on `firstName` and `lastName`
2. Call `render` with the result
3. Automatically re-render whenever `firstName` or `lastName` changes

#### `Velin.trackers.setterTracker`

Returns a setter function for the directive's expression instead of evaluating
it. Useful for two-way binding plugins that want the setter cached as `tracked`.

**Returns:** Setter function — passed to `render` as `tracked`.

### `Velin.compile(expr)`

Tokenizes and parses an expression string into an AST node. Cheap, but
results aren't cached — call once and reuse the AST if you need it on a hot
path.

**Parameters:**
- `expr` (string): JavaScript-like expression (see Evaluator section for the
  supported subset).

**Returns:** AST node compatible with `Velin.evaluateAst`.

### `Velin.evaluateAst(astNode, reactiveState)`

Evaluates an AST node previously produced by `Velin.compile`. Use this
instead of `Velin.evaluate` when you already have the AST (e.g. inside a
custom `track` function — the framework gives you `compiledExpression` for
free).

**Parameters:**
- `astNode` (ASTNode): The compiled expression.
- `reactiveState` (ReactiveState): The reactive state context.

**Returns:** Result of the expression.

### `Velin.evaluate(reactiveState, expr, allowMutations)`

Direct programmatic evaluation against a `ReactiveState`. **Plugins should not
call this directly** — use the `evaluate` helper destructured from the args
object instead, which is pre-bound to the current substate (see ADR-0002).

**Parameters:**
- `reactiveState` (ReactiveState): The reactive state.
- `expr` (string): JavaScript expression to evaluate.
- `allowMutations` (boolean, optional): If true, allows function calls to
  mutate state. Defaults to false for read-only evaluation.

**Returns:** Result of the expression.

**Plugin equivalent:**
```javascript
render: ({ evaluate, expr, node, subkey }) => {
  // evaluate() is pre-bound to this plugin's reactive scope
  const handler = () => evaluate(expr, /* allowMutations */ true);
  node.addEventListener(subkey, handler);
  return { pluginState: { handler } };
}
```

**When to use the top-level form:**
- Direct programmatic evaluation outside a plugin (tests, host code).
- Inside extensions that operate on a `ReactiveState` obtained via
  `Velin.ø__internal.getWrapper(state)`, where `state` is the proxy returned
  by `Velin.bind()`.

### `Velin.getSetter(reactiveState, expr)`

Direct programmatic setter builder. **Plugins should not call this directly**
— use the `getSetter` helper destructured from the args object instead, which
is pre-bound to the current substate (see ADR-0002).

**Parameters:**
- `reactiveState` (ReactiveState): The reactive state.
- `expr` (string): Property path expression (e.g., `'user.name'`, `'items[0]'`).

**Returns:** Function `(value) => void` that sets the property to the given value.

**Why it exists:** During expression evaluation, Velin prevents direct
property assignment to catch bugs. Setters provide a controlled way to
update state from event handlers.

**Plugin equivalent:**
```javascript
render: ({ node, tracked, expr, getSetter, pluginState = {} }) => {
  const setter = getSetter(expr);
  if (!pluginState.initialized) {
    node.addEventListener('input', (e) => setter(e.target.value));
  }
  if (node.value !== tracked) node.value = tracked;
  return { pluginState: { initialized: true } };
}
```

### `Velin.processNode(node, reactiveState)`

Processes a DOM node and all its children, applying all applicable Velin
directives. Plugins use `child.processNode(node)` from a `ChildContext`
returned by `compose()`; this top-level form is for host code and tests.

**Parameters:**
- `node` (Node): DOM node to process.
- `reactiveState` (ReactiveState): Reactive state to bind to.

**Returns:** void.

**How it works:**
1. Scans the node for all `vln-*` attributes
2. Finds matching registered plugins
3. Calls each plugin's `track` and `render` functions
4. Recursively processes all child nodes (unless a plugin returns `halt: true`)

**Direct use — making a dynamically-added element reactive:**
```javascript
const state = Velin.bind(document.body, { message: 'hi' });
const newDiv = document.createElement('div');
newDiv.setAttribute('vln-text', 'message');
document.body.appendChild(newDiv);
Velin.processNode(newDiv, Velin.ø__internal.getWrapper(state));
```

**Plugin use (via `ChildContext`):**
```javascript
render: ({ compose }) => {
  const child = compose({ item: { expr: 'items[0]' } });
  // ... create clone ...
  child.processNode(clone);   // no reactiveState threading
}
```

---

## Low-Level APIs

For structure-altering plugins like `vln-loop` or `vln-fragment` that create scoped child states. These APIs manage the parent-child state hierarchy.

### `Velin.composeState(reactiveState, interpolations)`

Direct programmatic substate creation. **Plugins should not call this directly**
— use `compose(init)` from the args object, which returns a `ChildContext`
with the same scope plus the helpers you need (see ADR-0002).

**Parameters:**
- `reactiveState` (ReactiveState): Parent reactive state.
- `interpolations` (Map<string, Interpolation>): Variable bindings, each
  `{type: 'EXPR' | 'LITERAL', value: …}`.

**Returns:** New child `ReactiveState`. Inherits the parent's `tricklingRoots`
stack; structural plugins append their array path to that stack so nested
loops compose correctly (see ADR-0001).

**Plugin equivalent:**
```javascript
const child = compose({
  item:   { expr: `items[${i}]` },
  $index: { literal: i },
}).anchor('items');   // append to trickling-root stack

child.processNode(clone);
```

### `Velin.cleanupState(parentState, innerState, node)`

Direct programmatic cleanup. **Plugins should not call this directly** —
use `child.cleanup(node?)` on the `ChildContext` you got from `compose()`,
which captures the parent implicitly.

**Parameters:**
- `parentState` (ReactiveState): Parent reactive state.
- `innerState` (ReactiveState): Child state to clean up.
- `node` (Node, optional): DOM element associated with the state (triggers
  the `destroy` lifecycle event).

**Returns:** void.

**What it cleans:**
1. Clears all interpolation mappings
2. Removes all dependency bindings
3. Calls all registered finalizers
4. Recursively cleans up any nested child states

**Plugin equivalent:**
```javascript
destroy: ({ pluginState }) => {
  pluginState.innerChild?.cleanup(node);
}
```

---

## Error Codes

Velin uses error codes in console messages:

- `[VLN001]`: Cannot set attributes on non-HTML elements
- `[VLN002]`: No attribute specified for `vln-attr`
- `[VLN003]`: Cannot set classes on non-HTML elements
- `[VLN004]`: No event handler found
- `[VLN005]`: No event name specified for `vln-on`
- `[VLN006]`: Target is not a valid input element
- `[VLN008]`: Template name not provided
- `[VLN009]`: Missing required template parameters
- `[VLN010]`: Attempted to set value during evaluation (use `Velin.getSetter`)
- `[VLN011]`: Failed to delete inner state from parent (state graph corruption)
- `[VLN012]`: Multiple plugins on the same node attempted to create a scoped state
- `[VLN013]`: Duplicate plugin application
- `[VLN014]`: Async mutation attempted after cleanup

## TypeScript Support

Velin is written in plain JavaScript but provides TypeScript definitions for autocomplete and type safety.

### Basic Usage

Type your state object for full autocomplete:

```typescript
import Velin from '@velinjs/all';

interface AppState {
  count: number;
  name: string;
}

const vln = Velin.bind<AppState>(root, {
  count: 0,
  name: 'Alice'
});
```

All type definitions are available in `dist/types/velin-core.d.ts`.


---

## See Also

- **[Getting Started](./getting-started.md)** - Learn how to use these APIs in practice
- **[Creating Plugins](./plugins.md)** - Practical guide to using Advanced and Danger Zone APIs
- **[Directives Guide](./directives.md)** - See how built-in plugins use these APIs
- **[TypeScript Definitions](../dist/types/)** - Full type definitions for all APIs
- **[Documentation Hub](./README.md)** - Navigate all Velin documentation
