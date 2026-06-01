// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 */

/**
 * @param {VelinCore} vln
 */
function setupVelinRouter(vln) {
  /**
   * vln-router="routeName"
   * Creates a scope with $route bound to 'routeName'.
   */
  vln.plugins.registerPlugin({
    name: "router",
    priority: vln.plugins.priorities.STOPPER,
    render: ({ node, expr, reactiveState }) => {
      // 1. Ensure the router state exists in the root
      if (!reactiveState.state[expr]) {
        reactiveState.state[expr] = { path: window.location.pathname, params: {}, query: {}, error: null, loading: false };
      }

      // 2. Compose a new scoped state with $route pointing to the router object
      const interpolations = new Map();
      interpolations.set("$route", expr);
      const scopedState = vln.composeState(reactiveState, interpolations);

      // 3. Set up path synchronization
      const routerState = reactiveState.state[expr];
      const updatePath = () => {
        routerState.path = window.location.pathname;
        const query = {};
        new URLSearchParams(window.location.search).forEach((value, key) => {
          query[key] = value;
        });
        routerState.query = query;
      };
      window.addEventListener("popstate", updatePath);

      // 4. Process children with the new scoped state
      Array.from(node.children).forEach(child => vln.processNode(child, scopedState));

      return {
        state: { unwatch: updatePath, scopedState },
        halt: true // Children already processed
      };
    },
    destroy: ({ pluginState }) => {
      window.removeEventListener("popstate", pluginState.unwatch);
    }
  });

  /**
   * vln-route="/path/:id"
   * Conditional renderer based on $route.path.
   */
  vln.plugins.registerPlugin({
    name: "route",
    priority: vln.plugins.priorities.STOPPER,
    track: ({ reactiveState }) => {
      // Access $route.path through the interpolations/evaluator
      const path = vln.evaluate(reactiveState, "$route.path");
      return path || "";
    },
    render: ({ node, expr, tracked }) => {
      const pathPattern = expr.replace(/^['"]|['"]$/g, '');
      const pattern = pathPattern.replace(/:([^\/]+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      const match = (tracked || "").match(regex);

      if (match) {
        node.style.display = "";
        return { halt: false };
      } else {
        node.style.display = "none";
        return { halt: true };
      }
    }
  });
}

// Auto-bootstrap
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupVelinRouter(/** @type {VelinCore} */ (__win.Velin));
}

export default setupVelinRouter;
