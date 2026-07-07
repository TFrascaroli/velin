// @ts-nocheck
/**
 * Velin devtools companion. Loads as a separate script tag against a
 * .dev.js Velin build. Loading against a prod build is a silent no-op.
 *
 * The UI itself is a Velin app bound inside the panel's shadow root. Its
 * own reactive state is registered with `hook.ø__ignoreState` so its binds,
 * effects, and mutations do not pollute the tabs it renders.
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

  whenHook(attach);

  function attach(hook) {
    const Velin = window.Velin;
    if (!Velin || typeof Velin.bind !== "function") {
      console.warn("[Velin devtools] window.Velin not present; cannot boot Velin-driven UI.");
      return;
    }

    // ── Shadow host ───────────────────────────────────────────────────────
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:8px;right:8px;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE_HTML;
    document.documentElement.appendChild(host);

    // ── Non-reactive lookup tables (keep DOM/state refs out of Velin) ─────
    const bindingsById = new Map();  // rowId → { nodes: Set<Node>, effects: Set<Function> }
    const nodesById = new Map();     // stateEntryId → Node|null
    let idCounter = 0;
    const nextId = () => ++idCounter;

    // ── Reactive state ────────────────────────────────────────────────────
    const savedTab = localStorage.getItem("velinDevtools.tab") || "Log";
    const initial = {
      // UI flags
      open: localStorage.getItem("velinDevtools.open") === "1",
      activeTab: ["State", "Bindings", "Log", "Effects", "Perf", "Warnings"].includes(savedTab) ? savedTab : "Log",
      highlightOn: localStorage.getItem("velinDevtools.hl") === "1",
      logFilter: "",

      // Static configs (kept in state for template loops)
      TABS: ["State", "Bindings", "Log", "Effects", "Perf", "Warnings"],
      LOG_KINDS: ["", "bind", "compose", "mutate", "trigger", "effect", "compile", "evaluate", "plugin", "cleanup", "warn"],

      // Snapshotted views — filled in refresh()
      logEntries: [],
      stateEntries: [],
      bindingRows: [],
      effectsGroups: [],
      perfRows: [],
      perfStats: { updateCounter: 0, effectCount: 0, bindingsCount: 0, orphanedEffectsSinceStart: 0 },
      warningsList: [],

      // ── Actions ────────────────────────────────────────────────────────
      setTab(t) {
        this.activeTab = t;
        localStorage.setItem("velinDevtools.tab", t);
        refresh();
      },
      close() {
        this.open = false;
        localStorage.setItem("velinDevtools.open", "0");
      },
      togglePanel() {
        this.open = !this.open;
        localStorage.setItem("velinDevtools.open", this.open ? "1" : "0");
        if (this.open) refresh();
      },
      toggleHighlight() {
        this.highlightOn = !this.highlightOn;
        localStorage.setItem("velinDevtools.hl", this.highlightOn ? "1" : "0");
      },
      clearLog() {
        hook.setLogCapacity(hook.log.length || 500);
        refresh();
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

      // ── Derivations (reactive, evaluated inline in templates) ──────────
      filteredLog() {
        return this.logFilter
          ? this.logEntries.filter((e) => e.kind === this.logFilter)
          : this.logEntries;
      },
      hasWarnings() { return this.warningsList.length > 0; },
      warningsReversed() { return this.warningsList.slice().reverse(); },
    };

    const state = Velin.bind(shadow, initial);
    const wrapper = Velin.ø__internal.getWrapper(state);
    hook.ø__ignoreState(wrapper);
    // ø__ignoreState also retroactively purged the log entries emitted during
    // our own bind above. Fresh log for the host page only.

    // ── Snapshot pump ─────────────────────────────────────────────────────
    let snapScheduled = false;
    function refresh() {
      if (!state.open) return;
      const ctrl = Velin.getController(state);
      ctrl.batch(() => {
        state.logEntries = snapshotLog();
        state.stateEntries = snapshotStates();
        state.bindingRows = snapshotBindings();
        state.effectsGroups = snapshotEffects();
        hook.refreshStats();
        const s = hook.stats;
        state.perfStats = {
          updateCounter: s.updateCounter,
          effectCount: s.effectCount,
          bindingsCount: s.bindingsCount,
          orphanedEffectsSinceStart: s.orphanedEffectsSinceStart,
        };
        state.perfRows = snapshotPerf();
      });
    }
    function scheduleRefresh() {
      if (snapScheduled || !state.open) return;
      snapScheduled = true;
      setTimeout(() => { snapScheduled = false; refresh(); }, REFRESH_MS);
    }

    // ── Hook subscribers ──────────────────────────────────────────────────
    const flashSet = new Set();
    let flashScheduled = false;
    hook.subscribe((ev) => {
      if (ev.kind === "warn") {
        state.warningsList.push({
          id: nextId(),
          code: ev.code,
          message: ev.message,
          t: ev.t,
        });
      }
      if (state.highlightOn && ev.kind === "effect" && ev.node && document.contains(ev.node)) {
        flashSet.add(ev.node);
        if (!flashScheduled) {
          flashScheduled = true;
          requestAnimationFrame(() => {
            for (const n of flashSet) flashNode(n);
            flashSet.clear();
            flashScheduled = false;
          });
        }
      }
      scheduleRefresh();
    });

    // ── Keyboard toggle ───────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
        state.togglePanel();
      }
    });

    // Initial snapshot if panel was already open on load.
    if (state.open) refresh();

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

    function snapshotStates() {
      // Flat list with indent depth. Substates render as indented rows
      // rather than nested details — simpler to reactively assign and still
      // reads clearly at typical devtools sizes.
      const out = [];
      const seenIdx = new WeakMap();
      let seenN = 0;
      const indexOf = (s) => {
        let i = seenIdx.get(s);
        if (i === undefined) { i = seenN++; seenIdx.set(s, i); }
        return i;
      };
      const walk = (s, depth) => {
        if (out.length >= STATES_VIEW_MAX) return;
        const id = nextId();
        const node = hook.nodeFor(s);
        const inners = s.ø__innerStates ? [...s.ø__innerStates] : [];
        nodesById.set(id, node);
        out.push({
          id,
          label: node ? nodePath(node) : "state " + indexOf(s),
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

    // ── DOM side-effects (host page, not shadow) ──────────────────────────
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
      dispose() { host.remove(); delete window.__VELIN_DEVTOOLS_COMPANION__; },
    };
  }

  // ── Template (Velin-driven UI) ──────────────────────────────────────────
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

        <!-- ── State tab ── -->
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

        <!-- ── Bindings tab ── -->
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

        <!-- ── Log tab ── -->
        <div vln-if="activeTab === 'Log'">
          <div class="row">
            <span>Filter: </span>
            <select vln-input="logFilter">
              <option vln-loop:k="LOG_KINDS" vln-attr:value="k" vln-text="k || 'all'"></option>
            </select>
          </div>
          <div vln-if="filteredLog().length === 0" class="dim">no log entries</div>
          <details vln-loop:ev="filteredLog()" class="row">
            <summary>
              <span class="k" vln-text="ev.kind"></span>
              <span class="v" vln-text="' ' + ev.summary"></span>
            </summary>
            <pre class="dim" vln-text="ev.raw"></pre>
          </details>
        </div>

        <!-- ── Effects tab ── -->
        <div vln-if="activeTab === 'Effects'">
          <div vln-if="effectsGroups.length === 0" class="dim">no effects</div>
          <details vln-loop:g="effectsGroups" class="row">
            <summary vln-text="g.key + ' — ' + g.effectsCount + ' effect(s), ' + g.pathsCount + ' path(s)'"></summary>
            <div class="dim" vln-text="'why: ' + g.whysSummary"></div>
          </details>
        </div>

        <!-- ── Perf tab ── -->
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

        <!-- ── Warnings tab ── -->
        <div vln-if="activeTab === 'Warnings'">
          <div vln-if="!hasWarnings()" class="dim">no warnings</div>
          <div vln-loop:w="warningsReversed()" class="row warn"
               vln-text="'[' + w.code + '] ' + w.message"></div>
        </div>

      </div>
    </div>
  `;
})();
