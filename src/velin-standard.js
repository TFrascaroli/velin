// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @typedef {import('./velin-core').Interpolation} Interpolation
 */

/**
 * @param {VelinCore} vln
 */
function setupVelinStd(vln) {
  // Default PLUGINS

  /**
   * vln-text: Sets element's text content reactively.
   *
   * @example
   * <h1 vln-text="title"></h1>
   * <p vln-text="'Hello, ' + name"></p>
   * <span vln-text="count * 2"></span>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-text|Directives Guide: vln-text}
   */
  vln.plugins.registerPlugin({
    name: "text",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked }) => {
      node.textContent = tracked ?? "";
    },
  });

  /**
   * vln-if: Shows/hides element based on condition.
   * Uses CSS display property (element stays in DOM).
   *
   * @example
   * <div vln-if="isLoggedIn">Welcome!</div>
   * <div vln-if="count > 0">You have items</div>
   * <p vln-if="!loading && !error">Content</p>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-if|Directives Guide: vln-if}
   */
  vln.plugins.registerPlugin({
    name: "if",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked }) => {
      if (node instanceof HTMLElement)
        node.style.display = tracked ? "" : "none";
    },
  });

  /**
   * vln-attr:name: Sets HTML attributes dynamically.
   * Use null/undefined to remove attribute.
   *
   * @example
   * <img vln-attr:src="imageUrl" vln-attr:alt="imageAlt" />
   * <button vln-attr:disabled="!isValid">Submit</button>
   * <a vln-attr:href="'/user/' + userId">Profile</a>
   * <div vln-attr:data-id="itemId"></div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-attrname|Directives Guide: vln-attr}
   */
  vln.plugins.registerPlugin({
    name: "attr",
    track: vln.trackers.expressionTracker,
    render: ({ node, subkey, tracked }) => {
      if (!(node instanceof HTMLElement)) {
        console.warn("[VLN001] Cannot set attributes on non-HTML elements");
        return;
      }
      if (!subkey) {
        console.warn("[VLN002] No attribute to set, expected 'attr:name'");
        return;
      }

      // Boolean attributes: disabled, checked, readonly, required, etc.
      // For these, the presence of the attribute makes them true (regardless of value)
      const booleanAttrs = ['disabled', 'checked', 'readonly', 'required', 'autofocus', 'autoplay', 'controls', 'loop', 'muted', 'open', 'selected'];
      const isBooleanAttr = booleanAttrs.includes(subkey.toLowerCase());

      if (isBooleanAttr) {
        // For boolean attributes, remove if falsy, set if truthy
        if (tracked) {
          node.setAttribute(subkey, '');
        } else {
          node.removeAttribute(subkey);
        }
      } else {
        // For regular attributes, remove if null/undefined, otherwise set value
        if (tracked === null || tracked === undefined) {
          node.removeAttribute(subkey);
        } else {
          node.setAttribute(subkey, tracked);
        }
      }
    },
  });

  /**
   * vln-class: Adds/removes CSS classes dynamically.
   * Accepts string (class name) or object ({ className: boolean }).
   *
   * @example
   * // String mode
   * <div vln-class="theme"></div>
   *
   * @example
   * // Object mode (multiple classes)
   * <div vln-class="{ active: isActive, disabled: !isEnabled }"></div>
   *
   * @example
   * // Conditional expression
   * <div vln-class="status === 'error' ? 'text-red' : 'text-green'"></div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-class|Directives Guide: vln-class}
   */
  vln.plugins.registerPlugin({
    name: "class",
    priority: vln.plugins.priorities.OVERRIDABLE,
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked, pluginState }) => {
      if (!(node instanceof HTMLElement)) {
        console.warn("[VLN003] Cannot set classes on non-HTML elements");
        return;
      }

      // Helper: Split space-separated class names and filter empty strings
      const splitClassNames = (str) => str.trim().split(/\s+/).filter(Boolean);

      // Helper: Activate classes by splitting and adding to both sets
      const activateClasses = (classString, current, managedClasses) => {
        const classes = splitClassNames(classString);
        for (const cls of classes) {
          current.add(cls);
          managedClasses.add(cls);
        }
      };

      // Start with current classes as a Set for efficient operations
      const current = new Set(Array.from(node.classList));

      // Remove previously managed classes (already split and stored individually)
      if (pluginState?.managedClasses) {
        for (const cls of pluginState.managedClasses) {
          current.delete(cls);
        }
      }

      // Track which individual classes we're managing in this render
      const managedClasses = new Set();

      if (typeof tracked === "string") {
        // String mode: split once and add each class individually
        activateClasses(tracked, current, managedClasses);

      } else if (tracked && typeof tracked === "object") {
        // Object mode: keys are class names (can contain spaces), values are boolean
        for (const [classKey, active] of Object.entries(tracked)) {
          if (active) {
            activateClasses(classKey, current, managedClasses);
          }
        }
      }

      // Apply all classes at once
      node.className = Array.from(current).join(" ");
      return { pluginState: { managedClasses } };
    },
  });

  /**
   * vln-on:event: Attaches event listeners.
   * Evaluates expression when event fires. Use 'event' to access event object.
   *
   * @example
   * <button vln-on:click="count++">Increment</button>
   * <button vln-on:click="handleClick()">Click me</button>
   * <form vln-on:submit="event.preventDefault(); handleSubmit()">...</form>
   * <input vln-on:keydown="lastKey = event.key" />
   * <div vln-on:mouseenter="isHovering = true"
   *      vln-on:mouseleave="isHovering = false">Hover</div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-onevent|Directives Guide: vln-on}
   */
  vln.plugins.registerPlugin({
    name: "on",
    destroy: ({ node, pluginState, subkey }) => {
      if (pluginState?.handler)
        node.removeEventListener(subkey, pluginState.handler);
    },
    render: ({ compose, compiledExpression, node, subkey }) => {
      if (typeof node.addEventListener !== "function") {
        console.warn("[VLN004] No events hook found");
        return;
      }
      if (!subkey) {
        console.warn("[VLN005] Expected event name 'on:event'");
        return;
      }
      const handler = (event) => {
        const child = compose({ event: { literal: event } });
        try {
          child.evaluateAst(compiledExpression);
        } finally {
          child.cleanup();
        }
      };
      node.addEventListener(subkey, handler);
      return { pluginState: { handler } };
    },
  });

  /**
   * vln-input: Creates two-way data binding for form controls.
   * Works with inputs, textareas, selects, and contenteditable elements.
   *
   * @example
   * // Text input
   * <input vln-input="name" />
   *
   * @example
   * // Checkbox (boolean value)
   * <input type="checkbox" vln-input="agreed" />
   *
   * @example
   * // Radio buttons (shared state property)
   * <input type="radio" name="size" value="small" vln-input="size" />
   * <input type="radio" name="size" value="large" vln-input="size" />
   *
   * @example
   * // Select dropdown
   * <select vln-input="country">
   *   <option value="us">USA</option>
   *   <option value="uk">UK</option>
   * </select>
   *
   * @example
   * // ContentEditable
   * <div contenteditable vln-input="content"></div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-input|Directives Guide: vln-input}
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/getting-started.md#two-way-binding-vln-input|Getting Started: Two-Way Binding}
   */
  vln.plugins.registerPlugin({
    name: "input",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked, expr, getSetter, pluginState = {} }) => {
      const isInput = node instanceof HTMLInputElement;
      const isTextArea = node instanceof HTMLTextAreaElement;
      const isSelect = node instanceof HTMLSelectElement;
      const isContentEditable = node.isContentEditable;

      if (!isInput && !isTextArea && !isSelect && !isContentEditable) {
        console.warn(
          "[VLN006] Target is not input, textarea, select, or contenteditable element"
        );
        return;
      }

      const setter = getSetter(expr);

      if (!pluginState.initialized) {
        if (isInput) {
          node.addEventListener("input", (e) => {
            if (!(e.target instanceof HTMLInputElement)) return;
            switch (e.target.type) {
              case "checkbox":
              case "radio":
                setter(e.target.checked);
                break;
              default:
                setter(e.target.value);
            }
          });
          if (node.type === "radio") {
            node.addEventListener("change", (e) => {
              if (!(e.target instanceof HTMLInputElement)) return;
              setter(e.target.checked);
            });
          }
        } else if (isTextArea) {
          node.addEventListener("input", (e) => {
            if (!(e.target instanceof HTMLTextAreaElement)) return;
            setter(e.target.value);
          });
        } else if (isSelect) {
          node.addEventListener("change", (e) => {
            if (!(e.target instanceof HTMLSelectElement)) return;
            setter(e.target.value);
          });
        } else if (isContentEditable) {
          node.addEventListener("input", () => {
            setter(node.textContent || "");
          });
        }
      }

      if (isInput) {
        switch (node.type) {
          case "checkbox":
          case "radio":
            if (node.checked !== tracked) node.checked = tracked;
            break;
          default:
            if (node.value !== tracked) node.value = tracked;
        }
      } else if (isTextArea) {
        if (node.value !== tracked) node.value = tracked;
      } else if (isSelect) {
        if (node.value !== tracked) node.value = tracked;
      } else if (isContentEditable) {
        if ((node.textContent || "") !== tracked) node.textContent = tracked;
      }

      return { pluginState: { initialized: true } };
    },
  });

  /**
   * vln-watch:name: Monitors an expression and calls a method when it changes.
   *
   * @example
   * <div vln-watch:count="logChange"></div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-watch|Directives Guide: vln-watch}
   */
  vln.plugins.registerPlugin({
    name: "watch",
    track: vln.trackers.expressionTracker,
    render: ({ tracked, subkey }) => {
      const handler = tracked;
      if (!subkey || typeof handler !== "function") {
        console.warn("[VLN007] Expected method name 'watch:methodName'");
        return;
      }
      handler(tracked);
    },
  });

  /**
   * vln-loop:varName: Repeats element for each item in array.
   * Creates scoped variable for each iteration. Automatically provides $index.
   *
   * @example
   * // Basic list
   * <ul>
   *   <li vln-loop:item="items" vln-text="item"></li>
   * </ul>
   *
   * @example
   * // With object items
   * <div vln-loop:user="users">
   *   <h3 vln-text="user.name"></h3>
   *   <p vln-text="user.email"></p>
   * </div>
   *
   * @example
   * // Using $index
   * <li vln-loop:item="items">
   *   <span vln-text="$index + 1"></span>: <span vln-text="item"></span>
   * </li>
   *
   * @example
   * // With event handlers
   * <button vln-loop:item="items" vln-on:click="removeAt($index)">
   *   Remove <span vln-text="item"></span>
   * </button>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-loop|Directives Guide: vln-loop}
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/getting-started.md#lists-vln-loop|Getting Started: Lists}
   */
  vln.plugins.registerPlugin({
    name: "loop",
    priority: vln.plugins.priorities.STOPPER,
    track: vln.trackers.expressionTracker,
    destroy: ({ pluginState }) => {
      const parent = pluginState?.placeholder?.parentNode;
      if (parent && pluginState) {
        if (pluginState.substates) {
          pluginState.substates.forEach((child, i) => {
            if (child) child.cleanup(pluginState.children[i]);
          });
        }
        if (pluginState.children) {
          pluginState.children.forEach((child) => parent.removeChild(child));
        }
        if (parent.contains(pluginState.template))
          parent.removeChild(pluginState.template);
        if (parent.contains(pluginState.placeholder))
          parent.removeChild(pluginState.placeholder);
      }
      pluginState.children = null;
      pluginState.substates = null;
      pluginState.parent = null;
      pluginState.template = null;
      pluginState.placeholder = null;
    },
    render: ({
      node,
      subkey,
      tracked,
      expr,
      attributeName,
      compose,
      consume,
      pluginState = {},
    }) => {
      const parent = node.parentNode || pluginState.parent;
      if (!parent) return { halt: true };

      const isInit = !pluginState.initialized;
      if (isInit) {
        const placeholder = document.createComment(attributeName);
        consume(node, attributeName, expr);
        pluginState.template = node.cloneNode(true);
        pluginState.placeholder = placeholder;
        pluginState.parent = parent;
        pluginState.initialized = true;
        pluginState.children = [];
        pluginState.substates = [];
        parent.replaceChild(placeholder, node);
      }

      const { template, placeholder } = pluginState;
      if (!tracked || typeof tracked[Symbol.iterator] !== "function") {
        return { halt: true, pluginState };
      }

      const oldChildren = pluginState.children;
      const oldSubstates = pluginState.substates;
      const newChildren = [];
      const newSubstates = [];

      let lastInserted = placeholder;

      for (let i = 0; i < tracked.length; i++) {
        if (oldChildren.length > i) {
          const reusedNode = oldChildren[i];
          const reusedChild = oldSubstates[i];
          newChildren.push(reusedNode);
          newSubstates.push(reusedChild);
          lastInserted = reusedNode;

          // Re-anchor (idempotent) and refresh $index for the reused substate.
          reusedChild
            .anchor(expr)
            .setInterpolation('$index', { type: 'LITERAL', value: i });

          reusedChild.triggerEffects(`${expr}[${i}]`);
          reusedChild.triggerEffects('$index');
        } else {
          const clone = template.cloneNode(true);
          newChildren.push(clone);

          const init = subkey
            ? { [subkey]: { expr: `${expr}[${i}]` }, $index: { literal: i } }
            : { $index: { literal: i } };
          // Anchor this loop's array path on the trickling-root stack so deps
          // at or above it are filtered out, while preserving any outer loop's
          // anchor.
          const child = compose(init).anchor(expr);

          newSubstates.push(child);
          placeholder.parentNode.insertBefore(clone, lastInserted.nextSibling);
          lastInserted = clone;
          child.processNode(clone);
        }
      }

      for (let i = tracked.length; i < oldChildren.length; i++) {
        const childNode = oldChildren[i];
        childNode.remove?.();
        oldSubstates[i].cleanup(childNode);
      }

      pluginState.children = newChildren;
      pluginState.substates = newSubstates;

      return { halt: true, pluginState };
    },
  });

  /**
   * vln-use:alias: Creates a new alias for a property in the state, allowing it to be referenced by a different name.
   * Useful for avoiding naming conflicts or providing more context-specific names for properties, as well as shorthand access to deeply nested properties.
   *
   * @example
   * <div vln-use:user="generalState.identity.local.currentUser">
   *   <h1 vln-text="user.name"></h1>
   * </div>
   *
   * @see {@link
   */
  vln.plugins.registerPlugin({
    name: "use",
    priority: vln.plugins.priorities.STOPPER + 100,
    track: vln.trackers.expressionTracker,
    render: ({ subkey, expr, compose }) => {
      const scopedState = compose({ [subkey]: { expr } });
      return { scopedState };
    }
  });
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupVelinStd(/** @type {VelinCore} */ (__win.Velin));
}

export default setupVelinStd;
