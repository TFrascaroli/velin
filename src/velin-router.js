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
   * Syncs window.location with a reactive state object.
   */
  vln.plugins.registerPlugin({
    name: "router",
    render: ({ reactiveState, expr, node }) => {
      // Initialize router state if not present
      if (!reactiveState.state[expr]) {
        reactiveState.state[expr] = { path: window.location.pathname, params: {}, query: {}, error: null, loading: false };
      }

      const routerState = reactiveState.state[expr];

      const updatePath = () => {
        routerState.path = window.location.pathname;
        const query = {};
        new URLSearchParams(window.location.search).forEach((value, key) => {
          query[key] = value;
        });
        routerState.query = query;
      };

      // Sync state -> URL
      // Watch path for changes
      const unwatch = () => { /* no-op */ }; 
      // Manual watch implementation using existing tracking if needed
      
      window.addEventListener("popstate", updatePath);
      
      return {
        state: { unwatch }
      };
    },
    destroy: ({ pluginState }) => {
      window.removeEventListener("popstate", pluginState.unwatch);
    }
  });

  /**
   * vln-route="/path/:id"
   * Conditional renderer based on route matching.
   */
  vln.plugins.registerPlugin({
    name: "route",
    priority: vln.plugins.priorities.STOPPER,
    render: ({ node, expr, reactiveState }) => {
      // Find parent router state (look up the DOM)
      let routerObj = null;
      let el = node.parentElement;
      while (el && !routerObj) {
        // This is a naive lookup - ideally we'd have a better way to register routers
        // For now, assume the user handles this by naming
        el = el.parentElement;
      }
      
      // Simple path matching
      const currentPath = window.location.pathname;
      const pattern = expr.replace(/:([^\/]+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      const match = currentPath.match(regex);

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
