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
const SOURCE_TRACK_CAP = 500;
// Per-record caps. Aggregates are keyed by directive+expression, so they're
// bounded by template size; these only guard pathological fan-out.
const CHILD_LIST_CAP = 256;
const ROOT_LIST_CAP = 2000;

// Signal thresholds. Not user-configurable in phase 1 — trust these, adjust
// once real usage tells us otherwise.
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

  // The dev hook is an observer. It must not keep anything alive. Every
  // ref we hold past the synchronous emit — in the log ring, in
  // mutationRing, in signal payloads — goes through WeakRef so that
  // unbind/GC can reclaim its targets. Readers deref on access.
  const WK = (v) => (v == null ? v : new WeakRef(v));
  const UN = (v) => (v && typeof v.deref === "function" ? v.deref() : v);
  // Fields on an emit that may hold a strong ref worth GC-friendly stashing.
  const WEAK_FIELDS = ["state", "node", "effect", "parent", "child", "rootNode"];
  function toRetainable(ev) {
    const out = { ...ev };
    for (const k of WEAK_FIELDS) if (out[k]) out[k] = WK(out[k]);
    // ev.ref may carry { node, state, ... } — wrap those too.
    if (out.ref && typeof out.ref === "object") {
      const r = { ...out.ref };
      for (const k of WEAK_FIELDS) if (r[k]) r[k] = WK(r[k]);
      out.ref = r;
    }
    return out;
  }
  function liveEntry(e) {
    if (!e) return e;
    const out = { ...e };
    for (const k of WEAK_FIELDS) if (out[k]) out[k] = UN(out[k]);
    if (out.ref && typeof out.ref === "object") {
      const r = { ...out.ref };
      for (const k of WEAK_FIELDS) if (r[k]) r[k] = UN(r[k]);
      out.ref = r;
    }
    return out;
  }

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
    orphanedEffectsSinceStart: 0,
    /** @type {Map<string, {calls: number, totalMs: number, maxMs: number, lastCall: number}>} */
    expressionEvalTime: new Map(),
  };

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  /** @type {Map<string, number>} */
  const frameMutations = new Map();
  // Unbatched flushes per path this frame. Thrash is about wasted effect
  // runs, so writes inside a batch (queued) and writes nobody watches
  // don't count — batching must make the warning go away.
  /** @type {Map<string, number>} */
  const frameFlushes = new Map();
  let frameScheduled = false;
  function scheduleFrameReset() {
    if (frameScheduled || typeof requestAnimationFrame === "undefined") return;
    frameScheduled = true;
    requestAnimationFrame(() => { frameMutations.clear(); frameFlushes.clear(); frameScheduled = false; });
  }
  const THRASH_LIMIT = 32;

  let emitSeq = 0;
  let mutationSeq = 0;
  // Per-mutation record. Effect costs are folded in as they run, so the
  // cascade survives the raw log turning over (one click can emit 100k+
  // events; the log keeps 500).
  /** @type {Map<number, {path: string, state: any, t: number, parent: number|null, source: number|null, effects: Map<string, any>|null, children: number[]|null, childOverflow: number}>} */
  const mutationRing = new Map();
  // Frames for code currently executing: "source" = a top-level entry point
  // (event handler, input setter); "effect" = a reactive effect run. Gives
  // mutations their parent + originating handler, and gives every frame an
  // exclusive (self) time by subtracting nested frames.
  /** @type {Array<any>} */
  const runningStack = [];
  let sourceSeq = 0;
  /** @type {Map<number, any>} completed handler runs that caused writes */
  const sourceRing = new Map();

  const aggExpr = createAgg(AGG_EXPR_CAP);
  const aggMut = createAgg(AGG_PATH_CAP);

  // Signals — a parallel channel to the log. Emitted by the hook itself
  // under internal triggers (thrash, long-task, warns, orphan-spike).
  /** @type {Set<Function>} */
  const signalListeners = new Set();
  /** Recent orphan-effect timestamps for spike detection. Rolling. */
  const orphanEvents = [];

  // Baseline sizes for suspiciousGrowth in leaks(). Populated on first call.
  let prevSizes = null;

  function emitSignal(sig) {
    sig.t = sig.t ?? now();
    for (const l of signalListeners) {
      try { l(sig); }
      catch (err) { queueMicrotask(() => { throw err; }); }
    }
  }

  function nearestEffectFrame() {
    for (let i = runningStack.length - 1; i >= 0; i--) {
      if (runningStack[i].kind === "effect") return runningStack[i];
    }
    return null;
  }

  /** Fold one effect run into an aggregate map keyed by directive + expr. */
  function foldEffect(map, ev, self) {
    const key = (ev.pluginName || "?") + "\u0000" + (ev.expr || "");
    let a = map.get(key);
    if (!a) {
      a = { pluginName: ev.pluginName || null, expr: ev.expr || "", calls: 0, selfMs: 0, maxSelfMs: 0, sample: ev.effect ? WK(ev.effect) : null };
      map.set(key, a);
    }
    a.calls++;
    a.selfMs += self;
    if (self > a.maxSelfMs) a.maxSelfMs = self;
  }

  function pushFrame(frame) {
    frame.t0 = now();
    frame.nestedMs = 0;
    runningStack.push(frame);
  }
  /** Pop the top frame; returns inclusive + exclusive time and charges the parent. */
  function popFrame() {
    const f = runningStack.pop();
    if (!f) return { totalMs: 0, selfMs: 0, frame: null };
    const totalMs = now() - f.t0;
    const parent = runningStack[runningStack.length - 1];
    if (parent) parent.nestedMs += totalMs;
    return { totalMs, selfMs: Math.max(0, totalMs - f.nestedMs), frame: f };
  }

  function pushRunning(seq) {
    pushFrame({ kind: "effect", seq: seq || 0 });
  }
  function popRunning() {
    const r = popFrame();
    return { totalMs: r.totalMs, selfMs: r.selfMs };
  }

  function billOverhead(dt) {
    const n = runningStack.length;
    if (!n || dt <= 0) return;
    runningStack[n - 1].nestedMs += dt;
    if (runningStack[0].kind === "source") runningStack[0].overheadMs += dt;
  }

  /**
   * Run one effect with full instrumentation: frame, timing, effect emit,
   * detached-node check. Everything except the effect body itself is
   * billed as overhead, so neither the effect nor the code that triggered
   * it is charged for the hook's bookkeeping.
   */
  function runEffect(effect, seq, state, path) {
    const tIn = now();
    pushFrame({ kind: "effect", seq: seq || 0 });
    let r;
    try { effect(); } finally { r = popFrame(); }
    billingSuppressed++;
    try {
      const dbg = effect.ø__debug;
      emit({ kind: "effect", state, path, node: dbg?.node, expr: dbg?.expr, pluginName: dbg?.pluginName, durationMs: r.totalMs, selfMs: r.selfMs, mutationSeq: seq, effect });
      if (dbg && dbg.node && typeof document !== "undefined") {
        if (document.contains(dbg.node)) dbg.wasConnected = true;
        else {
          trackOrphan();
          emit({ kind: "warn", code: "W001", message: "dangling-effect: effect ran on detached node", state, ref: { path, expr: dbg.expr } });
        }
      }
    } finally {
      billingSuppressed--;
    }
    // popFrame already charged the parent r.totalMs as nested time.
    billOverhead(now() - tIn - r.totalMs);
  }

  /**
   * Open a source frame for a top-level entry point (event handler, input
   * setter). Only opens when nothing else is executing — an evaluation
   * inside an effect or another handler belongs to that frame instead.
   * Returns whether a frame was opened; pass that to exitSource.
   */
  function enterSource(label) {
    if (runningStack.length) return false;
    pushFrame({ kind: "source", id: ++sourceSeq, label, writes: new Map(), rootCount: 0, overheadMs: 0 });
    return true;
  }
  function exitSource(opened) {
    if (!opened) return;
    const { totalMs, selfMs, frame } = popFrame();
    if (!frame || !frame.writes.size) return;
    if (sourceRing.size >= SOURCE_TRACK_CAP) sourceRing.delete(sourceRing.keys().next().value);
    sourceRing.set(frame.id, {
      id: frame.id, label: frame.label, t: frame.t0, totalMs, selfMs,
      overheadMs: frame.overheadMs,
      rootCount: frame.rootCount, writes: frame.writes,
    });
  }

  // The hook's own bookkeeping is real time on the main thread, but it is
  // not the user's code. Charge it to the enclosing frame as nested time
  // (so handler/effect self times exclude it) and report it separately.
  let emitDepth = 0;
  // >0 while runEffect is doing its post-run bookkeeping; it bills that
  // whole stretch itself, so emits inside it must not bill again.
  let billingSuppressed = 0;
  function emit(ev) {
    if (emitDepth++ || billingSuppressed) {
      try { return emitInner(ev); } finally { emitDepth--; }
    }
    const t0 = now();
    try {
      return emitInner(ev);
    } finally {
      emitDepth--;
      billOverhead(now() - t0);
    }
  }

  function emitInner(ev) {
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
      const effFrame = nearestEffectFrame();
      const srcFrame = runningStack.length && runningStack[0].kind === "source" ? runningStack[0] : null;
      ev.parentMutationSeq = effFrame && effFrame.seq ? effFrame.seq : null;
      ev.sourceId = srcFrame ? srcFrame.id : null;
      if (mutationRing.size >= MUTATION_TRACK_CAP) {
        const first = mutationRing.keys().next().value;
        mutationRing.delete(first);
      }
      // state ref stored weakly — mutationRing is bounded but can retain
      // thousands of entries, and we must not keep torn-down states alive.
      mutationRing.set(ev.mutationSeq, {
        path: ev.path, state: WK(ev.state), t: ev.t,
        parent: ev.parentMutationSeq, source: ev.sourceId,
        effects: null, children: null, childOverflow: 0,
      });
      if (ev.parentMutationSeq) {
        const p = mutationRing.get(ev.parentMutationSeq);
        if (p) {
          if (!p.children) p.children = [];
          if (p.children.length < CHILD_LIST_CAP) p.children.push(ev.mutationSeq);
          else p.childOverflow++;
        }
      }
      if (srcFrame) {
        const w = srcFrame.writes.get(ev.path);
        if (w) w.count++;
        else srcFrame.writes.set(ev.path, { count: 1, effects: new Map(), roots: [] });
        if (!ev.parentMutationSeq) {
          srcFrame.rootCount++;
          const ww = srcFrame.writes.get(ev.path);
          if (ww.roots.length < ROOT_LIST_CAP) ww.roots.push(ev.mutationSeq);
        }
      }
      if (ev.path) aggMut.record(ev.path, ev.t, 0, null);

      if (typeof requestAnimationFrame !== "undefined") {
        frameMutations.set(ev.path, (frameMutations.get(ev.path) || 0) + 1);
        scheduleFrameReset();
      }
    }

    if (ev.kind === "trigger") {
      if (ev.path && typeof ev.effectCount === "number") {
        aggMut.recordFanout(ev.path, ev.t, ev.effectCount);
      }
      if (!ev.queued && ev.effectCount > 0 && typeof requestAnimationFrame !== "undefined") {
        const n = (frameFlushes.get(ev.path) || 0) + 1;
        frameFlushes.set(ev.path, n);
        if (n === THRASH_LIMIT + 1) {
          emit({ kind: "warn", code: "W003", message: `mutation-thrash: ${ev.path} re-ran its effects ${n}x in one frame`, ref: { path: ev.path } });
          emitSignal({ kind: "thrash", severity: "warn", payload: { path: ev.path, count: n }, dismissKey: `thrash:${ev.path}` });
        }
        scheduleFrameReset();
      }
    }

    if (ev.kind === "effect") {
      // Exclusive time. Core reports it from the running stack; synthetic
      // emits (tests, external callers) may only carry durationMs.
      const self = typeof ev.selfMs === "number" ? ev.selfMs : (ev.durationMs || 0);
      const mut = ev.mutationSeq ? mutationRing.get(ev.mutationSeq) : null;
      if (ev.expr) aggExpr.record(ev.expr, ev.t, self, mut ? mut.path : null);
      if (mut) {
        if (!mut.effects) mut.effects = new Map();
        foldEffect(mut.effects, ev, self);
        const srcFrame = runningStack.length && runningStack[0].kind === "source" ? runningStack[0] : null;
        if (srcFrame && mut.source === srcFrame.id) {
          const w = srcFrame.writes.get(mut.path);
          if (w) foldEffect(w.effects, ev, self);
        }
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
          selfMs: self,
          mutationSeq: ev.mutationSeq || 0,
          path: ev.path || "",
        };
        dbg.ø__runRingHead = (dbg.ø__runRingHead + 1) % DEBUG_RUN_RING;
      }
    }

    // W003 is mirrored by the dedicated `thrash` signal; forwarding it too
    // would put the same event in the inbox twice.
    if (ev.kind === "warn" && ev.code !== "W003") {
      emitSignal({
        kind: "warn",
        severity: "info",
        payload: { code: ev.code, message: ev.message, ref: ev.ref },
        dismissKey: `warn:${ev.code}:${(ev.ref && (ev.ref.path || ev.ref.expr)) || ev.message || ""}`,
      });
    }

    // Subscribers see the live event (synchronous). We store a WeakRef-
    // wrapped copy in the ring so retention doesn't outlive the referents.
    for (const l of listeners) {
      try { l(ev); }
      catch (err) { queueMicrotask(() => { throw err; }); }
    }
    log[logHead] = toRetainable(ev);
    logHead = (logHead + 1) % logCap;
    if (logSize < logCap) logSize++;
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
          const raw = snap[i];
          if (raw.kind !== "mutate") continue;
          if (UN(raw.state) !== st) continue;
          if (!(dbg.reads || []).includes(raw.path)) continue;
          lastMutation = liveEntry(raw);
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
      const ms = r.selfMs ?? r.durationMs;
      if (last == null) last = ms;
      total += ms;
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
        if (r) recentRuns.push({ t: r.t, durationMs: r.durationMs, selfMs: r.selfMs ?? r.durationMs, mutationSeq: r.mutationSeq, path: r.path });
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

  const r3 = (x) => +x.toFixed(3);

  /** Aggregates → sorted plain rows. `live` derefs the effect sample. */
  function effectRows(map, live) {
    const rows = [];
    if (!map) return rows;
    for (const a of map.values()) {
      rows.push({
        kind: "effect",
        pluginName: a.pluginName,
        expr: a.expr,
        calls: a.calls,
        selfMs: r3(a.selfMs),
        maxSelfMs: r3(a.maxSelfMs),
        effect: live ? UN(a.sample) : a.sample,
      });
    }
    return rows.sort((x, y) => y.selfMs - x.selfMs);
  }

  function mergeEffects(into, from) {
    if (!from) return;
    for (const [k, a] of from) {
      const b = into.get(k);
      if (!b) { into.set(k, { ...a }); continue; }
      b.calls += a.calls;
      b.selfMs += a.selfMs;
      if (a.maxSelfMs > b.maxSelfMs) b.maxSelfMs = a.maxSelfMs;
    }
  }

  function subtreeMs(seq, depth) {
    const m = mutationRing.get(seq);
    if (!m) return 0;
    let ms = 0;
    if (m.effects) for (const a of m.effects.values()) ms += a.selfMs;
    if (m.children && depth < 64) for (const c of m.children) ms += subtreeMs(c, depth + 1);
    return ms;
  }

  /**
   * The write → effects → child-writes tree for one mutation, built from
   * per-mutation aggregates recorded as effects ran. Effects are grouped by
   * directive + expression (`calls` = how many times that binding ran).
   * Times are exclusive, so subtreeMs = effectsMs + Σ children.subtreeMs
   * with no double counting.
   */
  function causalityTree(seq, depth = 0) {
    if (!seq) return null;
    const m = mutationRing.get(seq);
    if (!m) return null;
    const effects = effectRows(m.effects, true);
    let effectsMs = 0;
    for (const e of effects) effectsMs += e.selfMs;
    const children = [];
    let missingChildren = 0;
    for (const c of m.children || []) {
      const node = depth < 64 ? causalityTree(c, depth + 1) : null;
      if (node) children.push(node); else missingChildren++;
    }
    let sub = effectsMs;
    for (const c of children) sub += c.subtreeMs;
    const src = m.source != null ? sourceRing.get(m.source) : null;
    return {
      kind: "mutate",
      mutationSeq: seq,
      path: m.path,
      t: m.t,
      parentMutationSeq: m.parent,
      source: src ? src.label : null,
      effectsMs: r3(effectsMs),
      subtreeMs: r3(sub),
      effects,
      children: children.sort((x, y) => y.subtreeMs - x.subtreeMs),
      childOverflow: m.childOverflow,
      missingChildren,
    };
  }

  /**
   * Attribute a time window (typically a long task) to the Velin work that
   * ran inside it. Groups by originating handler; writes made outside any
   * handler (async continuations, timers, external code) form their own
   * group. Within a group: one row per written path, each with the effects
   * its writes re-ran.
   *
   * overheadMs is the hook's own bookkeeping (absent without devtools).
   * otherMs is the part of the window no handler, effect or overhead
   * accounts for — layout, GC, non-Velin code. `partial` means the
   * mutation ring had already evicted writes from the start of the window.
   */
  function explainWindow(start, end, opts) {
    const live = !opts || opts.live !== false;
    const groups = [];

    for (const s of sourceRing.values()) {
      if (s.t > end || s.t + s.totalMs < start) continue;
      const writes = [];
      let effectsMs = 0, writeCount = 0;
      for (const [path, w] of s.writes) {
        const effects = effectRows(w.effects, live);
        let ms = 0;
        for (const e of effects) ms += e.selfMs;
        effectsMs += ms;
        writeCount += w.count;
        let heaviest = null;
        for (const seq of w.roots) {
          if (!mutationRing.has(seq)) continue;
          const hm = subtreeMs(seq, 0);
          if (!heaviest || hm > heaviest.ms) heaviest = { mutationSeq: seq, ms: r3(hm) };
        }
        writes.push({ path, count: w.count, cascaded: w.count - w.roots.length, ms: r3(ms), effects, heaviest });
      }
      writes.sort((x, y) => y.ms - x.ms);
      groups.push({
        kind: "handler",
        label: s.label,
        t: s.t,
        totalMs: r3(s.totalMs),
        ownMs: r3(s.selfMs),
        overheadMs: r3(s.overheadMs || 0),
        effectsMs: r3(effectsMs),
        writeCount,
        writes,
      });
    }

    /** @type {Map<string, {count:number, cascaded:number, effects:Map<string,any>, roots:number[]}>} */
    const loose = new Map();
    let oldest = Infinity;
    for (const [seq, m] of mutationRing) {
      if (m.t < oldest) oldest = m.t;
      if (m.t < start || m.t > end || m.source != null) continue;
      let row = loose.get(m.path);
      if (!row) { row = { count: 0, cascaded: 0, effects: new Map(), roots: [] }; loose.set(m.path, row); }
      row.count++;
      if (m.parent) row.cascaded++;
      else row.roots.push(seq);
      mergeEffects(row.effects, m.effects);
    }
    if (loose.size) {
      const writes = [];
      let effectsMs = 0, writeCount = 0;
      for (const [path, row] of loose) {
        const effects = effectRows(row.effects, live);
        let ms = 0;
        for (const e of effects) ms += e.selfMs;
        effectsMs += ms;
        writeCount += row.count;
        let heaviest = null;
        for (const seq of row.roots) {
          const hm = subtreeMs(seq, 0);
          if (!heaviest || hm > heaviest.ms) heaviest = { mutationSeq: seq, ms: r3(hm) };
        }
        writes.push({ path, count: row.count, cascaded: row.cascaded, ms: r3(ms), effects, heaviest });
      }
      writes.sort((x, y) => y.ms - x.ms);
      groups.push({ kind: "untracked", label: null, t: start, totalMs: r3(effectsMs), ownMs: 0, overheadMs: 0, effectsMs: r3(effectsMs), writeCount, writes });
    }

    groups.sort((x, y) => (y.ownMs + y.effectsMs) - (x.ownMs + x.effectsMs));
    let attributed = 0;
    let overhead = 0;
    for (const g of groups) { attributed += g.ownMs + g.effectsMs; overhead += g.overheadMs; }
    const durationMs = end - start;
    return {
      start,
      end,
      durationMs: r3(durationMs),
      attributedMs: r3(Math.min(attributed, durationMs)),
      overheadMs: r3(overhead),
      otherMs: r3(Math.max(0, durationMs - attributed - overhead)),
      partial: mutationRing.size >= MUTATION_TRACK_CAP && oldest > start,
      groups,
    };
  }

  // ── longtask observer ───────────────────────────────────────────────────
  // PerformanceObserver reports every JS task that blocked the main thread
  // >50ms. Browser-exact; no estimation. The window is attributed eagerly
  // (the rings keep moving) and shipped on the signal payload.
  let longtaskObserver = null;
  function startLongtaskObserver() {
    if (longtaskObserver) return;
    if (typeof PerformanceObserver === "undefined") return;
    try {
      longtaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const start = entry.startTime;
          const end = start + entry.duration;
          emitSignal({
            kind: "long-task",
            severity: "warn",
            payload: {
              durationMs: +entry.duration.toFixed(1),
              startTime: start,
              // Effect samples stay WeakRefs: signals persist for the session.
              window: explainWindow(start, end, { live: false }),
            },
            // One entry per task — two janks are two events, never merged.
            dismissKey: `long-task:${start.toFixed(1)}`,
          });
        }
      });
      longtaskObserver.observe({ entryTypes: ["longtask"] });
    } catch { longtaskObserver = null; }
  }
  function stopLongtaskObserver() {
    if (!longtaskObserver) return;
    try { longtaskObserver.disconnect(); } catch { /* noop */ }
    longtaskObserver = null;
  }
  startLongtaskObserver();

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
    // External view: deref the WeakRef-wrapped refs so consumers get live
    // objects (or null if the referent was GC'd). Internal readers use
    // readLog() + UN() to avoid double-walking.
    get log() { return readLog().map(liveEntry); },
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
    peek,

    // Phase 1 APIs
    explainNode,
    resolvePath,
    substatesUnder,
    dependentsOf,
    hotspots,
    explainEffect,
    leaks,
    currentFrameMutations,
    onSignal,
    causalityTree,
    explainWindow,

    // internal wiring called by core
    ø__trackState: trackState,
    ø__pushRunning: pushRunning,
    ø__popRunning: popRunning,
    ø__enterSource: enterSource,
    ø__exitSource: exitSource,
    /** Test escape hatch: inject a signal (jsdom has no longtask observer). */
    ø__emitSignal: emitSignal,
    ø__runEffect: runEffect,
    ø__stopLongtaskObserver: stopLongtaskObserver,
    ø__registerStateNode(state, node) { if (state && node) stateNodes.set(state, node); },
    ø__registerParent(child, parent) { if (child && parent) parents.set(child, parent); },
    ø__registerEffectNode: registerEffectNode,
    ø__unregisterEffectNode: unregisterEffectNode,
    ø__trackOrphan: trackOrphan,
    ø__ignoreState(state) {
      if (!state) return;
      ignoredStates.add(state);
      const snap = readLog();
      const kept = snap.filter((ev) => UN(ev.state) !== state);
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
      frameFlushes.clear();
      // Clear the log too — resetting mutationSeq while leaving historical
      // entries behind would silently alias old events onto new seqs, which
      // breaks causalityTree and any seq-correlated query.
      log = new Array(logCap);
      logHead = 0;
      logSize = 0;
      runningStack.length = 0;
      sourceRing.clear();
      sourceSeq = 0;
    },
  };

  return hook;
}
