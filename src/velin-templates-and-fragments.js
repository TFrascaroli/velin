// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  /**
   * vln-fragment: Renders a template with scoped variables.
   * Creates reusable component-like functionality with data binding.
   *
   * **Basic Usage:**
   * Define template with required variables using vln-vars attribute:
   *   <template id="userCard" vln-vars="user, onSave">
   *     <div class="card">
   *       <h3 vln-text="user.name"></h3>
   *       <button vln-on:click="onSave(user)">Save</button>
   *     </div>
   *   </template>
   *
   * Use template with vln-fragment and provide variables with vln-var:
   *   <div vln-fragment="'userCard'"
   *        vln-var:user="currentUser"
   *        vln-var:onSave="handleSave"></div>
   *
   * **Dynamic Template Selection:**
   *   <div vln-fragment="user.role + 'Card'" ...></div>
   *
   * **In Loops:**
   *   <div vln-loop:user="users"
   *        vln-fragment="'userCard'"
   *        vln-var:user="user"
   *        vln-var:actions="createActions(user)"></div>
   *
   * **Lifecycle Hooks (optional special vars):**
   *   vln-var:onMount="setupComponent()"    - Called after template rendered
   *   vln-var:onUnmount="cleanupComponent()" - Called before template removed
   *
   * **Validation:**
   * Will error if required variables (from vln-vars) are not provided.
   * Lifecycle hooks (onMount, onUnmount) are optional and don't need declaration.
   *
   * @see {@link https://github.com/yourusername/velin/blob/main/docs/templates.md|Templates & Fragments Guide}
   * @see {@link https://github.com/yourusername/velin/blob/main/docs/directives.md|Directives Guide}
   * @see {@link https://github.com/yourusername/velin/blob/main/playground/examples.html|Interactive Examples}
   */
  vln.plugins.registerPlugin({
    name: "fragment",
    priority: vln.plugins.priorities.LATE,

    track: ({ reactiveState, expr, node }) => {
      // Track the template ID
      const templateId = vln.evaluate(reactiveState, expr);

      // Also track all vln-var:* expressions and their current values
      const varValues = {};
      if (node instanceof HTMLElement) {
        const varAttrs = Array.from(node.attributes)
          .filter(a => a.name.startsWith("vln-var:") && !['onMount', 'onUnmount'].includes(a.name.slice(8)));

        for (const attr of varAttrs) {
          const varName = attr.name.slice(8); // Remove "vln-var:" prefix
          varValues[varName] = vln.evaluate(reactiveState, attr.value);
        }
      }

      // Return both template ID and var values so changes trigger re-render
      return { templateId, varValues };
    },

    destroy: ({ pluginState, reactiveState }) => {
      // Trigger onUnmount if it exists
      if (pluginState?.lifecycle?.onUnmount) {
        try {
          vln.evaluate(pluginState.innerState, pluginState.lifecycle.onUnmount);
        } catch (err) {
          console.error('[Velin Templates] Error in onUnmount hook:', err);
        }
      }

      // Cleanup inner state
      if (pluginState?.innerState) {
        vln.cleanupState(reactiveState, pluginState.innerState);
      }
    },

    render: ({ node, tracked, reactiveState, pluginState = {} }) => {
      const templateId = tracked?.templateId || tracked;

      if (!templateId) {
        console.error(
          '[Velin Templates] vln-fragment requires a template ID. ' +
          'Usage: vln-fragment="\'templateId\'" or vln-fragment="dynamicId"'
        );
        return { halt: true };
      }

      // Check if template changed - if not, just update the inner state's interpolations
      const templateChanged = !pluginState?.templateId || pluginState.templateId !== templateId;

      // Fetch template from DOM
      const template = document.getElementById(templateId);

      if (!template) {
        console.error(
          `[Velin Templates] Template #${templateId} not found. ` +
          `Make sure you have <template id="${templateId}"> in your HTML.`
        );
        return { halt: true };
      }

      if (!(template instanceof HTMLTemplateElement)) {
        console.error(
          `[Velin Templates] Element #${templateId} is not a <template>. ` +
          `Found: <${template.tagName.toLowerCase()}>`
        );
        return { halt: true };
      }

      // If template didn't change, inner nodes' effects will handle updates - nothing to do
      if (!templateChanged && pluginState?.innerState) {
        return {
          halt: true,
          state: pluginState
        };
      }

      // Template changed - cleanup and rebuild
      if (pluginState?.innerState) {
        vln.cleanupState(reactiveState, pluginState.innerState);
      }
      node.innerHTML = "";

      // Extract required vars from template (supports vln-vars="x, y" format)
      const varsAttr = template.getAttribute("vln-vars");
      const templateVars = varsAttr
        ? varsAttr.split(',').map(v => v.trim()).filter(v => v)
        : [];

      // Extract provided vars from fragment node
      const interpolations = new Map(
        Array.from(node.attributes)
          .filter(a => a.name.startsWith("vln-var:"))
          .map(a => [a.name.slice(8), a.value]) // "vln-var:".length === 8
      );

      // Validate required vars are provided (excluding lifecycle hooks)
      const missingVars = templateVars.filter(v =>
        v !== 'onMount' &&
        v !== 'onUnmount' &&
        !interpolations.has(v)
      );

      if (missingVars.length) {
        console.error(
          `[Velin Templates] Template #${templateId} requires missing variables: ` +
          `[${missingVars.join(", ")}]. ` +
          `Add them as: vln-var:${missingVars[0]}="yourValue"`
        );
        return { halt: true };
      }

      // Clone template content
      const clone = template.content.cloneNode(true);

      // Create scoped state
      const innerState = vln.composeState(reactiveState, interpolations);

      // Handle lifecycle hooks
      const lifecycle = {
        onMount: interpolations.get('onMount'),
        onUnmount: interpolations.get('onUnmount')
      };

      // Append and process child nodes
      Array.from(clone.childNodes).forEach(child => {
        node.appendChild(child);
        vln.processNode(child, innerState);
      });

      // Trigger onMount after processing
      if (lifecycle.onMount) {
        try {
          vln.evaluate(innerState, lifecycle.onMount);
        } catch (err) {
          console.error('[Velin Templates] Error in onMount hook:', err);
        }
      }

      return {
        halt: true,
        state: {
          templateId,
          innerState,
          lifecycle
        }
      };
    },
  });

  /**
   * vln-use: Alias for vln-fragment.
   * Some developers prefer this naming convention.
   *
   * @example
   * // These are equivalent:
   * <div vln-fragment="'userCard'" vln-var:user="currentUser"></div>
   * <div vln-use="'userCard'" vln-var:user="currentUser"></div>
   *
   * @see {@link https://github.com/yourusername/velin/blob/main/docs/templates.md#alternative-vln-use|Templates Guide: vln-use}
   */
  vln.plugins.registerPlugin({
    name: "use",
    priority: vln.plugins.priorities.LATE,
    track: ({ reactiveState, expr }) => {
      return vln.evaluate(reactiveState, expr);
    },
    destroy: ({ node, pluginState, reactiveState, subkey }) => {
      // Delegate to fragment plugin
      const fragmentPlugin = vln.plugins.get('fragment');
      if (fragmentPlugin?.destroy) {
        fragmentPlugin.destroy({ node, pluginState, reactiveState, subkey });
      }
    },
    render: (args) => {
      // Delegate to fragment plugin
      const fragmentPlugin = vln.plugins.get('fragment');
      return fragmentPlugin.render(args);
    }
  });
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupTemplatesAndFragments(/** @type {VelinCore} */ (__win.Velin));
}

export default setupTemplatesAndFragments;
