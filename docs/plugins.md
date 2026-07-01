# Creating Plugins

Create custom directives using the Velin plugin system.

## Plugin Basics

A plugin is a JavaScript object that defines how a custom directive behaves:

```javascript
Velin.plugins.registerPlugin({
  name: 'uppercase',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    node.textContent = String(tracked).toUpperCase();
  }
});
```

Now you can use it:

```html
<div vln-uppercase="message"></div>
```

## Plugin Structure

### Minimum Plugin

```javascript
{
  name: 'pluginName',    // Required: directive name (use as vln-pluginName)
  render: (args) => {}   // Required: function that updates the DOM
}
```

### Full Plugin

```javascript
{
  name: 'pluginName',       // Required
  priority: 10,             // Optional: higher runs first
  track: (args) => {},      // Optional: track dependencies
  render: (args) => {},     // Required: update DOM
  destroy: (args) => {}     // Optional: cleanup when removed
}
```

## Plugin Properties

### `name` (required)

The directive name. If name is `'foo'`, the directive will be `vln-foo`.

```javascript
name: 'tooltip'  // Creates vln-tooltip directive
```

### `priority` (optional)

Determines plugin execution order. Higher priority = runs first.

**Standard Priorities:**
```javascript
Velin.plugins.priorities.LATE = -1        // Run last
Velin.plugins.priorities.OVERRIDABLE = 10 // Default
Velin.plugins.priorities.STOPPER = 50     // Run first, stop children
```

**Example:**
```javascript
{
  name: 'if',
  priority: Velin.plugins.priorities.STOPPER, // Run before other plugins
  // ...
}
```

### `track` (optional)

Function called to set up dependency tracking. Return value is passed to `render` as `tracked`.

> ⚠ **`track` runs exactly once per plugin instance.** Dependencies are
> captured during this single call and never re-scanned on subsequent
> renders. Any reactive property your tracker skips on this first pass
> — via a ternary, `&&`, `??`, guard-clause, or any conditional read —
> is not registered, and later mutations to it will not trigger
> `render`. Touch every dep you might ever need up front (assign to a
> local so the JIT keeps the read). See
> [ADR-0003](./adr/0003-one-shot-dependency-capture.md).

**Function signature:** receives the same args object as `render` (see below) — most commonly you only destructure `evaluate`, `evaluateAst`, `compiledExpression`, `expr`, `node`, `subkey`.

**Common patterns:**

```javascript
// Track expression value (most common)
track: Velin.trackers.expressionTracker

// Track setter function (for two-way binding)
track: Velin.trackers.setterTracker

// Custom tracking — use the pre-bound helper
track: ({ evaluate, expr }) => {
  const value = evaluate(expr);
  // Do something with value
  return value;
}
```

### `render` (required)

Function that updates the DOM. Called initially and whenever dependencies change.

**Function signature:** the args object is destructured directly — destructure only the fields you need.

```javascript
render: ({
  // Directive info
  node,               // The DOM element
  expr,               // The directive's expression string
  compiledExpression, // Pre-compiled AST of expr
  subkey,             // For directives like vln-on:click, this is 'click'
  attributeName,      // Full attribute name, e.g. 'vln-on:click'
  attributeValue,     // Raw attribute value (same as expr for normal directives)
  tracked,            // Value returned from track()
  pluginState,        // Persistent state for this node

  // State helpers — pre-bound to the current reactive scope (ADR-0002)
  state,              // User-facing Proxy (read/write — bypasses dep tracking on writes)
  evaluate,           // (expr, allowMutations?) => any
  evaluateAst,        // (ast) => any
  getSetter,          // (expr) => (value) => void
  compose,            // (init) => ChildContext (see below)
  consume,            // (node, attrName, value) => mark attribute as processed
  triggerEffects,     // (prop) => manually fire reactive effects bound to a key
}) => {
  // Update the DOM
  node.textContent = tracked;

  // Optionally return a PluginControl to influence what happens next
  return {
    pluginState: newScratchpad,                  // persisted as pluginState next render
    halt: true,                                  // skip remaining plugins + children
    scopedState: childCtx,                       // children processed against this child
    plugins: [{ name: 'vln-foo', value: 'bar' }] // inject directives after this one
  };
}
```

Only one plugin per node may set `scopedState`; a second attempt throws
`VLN012`. Plugins injected via `plugins` run **immediately after** the
current plugin, ahead of any remaining lower-priority entries on the node.

### `ChildContext` (returned by `compose`)

`compose(init)` creates a scoped reactive sub-scope and returns a
`ChildContext`. Use it instead of touching the underlying reactive state.

