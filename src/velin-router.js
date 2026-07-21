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
    render: ({ expr, state, compose, pluginState = {} }) => {
      // 1. Ensure state exists and is properly initialized
      const currentHash = globalThis.location.hash.startsWith('#')
        ? globalThis.location.hash.slice(1)
        : '/';

      // Access the current value once to check if we need to initialize
      let routerState = state[expr];
      if (!routerState || typeof routerState !== 'object') {
        state[expr] = {};
        // Re-read to get the Proxy after assignment
        routerState = state[expr];
      }

      if (routerState.path !== currentHash) {
        routerState.path = currentHash;
      }
      if (!routerState.params) routerState.params = {};
      if (routerState.error === undefined) routerState.error = null;
      if (routerState.loading === undefined) routerState.loading = false;

      if (typeof routerState.navigateTo !== 'function') {
        routerState.navigateTo = function(path) {
          globalThis.location.hash = path;
        }
      }

      // 2. Initialize watchers only once
      if (!pluginState.initialized) {
        const onHashChange = () => {
          const hashPath = globalThis.location.hash.startsWith('#')
            ? globalThis.location.hash.slice(1)
            : '/';

          if (routerState.path !== hashPath) {
            routerState.path = hashPath;
          }
        };

        globalThis.addEventListener("hashchange", onHashChange);

        pluginState.initialized = true;
        pluginState.unwatch = onHashChange;
        pluginState.scopedChild = compose({ $__route: { expr } });
      }

      return {
        halt: false,
        scopedState: pluginState.scopedChild,
        pluginState,
      };
    },
    destroy: ({ pluginState }) => {
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
    track: ({ evaluate, expr }) => {
      // Access $__route.path through the interpolations/evaluator
      const currentPath = evaluate("$__route.path") || "";
      const targetPath = evaluate(expr);
      return {
        currentPath,
        targetPath,
      };
    },
    destroy: ({ pluginState }) => {
      if (pluginState?.activeNode) {
        pluginState.childCtx.cleanup(pluginState.activeNode);
        pluginState.activeNode.remove();
      }
      if (pluginState?.placeholder?.parentNode) {
        pluginState.placeholder.remove();
      }
    },
    render: ({ node, expr, compose, consume, tracked, pluginState = {}, attributeName }) => {
      const parent = node.parentNode || pluginState.parent;
      if (!parent) return { halt: true };

      if (!pluginState.initialized) {
        const placeholder = document.createComment(attributeName);
        consume(node, attributeName, expr);
        pluginState.template = node.cloneNode(true);
        pluginState.placeholder = placeholder;
        pluginState.parent = parent;
        pluginState.initialized = true;
        pluginState.activeNode = null;
        pluginState.childCtx = null;
        parent.replaceChild(placeholder, node);
      }

      const pattern = tracked.targetPath.replace(/:([^/]+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      const match = (tracked.currentPath || "").match(regex);

      if (match) {
        if (!pluginState.activeNode) {
          const clone = pluginState.template.cloneNode(true);
          // Consume the attribute on the clone to prevent re-processing this plugin
          consume(clone, attributeName, expr);

          // Create scoped child for cleanup tracking
          pluginState.childCtx = compose({});

          pluginState.placeholder.parentNode.insertBefore(clone, pluginState.placeholder);
          pluginState.childCtx.processNode(clone);
          pluginState.activeNode = clone;
        }
      } else {
        if (pluginState.activeNode) {
          pluginState.childCtx.cleanup(pluginState.activeNode);
          pluginState.activeNode.remove();
          pluginState.activeNode = null;
          pluginState.childCtx = null;
        }
      }

      return { halt: true, pluginState };
    }
  });

  /**
   * vln-router-scroll="routerStateKey"
   * On every committed route change of the referenced router, scrolls the
   * element the directive sits on back to the top. Put it on whichever
   * element owns the scroll (often <html>, sometimes an inner <main>).
   */
  vln.plugins.registerPlugin({
    name: "router-scroll",
    track: ({ evaluate, expr }) => {
      const routerState = evaluate(expr);
      return routerState && routerState.path;
    },
    render: ({ node, tracked, pluginState = {} }) => {
      const prev = pluginState.prev;
      pluginState.prev = tracked;

      // Skip initial render — only react to actual navigations.
      if (!pluginState.initialized) {
        pluginState.initialized = true;
        return { pluginState };
      }
      if (prev === tracked) return { pluginState };

      if (node === document.documentElement || node === document.body) {
        globalThis.scrollTo(0, 0);
      } else if (typeof /** @type {any} */(node).scrollTo === "function") {
        /** @type {any} */(node).scrollTo(0, 0);
      } else if (node instanceof HTMLElement) {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      }
      return { pluginState };
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
