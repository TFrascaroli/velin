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
 * enumerateBindings, etc. into reactive arrays. Templates re-render off
 * those arrays. This decouples panel work from host-page mutation rate —
 * a 60 fps table firing thousands of events/sec costs the panel exactly
 * one snapshot every REFRESH_MS regardless of volume.
 *
 * The only per-event subscribe is the highlight-on-update flash, gated
 * by a cached boolean so a disabled toggle is truly zero-cost.
 *
 * See docs/adr/0005-devtools-in-page-analytics.md.
 */

(function () {
  if (typeof window === "undefined") return;
  if (window.__VELIN_DEVTOOLS_COMPANION__) return;

  const VERSION = "0.2.0";
  const HOOK_KEY = "__VELIN_DEVTOOLS_HOOK__";
  const REFRESH_MS = 500;
  const LOG_VIEW_MAX = 200;
  const STATES_VIEW_MAX = 400;
  const BINDINGS_VIEW_MAX = 300;
  const EFFECTS_VIEW_MAX = 200;
  const PERF_VIEW_MAX = 40;
  const WARNINGS_VIEW_MAX = 200;

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
    // Velin.bind on a ShadowRoot is a no-op (processNode requires Element);
    // bind the .panel div itself so its own vln-attr:class is processed.
    const panelRoot = shadow.querySelector(".panel");

    // ── Non-reactive lookup tables ────────────────────────────────────────
    // Keep DOM/state refs out of Velin's Proxy world. Cleared each snapshot.
    const bindingsById = new Map();
    const nodesById = new Map();
    let idCounter = 0;
    const nextId = () => ++idCounter;

    // ── Cached UI flags — the hot path never reads state via Proxy ────────
    let cachedOpen = localStorage.getItem("velinDevtools.open") === "1";
    let cachedHighlight = localStorage.getItem("velinDevtools.hl") === "1";

    // ── Reactive state ────────────────────────────────────────────────────
    const savedTab = localStorage.getItem("velinDevtools.tab") || "Log";
    const initial = {
      open: cachedOpen,
      activeTab: ["State", "Bindings", "Log", "Effects", "Perf", "Warnings"].includes(savedTab) ? savedTab : "Log",
      highlightOn: cachedHighlight,
      logFilter: "",

      TABS: ["State", "Bindings", "Log", "Effects", "Perf", "Warnings"],
      LOG_KINDS: ["", "bind", "compose", "mutate", "trigger", "effect", "compile", "evaluate", "plugin", "cleanup", "warn"],

      logEntries: [],
      stateEntries: [],
      bindingRows: [],
      effectsGroups: [],
      perfRows: [],
      perfStats: { updateCounter: 0, effectCount: 0, bindingsCount: 0, orphanedEffectsSinceStart: 0 },
      warningsList: [],

      setTab(t) {
        this.activeTab = t;
        localStorage.setItem("velinDevtools.tab", t);
        snapshot();
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

    // Two-stage: (1) acquire + process into a plain view model, (2) commit
    // to reactive state in one batched write. Only the ACTIVE tab is
    // computed — hidden tabs' arrays stay untouched so their vln-loop
    // effects don't re-fire (vln-if uses display:none, not unmount, so
    // reassigning their data would trigger diff work on invisible DOM).
    // A no-op poll (same activeTab, no host mutations since last poll)
    // exits before any reactive write.
    function snapshot({ force = false } = {}) {
      if (!cachedOpen) return;
      const seq = hook.emitSeq;
      const tab = state.activeTab;
      if (!force && seq === lastEmitSeq && tab === lastTabSnapshotted) return;
      lastEmitSeq = seq;
      lastTabSnapshotted = tab;
      hook.refreshStats();

      // Stage 1: acquire + process. Zero reactive writes, no proxy traps.
      let view;
      switch (tab) {
        case "Log":       view = { logEntries: snapshotLog() }; break;
        case "State":     view = { stateEntries: snapshotStates() }; break;
        case "Bindings":  view = { bindingRows: snapshotBindings() }; break;
        case "Effects":   view = { effectsGroups: snapshotEffects() }; break;
        case "Perf":      view = {
          perfRows: snapshotPerf(),
          perfStats: {
            updateCounter: counter,
            effectCount: hook.stats.effectCount,
            bindingsCount: hook.stats.bindingsCount,
            orphanedEffectsSinceStart: hook.stats.orphanedEffectsSinceStart,
          },
        }; break;
        case "Warnings":  view = { warningsList: snapshotWarnings() }; break;
        default:          return;
      }

      // Stage 2: commit. One batched write; effects fire only for the
      // fields we actually touched, i.e. only for the active tab.
      const ctrl = Velin.getController(state);
      ctrl.batch(() => {
        for (const k in view) state[k] = view[k];
      });
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
      const start = Math.max(0, raw.length - LOG_VIEW_MAX);
      const out = [];
      for (let i = raw.length - 1; i >= start; i--) {
        const ev = raw[i];
        out.push({
          id: nextId(),
          kind: ev.kind,
          summary: shortSummary(ev),
          raw: safeStringify(ev),
          t: ev.t,
        });
      }
      return out;
    }

    function snapshotWarnings() {
      // Filter warnings straight out of hook.log — no separate buffer.
      const raw = hook.log;
      const out = [];
      for (let i = raw.length - 1; i >= 0 && out.length < WARNINGS_VIEW_MAX; i--) {
        const ev = raw[i];
        if (ev.kind !== "warn") continue;
        out.push({ id: nextId(), code: ev.code, message: ev.message, t: ev.t });
      }
      return out;
    }

    function snapshotStates() {
      nodesById.clear();
      const out = [];
      const walk = (s, depth) => {
        if (out.length >= STATES_VIEW_MAX) return;
        const id = nextId();
        const node = hook.nodeFor(s);
        const inners = s.ø__innerStates ? [...s.ø__innerStates] : [];
        nodesById.set(id, node);
        out.push({
          id,
          label: node ? nodePath(node) : "state " + out.length,
          indent: depth,
          innersCount: inners.length,
          hasNode: !!node,
        });
        for (const inner of inners) walk(inner, depth + 1);
      };
      for (const s of hook.states) {
        if (hook.parentOf(s)) continue;
        walk(s, 0);
      }
      return out;
    }

    function snapshotBindings() {
      bindingsById.clear();
      const rows = hook.enumerateBindings().slice(0, BINDINGS_VIEW_MAX);
      return rows.map((r) => {
        const id = nextId();
        bindingsById.set(id, { nodes: r.nodes, effects: r.effects || [] });
        return {
          id,
          path: r.path,
          effectCount: r.effectCount,
          exprsSummary: r.exprs.join(", ").slice(0, 80) || "-",
          nodesCount: r.nodes.length,
        };
      });
    }

    function snapshotEffects() {
      const groups = new Map();
      for (const s of hook.states) {
        for (const [path, effects] of s.bindings) {
          for (const e of effects) {
            const dbg = e.ø__debug;
            const key = (dbg?.pluginName || "anon") + "@" + (dbg?.expr || path);
            let g = groups.get(key);
            if (!g) { g = { key, effects: new Set(), paths: new Set() }; groups.set(key, g); }
            g.effects.add(e);
            g.paths.add(path);
          }
        }
      }
      const out = [];
      let i = 0;
      for (const g of groups.values()) {
        if (i++ >= EFFECTS_VIEW_MAX) break;
        const whys = new Set();
        for (const e of g.effects) {
          for (const w of hook.whyDidThisRun(e, 8)) whys.add(w);
        }
        out.push({
          id: nextId(),
          key: g.key,
          effectsCount: g.effects.size,
          pathsCount: g.paths.size,
          whysSummary: [...whys].join(", ") || "-",
        });
      }
      return out;
    }

    function snapshotPerf() {
      return [...hook.stats.expressionEvalTime.entries()]
        .map(([expr, v]) => ({
          expr,
          calls: v.calls,
          totalMs: +v.totalMs.toFixed(2),
          avg: +(v.totalMs / v.calls).toFixed(3),
        }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, PERF_VIEW_MAX);
    }

    // ── Formatting helpers ────────────────────────────────────────────────
    function shortSummary(ev) {
      switch (ev.kind) {
        case "mutate": return `${ev.path} (${ev.op}${ev.method ? " " + ev.method : ""})`;
        case "trigger": return `${ev.path} → ${ev.effectCount}${ev.queued ? " [q]" : ""}`;
        case "effect": return `${ev.path} ${ev.pluginName || ""} ${ev.durationMs?.toFixed?.(2)}ms`;
        case "evaluate": return `${ev.expr} ${ev.durationMs?.toFixed?.(2)}ms${ev.ok ? "" : " ERR"}`;
        case "compile": return ev.expr || "";
        case "plugin": return `${ev.name} ${ev.phase}`;
        case "warn": return `[${ev.code}] ${ev.message}`;
        default: return "";
      }
    }

    function safeStringify(o) {
      const shallow = {};
      for (const k of Object.keys(o)) {
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
  const TEMPLATE_HTML = `
    <style>
      :host { all: initial; }
      .panel { font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; color: #ddd;
               background: #111a; backdrop-filter: blur(8px); border: 1px solid #444;
               border-radius: 6px; width: 520px; height: 360px; display: none;
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
      th, td { text-align: left; padding: 2px 6px; border-bottom: 1px solid #333; }
      th { color: #7cf; }
      input[type=text], select { background: #222; color: #ddd; border: 1px solid #444;
                                 border-radius: 3px; padding: 2px 4px; font: inherit; }
      .state-row { padding: 2px 0; border-bottom: 1px dotted #333; }
      .state-row:hover { background: #222; }
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
          <div vln-if="stateEntries.length === 0" class="dim">no bound states</div>
          <div vln-loop:s="stateEntries" class="state-row"
               vln-attr:style="'padding-left:' + (s.indent * 12) + 'px'"
               vln-on:mouseenter="hoverInState(s.id)"
               vln-on:mouseleave="hoverOutState(s.id)">
            <span class="k" vln-text="s.label"></span>
            <span vln-if="s.innersCount > 0" class="dim" vln-text="' (' + s.innersCount + ')'"></span>
          </div>
        </div>

        <div vln-if="activeTab === 'Bindings'">
          <div vln-if="bindingRows.length === 0" class="dim">no bindings</div>
          <table vln-if="bindingRows.length > 0">
            <tr>
              <th>Path</th><th>#Effects</th><th>Exprs</th><th>Nodes</th>
            </tr>
            <tr vln-loop:b="bindingRows" class="row click" vln-on:click="flashBinding(b.id)">
              <td vln-text="b.path"></td>
              <td vln-text="b.effectCount"></td>
              <td vln-text="b.exprsSummary"></td>
              <td vln-text="b.nodesCount"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Log'">
          <div class="row">
            <span>Filter: </span>
            <select vln-input="logFilter">
              <option vln-loop:k="LOG_KINDS" vln-attr:value="k" vln-text="k || 'all'"></option>
            </select>
          </div>
          <div vln-if="logEntries.length === 0" class="dim">no log entries</div>
          <details vln-loop:ev="logEntries" class="row"
                   vln-if="logFilter === '' || ev.kind === logFilter">
            <summary>
              <span class="k" vln-text="ev.kind"></span>
              <span class="v" vln-text="' ' + ev.summary"></span>
            </summary>
            <pre class="dim" vln-text="ev.raw"></pre>
          </details>
        </div>

        <div vln-if="activeTab === 'Effects'">
          <div vln-if="effectsGroups.length === 0" class="dim">no effects</div>
          <details vln-loop:g="effectsGroups" class="row">
            <summary vln-text="g.key + ' — ' + g.effectsCount + ' effect(s), ' + g.pathsCount + ' path(s)'"></summary>
            <div class="dim" vln-text="'why: ' + g.whysSummary"></div>
          </details>
        </div>

        <div vln-if="activeTab === 'Perf'">
          <table>
            <tr><th>Expression</th><th>Calls</th><th>Total ms</th><th>Avg ms</th></tr>
            <tr vln-loop:r="perfRows" class="row">
              <td vln-text="r.expr"></td>
              <td vln-text="r.calls"></td>
              <td vln-text="r.totalMs"></td>
              <td vln-text="r.avg"></td>
            </tr>
          </table>
          <div class="dim"
               vln-text="'updates: ' + perfStats.updateCounter + ' | effects: ' + perfStats.effectCount + ' | bindings: ' + perfStats.bindingsCount + ' | orphaned: ' + perfStats.orphanedEffectsSinceStart"></div>
        </div>

        <div vln-if="activeTab === 'Warnings'">
          <div vln-if="warningsList.length === 0" class="dim">no warnings</div>
          <div vln-loop:w="warningsList" class="row warn"
               vln-text="'[' + w.code + '] ' + w.message"></div>
        </div>

      </div>
    </div>
  `;

  whenHook(attach);
})();
