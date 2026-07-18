// @ts-nocheck
/**
 * Velin devtools companion. Loads as a separate script tag against a
 * .dev.js Velin build. Loading against a prod build is a silent no-op.
 *
 * The UI is a Velin app bound inside the panel's shadow root. Its own
 * reactive state is registered with `hook.ø__ignoreState` so its own
 * effects and mutations do not pollute the tabs it renders.
 *
 * Refresh model: **polled**. The panel does NOT subscribe to per-event
 * hook writes. When open, a setInterval snapshots hook.log, hook.states,
 * topBindings, etc. into reactive arrays. Templates re-render off those
 * arrays. This decouples panel work from host-page mutation rate — a 60
 * fps table firing thousands of events/sec costs the panel exactly one
 * snapshot every REFRESH_MS regardless of volume.
 *
 * All vln-loop uses keyed diffs (`{collection, key: 'id'}`) with ids
 * derived from stable data (state identity, event ø__seq, expression
 * text) so substates get reused across polls instead of being torn down
 * and rebuilt every 500ms.
 *
 * The only per-event subscribe is the highlight-on-update flash, gated
 * by a cached boolean so a disabled toggle is truly zero-cost.
 *
 * See docs/adr/0005-devtools-in-page-analytics.md.
 */

(function () {
  if (typeof window === "undefined") return;
  if (window.__VELIN_DEVTOOLS_COMPANION__) return;

  const VERSION = "0.1.0-alpha.0";
  const HOOK_KEY = "__VELIN_DEVTOOLS_HOOK__";
  const REFRESH_MS = 500;
  const LOG_VIEW_MAX = 200;
  const STATES_VIEW_MAX = 400;
  const BINDINGS_VIEW_MAX = 100;
  const EFFECTS_VIEW_MAX = 100;
  const PERF_VIEW_MAX = 40;
  const WARNINGS_VIEW_MAX = 200;
  const SNAPSHOT_BUDGET_MS = 30;

  const off =
    new URLSearchParams(location.search).get("velin-devtools") === "off" ||
    (typeof localStorage !== "undefined" && localStorage.getItem("velinDevtools") === "off");
  if (off) return;

  function whenHook(fn) {
    if (window[HOOK_KEY]) return fn(window[HOOK_KEY]);
    let installed = false;
    let stored;
    try {
      Object.defineProperty(window, HOOK_KEY, {
        configurable: true,
        get() { return stored; },
        set(v) {
          stored = v;
          if (!installed) {
            installed = true;
            queueMicrotask(() => fn(v));
          }
        },
      });
    } catch { /* prop already set as data */ }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", checkLate);
    } else {
      queueMicrotask(checkLate);
    }
    function checkLate() {
      queueMicrotask(() => {
        if (!window[HOOK_KEY]) {
          console.warn("[Velin devtools] Velin was not built with __DEV__=true; devtools cannot attach.");
        }
      });
    }
  }

  function attach(hook) {
    const Velin = window.Velin;
    if (!Velin || typeof Velin.bind !== "function") {
      console.warn("[Velin devtools] window.Velin not present; cannot boot Velin-driven UI.");
      return;
    }

    // ── Shadow host + panel root ──────────────────────────────────────────
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:8px;right:8px;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE_HTML;
    document.documentElement.appendChild(host);
    const panelRoot = shadow.querySelector(".panel");
    const bodyEl = shadow.querySelector(".body");

    // ── Non-reactive lookup tables ────────────────────────────────────────
    // Stable across polls so keyed vln-loop reuses rows / substate effects.
    /** @type {WeakMap<any, number>} state → id */
    const stateIds = new WeakMap();
    let stateIdSeq = 0;
    const idFor = (s) => {
      let id = stateIds.get(s);
      if (id == null) { id = ++stateIdSeq; stateIds.set(s, id); }
      return id;
    };

    // Non-reactive lookups keyed by row id → repopulated each snapshot.
    /** @type {Map<string|number, {nodes: any[]}>} */
    const bindingsById = new Map();
    /** @type {Map<string|number, Node>} */
    const nodesById = new Map();

    // State-tab expand/collapse. Plain Set of state ids the user has
    // explicitly collapsed. Default: every node expanded. Toggling forces
    // a snapshot rebuild rather than firing effects on writes.
    /** @type {Set<number>} */
    const collapsedStates = new Set();

    // ── Cached UI flags — the hot path never reads state via Proxy ────────
    let cachedOpen = localStorage.getItem("velinDevtools.open") === "1";
    let cachedHighlight = localStorage.getItem("velinDevtools.hl") === "1";

    // Snapshot-to-snapshot delta tracking for Perf churn indicator.
    let lastUpdateCounter = 0;

    // ── Reactive state ────────────────────────────────────────────────────
    const savedTab = localStorage.getItem("velinDevtools.tab") || "Log";
    const TABS = ["State", "Bindings", "Log", "Effects", "Perf", "Warnings"];
    const initial = {
      open: cachedOpen,
      activeTab: TABS.includes(savedTab) ? savedTab : "Log",
      highlightOn: cachedHighlight,
      logFilter: "",
      logGrouping: true,

      TABS,
      LOG_KINDS: ["", "bind", "compose", "mutate", "trigger", "effect", "compile", "evaluate", "plugin", "cleanup", "warn"],

      logEntries: [],
      stateEntries: [],
      bindingRows: [],
      effectsRuns: [],
      perfRows: [],
      perfStats: { updateCounter: 0, updatesDelta: 0, effectCount: 0, bindingsCount: 0, orphanedEffectsSinceStart: 0 },
      warningsList: [],

      setTab(t) {
        this.activeTab = t;
        localStorage.setItem("velinDevtools.tab", t);
        stickToTop = true; // fresh tab → allow snapping to top
        snapshot({ force: true });
      },
      close() {
        this.open = false;
        cachedOpen = false;
        localStorage.setItem("velinDevtools.open", "0");
        stopPolling();
      },
      togglePanel() {
        this.open = !this.open;
        cachedOpen = this.open;
        localStorage.setItem("velinDevtools.open", cachedOpen ? "1" : "0");
        if (cachedOpen) { snapshot({ force: true }); startPolling(); }
        else stopPolling();
      },
      toggleHighlight() {
        this.highlightOn = !this.highlightOn;
        cachedHighlight = this.highlightOn;
        localStorage.setItem("velinDevtools.hl", cachedHighlight ? "1" : "0");
      },
      toggleLogGrouping() {
        this.logGrouping = !this.logGrouping;
        snapshot({ force: true });
      },
      clearLog() {
        hook.setLogCapacity(hook.log.length || 500);
        snapshot({ force: true });
      },
      flashBinding(id) {
        const b = bindingsById.get(id);
        if (!b) return;
        for (const n of b.nodes) flashNode(n);
      },
      hoverInState(id) {
        const node = nodesById.get(id);
        if (node instanceof Element) applyOutline(node);
      },
      hoverOutState(id) {
        const node = nodesById.get(id);
        if (node instanceof Element) removeOutline(node);
      },
      toggleStateRow(id) {
        if (collapsedStates.has(id)) collapsedStates.delete(id);
        else collapsedStates.add(id);
        snapshot({ force: true });
      },
      flashEffect(id) {
        const b = bindingsById.get(id);
        if (b) for (const n of b.nodes) flashNode(n);
      },
    };

    const state = Velin.bind(panelRoot, initial);
    const wrapper = Velin.ø__internal.getWrapper(state);
    hook.ø__ignoreState(wrapper);
    // ø__ignoreState also retroactively purged the log entries emitted
    // during our own bind() above. Fresh log for the host page only.

    // ── Polled refresh (the ONLY reactive-write path) ─────────────────────
    let pollerId = null;
    let lastEmitSeq = -1;
    let lastTabSnapshotted = null;
    function startPolling() {
      if (pollerId != null) return;
      pollerId = setInterval(() => {
        if (!cachedOpen) return; // paranoia; stopPolling handles the common case
        snapshot();
      }, REFRESH_MS);
    }
    function stopPolling() {
      if (pollerId == null) return;
      clearInterval(pollerId);
      pollerId = null;
    }

    // ── Sticky-scroll for Log tab ────────────────────────────────────────
    // Newest events land at the top of the list. `stickToTop` mirrors the
    // classic "stay at bottom" behavior of chat/log UIs, inverted. On any
    // user scroll away from top we release; scrolling back to top rearms.
    let stickToTop = true;
    if (bodyEl) {
      bodyEl.addEventListener("scroll", () => {
        stickToTop = bodyEl.scrollTop <= 2;
      }, { passive: true });
    }

    // Two-stage: (1) acquire + process into a plain view model, (2) commit
    // to reactive state in one batched write. Only the ACTIVE tab is
    // computed — hidden tabs' arrays stay untouched so their vln-loop
    // effects don't re-fire (vln-if uses display:none, not unmount, so
    // reassigning their data would trigger diff work on invisible DOM).
    function snapshot({ force = false } = {}) {
      if (!cachedOpen) return;
      const seq = hook.emitSeq;
      const tab = state.activeTab;
      if (!force && seq === lastEmitSeq && tab === lastTabSnapshotted) return;
      lastEmitSeq = seq;
      lastTabSnapshotted = tab;
      hook.refreshStats();

      const t0 = performance.now();

      // Stage 1: acquire + process. Zero reactive writes, no proxy traps.
      let view;
      switch (tab) {
        case "Log":       view = { logEntries: snapshotLog() }; break;
        case "State":     view = { stateEntries: snapshotStates() }; break;
        case "Bindings":  view = { bindingRows: snapshotBindings() }; break;
        case "Effects":   view = { effectsRuns: snapshotEffects() }; break;
        case "Perf":      {
          const uc = hook.stats.updateCounter;
          view = {
            perfRows: snapshotPerf(),
            perfStats: {
              updateCounter: uc,
              updatesDelta: uc - lastUpdateCounter,
              effectCount: hook.stats.effectCount,
              bindingsCount: hook.stats.bindingsCount,
              orphanedEffectsSinceStart: hook.stats.orphanedEffectsSinceStart,
            },
          };
          lastUpdateCounter = uc;
          break;
        }
        case "Warnings":  view = { warningsList: snapshotWarnings() }; break;
        default:          return;
      }

      // Stage 2: commit. One batched write; effects fire only for the
      // fields we actually touched, i.e. only for the active tab.
      const ctrl = Velin.getController(state);
      ctrl.batch(() => {
        for (const k in view) state[k] = view[k];
      });

      const elapsed = performance.now() - t0;
      if (elapsed > SNAPSHOT_BUDGET_MS) {
        console.warn(`[Velin devtools] ${tab} snapshot took ${elapsed.toFixed(1)}ms (budget ${SNAPSHOT_BUDGET_MS}ms).`);
      }

      // Log tab: honor sticky-scroll after DOM applies.
      if (tab === "Log" && stickToTop && bodyEl) {
        requestAnimationFrame(() => { bodyEl.scrollTop = 0; });
      }
    }

    // ── Hook subscribers — flash ONLY ─────────────────────────────────────
    // The subscribe callback is the hot path: it runs synchronously inside
    // emit for every host-page event (potentially thousands/sec). It must
    // stay O(1) with cached-boolean early exits and MUST NOT touch reactive
    // state. All reactive writes go through snapshot() on the poll interval.
    const flashSet = new Set();
    let flashScheduled = false;
    hook.subscribe((ev) => {
      if (!cachedHighlight) return;              // fast path: toggle off = zero work
      if (ev.kind !== "effect") return;
      const node = ev.node;
      if (!node || !document.contains(node)) return;
      flashSet.add(node);
      if (!flashScheduled) {
        flashScheduled = true;
        requestAnimationFrame(() => {
          for (const n of flashSet) flashNode(n);
          flashSet.clear();
          flashScheduled = false;
        });
      }
    });

    // ── Keyboard toggle ───────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
        state.togglePanel();
      }
    });

    if (cachedOpen) { snapshot({ force: true }); startPolling(); }

    // ── Snapshot builders ─────────────────────────────────────────────────
    function snapshotLog() {
      const raw = hook.log;
      const filter = state.logFilter;
      const grouping = state.logGrouping;
      const out = [];
      // Walk newest → oldest; stop when we've filled the view budget.
      for (let i = raw.length - 1; i >= 0 && out.length < LOG_VIEW_MAX; i--) {
        const ev = raw[i];
        if (filter && ev.kind !== filter) continue;
        if (grouping && out.length > 0) {
          const prev = out[out.length - 1];
          if (prev.kind === ev.kind && prev._groupKey === groupKeyFor(ev)) {
            prev.count++;
            prev.earliestT = ev.t;
            continue;
          }
        }
        out.push({
          id: ev.ø__seq,
          kind: ev.kind,
          summary: shortSummary(ev),
          raw: safeStringify(ev),
          t: ev.t,
          earliestT: ev.t,
          count: 1,
          _groupKey: groupKeyFor(ev),
        });
      }
      // Compute display timestamps: relative to the previous (older) event.
      // Since out is newest-first, prev-in-time is the next entry in the
      // array. Format as "+Δs" so the eye scans deltas, not absolutes.
      for (let i = 0; i < out.length; i++) {
        const older = out[i + 1];
        out[i].tRel = older ? fmtDelta(out[i].earliestT - older.earliestT) : fmtAbs(out[i].earliestT);
        out[i].summaryDisplay = out[i].count > 1
          ? `${out[i].summary}  ×${out[i].count}`
          : out[i].summary;
      }
      return out;
    }

    function groupKeyFor(ev) {
      // Same-kind bursts on the same target collapse. "target" varies by
      // kind — path for mutate/trigger/effect, expr for evaluate/compile,
      // code for warn, name for plugin, else the state identity.
      switch (ev.kind) {
        case "mutate":
        case "trigger":
        case "effect":  return ev.path || "";
        case "evaluate":
        case "compile": return ev.expr || "";
        case "warn":    return ev.code || "";
        case "plugin":  return ev.name + "@" + (ev.phase || "");
        default:        return "";
      }
    }

    function snapshotWarnings() {
      // Group by (code, ref-identity). Newest first, cap by view budget.
      const groups = new Map();
      const raw = hook.log;
      for (let i = raw.length - 1; i >= 0; i--) {
        const ev = raw[i];
        if (ev.kind !== "warn") continue;
        const refKey = ev.ref
          ? (ev.ref.path || ev.ref.expr || JSON.stringify(ev.ref))
          : ev.message;
        const key = ev.code + "::" + refKey;
        let g = groups.get(key);
        if (!g) {
          if (groups.size >= WARNINGS_VIEW_MAX) continue;
          g = { id: key, code: ev.code, sample: ev.message, count: 0, lastT: ev.t };
          groups.set(key, g);
        }
        g.count++;
        if (ev.t > g.lastT) g.lastT = ev.t;
      }
      const now = hook.ø__now();
      return [...groups.values()]
        .sort((a, b) => b.lastT - a.lastT)
        .map((g) => ({
          id: g.id,
          code: g.code,
          sample: g.sample,
          count: g.count,
          lastAgo: fmtAgo(now - g.lastT),
        }));
    }

    function snapshotStates() {
      nodesById.clear();
      const out = [];
      const walk = (s, depth, parentId) => {
        if (out.length >= STATES_VIEW_MAX) return;
        const id = idFor(s);
        const node = hook.nodeFor(s);
        const inners = s.ø__innerStates ? [...s.ø__innerStates] : [];
        nodesById.set(id, node);
        const isCollapsed = collapsedStates.has(id);
        out.push({
          id,
          parentId,
          label: node ? nodePath(node) : "state " + id,
          indent: depth,
          innersCount: inners.length,
          hasNode: !!node,
          hasTricklingRoots: !!(s.tricklingRoots && s.tricklingRoots.length),
          collapsed: isCollapsed,
        });
        if (!isCollapsed) for (const inner of inners) walk(inner, depth + 1, id);
      };
      for (const s of hook.states) {
        if (hook.parentOf(s)) continue;
        walk(s, 0, 0);
      }
      return out;
    }

    function snapshotBindings() {
      bindingsById.clear();
      const rows = hook.topBindings(BINDINGS_VIEW_MAX);
      return rows.map((r) => {
        const id = r.stateIdx + "@" + r.path;
        bindingsById.set(id, { nodes: r.nodes });
        return {
          id,
          path: r.path,
          effectCount: r.effectCount,
          sampleExpr: r.sampleExpr || "-",
          nodesCount: r.nodes.length,
        };
      });
    }

    function snapshotEffects() {
      // "What just re-ran?" — the last N effect events out of hook.log,
      // newest first. Whys come from whyDidThisRun on the effect object
      // itself, but only the event has the node/path/expr we need to show
      // per-run. For the why list we look up recentPaths via the effect
      // debug ring — but events don't carry the effect ref. Instead we
      // synthesize a "why" as the path of the log entry itself (that's
      // literally what triggered this run).
      bindingsById.clear();
      const raw = hook.log;
      const now = hook.ø__now();
      const out = [];
      for (let i = raw.length - 1; i >= 0 && out.length < EFFECTS_VIEW_MAX; i--) {
        const ev = raw[i];
        if (ev.kind !== "effect") continue;
        const id = ev.ø__seq;
        if (ev.node) bindingsById.set(id, { nodes: [ev.node] });
        out.push({
          id,
          path: ev.path || "-",
          expr: ev.expr || "-",
          nodeLabel: ev.node ? nodePath(ev.node) : "-",
          plugin: ev.pluginName || "-",
          durationMs: typeof ev.durationMs === "number" ? +ev.durationMs.toFixed(2) : 0,
          ago: fmtAgo(now - ev.t),
        });
      }
      return out;
    }

    function snapshotPerf() {
      return [...hook.stats.expressionEvalTime.entries()]
        .map(([expr, v]) => ({
          id: expr,
          expr,
          calls: v.calls,
          totalMs: +v.totalMs.toFixed(2),
          avg: +(v.totalMs / v.calls).toFixed(3),
          maxMs: +(v.maxMs ?? 0).toFixed(2),
        }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, PERF_VIEW_MAX);
    }

    // ── Formatting helpers ────────────────────────────────────────────────
    function shortSummary(ev) {
      switch (ev.kind) {
        case "bind":     return ev.rootNode ? `<${(ev.rootNode.nodeName || "node").toLowerCase()}>` : "";
        case "compose":  return "substate";
        case "cleanup":  return ev.node ? `<${(ev.node.nodeName || "node").toLowerCase()}>` : "state";
        case "mutate":   return `${ev.path} (${ev.op}${ev.method ? " " + ev.method : ""})`;
        case "trigger":  return `${ev.path} → ${ev.effectCount ?? 0}${ev.queued ? " [q]" : ""}`;
        case "effect":   return `${ev.path || "-"} ${ev.pluginName || ""} ${fmtMs(ev.durationMs)}`;
        case "evaluate": return `${ev.expr || "-"} ${fmtMs(ev.durationMs)}${ev.ok ? "" : " ERR"}`;
        case "compile":  return ev.expr || "";
        case "plugin":   return `${ev.name} ${ev.phase}${ev.expr ? " " + ev.expr : ""}`;
        case "warn":     return `[${ev.code}] ${ev.message}`;
        default:         return "";
      }
    }

    function fmtMs(ms) {
      return typeof ms === "number" ? ms.toFixed(2) + "ms" : "";
    }

    function fmtDelta(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) deltaMs = 0;
      if (deltaMs < 1) return "+0ms";
      if (deltaMs < 1000) return `+${deltaMs.toFixed(0)}ms`;
      if (deltaMs < 60_000) return `+${(deltaMs / 1000).toFixed(1)}s`;
      return `+${(deltaMs / 60_000).toFixed(1)}m`;
    }

    function fmtAbs(t) {
      const d = new Date(performance.timeOrigin + t);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }

    function fmtAgo(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) return "just now";
      if (deltaMs < 1000) return `${deltaMs.toFixed(0)}ms ago`;
      if (deltaMs < 60_000) return `${(deltaMs / 1000).toFixed(1)}s ago`;
      return `${(deltaMs / 60_000).toFixed(1)}m ago`;
    }

    function safeStringify(o) {
      const shallow = {};
      for (const k of Object.keys(o)) {
        if (k === "ø__seq") continue;
        const v = o[k];
        if (v == null || typeof v !== "object") shallow[k] = v;
        else if (v instanceof Node) shallow[k] = "<" + (v.nodeName || "node") + ">";
        else if (k === "state" || k === "parent" || k === "child") shallow[k] = "<ReactiveState>";
        else if (Array.isArray(v)) shallow[k] = `[…${v.length}]`;
        else shallow[k] = "{…}";
      }
      try { return JSON.stringify(shallow, null, 2); }
      catch { return String(o); }
    }

    function nodePath(node) {
      if (!node || node.nodeType !== 1) return "?";
      const parts = [];
      let n = node;
      while (n && n.nodeType === 1 && n !== document.documentElement && parts.length < 6) {
        let seg = n.tagName.toLowerCase();
        if (n.id) { seg += "#" + n.id; parts.unshift(seg); break; }
        if (n.classList && n.classList.length) seg += "." + n.classList[0];
        if (n.parentElement) {
          const same = [...n.parentElement.children].filter((c) => c.tagName === n.tagName);
          if (same.length > 1) seg += "[" + (same.indexOf(n) + 1) + "]";
        }
        parts.unshift(seg);
        n = n.parentElement;
      }
      return parts.join("/");
    }

    // ── DOM side-effects on host page (not shadow) ────────────────────────
    function flashNode(node) {
      if (!(node instanceof Element)) return;
      const prev = node.style.outline;
      const prevT = node.style.transition;
      node.style.transition = "outline 0.4s";
      node.style.outline = "2px solid #7cf";
      setTimeout(() => { node.style.outline = prev; node.style.transition = prevT; }, 400);
    }
    function applyOutline(node) {
      node.dataset.velinPrevOutline = node.style.outline || "";
      node.dataset.velinPrevOffset = node.style.outlineOffset || "";
      node.style.outline = "2px solid #7cf";
      node.style.outlineOffset = "-2px";
    }
    function removeOutline(node) {
      node.style.outline = node.dataset.velinPrevOutline || "";
      node.style.outlineOffset = node.dataset.velinPrevOffset || "";
      delete node.dataset.velinPrevOutline;
      delete node.dataset.velinPrevOffset;
    }

    window.__VELIN_DEVTOOLS_COMPANION__ = {
      version: VERSION,
      dispose() { stopPolling(); host.remove(); delete window.__VELIN_DEVTOOLS_COMPANION__; },
    };
  }

  // ── Template ────────────────────────────────────────────────────────────
  // Per-kind colors (log tab): map kind → CSS var so the header legend and
  // the row swatches stay in sync.
  const TEMPLATE_HTML = `
    <style>
      :host { all: initial; }
      .panel { font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; color: #ddd;
               background: #111a; backdrop-filter: blur(8px); border: 1px solid #444;
               border-radius: 6px; width: 600px; height: 400px; display: none;
               resize: both; overflow: hidden; box-shadow: 0 6px 24px #000a; }
      .panel.open { display: flex; flex-direction: column; }
      header { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
               background: #222; border-bottom: 1px solid #333; user-select: none; }
      header .title { font-weight: bold; color: #7cf; margin-right: auto; }
      header button, header label { font: inherit; color: #ddd; background: #333;
               border: 1px solid #555; border-radius: 3px; padding: 2px 6px; cursor: pointer; }
      header input[type=checkbox] { vertical-align: middle; margin-right: 3px; }
      .tabs { display: flex; gap: 2px; padding: 4px 8px 0; background: #1a1a1a; }
      .tabs button { font: inherit; background: transparent; color: #999; border: 0;
                     border-bottom: 2px solid transparent; padding: 4px 8px; cursor: pointer; }
      .tabs button.active { color: #7cf; border-bottom-color: #7cf; }
      .body { flex: 1; overflow: auto; padding: 6px 8px; }
      .row { padding: 2px 0; border-bottom: 1px dotted #333; }
      .row.click { cursor: pointer; }
      .row.click:hover { background: #222; }
      .k { color: #7cf; }
      .v { color: #eda; }
      .dim { color: #888; }
      .warn { color: #fa7; }
      .err { color: #f66; }
      details { margin-left: 8px; }
      summary { cursor: pointer; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 2px 6px; border-bottom: 1px solid #333;
               vertical-align: top; }
      th { color: #7cf; position: sticky; top: 0; background: #1a1a1a; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      input[type=text], select { background: #222; color: #ddd; border: 1px solid #444;
                                 border-radius: 3px; padding: 2px 4px; font: inherit; }
      .state-row { padding: 2px 0; border-bottom: 1px dotted #333; cursor: pointer;
                   display: flex; align-items: center; gap: 6px; }
      .state-row:hover { background: #222; }
      .caret { display: inline-block; width: 10px; color: #888; }
      .badge { display: inline-block; padding: 0 4px; border-radius: 3px;
               font-size: 10px; line-height: 14px; background: #223; color: #7cf; }
      .badge.trickle { background: #331; color: #eda; }
      .badge.count { background: #333; color: #eda; }
      .log-row { display: grid; grid-template-columns: 60px 60px 1fr; gap: 6px;
                 padding: 2px 0; border-bottom: 1px dotted #333; align-items: baseline; }
      .log-row .t { color: #888; font-variant-numeric: tabular-nums; }
      .log-row .kind { display: inline-block; padding: 0 4px; border-radius: 3px;
                       font-size: 10px; text-transform: uppercase; text-align: center; }
      .log-row .summ { color: #eda; overflow: hidden; text-overflow: ellipsis;
                       white-space: nowrap; }
      /* Per-kind colors */
      .kind.mutate   { background: #244; color: #9df; }
      .kind.trigger  { background: #232; color: #ad9; }
      .kind.effect   { background: #422; color: #fa9; }
      .kind.evaluate { background: #443; color: #eda; }
      .kind.compile  { background: #334; color: #ccf; }
      .kind.plugin   { background: #333; color: #ccc; }
      .kind.bind     { background: #224; color: #7cf; }
      .kind.compose  { background: #234; color: #9cf; }
      .kind.cleanup  { background: #322; color: #d99; }
      .kind.warn     { background: #430; color: #fa7; }
      .log-row details { margin: 0; grid-column: 1 / -1; }
      .log-row pre { margin: 4px 0 4px 66px; padding: 4px 6px; background: #0a0a0a;
                     border-left: 2px solid #333; color: #aaa; overflow: auto;
                     max-height: 200px; }
      .empty { color: #888; padding: 12px; text-align: center; }
      .churn { color: #eda; font-weight: bold; }
    </style>
    <div class="panel" vln-attr:class="'panel ' + (open ? 'open' : '')">
      <header>
        <span class="title">Velin devtools</span>
        <label>
          <input type="checkbox" vln-attr:checked="highlightOn" vln-on:change="toggleHighlight()">
          highlight
        </label>
        <button vln-on:click="clearLog()" title="Clear log">clear</button>
        <button vln-on:click="close()" title="Close (Ctrl+Shift+V)">×</button>
      </header>
      <div class="tabs">
        <button vln-loop:t="TABS"
                vln-attr:class="activeTab === t ? 'active' : ''"
                vln-on:click="setTab(t)"
                vln-text="t"></button>
      </div>
      <div class="body">

        <div vln-if="activeTab === 'State'">
          <div vln-if="stateEntries.length === 0" class="empty">no bound states</div>
          <div vln-loop:s="{collection: stateEntries, key: 'id'}"
               class="state-row"
               vln-attr:style="'padding-left:' + (s.indent * 14 + 4) + 'px'"
               vln-on:click="toggleStateRow(s.id)"
               vln-on:mouseenter="hoverInState(s.id)"
               vln-on:mouseleave="hoverOutState(s.id)">
            <span class="caret"
                  vln-text="s.innersCount > 0 ? (s.collapsed ? '▶' : '▼') : ''"></span>
            <span class="k" vln-text="s.label"></span>
            <span vln-if="s.innersCount > 0" class="badge count"
                  vln-text="s.innersCount"></span>
            <span vln-if="s.hasTricklingRoots" class="badge trickle" title="anchored state">↓</span>
          </div>
        </div>

        <div vln-if="activeTab === 'Bindings'">
          <div vln-if="bindingRows.length === 0" class="empty">no bindings</div>
          <table vln-if="bindingRows.length > 0">
            <tr>
              <th>Path</th><th>#Effects</th><th>Sample expr</th><th>Nodes</th>
            </tr>
            <tr vln-loop:b="{collection: bindingRows, key: 'id'}"
                class="row click"
                vln-on:click="flashBinding(b.id)">
              <td vln-text="b.path"></td>
              <td class="num" vln-text="b.effectCount"></td>
              <td vln-text="b.sampleExpr"></td>
              <td class="num" vln-text="b.nodesCount"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Log'">
          <div class="row" style="display:flex; gap:8px; align-items:center;">
            <span>Filter</span>
            <select vln-input="logFilter">
              <option vln-loop:k="LOG_KINDS" vln-attr:value="k" vln-text="k || 'all'"></option>
            </select>
            <label>
              <input type="checkbox" vln-attr:checked="logGrouping"
                     vln-on:change="toggleLogGrouping()">
              group bursts
            </label>
          </div>
          <div vln-if="logEntries.length === 0" class="empty">no log entries</div>
          <details vln-loop:ev="{collection: logEntries, key: 'id'}" class="log-row">
            <summary>
              <span class="t" vln-text="ev.tRel"></span>
              <span vln-attr:class="'kind ' + ev.kind" vln-text="ev.kind"></span>
              <span class="summ" vln-text="ev.summaryDisplay"></span>
            </summary>
            <pre vln-text="ev.raw"></pre>
          </details>
        </div>

        <div vln-if="activeTab === 'Effects'">
          <div vln-if="effectsRuns.length === 0" class="empty">no effects have run recently</div>
          <table vln-if="effectsRuns.length > 0">
            <tr>
              <th>When</th><th>Path</th><th>Expr</th><th>Plugin</th><th>Node</th><th>ms</th>
            </tr>
            <tr vln-loop:r="{collection: effectsRuns, key: 'id'}"
                class="row click"
                vln-on:click="flashEffect(r.id)">
              <td class="dim" vln-text="r.ago"></td>
              <td vln-text="r.path"></td>
              <td vln-text="r.expr"></td>
              <td class="dim" vln-text="r.plugin"></td>
              <td class="dim" vln-text="r.nodeLabel"></td>
              <td class="num" vln-text="r.durationMs"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Perf'">
          <div class="dim" style="margin-bottom:6px;">
            updates: <span class="churn" vln-text="perfStats.updateCounter"></span>
            (<span class="churn" vln-text="'+' + perfStats.updatesDelta"></span>/tick)
             | effects: <span vln-text="perfStats.effectCount"></span>
             | bindings: <span vln-text="perfStats.bindingsCount"></span>
             | orphaned: <span vln-text="perfStats.orphanedEffectsSinceStart"></span>
          </div>
          <div vln-if="perfRows.length === 0" class="empty">no expressions evaluated yet</div>
          <table vln-if="perfRows.length > 0">
            <tr>
              <th>Expression</th><th>Calls</th><th>Total ms</th><th>Avg ms</th><th>Max ms</th>
            </tr>
            <tr vln-loop:r="{collection: perfRows, key: 'id'}" class="row">
              <td vln-text="r.expr"></td>
              <td class="num" vln-text="r.calls"></td>
              <td class="num" vln-text="r.totalMs"></td>
              <td class="num" vln-text="r.avg"></td>
              <td class="num" vln-text="r.maxMs"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Warnings'">
          <div vln-if="warningsList.length === 0" class="empty">no warnings</div>
          <table vln-if="warningsList.length > 0">
            <tr>
              <th>Code</th><th>Sample</th><th>Count</th><th>Last</th>
            </tr>
            <tr vln-loop:w="{collection: warningsList, key: 'id'}" class="row warn">
              <td vln-text="w.code"></td>
              <td vln-text="w.sample"></td>
              <td class="num" vln-text="w.count"></td>
              <td class="dim" vln-text="w.lastAgo"></td>
            </tr>
          </table>
        </div>

      </div>
    </div>
  `;

  whenHook(attach);
})();