```javascript
const child = compose({
  user:   { expr: 'items[i]' },   // bind expression — tracks deps
  $index: { literal: i },         // bind literal value — no tracking
});

child.state;                  // child's Proxy (with interpolations visible)
child.evaluate(expr);         // evaluate inside child scope
child.evaluateAst(ast);       // evaluate a pre-compiled AST in child scope
child.getSetter(expr);
child.compose(nested);        // nest another scope
child.anchor(arrayExpr);      // append to trickling-root stack (vln-loop pattern)
child.setInterpolation(k, i); // update an interpolation in place
child.processNode(node);      // process a DOM subtree against this child
child.cleanup(node?);         // tear down (call from destroy or when removing)
child.triggerEffects(prop);   // manually fire effects on this child's bindings
```

`compose()` also accepts the verbose `Map<string, Interpolation>` form for
plugins that already have one in hand. Both forms require explicit
`{expr}` / `{literal}` tags — no type-based magic.

### `destroy` (optional)

Cleanup function called when the element is removed or re-rendered. Receives
the same args object as `render` (including helpers).

```javascript
destroy: ({ node, pluginState, subkey }) => {
  // Clean up event listeners, timers, etc.
  if (pluginState.handler) {
    node.removeEventListener('click', pluginState.handler);
  }
}
```

## Example Plugins

### 1. Simple Text Transformation

```javascript
Velin.plugins.registerPlugin({
  name: 'uppercase',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    node.textContent = String(tracked || '').toUpperCase();
  }
});
```

Usage:
```html
<div vln-uppercase="message"></div>
```

### 2. Tooltip Plugin

```javascript
Velin.plugins.registerPlugin({
  name: 'tooltip',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    if (tracked) {
      node.setAttribute('title', tracked);
      node.style.cursor = 'help';
    } else {
      node.removeAttribute('title');
      node.style.cursor = '';
    }
  }
});
```

Usage:
```html
<span vln-tooltip="helpText">❓</span>
```

### 3. Auto-focus Plugin

```javascript
Velin.plugins.registerPlugin({
  name: 'autofocus',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked, pluginState = {} }) => {
    if (tracked && !pluginState.focused) {
      node.focus();
      return { pluginState: { focused: true } };
    }
  }
});
```

Usage:
```html
<input vln-autofocus="shouldFocus" />
```

### 4. Click Outside Plugin

```javascript
Velin.plugins.registerPlugin({
  name: 'clickoutside',
  destroy: ({ pluginState }) => {
    if (pluginState.handler) {
      document.removeEventListener('click', pluginState.handler);
    }
  },
  render: ({ evaluate, expr, node, pluginState = {} }) => {
    // Remove old listener
    if (pluginState.handler) {
      document.removeEventListener('click', pluginState.handler);
    }

    // Add new listener
    const handler = (event) => {
      if (!node.contains(event.target)) {
        evaluate(expr, true);
      }
    };

    document.addEventListener('click', handler);

    return { pluginState: { handler } };
  }
});
```

Usage:
```html
<div vln-clickoutside="closeMenu()">
  <!-- menu content -->
</div>
```

### 5. Debounced Input

```javascript
Velin.plugins.registerPlugin({
  name: 'debounce',
  priority: Velin.plugins.priorities.OVERRIDABLE,
  destroy: ({ pluginState }) => {
    if (pluginState.timer) {
      clearTimeout(pluginState.timer);
    }
  },
  render: ({ getSetter, expr, node, subkey, pluginState = {} }) => {
    const delay = parseInt(subkey) || 300; // vln-debounce:300
    const setter = getSetter(expr);

    if (pluginState.handler) {
      node.removeEventListener('input', pluginState.handler);
    }

    const handler = (event) => {
      if (pluginState.timer) {
        clearTimeout(pluginState.timer);
      }

      pluginState.timer = setTimeout(() => {
        setter(event.target.value);
      }, delay);
    };

    node.addEventListener('input', handler);

    return { pluginState: { handler, timer: pluginState.timer } };
  }
});
```

Usage:
```html
<!-- Debounce for 300ms (default) -->
<input vln-debounce="search" />

<!-- Debounce for 500ms -->
<input vln-debounce:500="search" />
```

### 6. Show/Hide with Animation

```javascript
Velin.plugins.registerPlugin({
  name: 'show',
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    if (tracked) {
      node.style.display = '';
      node.style.opacity = '0';
      requestAnimationFrame(() => {
        node.style.transition = 'opacity 0.3s';
        node.style.opacity = '1';
      });
    } else {
      node.style.transition = 'opacity 0.3s';
      node.style.opacity = '0';
      setTimeout(() => {
        node.style.display = 'none';
      }, 300);
    }
  }
});
```

Usage:
```html
<div vln-show="isVisible">Fades in/out</div>
```

## Using Subkeys

Subkeys allow one plugin to handle multiple variations:

