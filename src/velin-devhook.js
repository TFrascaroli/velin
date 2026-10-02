// @ts-nocheck
/**
 * Dev-only devtools hook. Imported by velin-core.js under an `if (__DEV__)`
 * gate so esbuild tree-shakes the entire module out of `.min.js`.
 *
 * See docs/adr/0005-devtools-in-page-analytics.md for the contract and
 * .plans/devtools-improvements.md for the phase-1 API surface.
 */

const RING_DEFAULT = 500;
const EXPR_STATS_CAP = 1024;

// Rolling-window aggregator sizing. Fixed absolute-epoch buckets so writes
// and reads share the same clock and don't need per-key housekeeping.
const AGG_BUCKET_MS = 250;
const AGG_BUCKET_COUNT = 40;               // 10s max window
const AGG_EXPR_CAP = 512;
const AGG_PATH_CAP = 512;

// Mutation seq → path lookup ring. Bounds memory while giving hotspots
// enough history to correlate effects with their driving mutation.
const MUTATION_TRACK_CAP = 2000;

// Signal thresholds. Not user-configurable in phase 1 — trust these, adjust
// once real usage tells us otherwise.
const LONG_EFFECT_THRESHOLD_MS = 16;       // ~1 frame at 60fps
const ORPHAN_SPIKE_THRESHOLD = 10;
const ORPHAN_SPIKE_WINDOW_MS = 1000;
const GROWTH_ALERT_MIN_DELTA = 128;        // ignore small wiggles
const GROWTH_ALERT_RATIO = 2;              // size doubled since last check

export const DEBUG_PATH_RING = 16;
export const DEBUG_RUN_RING = 16;

/**
 * Bucketed rolling aggregator keyed by string. Each bucket is an absolute
 * epoch = floor(t / AGG_BUCKET_MS); writes reset stale buckets in place.
 * Reads sum buckets whose epoch falls inside the requested window.
 */
function createAgg(entryCap) {
  /** @type {Map<string, { buckets: Array<{epoch:number,calls:number,totalMs:number,maxMs:number,drivers:Map<string,number>,fanoutSum:number,fanoutCount:number}>, lastSeen:number }>} */
  const map = new Map();
  const nowEpoch = (now) => Math.floor(now / AGG_BUCKET_MS);

  function slot(key, now) {
    let entry = map.get(key);
    if (!entry) {
      if (map.size >= entryCap) {
        // Cap reached — scan for the coldest entry (oldest lastSeen) and
        // evict it. O(entryCap) but only fires on cap overflow, which is
        // rare (512 unique exprs/paths). The alternative — LRU refresh on
        // every write — costs 3 hash ops per aggregator write on the hot
        // path, which shows up on tables firing thousands of effects/sec.
        let oldestKey, oldestSeen = Infinity;
        for (const [k, v] of map) {
          if (v.lastSeen < oldestSeen) { oldestSeen = v.lastSeen; oldestKey = k; }
        }
        if (oldestKey !== undefined) map.delete(oldestKey);
      }
      entry = { buckets: new Array(AGG_BUCKET_COUNT), lastSeen: 0 };
      map.set(key, entry);
    }
    const epoch = nowEpoch(now);
    const idx = ((epoch % AGG_BUCKET_COUNT) + AGG_BUCKET_COUNT) % AGG_BUCKET_COUNT;
    let b = entry.buckets[idx];
    if (!b || b.epoch !== epoch) {
      b = { epoch, calls: 0, totalMs: 0, maxMs: 0, drivers: new Map(), fanoutSum: 0, fanoutCount: 0 };
      entry.buckets[idx] = b;
    }
    entry.lastSeen = epoch;
    return b;
  }

  return {
    /** Record a hit with optional duration and driver-path. */
    record(key, now, dt, driverPath) {
      const b = slot(key, now);
      b.calls++;
      if (dt) {
        b.totalMs += dt;
        if (dt > b.maxMs) b.maxMs = dt;
      }
      if (driverPath) b.drivers.set(driverPath, (b.drivers.get(driverPath) || 0) + 1);
    },
    /** Record fanout for a path (used by mutation aggregator). */
    recordFanout(key, now, fanout) {
      const b = slot(key, now);
      b.fanoutSum += fanout;
      b.fanoutCount++;
    },
    /** Sum buckets covering the last windowMs. Returns null if no data. */
    query(key, now, windowMs) {
      const entry = map.get(key);
      if (!entry) return null;
      const curr = nowEpoch(now);
      const minEpoch = curr - Math.ceil(windowMs / AGG_BUCKET_MS) + 1;
      let calls = 0, totalMs = 0, maxMs = 0, fanoutSum = 0, fanoutCount = 0;
      const drivers = new Map();
      for (const b of entry.buckets) {
        if (!b || b.epoch < minEpoch || b.epoch > curr) continue;
        calls += b.calls; totalMs += b.totalMs;
        if (b.maxMs > maxMs) maxMs = b.maxMs;
        fanoutSum += b.fanoutSum; fanoutCount += b.fanoutCount;
        for (const [p, c] of b.drivers) drivers.set(p, (drivers.get(p) || 0) + c);
      }
      if (calls === 0 && fanoutCount === 0) return null;
      return { calls, totalMs, maxMs, drivers, fanoutSum, fanoutCount };
    },
    keys() { return map.keys(); },
    size() { return map.size; },
    /** Purge everything (test hook). */
    clear() { map.clear(); },
  };
}

