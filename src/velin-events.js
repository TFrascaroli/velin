// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 */

/**
 * @param {VelinCore} vln
 */
function setupVelinEvents(vln) {
  /**
   * vln-evt-alias:aliasName="'sourceEvent'"
   * Listens for sourceEvent and re-dispatches it as aliasName.
   */
  vln.plugins.registerPlugin({
    name: "evt-alias",
    render: ({ node, subkey, evaluate, expr }) => {
      if (!subkey) return;
      const sourceEvent = evaluate(expr);

      const handler = (e) => {
        const aliasEvent = new CustomEvent(subkey, {
          bubbles: true,
          cancelable: true,
          detail: e.detail || {}
        });
        node.dispatchEvent(aliasEvent);
      };

      node.addEventListener(sourceEvent, handler);
      return { pluginState: { handler, sourceEvent } };
    },
    destroy: ({ node, pluginState }) => {
      if (pluginState.handler) {
        node.removeEventListener(pluginState.sourceEvent, pluginState.handler);
      }
    }
  });

  /**
   * vln-evt-contain="'click'" or vln-evt-contain="['click', 'keypress']"
   * Stops propagation of the given event(s) at the capture phase.
   * Accepts a single event name or an array of event names.
   */
  vln.plugins.registerPlugin({
    name: "evt-contain",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked, pluginState = {} }) => {
      // Remove old listeners
      if (pluginState.handlers) {
        for (const [evt, handler] of Object.entries(pluginState.handlers)) {
          node.removeEventListener(evt, /** @type {EventListener} */ (handler));
        }
      }

      const events = Array.isArray(tracked)
        ? tracked
        : typeof tracked === 'string' && tracked
          ? [tracked]
          : [];

      const handlers = {};
      for (const eventName of events) {
        if (typeof eventName !== 'string' || !eventName) continue;
        const handler = (e) => e.stopPropagation();
        node.addEventListener(eventName, handler, true); // capture phase
        handlers[eventName] = handler;
      }
      return { pluginState: { handlers } };
    },
    destroy: ({ node, pluginState }) => {
      if (pluginState.handlers) {
        for (const [evt, handler] of Object.entries(pluginState.handlers)) {
          node.removeEventListener(evt, /** @type {EventListener} */ (handler));
        }
      }
    }
  });
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupVelinEvents(/** @type {VelinCore} */ (__win.Velin));
}

export default setupVelinEvents;
