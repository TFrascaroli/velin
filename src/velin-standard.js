// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @typedef {import('./velin-core').Interpolation} Interpolation
 */

/**
 * @param {VelinCore} vln
 */
function setupVelinStd(vln) {
  /**
   * When a parent substate rewrites an interpolation (e.g. keyed vln-loop
   * moves an item's `subkey` from `arr[oldI]` to `arr[newI]`), inherited
   * copies in descendant substates need to follow. `composeState` snapshots
   * parent interpolations at compose time, so we walk the descendant tree
   * and update every substate whose current entry still matches the old
   * expression — preserving nested overrides.
   *
   * @param {any} childContext parent substate's ChildContext (we walk its
   *   inner states, NOT its own interpolations — the caller already
   *   updated those).
   * @param {string} key interpolation name to propagate
   * @param {string} oldExpr expression string the old interpolation held
   * @param {any} newInterp new interpolation object to install
   */
  function propagateInterpolation(childContext, key, oldExpr, newInterp) {
    const rs = childContext && childContext.ø__reactiveState;
    if (!rs || !rs.ø__innerStates) return;
    /** @param {any} state */
    function walk(state) {
      if (!state) return;
      if (state.interpolations) {
        const cur = state.interpolations.get(key);
        if (cur && cur.type === 'EXPR' && cur.value && cur.value.expr === oldExpr) {
          state.interpolations.set(key, newInterp);
        }
      }
      if (state.ø__innerStates) {
        for (const inner of state.ø__innerStates) walk(inner);
      }
    }
    for (const inner of rs.ø__innerStates) walk(inner);
  }

  /**
   * Same as propagateInterpolation but for LITERAL entries ($index). We
   * compare LITERAL values by strict equality.
   *
   * @param {any} childContext
   * @param {string} key
   * @param {any} oldValue
   * @param {any} newInterp
   */
  function propagateLiteralInterpolation(childContext, key, oldValue, newInterp) {
    const rs = childContext && childContext.ø__reactiveState;
    if (!rs || !rs.ø__innerStates) return;
    /** @param {any} state */
    function walk(state) {
      if (!state) return;
      if (state.interpolations) {
        const cur = state.interpolations.get(key);
        if (cur && cur.type === 'LITERAL' && cur.value === oldValue) {
          state.interpolations.set(key, newInterp);
        }
      }
      if (state.ø__innerStates) {
        for (const inner of state.ø__innerStates) walk(inner);
      }
    }
    for (const inner of rs.ø__innerStates) walk(inner);
  }

  /**
   * Re-fire every unique effect owned by this substate and its descendants.
   * Used by keyed vln-loop when an item's substate is reused at a new array
   * position: after we swap the item's interpolation, existing effects
   * still subscribe to old dep paths. Firing each one — including deep
   * effects inside nested substates (vln-fragment, vln-use, nested loops) —
   * lets them re-eval against the new interpolation, produce fresh DOM
   * output, and (re)register on the new dep paths.
   *
   * Stale subscriptions on the old dep paths remain but are harmless — the
   * effects are idempotent when the source of truth (the interpolation)
   * has already been rewritten.
   *
   * @param {any} childContext
   */
  function refreshSubstateEffects(childContext) {
    const rs = childContext && childContext.ø__reactiveState;
    if (!rs) return;
    const fired = new Set();
    /** @param {any} state */
    function walk(state) {
      if (!state) return;
      if (state.ø__innerBindings) {
        for (const effectSet of state.ø__innerBindings.values()) {
          for (const eff of effectSet) {
            if (!fired.has(eff)) { fired.add(eff); eff(); }
          }
        }
      }
      if (state.ø__innerStates) {
        for (const inner of state.ø__innerStates) walk(inner);
      }
    }
    walk(rs);
  }

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
      if (!(node instanceof Element)) {
        console.warn("[VLN001] Cannot set attributes on non-Element nodes");
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
        // The attribute reflects the *default* state (e.g. defaultChecked)
        // and diverges from the live property once the user interacts. For
        // form controls that expose the boolean as a property, also assign
        // it so reactive writes reset the actual checkbox/radio/select state.
        if (subkey in node) {
          try { /** @type {any} */(node)[subkey] = !!tracked; } catch (_) {}
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
      if (!(node instanceof Element)) {
        console.warn("[VLN003] Cannot set classes on non-Element nodes");
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

      // Apply all classes at once. On SVGElement, `.className` is an
      // SVGAnimatedString (read-only string assignment silently fails),
      // so route through setAttribute for cross-element safety.
      node.setAttribute("class", Array.from(current).join(" "));
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
      const isContentEditable = node instanceof HTMLElement && node.isContentEditable;

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
   * vln-watch:methodName: Monitors an expression and calls a method when it changes.
   *
   * The subkey is the handler path (resolved against state); the attribute value
   * is the expression whose dependencies are tracked. The handler receives the
   * newly evaluated value.
   *
   * @example
   * <div vln-watch:logChange="count"></div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-watch|Directives Guide: vln-watch}
   */
  vln.plugins.registerPlugin({
    name: "watch",
    track: vln.trackers.expressionTracker,
    render: ({ tracked, subkey, evaluate }) => {
      if (!subkey) {
        console.warn("[VLN007] vln-watch requires a handler: vln-watch:methodName=\"expr\"");
        return;
      }
      const handler = evaluate(subkey);
      if (typeof handler !== "function") {
        console.warn(`[VLN007] vln-watch:${subkey} did not resolve to a function (HTML lowercases attribute names — use lowercase handler paths)`);
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
   * @example
   * // Keyed diff: pass { collection, key } to reuse substates by identity
   * // instead of by position. On reorder, DOM nodes are moved rather than
   * // rebuilt — big win when the row template is expensive (fragments etc).
   * // Throws if any item lacks the key field or if two items share a key.
   * <div vln-loop:row="{collection: rows, key: 'id'}">
   *   <span vln-text="row.name"></span>
   * </div>
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
      pluginState.keys = null;
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
        pluginState.keys = [];
        parent.replaceChild(placeholder, node);
      }

      // Two supported shapes:
      //   plain iterable          → positional diff (existing behavior)
      //   { collection, key: '…' } → keyed diff (reuse by item identity)
      let collection = tracked;
      let keyField = null;
      if (
        tracked &&
        typeof tracked === 'object' &&
        !Array.isArray(tracked) &&
        typeof tracked[Symbol.iterator] !== 'function' &&
        'collection' in tracked
      ) {
        collection = tracked.collection;
        keyField = tracked.key != null ? String(tracked.key) : null;
      }

      const { template, placeholder } = pluginState;
      if (!collection || typeof collection[Symbol.iterator] !== 'function') {
        return { halt: true, pluginState };
      }

      const oldChildren = pluginState.children;
      const oldSubstates = pluginState.substates;

      // ── KEYED DIFF ────────────────────────────────────────────────────────
      // Substates are matched to old ones by their key. When an item moves,
      // its substate follows — we swap the item interpolation and refresh
      // this substate's own effects so they re-eval against the new
      // interpolation and capture fresh deps. The child template (and any
      // expensive vln-fragment underneath it) survives untouched.
      //
      // The item interpolation uses `${expr}.collection[${i}]` so it
      // evaluates the config object once and indexes the wrapped array;
      // that indexing goes through the array proxy so effects still
      // subscribe to the real underlying `root.<arrayPath>[i]` paths.
      if (keyField) {
        const oldKeys = pluginState.keys || [];
        const oldByKey = new Map();
        for (let j = 0; j < oldKeys.length; j++) oldByKey.set(oldKeys[j], j);

        const newChildren = [];
        const newSubstates = [];
        const newKeys = [];
        const usedOld = new Set();
        const seen = new Set();

        let lastInserted = placeholder;

        for (let i = 0; i < collection.length; i++) {
          const item = collection[i];
          if (
            item == null ||
            typeof item !== 'object' ||
            !Object.prototype.hasOwnProperty.call(item, keyField)
          ) {
            throw new Error(
              `[VLN020] vln-loop: item at index ${i} has no own property ` +
              `'${keyField}' — required by keyed loop config { key: '${keyField}' }.`,
            );
          }
          const key = item[keyField];
          if (seen.has(key)) {
            throw new Error(
              `[VLN021] vln-loop: duplicate key ${JSON.stringify(key)} ` +
              `at index ${i} — keyed loops require every item's key to be unique.`,
            );
          }
          seen.add(key);

          const itemExpr = `${expr}.collection[${i}]`;

          const oldIdx = oldByKey.get(key);
          if (oldIdx !== undefined) {
            const reusedNode = oldChildren[oldIdx];
            const reusedChild = oldSubstates[oldIdx];
            usedOld.add(oldIdx);
            newChildren.push(reusedNode);
            newSubstates.push(reusedChild);
            newKeys.push(key);

            // Point the item interpolation at its new position and refresh
            // $index. `composeState` snapshots inherited interpolations
            // into descendants, so we also propagate the swap into the
            // subtree — otherwise vln-fragment/vln-use children still see
            // the old expression.
            const oldItemExpr = `${expr}.collection[${oldIdx}]`;
            if (subkey) {
              const newInterp = {
                type: 'EXPR',
                value: { expr: itemExpr, ast: vln.compile(itemExpr) },
              };
              reusedChild.setInterpolation(subkey, newInterp);
              propagateInterpolation(reusedChild, subkey, oldItemExpr, newInterp);
            }
            reusedChild.anchor(expr);
            const newIndexInterp = { type: 'LITERAL', value: i };
            reusedChild.setInterpolation('$index', newIndexInterp);
            propagateLiteralInterpolation(reusedChild, '$index', oldIdx, newIndexInterp);

            // Only refresh when the substate actually moved — an in-place
            // reuse points at the same array slot, so the existing
            // subscriptions already match.
            if (oldIdx !== i) refreshSubstateEffects(reusedChild);

            // Move DOM into position only when needed.
            if (reusedNode.previousSibling !== lastInserted) {
              placeholder.parentNode.insertBefore(reusedNode, lastInserted.nextSibling);
            }
            lastInserted = reusedNode;
          } else {
            const clone = template.cloneNode(true);
            newChildren.push(clone);
            newKeys.push(key);

            const init = subkey
              ? { [subkey]: { expr: itemExpr }, $index: { literal: i } }
              : { $index: { literal: i } };
            const child = compose(init).anchor(expr);

            newSubstates.push(child);
            child.processNode(clone);
            placeholder.parentNode.insertBefore(clone, lastInserted.nextSibling);
            lastInserted = clone;
          }
        }

        for (let j = 0; j < oldSubstates.length; j++) {
          if (!usedOld.has(j)) {
            const childNode = oldChildren[j];
            childNode.remove?.();
            oldSubstates[j].cleanup(childNode);
          }
        }

        pluginState.children = newChildren;
        pluginState.substates = newSubstates;
        pluginState.keys = newKeys;
        return { halt: true, pluginState };
      }

      // ── POSITIONAL DIFF (existing behavior) ───────────────────────────────
      const newChildren = [];
      const newSubstates = [];

      let lastInserted = placeholder;

      for (let i = 0; i < collection.length; i++) {
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
          child.processNode(clone);
          placeholder.parentNode.insertBefore(clone, lastInserted.nextSibling);
          lastInserted = clone;
        }
      }

      for (let i = collection.length; i < oldChildren.length; i++) {
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