export function createDevHook() {
  const listeners = new Set();
  /** @type {Map<Function, {stackAt: string, addedAt: number}>} */
  const subscriberMeta = new Map();

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
  /** @type {WeakSet<any>} */
  const ignoredStates = new WeakSet();
  /** @type {WeakMap<Node, Set<any>>} node → effects registered on it */
  const nodeEffects = new WeakMap();

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

  let emitSeq = 0;
  let mutationSeq = 0;
  /** @type {Map<number, {path: string, state: any, t: number}>} */
  const mutationRing = new Map();

  const aggExpr = createAgg(AGG_EXPR_CAP);
  const aggMut = createAgg(AGG_PATH_CAP);

  // Signals — a parallel channel to the log. Emitted by the hook itself
  // under internal triggers (long-effect, thrash, warns, orphan-spike).
  /** @type {Set<Function>} */
  const signalListeners = new Set();
  /** Recent orphan-effect timestamps for spike detection. Rolling. */
  const orphanEvents = [];

  // Baseline sizes for suspiciousGrowth in leaks(). Populated on first call.
  let prevSizes = null;

  function emitSignal(sig) {
    for (const l of signalListeners) {
      try { l(sig); }
      catch (err) { queueMicrotask(() => { throw err; }); }
    }
  }

  function emit(ev) {
    if (ev.state) {
      for (let s = ev.state; s; s = parents.get(s) || null) {
        if (ignoredStates.has(s)) return null;
      }
    }
    emitSeq++;
    ev.t = ev.t ?? now();
    ev.ø__seq = emitSeq;

    if (ev.kind === "mutate") {
      ev.mutationSeq = ++mutationSeq;
      if (mutationRing.size >= MUTATION_TRACK_CAP) {
        const first = mutationRing.keys().next().value;
        mutationRing.delete(first);
      }
      mutationRing.set(ev.mutationSeq, { path: ev.path, state: ev.state, t: ev.t });
      if (ev.path) aggMut.record(ev.path, ev.t, 0, null);

      if (typeof requestAnimationFrame !== "undefined") {
        const n = (frameMutations.get(ev.path) || 0) + 1;
        frameMutations.set(ev.path, n);
        if (n === THRASH_LIMIT + 1) {
          emit({ kind: "warn", code: "W003", message: `mutation-thrash: ${ev.path} mutated ${n}x in one frame`, ref: { path: ev.path } });
          emitSignal({ kind: "thrash", severity: "warn", payload: { path: ev.path, count: n }, dismissKey: `thrash:${ev.path}` });
        }
        if (!frameScheduled) {
          frameScheduled = true;
          requestAnimationFrame(() => { frameMutations.clear(); frameScheduled = false; });
        }
      }
    }

    if (ev.kind === "trigger") {
      if (ev.path && typeof ev.effectCount === "number") {
        aggMut.recordFanout(ev.path, ev.t, ev.effectCount);
      }
    }

    if (ev.kind === "effect") {
      if (ev.expr) {
        const driver = ev.mutationSeq ? mutationRing.get(ev.mutationSeq)?.path : null;
        aggExpr.record(ev.expr, ev.t, ev.durationMs || 0, driver);
      }
      const dbg = ev.effect && ev.effect.ø__debug;
      if (dbg) {
        if (!dbg.recentRuns) {
          dbg.recentRuns = new Array(DEBUG_RUN_RING);
          dbg.ø__runRingHead = 0;
        }
        dbg.recentRuns[dbg.ø__runRingHead] = {
          t: ev.t,
          durationMs: ev.durationMs || 0,
          mutationSeq: ev.mutationSeq || 0,
          path: ev.path || "",
        };
        dbg.ø__runRingHead = (dbg.ø__runRingHead + 1) % DEBUG_RUN_RING;
      }
      if ((ev.durationMs || 0) > LONG_EFFECT_THRESHOLD_MS) {
        emitSignal({
          kind: "long-effect",
          severity: "warn",
          payload: { expr: ev.expr, durationMs: ev.durationMs, node: ev.node, effect: ev.effect },
          dismissKey: `long-effect:${ev.expr || "?"}`,
        });
      }
    }

    if (ev.kind === "warn") {
      emitSignal({
        kind: "warn",
        severity: ev.code === "W003" ? "warn" : "info",
        payload: { code: ev.code, message: ev.message, ref: ev.ref },
        dismissKey: `warn:${ev.code}:${(ev.ref && (ev.ref.path || ev.ref.expr)) || ev.message || ""}`,
      });
    }

    log[logHead] = ev;
    logHead = (logHead + 1) % logCap;
    if (logSize < logCap) logSize++;

    for (const l of listeners) {
      try { l(ev); }
      catch (err) { queueMicrotask(() => { throw err; }); }
    }
    return ev;
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

  // Bounded top-N by effect count. Skips cheap-inner work: only pays the
  // node/expr allocations for paths that make the cut.
  function topBindings(limit) {
    const heap = [];
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

  // ── Phase 1 query APIs ──────────────────────────────────────────────────

  /**
   * Descend composed substates so a path like `root.rows[3].name` resolves
   * to (rowState, "root.name") — the substate that actually owns the leaf
   * binding. Every path-anchored API funnels through this.
   *
   * A composed substate's DOM anchor node lives at some path under the
   * parent's tree. We locate it by matching the substate's rootNode to a
   * position under the parent's rootNode, then splitting the path at that
   * boundary.
   *
   * Fallback: if no substate matches, the given state owns the path as-is.
   */
  function resolvePath(state, path) {
    if (!state || !path) return { owningState: state, localPath: path };
    // Descend as long as any inner state's bindings contain a prefix.
    let cur = state;
    let curPath = path;
    outer: while (cur && cur.ø__innerStates) {
      for (const inner of cur.ø__innerStates) {
        if (!inner || !inner.bindings) continue;
        // If the inner state's bindings map has any key strictly under
        // curPath OR curPath is itself an inner-binding, hand off.
        for (const bindKey of inner.bindings.keys()) {
          if (bindKey === curPath || bindKey.startsWith(curPath + ".") || bindKey.startsWith(curPath + "[")) {
            cur = inner;
            continue outer;
          }
        }
      }
      break;
    }
    return { owningState: cur, localPath: curPath };
  }

  /**
   * All substates whose bindings include a key at-or-under `path`. Used by
   * dependentsOf(scope:"wide") to fan out into composed children.
   */
  function substatesUnder(state, path) {
    const out = [];
    const visit = (s) => {
      if (!s || !s.ø__innerStates) return;
      for (const inner of s.ø__innerStates) {
        if (!inner || !inner.bindings) continue;
        let hit = false;
        for (const k of inner.bindings.keys()) {
          if (k === path || k.startsWith(path + ".") || k.startsWith(path + "[")) { hit = true; break; }
        }
        if (hit) out.push(inner);
        visit(inner);
      }
    };
    visit(state);
    return out;
  }

  /**
   * Rich per-node explanation. Uses the node → effects reverse index built
   * at bind time. Filters out effects whose owning state has been torn down.
   */
  function explainNode(node) {
    if (!node) return { states: [], bindings: [] };
    const effects = nodeEffects.get(node);
    const bindings = [];
    if (effects) {
      for (const effect of effects) {
        const dbg = effect.ø__debug;
        if (!dbg) continue;
        const st = dbg.state;
        if (!st || !st.bindings) continue; // torn down
        const reads = (dbg.reads || []).map((p) => ({ state: st, path: p }));
        let lastMutation = null;
        const snap = readLog();
        for (let i = snap.length - 1; i >= 0; i--) {
          const ev = snap[i];
          if (ev.kind !== "mutate" || ev.state !== st) continue;
          if (!(dbg.reads || []).includes(ev.path)) continue;
          lastMutation = ev;
          break;
        }
        let currentValue;
        try {
          const rd = dbg.reads && dbg.reads[0];
          if (rd) {
            const parts = rd.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
            if (parts[0] === "root") parts.shift();
            currentValue = peek(st, parts);
          }
        } catch { currentValue = undefined; }
        bindings.push({
          directive: `vln-${dbg.pluginName}` + (dbg.subkey ? `:${dbg.subkey}` : ""),
          expr: dbg.expr,
          reads,
          lastMutation,
          currentValue,
        });
      }
    }
    // States owning this node — walk states, collect any whose stateNode is
    // this node or an ancestor. Root last.
    const states = [];
    if (typeof document !== "undefined") {
      for (const s of statesIterable) {
        const sNode = stateNodes.get(s);
        if (!sNode) continue;
        if (sNode === node || (sNode.contains && sNode.contains(node))) states.push(s);
      }
      // Sort by depth so most-specific first, root last.
      states.sort((a, b) => {
        const an = stateNodes.get(a), bn = stateNodes.get(b);
        if (!an || !bn) return 0;
        if (an === bn) return 0;
        return an.contains(bn) ? 1 : -1;
      });
    }
    return { states, bindings };
  }

  /**
   * Nodes that would re-render if `path` on `state` were mutated. Groups by
   * node so a node with multiple effects shows once with an aggregate.
   *
   * scope "narrow" = exact bindings.get(path). scope "wide" = prefix-match
   * bindings keys and recurse into substatesUnder(path).
   */
  function dependentsOf(state, path, opts) {
    const scope = (opts && opts.scope) || "narrow";
    if (!state || !state.bindings || !path) return [];
    /** @type {Map<Node|null, {node:Node|null, effects:Array<{expr:string,avgMs:number|null,lastRunMs:number|null,effect:any}>, isDetached:boolean}>} */
    const perNode = new Map();
    const seenEffects = new Set();

    function collectFromState(s) {
      if (!s || !s.bindings) return;
      for (const [k, set] of s.bindings) {
        const matches = scope === "narrow"
          ? k === path
          : k === path || k.startsWith(path + ".") || k.startsWith(path + "[");
        if (!matches) continue;
        for (const effect of set) {
          if (seenEffects.has(effect)) continue;
          seenEffects.add(effect);
          const dbg = effect.ø__debug;
          const node = dbg ? dbg.node : null;
          let row = perNode.get(node);
          if (!row) {
            const detached = !!(node && typeof document !== "undefined" && !document.contains(node));
            row = { node, effects: [], isDetached: detached };
            perNode.set(node, row);
          }
          const stats = runStats(effect);
          row.effects.push({
            expr: dbg ? dbg.expr : "",
            avgMs: stats.avgMs,
            lastRunMs: stats.lastRunMs,
            effect,
          });
        }
      }
    }

    collectFromState(state);
    if (scope === "wide") for (const sub of substatesUnder(state, path)) collectFromState(sub);

    const rows = [];
    for (const row of perNode.values()) {
      let est = 0, anyKnown = false;
      for (const e of row.effects) {
        if (typeof e.avgMs === "number") { est += e.avgMs; anyKnown = true; }
      }
      rows.push({
        node: row.node,
        effects: row.effects,
        estimatedCostMs: anyKnown ? +est.toFixed(3) : null,
        isDetached: row.isDetached,
      });
    }
    return rows;
  }

  function runStats(effect) {
    const dbg = effect && effect.ø__debug;
    if (!dbg || !dbg.recentRuns) return { avgMs: null, lastRunMs: null };
    let total = 0, count = 0, last = null;
    const head = dbg.ø__runRingHead;
    const cap = dbg.recentRuns.length;
    for (let i = 0; i < cap; i++) {
      const idx = (head - 1 - i + cap) % cap;
      const r = dbg.recentRuns[idx];
      if (!r) continue;
      if (last == null) last = r.durationMs;
      total += r.durationMs;
      count++;
    }
    return {
      avgMs: count ? +(total / count).toFixed(3) : null,
      lastRunMs: last,
    };
  }

  /**
   * Windowed top-N expressions by total time. Driver paths come from
   * mutationSeq correlation, aggregated across all runs in the window.
   */
  function hotspots(opts) {
    const windowMs = (opts && opts.windowMs) || 1000;
    const t = now();
    const results = [];
    for (const expr of aggExpr.keys()) {
      const q = aggExpr.query(expr, t, windowMs);
      if (!q || q.calls === 0) continue;
      const drivers = [...q.drivers.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count);
      // Per-effect breakdown by walking the reverse index — but that's
      // node-anchored, and expressions can span multiple nodes (same expr
      // reused). Walk states.bindings for effects with this expr.
      const effects = [];
      const seenEff = new Set();
      for (const s of statesIterable) {
        for (const set of s.bindings.values()) {
          for (const eff of set) {
            if (seenEff.has(eff)) continue;
            const dbg = eff.ø__debug;
            if (!dbg || dbg.expr !== expr) continue;
            seenEff.add(eff);
            const rs = runStats(eff);
            effects.push({ node: dbg.node, avgMs: rs.avgMs });
          }
        }
      }
      results.push({
        expr,
        totalMs: +q.totalMs.toFixed(3),
        calls: q.calls,
        maxMs: +q.maxMs.toFixed(3),
        drivers,
        effects,
      });
    }
    return results.sort((a, b) => b.totalMs - a.totalMs);
  }

  /**
   * Windowed top-N mutation paths. avgFanout is the average number of
   * effects triggered per mutation for that path within the window.
   */
  function topMutations(opts) {
    const windowMs = (opts && opts.windowMs) || 1000;
    const t = now();
    const results = [];
    for (const path of aggMut.keys()) {
      const q = aggMut.query(path, t, windowMs);
      if (!q) continue;
      const avgFanout = q.fanoutCount ? +(q.fanoutSum / q.fanoutCount).toFixed(2) : 0;
      if (q.calls === 0 && q.fanoutCount === 0) continue;
      results.push({ path, count: q.calls, avgFanout });
    }
    return results.sort((a, b) => b.count - a.count);
  }

  function currentFrameMutations() {
    return new Map(frameMutations);
  }

  /**
   * Effect introspection. reads come from initial dep capture (stored on
   * ø__debug at effect creation). recentRuns is the ø__debug ring exposed
   * newest-first.
   */
  function explainEffect(effect) {
    if (!effect) return null;
    const dbg = effect.ø__debug;
    if (!dbg) return null;
    const st = dbg.state;
    const reads = (dbg.reads || []).map((p) => ({ state: st, path: p }));
    const recentRuns = [];
    if (dbg.recentRuns) {
      const head = dbg.ø__runRingHead;
      const cap = dbg.recentRuns.length;
      for (let i = 0; i < cap; i++) {
        const idx = (head - 1 - i + cap) % cap;
        const r = dbg.recentRuns[idx];
        if (r) recentRuns.push({ t: r.t, durationMs: r.durationMs, mutationSeq: r.mutationSeq, path: r.path });
      }
    }
    return {
      expr: dbg.expr,
      node: dbg.node,
      state: st,
      pluginName: dbg.pluginName,
      subkey: dbg.subkey,
      reads,
      recentRuns,
      whyDidThisRun: whyDidThisRun(effect),
    };
  }

  /**
   * On-demand leak sweep. Walks every effect once; do NOT poll this.
   *
   * - detachedEffects: effect.node is set but not in document.
   * - detachedStates: state.rootNode is set but not in document.
   * - orphanedSubs: every currently-registered subscriber, with the stack
   *   captured at subscribe() time. Consumer decides which are stale.
   * - suspiciousGrowth: ring/map sizes that grew past a threshold since
   *   the previous leaks() call.
   */
  function leaks() {
    const detachedEffects = [];
    const detachedStates = [];
    const inDoc = typeof document !== "undefined";
    // Composed states share effect refs — the same loop effect lives in
    // both the parent state's bindings and each child iteration's. Dedup
    // so one leaky effect counts once, not N times.
    const seen = new WeakSet();
    for (const s of statesIterable) {
      const sNode = stateNodes.get(s);
      if (inDoc && sNode && !document.contains(sNode)) {
        detachedStates.push({ state: s, rootNode: sNode });
      }
      for (const [path, set] of s.bindings) {
        for (const eff of set) {
          if (seen.has(eff)) continue;
          seen.add(eff);
          const dbg = eff.ø__debug;
          if (!dbg || !dbg.node) continue;
          // Only effects whose node was once in the document count as leaks.
          // Internal template clones (vln-loop's cloneable prototype) are
          // bound to never-connected nodes by design; skip them.
          if (!dbg.wasConnected) continue;
          if (inDoc && !document.contains(dbg.node)) {
            const rs = runStats(eff);
            detachedEffects.push({
              effect: eff,
              expr: dbg.expr,
              state: s,
              path,
              node: dbg.node,
              lastRunT: rs.lastRunMs != null ? rs.lastRunMs : null,
            });
          }
        }
      }
    }
    const orphanedSubs = [];
    for (const [fn, meta] of subscriberMeta) {
      orphanedSubs.push({ subscriber: fn, addedAt: meta.addedAt, stackAt: meta.stackAt });
    }
    const currentSizes = {
      log: logSize,
      mutationRing: mutationRing.size,
      aggExpr: aggExpr.size(),
      aggMut: aggMut.size(),
      stateRefs: stateRefs.size,
      subscribers: subscriberMeta.size,
      orphanEvents: orphanEvents.length,
    };
    const suspiciousGrowth = [];
    if (prevSizes) {
      for (const k of Object.keys(currentSizes)) {
        const cur = currentSizes[k];
        const prev = prevSizes[k];
        const delta = cur - prev;
        if (delta >= GROWTH_ALERT_MIN_DELTA && prev > 0 && cur >= prev * GROWTH_ALERT_RATIO) {
          suspiciousGrowth.push({ what: k, size: cur, delta });
        }
      }
    }
    prevSizes = currentSizes;
    return { detachedEffects, detachedStates, orphanedSubs, suspiciousGrowth };
  }

  function onSignal(fn) {
    signalListeners.add(fn);
    return () => signalListeners.delete(fn);
  }

  // ── Wiring called by velin-core.js ──────────────────────────────────────

  function registerEffectNode(node, effect) {
    if (!node || !effect) return;
    let set = nodeEffects.get(node);
    if (!set) { set = new Set(); nodeEffects.set(node, set); }
    set.add(effect);
  }

  function unregisterEffectNode(node, effect) {
    if (!node || !effect) return;
    const set = nodeEffects.get(node);
    if (!set) return;
    set.delete(effect);
  }

  function trackOrphan() {
    stats.orphanedEffectsSinceStart++;
    const t = now();
    orphanEvents.push(t);
    // trim to window
    const cutoff = t - ORPHAN_SPIKE_WINDOW_MS;
    while (orphanEvents.length && orphanEvents[0] < cutoff) orphanEvents.shift();
    if (orphanEvents.length >= ORPHAN_SPIKE_THRESHOLD) {
      // stable dismissKey per window bucket so subscribers dedupe naturally
      const bucket = Math.floor(t / ORPHAN_SPIKE_WINDOW_MS);
      emitSignal({
        kind: "orphan-spike",
        severity: "warn",
        payload: { count: orphanEvents.length, windowMs: ORPHAN_SPIKE_WINDOW_MS },
        dismissKey: `orphan-spike:${bucket}`,
      });
    }
  }

  const hook = {
    states: statesIterable,
    plugins: null,
    pluginStates: null,
    subscribe(fn) {
      listeners.add(fn);
      const stackAt = (new Error().stack || "").split("\n").slice(2, 6).join("\n");
      subscriberMeta.set(fn, { stackAt, addedAt: now() });
      return () => {
        listeners.delete(fn);
        subscriberMeta.delete(fn);
      };
    },
    get log() { return readLog(); },
    get emitSeq() { return emitSeq; },
    get mutationSeq() { return mutationSeq; },
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
    topBindings,

    // Phase 1 APIs
    explainNode,
    resolvePath,
    substatesUnder,
    dependentsOf,
    hotspots,
    explainEffect,
    leaks,
    topMutations,
    currentFrameMutations,
    onSignal,

    // internal wiring called by core
    ø__trackState: trackState,
    ø__registerStateNode(state, node) { if (state && node) stateNodes.set(state, node); },
    ø__registerParent(child, parent) { if (child && parent) parents.set(child, parent); },
    ø__registerEffectNode: registerEffectNode,
    ø__unregisterEffectNode: unregisterEffectNode,
    ø__trackOrphan: trackOrphan,
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
    /** Test / devtools-panel escape hatch — clear aggregator + frame state. */
    ø__resetAggregators() {
      aggExpr.clear();
      aggMut.clear();
      mutationRing.clear();
      mutationSeq = 0;
      orphanEvents.length = 0;
      prevSizes = null;
      frameMutations.clear();
    },
  };

  return hook;
}
