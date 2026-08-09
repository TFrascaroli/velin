// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 */

/**
 * @param {VelinCore} vln
 */
function setupVelinRouter(vln) {
  // No-ops when the optional velin-transitions module isn't loaded. `leave`
  // returns a `{ cancel }` handle in both modes so callers can uniformly
  // abort an in-flight leave.
  const NOOP_LEAVE = { cancel: () => {} };
  const leave = (node, done) => {
    if (vln.transitions) return vln.transitions.awaitLeave(node, done);
    done();
    return NOOP_LEAVE;
  };
  const enter = (node) => { if (vln.transitions) vln.transitions.markEnter(node); };

  // Cross-directive coordination for vln-route: when path changes, a route
  // that's leaving and a route that would mount fire in the same tick, and
  // effect order depends on DOM order — so the mounting route can fire
  // BEFORE the leaving sibling has registered its leave. `mountedCount`
  // lets us detect that race: if anyone was mounted at the time we want
  // to mount, defer via microtask so racing leaves get a chance to bump
  // `leavingCount` first. `pendingMounts` queues mount closures to drain
  // when `leavingCount` reaches 0. Keyed by the router's state proxy so
  // multiple routers coexist.
  /** @type {WeakMap<object, {leavingCount: number, mountedCount: number, pendingMounts: Function[]}>} */
  const routeCoords = new WeakMap();
  const getCoord = (routerState) => {
    if (!routerState) return null;
    let coord = routeCoords.get(routerState);
    if (!coord) {
      coord = { leavingCount: 0, mountedCount: 0, pendingMounts: [] };
      routeCoords.set(routerState, coord);
    }
    return coord;
  };
  const drainMounts = (coord) => {
    if (coord.leavingCount !== 0) return;
    const pending = coord.pendingMounts;
    if (pending.length === 0) return;
    coord.pendingMounts = [];
    for (const fn of pending) fn();
  };
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
        // Prime the coord so child vln-route directives see it on first render.
        getCoord(routerState);
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
      if (pluginState?.leavingNode) {
        pluginState.leaveHandle?.cancel();
        pluginState.leavingCtx.cleanup(pluginState.leavingNode);
        pluginState.leavingNode.remove();
      }
      if (pluginState?.placeholder?.parentNode) {
        pluginState.placeholder.remove();
      }
    },
    render: ({ node, expr, compose, consume, evaluate, tracked, pluginState = {}, attributeName }) => {
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
        pluginState.leavingNode = null;
        pluginState.leavingCtx = null;
        pluginState.leaveHandle = null;
        pluginState.queuedMount = null;
        parent.replaceChild(placeholder, node);
      }

      const pattern = tracked.targetPath.replace(/:([^/]+)/g, '(?<$1>[^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      const matches = (path) => regex.test(path || "");
      const match = matches(tracked.currentPath);

      const coord = getCoord(evaluate("$__route"));

      // Mount body — extracted so it can run either synchronously (no
      // sibling was mounted), via a microtask (a sibling was mounted and
      // may still race a leave), or via the coord drain (a sibling is
      // known to be leaving). Re-verifies match against the CURRENT
      // router path so a rapid nav-and-back doesn't mount a route the
      // user already navigated away from.
      const performMount = () => {
        pluginState.queuedMount = null;
        if (pluginState.activeNode) return; // already mounted (revived, etc.)
        if (!matches(evaluate("$__route.path"))) return; // stale
        const clone = pluginState.template.cloneNode(true);
        consume(clone, attributeName, expr);
        pluginState.childCtx = compose({});
        pluginState.placeholder.parentNode.insertBefore(clone, pluginState.placeholder);
        pluginState.childCtx.processNode(clone);
        pluginState.activeNode = clone;
        if (coord) coord.mountedCount++;
        enter(clone);
      };

      if (match) {
        // Revive: same route came back while its old subtree was still
        // leaving. Undo the leave-side coord bookkeeping and drain any
        // sibling mounts that were queued behind our leave.
        if (pluginState.leavingNode) {
          pluginState.leaveHandle?.cancel();
          pluginState.activeNode = pluginState.leavingNode;
          pluginState.childCtx = pluginState.leavingCtx;
          pluginState.leavingNode = null;
          pluginState.leavingCtx = null;
          pluginState.leaveHandle = null;
          if (coord) {
            coord.leavingCount--;
            coord.mountedCount++;
            drainMounts(coord);
          }
        } else if (!pluginState.activeNode && !pluginState.queuedMount) {
          if (coord && coord.leavingCount > 0) {
            // A sibling has already registered its leave — queue behind it.
            pluginState.queuedMount = performMount;
            coord.pendingMounts.push(performMount);
          } else if (coord && coord.mountedCount > 0) {
            // A sibling was mounted at the top of this tick but hasn't
            // fired its effect yet (DOM-order race). Defer to a microtask;
            // once the sibling's leave registers, we'll queue behind it.
            pluginState.queuedMount = performMount;
            queueMicrotask(() => {
              if (pluginState.queuedMount !== performMount) return; // superseded
              pluginState.queuedMount = null;
              if (coord.leavingCount > 0) coord.pendingMounts.push(performMount);
              else performMount();
            });
          } else {
            performMount();
          }
        }
      } else {
        // Path no longer matches. If we had queued a mount, clear our own
        // reference — the drain (or the microtask trampoline) will see the
        // cleared queuedMount and no-op.
        if (pluginState.queuedMount) {
          pluginState.queuedMount = null;
        }
        if (pluginState.activeNode) {
          const leaving = pluginState.activeNode;
          const ctx = pluginState.childCtx;
          pluginState.activeNode = null;
          pluginState.childCtx = null;
          pluginState.leavingNode = leaving;
          pluginState.leavingCtx = ctx;
          if (coord) {
            coord.mountedCount--;
            coord.leavingCount++;
          }
          pluginState.leaveHandle = leave(leaving, () => {
            if (pluginState.leavingNode !== leaving) return;
            ctx.cleanup(leaving);
            leaving.remove();
            pluginState.leavingNode = null;
            pluginState.leavingCtx = null;
            pluginState.leaveHandle = null;
            if (coord) {
              coord.leavingCount--;
              drainMounts(coord);
            }
          });
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
