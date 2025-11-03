# Creating Plugins

Velin's plugin system allows you to create custom directives that extend the framework's capabilities.

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

**Function signature:**
```javascript
track: ({ reactiveState, expr, node, subkey }) => {
  // Return value becomes 'tracked' in render
  return someValue;
}
```

**Common patterns:**

```javascript
// Track expression value
track: Velin.trackers.expressionTracker

// Track setter function
track: Velin.trackers.setterTracker

// Custom tracking
track: ({ reactiveState, expr }) => {
  const value = Velin.evaluate(reactiveState, expr);
  // Do something with value
  return value;
}
```

### `render` (required)

Function that updates the DOM. Called initially and whenever dependencies change.

**Function signature:**
```javascript
render: ({
  reactiveState,  // Reactive state object
  expr,           // The directive's attribute value
  node,           // The DOM element
  subkey,         // For directives like vln-on:click, this is 'click'
  tracked,        // Value returned from track()
  pluginState,    // Persistent state for this node
  attributeName   // Full attribute name, e.g., 'vln-on:click'
}) => {
  // Update the DOM
  node.textContent = tracked;

  // Optionally return control or updated state
  return {
    state: newPluginState,  // Updated plugin state
    halt: true              // Stop processing child nodes
  };
}
```

### `destroy` (optional)

Cleanup function called when the element is removed or re-rendered.

**Function signature:**
```javascript
destroy: ({ node, pluginState, reactiveState, subkey }) => {
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
      return { state: { focused: true } };
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
  destroy: ({ node, pluginState }) => {
    if (pluginState.handler) {
      document.removeEventListener('click', pluginState.handler);
    }
  },
  render: ({ reactiveState, expr, node, pluginState = {} }) => {
    // Remove old listener
    if (pluginState.handler) {
      document.removeEventListener('click', pluginState.handler);
    }

    // Add new listener
    const handler = (event) => {
      if (!node.contains(event.target)) {
        Velin.evaluate(reactiveState, expr);
      }
    };

    document.addEventListener('click', handler);

    return { state: { handler } };
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
  render: ({ reactiveState, expr, node, subkey, pluginState = {} }) => {
    const delay = parseInt(subkey) || 300; // vln-debounce:300
    const setter = Velin.getSetter(reactiveState, expr);

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

    return { state: { handler, timer: pluginState.timer } };
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
  render: ({ node, subkey, reactiveState, expr }) => {
    // subkey is the part after the colon
    // vln-on:click -> subkey = 'click'
    // vln-on:submit -> subkey = 'submit'

    const handler = () => Velin.evaluate(reactiveState, expr);
    node.addEventListener(subkey, handler);
  }
});
```

Usage:
```html
<button vln-on:[^=]+="handleClick()">Click</button>
<form vln-on:[^=]+="handleSubmit()">Submit</form>
```

## Plugin State

Use `pluginState` to store data between renders:

```javascript
render: ({ pluginState = {} }) => {
  // First render: pluginState is {}
  if (!pluginState.initialized) {
    console.log('First render!');
    return { state: { initialized: true } };
  }

  // Subsequent renders: pluginState has our data
  console.log('Already initialized');
}
```

**Important:** Always provide a default `= {}` parameter and return `{ state: newState }` to update it.

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

You can call other plugins from your plugin:

```javascript
Velin.plugins.registerPlugin({
  name: 'mycombo',
  render: ({ reactiveState, node }) => {
    // Get another plugin
    const textPlugin = Velin.plugins.get('text');

    // Process with it
    Velin.plugins.processPlugin(
      textPlugin,
      reactiveState,
      'message',
      node,
      'vln-text'
    );
  }
});
```

## Best Practices

### 1. Always handle cleanup

```javascript
{
  destroy: ({ pluginState }) => {
    // Remove event listeners
    // Clear timeouts/intervals
    // Cancel pending requests
  }
}
```

### 2. Use appropriate priority

```javascript
{
  priority: Velin.plugins.priorities.STOPPER  // For structural directives (if, for)
  priority: Velin.plugins.priorities.OVERRIDABLE  // For most directives
  priority: Velin.plugins.priorities.LATE  // For directives that should run last
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
    state: { ...pluginState, newProp: 'value' }
  };
}
```

### 5. Be defensive

```javascript
render: ({ node, tracked }) => {
  if (!(node instanceof HTMLElement)) {
    console.warn('Plugin requires HTMLElement');
    return;
  }

  // ... rest of logic
}
```

## Plugin Events

Listen to plugin events using `Velin.on()`:

```javascript
Velin.on('afterProcessNode', ({ node, plugin, reactiveState }) => {
  console.log(`Processed ${node.tagName} with ${plugin}`);
});

// Filter by plugin
Velin.on('afterProcessNode', ({ node }) => {
  console.log('Text plugin processed:', node);
}, { plugin: 'text' });

// Filter by selector
Velin.on('afterProcessNode', ({ node }) => {
  console.log('Button processed:', node);
}, { selector: 'button' });
```

## Complete Plugin Example

Here's a complete, production-ready plugin with all features:

```javascript
Velin.plugins.registerPlugin({
  name: 'autosize',
  priority: Velin.plugins.priorities.OVERRIDABLE,

  track: ({ reactiveState, expr }) => {
    return Velin.evaluate(reactiveState, expr);
  },

  destroy: ({ node, pluginState }) => {
    if (pluginState.observer) {
      pluginState.observer.disconnect();
    }
    if (pluginState.handler) {
      node.removeEventListener('input', pluginState.handler);
    }
  },

  render: ({ node, tracked, pluginState = {} }) => {
    if (!(node instanceof HTMLTextAreaElement)) {
      console.warn('[vln-autosize] Only works on <textarea> elements');
      return;
    }

    // Set initial value
    if (tracked !== undefined && node.value !== tracked) {
      node.value = tracked;
    }

    // Auto-resize function
    const resize = () => {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 'px';
    };

    // Initial resize
    resize();

    // Setup input listener (first time only)
    if (!pluginState.initialized) {
      const handler = () => resize();
      node.addEventListener('input', handler);

      // Also observe for external changes
      const observer = new MutationObserver(resize);
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['value']
      });

      return {
        state: {
          initialized: true,
          handler,
          observer
        }
      };
    }

    // Subsequent renders: just resize
    resize();
    return { state: pluginState };
  }
});
```

Usage:
```html
<textarea vln-autosize="message" placeholder="Type something..."></textarea>
```
