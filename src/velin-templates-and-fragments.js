// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  /**
   * Renders a template fragment with scoped reactive state.
   *
   * Usage:
   *   <template id="userCard" vln-var="user" vln-var="onSave">
   *     <div class="card">
   *       <h3 vln-text="vln.user.name"></h3>
   *       <button vln-on:click="vln.onSave(vln.user)">Save</button>
   *     </div>
   *   </template>
   *
   *   <div vln-fragment="'userCard'"
   *        vln-var:user="vln.currentUser"
   *        vln-var:onSave="vln.handleSave"></div>
   *
   * Dynamic templates:
   *   <div vln-fragment="vln.user.role + 'Card'" ...></div>
   *
   * Lifecycle hooks (optional special vars):
   *   vln-var:onMount="vln.setupComponent()"
   *   vln-var:onUnmount="vln.cleanupComponent()"
   */
  vln.plugins.registerPlugin({
    name: "fragment",
    priority: vln.plugins.priorities.LATE,

    track: ({ reactiveState, expr }) => {
      return vln.evaluate(reactiveState, expr);
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
      const templateId = tracked;

      if (!templateId) {
        console.error(
          '[Velin Templates] vln-fragment requires a template ID. ' +
          'Usage: vln-fragment="\'templateId\'" or vln-fragment="vln.dynamicId"'
        );
        return { halt: true };
      }

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

      // Cleanup previous render
      if (pluginState?.innerState) {
        vln.cleanupState(reactiveState, pluginState.innerState);
      }

      // Clear node content
      node.innerHTML = "";

      // Extract required vars from template
      const templateVars = Array.from(template.attributes)
        .filter(a => a.name === "vln-var")
        .map(a => a.value);

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
          `Add them as: vln-var:${missingVars[0]}="vln.yourValue"`
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
          innerState,
          lifecycle
        }
      };
    },
  });

  /**
   * Alternative name for fragment (some devs prefer "use")
   * Usage: <div vln-use="'templateId'"></div>
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
