// @ts-check

/**
 * Opt-in enter/leave transition primitives. Load this module to make
 * `vln-if`, `vln-loop`, `vln-route`, and `vln-fragment` honor two CSS
 * class names on mount/unmount:
 *
 *   .vln-entering — added on mount, stripped after two animation frames.
 *   .vln-leaving  — added on unmount, held until CSS `transition-duration`
 *                   + `transition-delay` (or the animation equivalents),
 *                   plus a small slack, elapses.
 *
 * Not required. If this module isn't loaded, the four directives fall
 * back to synchronous removal (their pre-transitions behavior). Users
 * pulling individual bundles (velin-standard, velin-templates,
 * velin-router) need to load this too if they want animations.
 * `@velinjs/all` bundles it automatically.
 */

const LEAVE_SLACK_MS = 50;

function parseDur(str) {
  let max = 0;
  for (const raw of (str || '').split(',')) {
    const n = parseFloat(raw);
    if (!isFinite(n)) continue;
    const ms = raw.includes('ms') ? n : n * 1000;
    if (ms > max) max = ms;
  }
  return max;
}

function maxAnimTime(el) {
  const cs = getComputedStyle(el);
  return Math.max(
    parseDur(cs.transitionDuration) + parseDur(cs.transitionDelay),
    parseDur(cs.animationDuration) + parseDur(cs.animationDelay),
  );
}

// Remove `cls` and drop the empty `class=""` attribute leftover from classList.
function stripClass(node, cls) {
  node.classList.remove(cls);
  if (node.getAttribute('class') === '') node.removeAttribute('class');
}

const NOOP_HANDLE = { cancel: () => {} };

/**
 * Add `vln-leaving`, then hold `node` in the DOM for its CSS
 * transition/animation duration, then call `done`. If the node has no
 * transition — or isn't an Element / isn't connected — `done` runs
 * synchronously.
 *
 * Uses a plain `setTimeout(total + 50 ms)` rather than listening for
 * `transitionend`, so multi-property transitions like
 * `transition: opacity 200ms, transform 400ms` wait for the longer of
 * the two rather than firing early on the first-completing property.
 *
 * Returns a cancel handle. Calling `handle.cancel()` before completion
 * strips `vln-leaving`, clears the timeout, and does NOT invoke `done` —
 * the caller keeps ownership of the node in whatever state it wants
 * (typically: leave it in place, letting the CSS transition reverse
 * back to natural state). After `done` has already fired, `cancel()`
 * is a no-op.
 */
export function awaitLeave(node, done) {
  if (!(node instanceof Element) || !node.isConnected) {
    done();
    return NOOP_HANDLE;
  }
  node.classList.add('vln-leaving');
  const total = maxAnimTime(node);
  if (total <= 0) {
    done();
    return NOOP_HANDLE;
  }
  let finished = false;
  const timer = setTimeout(() => {
    finished = true;
    done();
  }, total + LEAVE_SLACK_MS);
  return {
    cancel() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stripClass(node, 'vln-leaving');
    },
  };
}

/**
 * Add `vln-entering` to a just-mounted `node`, then strip it after two
 * animation frames so a CSS transition against `.vln-entering` runs
 * from the entering state to the natural state. If the node has no
 * transition/animation, the class is added and removed synchronously,
 * and the leftover empty `class=""` attribute is cleaned up.
 */
export function markEnter(node) {
  if (!(node instanceof Element)) return;
  node.classList.add('vln-entering');
  if (maxAnimTime(node) <= 0) {
    stripClass(node, 'vln-entering');
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => stripClass(node, 'vln-entering'));
  });
}

// Auto-attach when loaded in a browser after Velin core is present.
/** @type {any} */
const __win = typeof window !== 'undefined' ? window : {};
if (__win.Velin) {
  __win.Velin.transitions = { awaitLeave, markEnter };
}

export default { awaitLeave, markEnter };