```javascript
Velin.plugins.registerPlugin({
  name: 'on',
  render: ({ node, subkey, evaluate, expr }) => {
    // subkey is the part after the colon
    // vln-on:click -> subkey = 'click'
    // vln-on:submit -> subkey = 'submit'

    const handler = () => evaluate(expr, true);
    node.addEventListener(subkey, handler);
  }
});
```

Usage:
```html
<button vln-on:click="handleClick()">Click</button>
<form vln-on:click="handleSubmit()">Submit</form>
```

## Plugin State

Use `pluginState` to store data between renders:

```javascript
render: ({ pluginState = {} }) => {
  // First render: pluginState is {}
  if (!pluginState.initialized) {
    console.log('First render!');
    return { pluginState: { initialized: true } };
  }

  // Subsequent renders: pluginState has our data
  console.log('Already initialized');
}
```

**Important:** Always provide a default `= {}` parameter and return `{ pluginState: newState }` to update it. (The return key was renamed from `state` to `pluginState` in ADR-0002 — symmetric with the args field so there's no in/out collision.)

## Stopping Child Processing

Return `{ halt: true }` to prevent Velin from processing child nodes:

```javascript
Velin.plugins.registerPlugin({
  name: 'if',
  priority: Velin.plugins.priorities.STOPPER,
  track: Velin.trackers.expressionTracker,
  render: ({ node, tracked }) => {
    if (tracked) {
      node.style.display = '';
      return { halt: false }; // Process children
    } else {
      node.style.display = 'none';
      return { halt: true };  // Don't process children (performance)
    }
  }
});
```

## Accessing Other Plugins

Two ways:

### Inject directives via `PluginControl.plugins` (preferred)

Return injected entries from `render`. They run on the same node right after
your plugin, without leaving a `reflect-*` breadcrumb:

```javascript
Velin.plugins.registerPlugin({
  name: 'mycombo',
  render: () => ({
    plugins: [
      { name: 'vln-text', value: 'message' }
    ]
  })
});
```

### Call `processPlugin` directly

For full control. The signature is positional and takes seven arguments:

```javascript
Velin.plugins.processPlugin(
  Velin.plugins.get('text'),
  reactiveState,
  'message',     // expr
  node,
  'vln-text',    // attributeName
  'message',     // attributeValue (usually same as expr)
  null           // subcommand
);
```

## Best Practices

### 1. Always handle cleanup

```javascript
{
  destroy: ({ pluginState }) => {
    // Remove event listeners, timers, etc.
  }
}
```

### 2. Use appropriate priority

```javascript
{
  priority: Velin.plugins.priorities.STOPPER,     // Structural directives
  priority: Velin.plugins.priorities.OVERRIDABLE, // Most directives
  priority: Velin.plugins.priorities.LATE         // Run last
}
```

### 3. Provide defaults for pluginState

```javascript
render: ({ pluginState = {} }) => {
  // Always works even on first render
}
```

### 4. Return updated state

```javascript
render: ({ pluginState = {} }) => {
  return {
    pluginState: { ...pluginState, newProp: 'value' }
  };
}
```

### 5. Be defensive

```javascript
render: ({ node, tracked }) => {
  if (!(node instanceof HTMLElement)) return;
  // ... rest of logic
}
```

## Plugin Example: Auto-size Textarea

```javascript
Velin.plugins.registerPlugin({
  name: 'autosize',
  priority: Velin.plugins.priorities.OVERRIDABLE,

  destroy: ({ node, pluginState }) => {
    if (pluginState.handler) {
      node.removeEventListener('input', pluginState.handler);
    }
  },

  render: ({ node, tracked, pluginState = {} }) => {
    if (!(node instanceof HTMLTextAreaElement)) return;

    if (tracked !== undefined && node.value !== tracked) {
      node.value = tracked;
    }

    const resize = () => {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 'px';
    };

    if (!pluginState.initialized) {
      const handler = () => resize();
      node.addEventListener('input', handler);
      resize();
      return { pluginState: { initialized: true, handler } };
    }

    resize();
  }
});
```

Usage:
```html
<textarea vln-autosize="message"></textarea>
```


---

## See Also

- **[API Reference: Advanced APIs](./api-reference.md#advanced-apis)** - Detailed API docs for plugin creation
- **[API Reference: Low-Level APIs](./api-reference.md#low-level-apis)** - State composition APIs for complex plugins
- **[Source: velin-standard.js](../src/velin-standard.js)** - Source code of built-in plugins (great examples)
- **[Source: velin-templates-and-fragments.js](../src/velin-templates-and-fragments.js)** - Advanced plugin examples
- **[Directives Guide](./directives.md)** - See what each built-in plugin does
- **[Documentation Hub](./README.md)** - Navigate all Velin documentation
