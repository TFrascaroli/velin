// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @param {VelinCore} vln
 */
function setupVelinStd(vln) {
  // Default PLUGINS
  vln.plugins.registerPlugin({
    name: "text",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked }) => {
      node.textContent = tracked ?? "";
    },
  });

  vln.plugins.registerPlugin({
    name: "if",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked }) => {
      if (node instanceof HTMLElement)
        node.style.display = tracked ? "" : "none";
    },
  });

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
      return { state: { managedClasses } };
    },
  });

  vln.plugins.registerPlugin({
    name: "on",
    destroy: ({ node, pluginState, subkey }) => {
      if (pluginState?.handler)
        node.removeEventListener(subkey, pluginState.handler);
    },
    render: ({ reactiveState, expr, node, subkey, pluginState = {} }) => {
      if (typeof node.addEventListener !== "function") {
        console.warn("[VLN004] No events hook found");
        return;
      }
      if (!subkey) {
        console.warn("[VLN005] Expected event name 'on:event'");
        return;
      }
      // Pass true for allowMutations - event handlers should be able to mutate state
      const handler = (event) => {
        // Build interpolations map with event object directly
        const interpolations = new Map();
        interpolations.set('event', event);

        const substate = vln.composeState(reactiveState, interpolations);

        try {
          vln.evaluate(substate, expr, true);
        } finally {
          vln.cleanupState(reactiveState, substate);
        }
      };
      node.addEventListener(subkey, handler);
      return { state: { handler } };
    },
  });

  vln.plugins.registerPlugin({
    name: "input",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked, expr, reactiveState, pluginState = {} }) => {
      const isInput = node instanceof HTMLInputElement;
      const isSelect = node instanceof HTMLSelectElement;
      const isContentEditable = node.isContentEditable;

      if (!isInput && !isSelect && !isContentEditable) {
        console.warn(
          "[VLN006] Target is not input, select, or contenteditable element"
        );
        return;
      }

      const setter = vln.getSetter(reactiveState, expr);

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
      } else if (isSelect) {
        if (node.value !== tracked) node.value = tracked;
      } else if (isContentEditable) {
        if ((node.textContent || "") !== tracked) node.textContent = tracked;
      }

      return { state: { initialized: true } };
    },
  });

  vln.plugins.registerPlugin({
    name: "loop",
    priority: vln.plugins.priorities.STOPPER,
    track: vln.trackers.expressionTracker,
    destroy: ({ pluginState, reactiveState }) => {
      const parent = pluginState?.placeholder?.parentNode;
      if (parent && pluginState) {
        if (pluginState.substates) {
          pluginState.substates.forEach((sub) => {
            if (sub) {
              vln.cleanupState(reactiveState, sub);
            }
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
      reactiveState,
      node,
      subkey,
      tracked,
      expr,
      attributeName,
      pluginState = {},
    }) => {
      const parent = node.parentNode || pluginState.parent;
      if (!parent) return { halt: true };

      const isInit = !pluginState.initialized;
      if (isInit) {
        const placeholder = document.createComment(attributeName);
        vln.ø__internal.consumeAttribute(node, attributeName, expr);
        pluginState.template = node.cloneNode(true);
        pluginState.placeholder = placeholder;
        pluginState.parent = parent;
        pluginState.initialized = true;
        pluginState.children = [];
        pluginState.keyMap = new Map();
        pluginState.reusePool = [];
        pluginState.reactiveState = reactiveState;
        pluginState.substates = [];
        parent.replaceChild(placeholder, node);
      }

      const { template, placeholder } = pluginState;
      if (!tracked || typeof tracked[Symbol.iterator] !== "function") {
        return { halt: true, state: pluginState };
      }

      const oldChildren = pluginState.children;
      const oldSubstates = pluginState.substates;
      const newChildren = [];
      const newSubstates = [];

      let lastInserted = placeholder;

      for(let i = 0; i < tracked.length; i++) {
        if (oldChildren.length > i) {
          const node = oldChildren[i];
          const substate = oldSubstates[i];
          newChildren.push(node);
          newSubstates.push(substate);
          lastInserted = node;

          // Update $index interpolation for reused substates
          if (substate?.interpolations) {
            substate.interpolations.set('$index', `${i}`);
          }

          if (substate?.interpolations.size) {
            vln.ø__internal.triggerEffects(
              `${expr}[${i}]`,
              substate
            );
            // Trigger $index updates
            vln.ø__internal.triggerEffects('root.$index', substate);
          }
        } else {
          const clone = template.cloneNode(true);
          newChildren.push(clone);

          // Build interpolations map with item and $index
          const interpolations = new Map();
          if (subkey) {
            interpolations.set(subkey, `${expr}[${i}]`);
          }
          // Add $index as a literal expression
          interpolations.set('$index', `${i}`);

          const substate = vln.composeState(reactiveState, interpolations);

          if (subkey) {
            substate.interpolations.set(subkey, `${expr}[${i}]`);
          }
          substate.interpolations.set('$index', `${i}`);

          newSubstates.push(substate);
          placeholder.parentNode.insertBefore(clone, lastInserted.nextSibling);
          lastInserted = clone;
          vln.processNode(clone, substate);
        }
      };

      for (let i = tracked.length; i < oldChildren.length; i++) {
        oldChildren[i].remove?.();
        vln.cleanupState(reactiveState, oldSubstates[i]);
      }

      pluginState.children = newChildren;
      pluginState.substates = newSubstates;

      return { halt: true, state: pluginState };
    },
  });
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupVelinStd(/** @type {VelinCore} */ (__win.Velin));
}

export default setupVelinStd;
