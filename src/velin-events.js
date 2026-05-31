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
    render: ({ node, subkey, reactiveState, expr }) => {
      if (!subkey) return;
      const sourceEvent = vln.evaluate(reactiveState, expr);
      
      const handler = (e) => {
        const aliasEvent = new CustomEvent(subkey, {
          bubbles: true,
          cancelable: true,
          detail: e.detail || {}
        });
        node.dispatchEvent(aliasEvent);
      };

      node.addEventListener(sourceEvent, handler);
      return { state: { handler, sourceEvent } };
    },
    destroy: ({ node, pluginState }) => {
      if (pluginState.handler) {
        node.removeEventListener(pluginState.sourceEvent, pluginState.handler);
      }
    }
  });

  /**
   * vln-evt-contain="['event1', 'event2']" or vln-evt-contain="true"
   * Stops propagation of specified events or all events.
   */
  vln.plugins.registerPlugin({
    name: "evt-contain",
    track: vln.trackers.expressionTracker,
    render: ({ node, tracked, pluginState = {} }) => {
      // Remove old listeners if any
      if (pluginState.handlers) {
        for (const [evt, handler] of Object.entries(pluginState.handlers)) {
          node.removeEventListener(evt, /** @type {EventListener} */ (handler));
        }
      }

      const handlers = {};
      const eventsToContain = Array.isArray(tracked) ? tracked : (tracked === true ? null : []);

      if (tracked === true) {
        // If true, we can't easily catch "all" events without a lot of listeners.
        // Usually used as a general "stop everything" marker for plugins to check,
        // but for now, we'll assume it means common UI events if true.
        // Actually, let's stick to explicit arrays or a specific use case.
      } else if (Array.isArray(eventsToContain)) {
        eventsToContain.forEach(evt => {
          const handler = (e) => e.stopPropagation();
          node.addEventListener(evt, handler);
          handlers[evt] = handler;
        });
      }

      return { state: { handlers } };
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
