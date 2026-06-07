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
    track: vln.trackers.expressionTracker,
    render: ({ expr, reactiveState, pluginState = {} }) => {
      // 1. Ensure state exists and is properly initialized
      const currentHash = globalThis.location.hash.startsWith('#') 
        ? globalThis.location.hash.slice(1) 
        : '/';
      
      // Access the current value once to check if we need to initialize
      let routerState = reactiveState.state[expr];
      if (!routerState || typeof routerState !== 'object') {
        routerState = {};
        reactiveState.state[expr] = routerState;
        // Re-read it to get the Proxy if it was just created
        routerState = reactiveState.state[expr];
      }
      
      if (routerState.path !== currentHash) {
        routerState.path = currentHash;
      }
      if (!routerState.params) routerState.params = {};
      if (!routerState.query) routerState.query = {};
      if (routerState.error === undefined) routerState.error = null;
      if (routerState.loading === undefined) routerState.loading = false;
      
      if (typeof routerState.navigateTo !== 'function') {
        routerState.navigateTo = function(path) {
          globalThis.location.hash = path;
        }
      }

      // 2. Initialize watchers only once
      if (!pluginState.initialized) {
        console.log('Router plugin initializing - adding listener');
        const onHashChange = () => {
          const hashPath = globalThis.location.hash.startsWith('#') 
            ? globalThis.location.hash.slice(1) 
            : '/';
          
          if (routerState.path !== hashPath) {
            routerState.path = hashPath;
            
            const query = {};
            new URLSearchParams(globalThis.location.search).forEach((value, key) => {
              query[key] = value;
            });
            routerState.query = query;
          }
        };

        globalThis.addEventListener("hashchange", onHashChange);
        
        const interpolations = new Map();
        interpolations.set("$__route", { type: 'EXPR', value: { expr } });
        const scopedState = vln.composeState(reactiveState, interpolations);

        pluginState.initialized = true;
        pluginState.unwatch = onHashChange;
        pluginState.scopedState = scopedState;
      }

      return {
        halt: false,
        scopedState: pluginState.scopedState,
        state: pluginState,
      };
    },
    destroy: ({ pluginState }) => {
      console.log('Destroy called, unwatch:', pluginState.unwatch);
      if (pluginState.unwatch) {
        globalThis.removeEventListener("hashchange", pluginState.unwatch);
      }
    }
  });

  /**
   * vln-route="/path/:id"
   * Conditional renderer based on $route.path.
   */
  vln.plugins.registerPlugin({
    name: "route",
    priority: vln.plugins.priorities.STOPPER + 10,
    track: ({ reactiveState, expr }) => {
      // Access $__route.path through the interpolations/evaluator
      const currentPath = vln.evaluate(reactiveState, "$__route.path") || "";
      const targetPath = vln.evaluate(reactiveState, expr);
      return {
        currentPath,
        targetPath,
      };
    },
    destroy: ({ reactiveState, pluginState }) => {
      if (pluginState?.activeNode) {
        vln.cleanupState(reactiveState, pluginState.childState, pluginState.activeNode);
        pluginState.activeNode.remove();
      }
      if (pluginState?.placeholder?.parentNode) {
        pluginState.placeholder.remove();
      }
    },
    render: ({ node, expr, reactiveState, tracked, pluginState = {}, attributeName }) => {
      const parent = node.parentNode || pluginState.parent;
      if (!parent) return { halt: true };

      if (!pluginState.initialized) {
        const placeholder = document.createComment(attributeName);
        vln.ø__internal.consumeAttribute(node, attributeName, expr);
        pluginState.template = node.cloneNode(true);
        pluginState.placeholder = placeholder;
        pluginState.parent = parent;
        pluginState.initialized = true;
        pluginState.activeNode = null;
        pluginState.childState = null;
        parent.replaceChild(placeholder, node);
      }

      const pattern = tracked.targetPath.replace(/:([^/]+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      const match = (tracked.currentPath || "").match(regex);

      if (match) {
        if (!pluginState.activeNode) {
          const clone = pluginState.template.cloneNode(true);
          // Consume the attribute on the clone to prevent re-processing this plugin
          vln.ø__internal.consumeAttribute(clone, attributeName, expr);

          // Create scoped state for children so they can be cleaned up
          pluginState.childState = vln.composeState(reactiveState, new Map());
          
          pluginState.placeholder.parentNode.insertBefore(clone, pluginState.placeholder);
          vln.processNode(clone, pluginState.childState);
          pluginState.activeNode = clone;
        }
      } else {
        if (pluginState.activeNode) {
          vln.cleanupState(reactiveState, pluginState.childState, pluginState.activeNode);
          pluginState.activeNode.remove();
          pluginState.activeNode = null;
          pluginState.childState = null;
        }
      }

      return { halt: true, state: pluginState };
    }
  });
}

// Auto-bootstrap
/** @type {any} */
const __win = globalThis.window ? globalThis.window : {};
if (__win.Velin) {
  setupVelinRouter(/** @type {VelinCore} */ (__win.Velin));
}

export default setupVelinRouter;
