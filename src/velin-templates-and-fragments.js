// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @typedef {import('./velin-core').Interpolation} Interpolation
 */

/**
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
   * **Validation:**
   * Will error if required variables (from vln-vars) are not provided.
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/templates.md|Templates & Fragments Guide}
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md|Directives Guide}
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/playground/index.html|Interactive Examples}
   */
  vln.plugins.registerPlugin({
    name: "fragment",
    priority: vln.plugins.priorities.LATE,

    track: ({ compiledExpression, evaluate, evaluateAst, node }) => {
      // Track the template ID
      const templateId = evaluateAst(compiledExpression);

      // Also track all vln-var:* expressions and their current values
      const varValues = {};
      if (node instanceof HTMLElement) {
        const varAttrs = Array.from(node.attributes)
          .filter(a => a.name.startsWith("vln-var:"));

        for (const attr of varAttrs) {
          const varName = attr.name.slice(8); // Remove "vln-var:" prefix
          varValues[varName] = evaluate(attr.value);
        }
      }

      // Return both template ID and var values so changes trigger re-render
      return { templateId, varValues };
    },

    destroy: ({ node, pluginState }) => {
      // Cleanup inner state
      if (pluginState?.innerChild) {
        pluginState.innerChild.cleanup(node);
      }
    },

    render: ({ node, tracked, compose, pluginState = {} }) => {
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
      if (!templateChanged && pluginState?.innerChild) {
        return {
          halt: true,
          pluginState,
        };
      }

      // Template changed - cleanup and rebuild
      if (pluginState?.innerChild) {
        pluginState.innerChild.cleanup(node);
      }
      node.innerHTML = "";

      // Extract required vars from template (supports vln-vars="x, y" format)
      const varsAttr = template.getAttribute("vln-vars");
      const templateVars = varsAttr
        ? varsAttr.split(',').map(v => v.trim()).filter(v => v)
        : [];

      // Extract provided vars from fragment node and build a compose() input
      /** @type {Record<string, {expr: string}>} */
      const composeInit = {};
      for (const attr of Array.from(node.attributes)) {
        if (attr.name.startsWith("vln-var:")) {
          composeInit[attr.name.slice(8)] = { expr: attr.value };
        }
      }

      // Validate required vars are provided
      const missingVars = templateVars.filter(v => !(v in composeInit));

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

      // Create scoped child and process child nodes inside it
      const innerChild = compose(composeInit);
      Array.from(clone.childNodes).forEach(child => {
        node.appendChild(child);
        innerChild.processNode(child);
      });

      return {
        halt: true,
        pluginState: {
          templateId,
          innerChild,
        },
      };
    },
  });
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupTemplatesAndFragments(/** @type {VelinCore} */ (__win.Velin));
}

export default setupTemplatesAndFragments;
