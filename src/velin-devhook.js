// @ts-nocheck
/**
 * Dev-only devtools hook. Imported by velin-core.js under an `if (__DEV__)`
 * gate so esbuild tree-shakes the entire module out of `.min.js`.
 *
 * See docs/adr/0005-devtools-in-page-analytics.md for the contract.
 */

const RING_DEFAULT = 500;
const EXPR_STATS_CAP = 1024;

export function createDevHook() {
  const listeners = new Set();
  /** @type {Array<any>} */
  let log = new Array(RING_DEFAULT);
  let logHead = 0;
  let logSize = 0;
  let logCap = RING_DEFAULT;

  /** @type {Set<WeakRef<any>>} */
  const stateRefs = new Set();
  /** @type {WeakMap<any, Node>} */
  const stateNodes = new WeakMap();
  /** @type {WeakMap<any, any>} */
  const parents = new WeakMap();
  /** @type {WeakSet<any>} States marked as "internal" — devtools' own bind, other overlays. Excluded from ø__emit, hook.states, and enumerateBindings. */
  const ignoredStates = new WeakSet();

  const stats = {
    updateCounter: 0,
    effectCount: 0,
    bindingsCount: 0,
    orphanedEffectsSinceStart: 0,
    /** @type {Map<string, {calls: number, totalMs: number, maxMs: number, lastCall: number}>} */
    expressionEvalTime: new Map(),
  };

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  /** @type {Map<string, number>} */
  const frameMutations = new Map();
  let frameScheduled = false;
  const THRASH_LIMIT = 32;

  // Monotonic counter advanced once per accepted (non-ignored) emit.
  // Consumers polling for host-page activity read this and skip work when
  // it hasn't moved — a clean signal that avoids the trap of relying on
  // stats.updateCounter (which is incremented for the poller's own
  // reactive writes too, causing feedback).
  let emitSeq = 0;

  function emit(ev) {
    if (ev.state) {
      // Walk parent chain — a substate under an ignored root (composed via
      // vln-loop, vln-fragment, etc.) is a new ReactiveState object, so we
      // can't rely on identity alone. Cheap: depth is usually 1–3.
      for (let s = ev.state; s; s = parents.get(s) || null) {
        if (ignoredStates.has(s)) return;
      }
    }
    emitSeq++;
    ev.t = ev.t ?? now();
    ev.ø__seq = emitSeq;
    log[logHead] = ev;
    logHead = (logHead + 1) % logCap;
    if (logSize < logCap) logSize++;
    if (ev.kind === "mutate" && typeof requestAnimationFrame !== "undefined") {
      const n = (frameMutations.get(ev.path) || 0) + 1;
      frameMutations.set(ev.path, n);
      if (n === THRASH_LIMIT + 1) {
        emit({ kind: "warn", code: "W003", message: `mutation-thrash: ${ev.path} mutated ${n}x in one frame`, ref: { path: ev.path } });
      }
      if (!frameScheduled) {
        frameScheduled = true;
        requestAnimationFrame(() => { frameMutations.clear(); frameScheduled = false; });
      }
    }
    for (const l of listeners) {
      try { l(ev); }
      catch (err) { queueMicrotask(() => { throw err; }); }
    }
  }

  function readLog() {
    if (logSize < logCap) return log.slice(0, logSize);
    return log.slice(logHead).concat(log.slice(0, logHead));
  }

  function trackState(state) {
    stateRefs.add(new WeakRef(state));
  }

  const statesIterable = {
    *[Symbol.iterator]() {
      for (const ref of Array.from(stateRefs)) {
        const s = ref.deref();
        if (s && s.bindings) {
          if (ignoredStates.has(s)) continue;
          yield s;
        }
        else stateRefs.delete(ref);
      }
    },
  };

  function refreshStats() {
    let effectCount = 0, bindingsCount = 0;
    for (const s of statesIterable) {
      bindingsCount += s.bindings.size;
      for (const set of s.bindings.values()) effectCount += set.size;
    }
    stats.effectCount = effectCount;
    stats.bindingsCount = bindingsCount;
  }

  function peek(reactiveState, pathParts) {
    const caps = reactiveState.ø__depCaptures;
    const shim = { capturingDeps: false, deps: new Set() };
    caps.push(shim);
    try {
      let cur = reactiveState.state;
      for (const p of pathParts) cur = cur == null ? undefined : cur[p];
      return cur;
    } finally {
      caps.pop();
    }
  }

  function whyDidThisRun(effect, limit = 8) {
    const dbg = effect && effect.ø__debug;
    if (!dbg) return [];
    const ring = dbg.recentPaths;
    const head = dbg.ø__pathRingHead;
    const cap = ring.length;
    const seen = new Set();
    const out = [];
    for (let i = 0; i < cap && out.length < limit; i++) {
      const idx = (head - 1 - i + cap) % cap;
      const p = ring[idx];
      if (p == null || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
    return out;
  }

  function enumerateBindings() {
    const rows = [];
    for (const s of statesIterable) {
      for (const [path, effects] of s.bindings) {
        const exprSet = new Set();
        const nodeSet = new Set();
        for (const e of effects) {
          const dbg = e.ø__debug;
          if (dbg) {
            if (dbg.expr) exprSet.add(dbg.expr);
            if (dbg.node) nodeSet.add(dbg.node);
          }
        }
        rows.push({
          state: s,
          path,
          effectCount: effects.size,
          exprs: [...exprSet],
          nodes: [...nodeSet],
        });
      }
    }
    return rows;
  }

  // Bounded top-N by effect count. Skips cheap-inner work: only pays the
  // node/expr allocations for paths that make the cut. On efficient-table
  // this avoids the thousand-row allocation that enumerateBindings does.
  function topBindings(limit) {
    const heap = []; // sorted asc by effectCount; keep at most `limit`
    let stateIdx = 0;
    for (const s of statesIterable) {
      for (const [path, effects] of s.bindings) {
        const n = effects.size;
        if (heap.length >= limit && n <= heap[0].effectCount) continue;
        let sampleExpr = "";
        const nodes = [];
        for (const e of effects) {
          const dbg = e.ø__debug;
          if (dbg) {
            if (!sampleExpr && dbg.expr) sampleExpr = dbg.expr;
            if (dbg.node) nodes.push(dbg.node);
          }
        }
        const row = { stateIdx, path, effectCount: n, sampleExpr, nodes };
        if (heap.length < limit) {
          heap.push(row);
          heap.sort((a, b) => a.effectCount - b.effectCount);
        } else {
          heap[0] = row;
          heap.sort((a, b) => a.effectCount - b.effectCount);
        }
      }
      stateIdx++;
    }
    return heap.sort((a, b) => b.effectCount - a.effectCount);
  }

  const hook = {
    states: statesIterable,
    plugins: null, // wired below by core
    pluginStates: null, // wired below by core
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get log() { return readLog(); },
    /** Monotonic counter that advances once per non-ignored emit. Poll this to detect host-page activity without paying the cost of reading hook.log. */
    get emitSeq() { return emitSeq; },
    setLogCapacity(n) {
      if (typeof n !== "number" || n < 1) return;
      const snap = readLog();
      log = new Array(n);
      logCap = n;
      logHead = 0;
      logSize = 0;
      for (const ev of snap.slice(-n)) {
        log[logHead] = ev;
        logHead = (logHead + 1) % n;
        if (logSize < n) logSize++;
      }
    },
    stats,
    refreshStats,
    peek,
    whyDidThisRun,
    enumerateBindings,
    topBindings,

    // internal wiring called by core
    ø__trackState: trackState,
    ø__registerStateNode(state, node) { if (state && node) stateNodes.set(state, node); },
    ø__registerParent(child, parent) { if (child && parent) parents.set(child, parent); },
    /** Marks a state as internal (devtools overlay, panels, etc.) so it's excluded from hook.states and future emits. Also purges log entries already recorded for this state. */
    ø__ignoreState(state) {
      if (!state) return;
      ignoredStates.add(state);
      const snap = readLog();
      const kept = snap.filter((ev) => !(ev.state === state));
      log = new Array(logCap);
      logHead = 0;
      logSize = 0;
      for (const ev of kept) {
        log[logHead] = ev;
        logHead = (logHead + 1) % logCap;
        if (logSize < logCap) logSize++;
      }
    },
    nodeFor(state) { return stateNodes.get(state) || null; },
    parentOf(state) { return parents.get(state) || null; },
    ø__emit: emit,
    ø__recordExpressionEval(expr, ms) {
      let e = stats.expressionEvalTime.get(expr);
      if (!e) {
        if (stats.expressionEvalTime.size >= EXPR_STATS_CAP) {
          // Evict least-recently-called.
          let oldestKey, oldestT = Infinity;
          for (const [k, v] of stats.expressionEvalTime) {
            if (v.lastCall < oldestT) { oldestT = v.lastCall; oldestKey = k; }
          }
          if (oldestKey !== undefined) stats.expressionEvalTime.delete(oldestKey);
        }
        e = { calls: 0, totalMs: 0, maxMs: 0, lastCall: 0 };
        stats.expressionEvalTime.set(expr, e);
      }
      e.calls++;
      e.totalMs += ms;
      if (ms > e.maxMs) e.maxMs = ms;
      e.lastCall = now();
    },
    ø__now: now,
  };

  return hook;
}

export const DEBUG_PATH_RING = 16;
