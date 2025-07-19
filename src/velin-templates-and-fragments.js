// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  /**
   * @param {string[]} a
   * @param {string[]} b
   */
  function diffArrays(a, b) {
    const setB = new Set(b || []);
    return (a || []).filter((item) => !setB.has(item));
  }

  // TEMPLATES and FRAGMENT

  // vln-template="template-name" vln-var="varName1" vln-var="varName2"...
  vln.plugins.registerPlugin({
    name: "template",
    priority: vln.plugins.priorities.STOPPER,
    track: ({ reactiveState }) =>
      vln.getSetter(reactiveState, "vln.ø__templates"),
    render: ({ node, expr, tracked, reactiveState }) => {
      const key = expr;
      if (!key) return { halt: true };

      const templates = reactiveState.state["ø__templates"] || {};

      const params = Array.from(node.attributes)
        .filter((a) => a.name === "vln-var")
        .map((a) => a.value);

      templates[key] = {
        html: node.innerHTML,
        params,
      };
      if (!reactiveState.state["ø__templates"]) tracked(templates);
      const parent = node.parentNode;
      if (parent) parent.removeChild(node);

      return { halt: true };
    },
  });

  // vln-fragment="template-name" vln-var:varName1="vln.value1" vln-var:varName2="vln.value2"...
  vln.plugins.registerPlugin({
    name: "fragment",
    priority: vln.plugins.priorities.LATE,
    track: ({ reactiveState, expr }) => {
      return {
        templates: vln.evaluate(reactiveState, "vln.ø__templates"),
        key: vln.evaluate(reactiveState, expr),
      };
    },
    render: ({ node, tracked, reactiveState, pluginState = {} }) => {
      const key = tracked.key;
      if (!key)
        throw new Error("[VLN008] Expected template name as expression");
      const templates = tracked.templates || {};
      const template = templates[key];
      if (!template) return { halt: true };
      if (pluginState?.reactiveInnerState) {
        vln.cleanupState(reactiveState, pluginState.reactiveInnerState);
      }
      node.innerHTML = "";

      const templateFragment = document
        .createRange()
        .createContextualFragment(template.html);
      const clone = /** @type HTMLElement */ (templateFragment.cloneNode(true));
      const interpolations = new Map(
        Array.from(node.attributes)
          .filter((a) => a.name.startsWith("vln-var"))
          .map((a) => [a.name.split(":")[1], a.value])
      );

      const paramsDiff = diffArrays(
        template.params,
        Array.from(interpolations.keys())
      );
      if (paramsDiff.length) {
        console.error(
          `[VLN009] Template '${key}' requires the following parameters: [${paramsDiff.join(
            ", "
          )}]`
        );
        return { halt: true };
      }
      const reactiveInnerState = vln.composeState(
        reactiveState,
        interpolations
      );

      // Insert children directly into the host node
      Array.from(clone.childNodes).forEach((child) => {
        node.appendChild(child);
        vln.processNode(child, reactiveInnerState);
      });

      return { halt: true, state: { reactiveInnerState } };
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
