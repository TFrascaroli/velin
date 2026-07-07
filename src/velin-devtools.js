// @ts-nocheck
/**
 * Velin devtools companion. Loads as a separate script tag against a
 * .dev.js Velin build. Loading against a prod build is a silent no-op.
 * See docs/adr/0005-devtools-in-page-analytics.md.
 */

(function () {
  if (typeof window === "undefined") return;
  if (window.__VELIN_DEVTOOLS_COMPANION__) return;

  const VERSION = "0.1.0";
  const HOOK_KEY = "__VELIN_DEVTOOLS_HOOK__";

  const off = new URLSearchParams(location.search).get("velin-devtools") === "off" ||
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
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;bottom:8px;right:8px;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel { font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; color: #ddd;
                 background: #111a; backdrop-filter: blur(8px); border: 1px solid #444;
                 border-radius: 6px; width: 520px; height: 360px; display: none;
                 resize: both; overflow: hidden; box-shadow: 0 6px 24px #000a; }
        .panel.open { display: flex; flex-direction: column; }
        header { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
                 background: #222; border-bottom: 1px solid #333; user-select: none; cursor: move; }
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
        th { color: #7cf; cursor: pointer; }
        .filter { margin-left: auto; }
        input[type=text], select { background: #222; color: #ddd; border: 1px solid #444;
                                   border-radius: 3px; padding: 2px 4px; font: inherit; }
      </style>
      <div class="panel" id="panel">
        <header>
          <span class="title">Velin devtools</span>
          <label><input type="checkbox" id="hlToggle"> highlight</label>
          <button id="clearLog" title="Clear log">clear</button>
          <button id="close" title="Close (Ctrl+Shift+V)">×</button>
        </header>
        <div class="tabs" id="tabs"></div>
        <div class="body" id="body"></div>
      </div>
    `;
    document.documentElement.appendChild(host);

    const panel = shadow.getElementById("panel");
    const body = shadow.getElementById("body");
    const tabsEl = shadow.getElementById("tabs");
    const hlToggle = shadow.getElementById("hlToggle");
    const clearBtn = shadow.getElementById("clearLog");
    const closeBtn = shadow.getElementById("close");

    const savedOpen = localStorage.getItem("velinDevtools.open") === "1";
    if (savedOpen) panel.classList.add("open");

    const TABS = ["State", "Bindings", "Log", "Effects", "Perf", "Warnings"];
    let activeTab = localStorage.getItem("velinDevtools.tab") || "Log";
    if (!TABS.includes(activeTab)) activeTab = "Log";

    TABS.forEach((t) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.className = t === activeTab ? "active" : "";
      b.onclick = () => { activeTab = t; localStorage.setItem("velinDevtools.tab", t); renderTabs(); render(); };
      tabsEl.appendChild(b);
    });
    function renderTabs() {
      [...tabsEl.children].forEach((b) => { b.className = b.textContent === activeTab ? "active" : ""; });
    }

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
        panel.classList.toggle("open");
        localStorage.setItem("velinDevtools.open", panel.classList.contains("open") ? "1" : "0");
        if (panel.classList.contains("open")) render();
      }
    });
    closeBtn.onclick = () => { panel.classList.remove("open"); localStorage.setItem("velinDevtools.open", "0"); };
    clearBtn.onclick = () => { hook.setLogCapacity(hook.log.length ? hook.log.length : 500); render(); };

    let logFilter = "";
    let highlightOn = localStorage.getItem("velinDevtools.hl") === "1";
    hlToggle.checked = highlightOn;
    hlToggle.onchange = () => { highlightOn = hlToggle.checked; localStorage.setItem("velinDevtools.hl", highlightOn ? "1" : "0"); };

    // Highlight-on-update
    const flashSet = new Set();
    let flashScheduled = false;
    hook.subscribe((ev) => {
      if (!highlightOn) return;
      if (ev.kind === "effect" && ev.node && document.contains(ev.node)) {
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
    });

    function flashNode(node) {
      if (!(node instanceof Element)) return;
      const prev = node.style.outline;
      const prevT = node.style.transition;
      node.style.transition = "outline 0.4s";
      node.style.outline = "2px solid #7cf";
      setTimeout(() => { node.style.outline = prev; node.style.transition = prevT; }, 400);
    }

    // Auto-refresh — throttled hard. High-frequency Velin apps can fire
    // thousands of events/sec; anything faster than ~2Hz freezes the panel
    // for pages under load.
    hook.subscribe(() => { if (panel.classList.contains("open")) scheduleRender(); });
    let renderScheduled = false;
    function scheduleRender() {
      if (renderScheduled) return;
      renderScheduled = true;
      setTimeout(() => { renderScheduled = false; render(); }, 500);
    }

    // Warnings collected
    const warnings = [];
    hook.subscribe((ev) => { if (ev.kind === "warn") warnings.push(ev); });

    // Pinned bindings highlight
    let pinned = new Set();

    function render() {
      if (!panel.classList.contains("open")) return;
      body.innerHTML = "";
      if (activeTab === "State") renderState();
      else if (activeTab === "Bindings") renderBindings();
      else if (activeTab === "Log") renderLog();
      else if (activeTab === "Effects") renderEffects();
      else if (activeTab === "Perf") renderPerf();
      else if (activeTab === "Warnings") renderWarnings();
    }

    function el(tag, attrs, text) {
      const e = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "onclick") e.onclick = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
      if (text != null) e.textContent = text;
      return e;
    }

    function summarize(v) {
      if (v === null) return "null";
      if (v === undefined) return "undefined";
      if (typeof v === "string") return JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v);
      if (typeof v === "function") return "ƒ";
      if (typeof v === "object") {
        if (Array.isArray(v)) return "[…" + v.length + "]";
        return "{…}";
      }
      return String(v);
    }

    // Persist expanded state across renders. Key format: "<stateIndex>|<path>".
    const openedState = new Set();
    const stateIndex = new WeakMap();
    let nextStateIdx = 0;
    function indexOf(state) {
      let i = stateIndex.get(state);
      if (i === undefined) { i = nextStateIdx++; stateIndex.set(state, i); }
      return i;
    }

    // "div.foo/ul/li[3]" style label — short, unambiguous, click-to-highlight.
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

    function labelFor(s) {
      const idx = indexOf(s);
      const node = hook.nodeFor(s);
      return node ? nodePath(node) : `state ${idx}`;
    }

    // Persistent hover-highlight: outline stays while the mouse is on the label.
    function hoverHighlight(el_, node) {
      if (!node) return;
      let prevOutline, prevOutlineOffset, prevZIndex;
      el_.addEventListener("mouseenter", () => {
        if (!(node instanceof Element)) return;
        prevOutline = node.style.outline;
        prevOutlineOffset = node.style.outlineOffset;
        prevZIndex = node.style.zIndex;
        node.style.outline = "2px solid #7cf";
        node.style.outlineOffset = "-2px";
      });
      el_.addEventListener("mouseleave", () => {
        if (!(node instanceof Element)) return;
        node.style.outline = prevOutline || "";
        node.style.outlineOffset = prevOutlineOffset || "";
        node.style.zIndex = prevZIndex || "";
      });
    }

    function renderState() {
      let count = 0;
      for (const s of hook.states) {
        if (hook.parentOf(s)) continue; // substates render inside their parent
        count++;
        renderStateNode(body, s);
      }
      if (count === 0) body.appendChild(el("div", { class: "dim" }, "no bound states"));
    }

    function renderStateNode(host, s) {
      const idx = indexOf(s);
      const key = idx + "|";
      const node = hook.nodeFor(s);
      const sec = el("details");
      const sum = el("summary");
      const labelSpan = el("span", { class: "k" }, labelFor(s));
      hoverHighlight(labelSpan, node);
      sum.appendChild(labelSpan);
      const inners = s.ø__innerStates ? s.ø__innerStates.size : 0;
      if (inners) sum.appendChild(el("span", { class: "dim" }, ` (${inners})`));
      sec.appendChild(sum);
      if (openedState.has(key)) { sec.open = true; renderStateBody(sec, s); }
      sec.addEventListener("toggle", () => {
        if (sec.open) {
          openedState.add(key);
          if (!sec.querySelector(":scope > .state-body")) renderStateBody(sec, s);
        } else openedState.delete(key);
      });
      host.appendChild(sec);
    }

    function renderStateBody(host, s) {
      const box = el("div", { class: "state-body" });

      const interps = s.interpolations ? [...s.interpolations.entries()] : [];
      if (interps.length) {
        box.appendChild(el("div", { class: "row k" }, `interpolations (${interps.length})`));
        for (const [k, v] of interps.slice(0, 50)) {
          const r = el("div", { class: "row" });
          r.style.paddingLeft = "12px";
          r.appendChild(el("span", { class: "k" }, k + ": "));
          if (v && v.type === "EXPR") {
            r.appendChild(el("span", { class: "v" }, "expr "));
            r.appendChild(el("span", { class: "dim" }, v.value?.expr ?? ""));
          } else {
            r.appendChild(el("span", { class: "v" }, summarize(v?.value)));
          }
          box.appendChild(r);
        }
        if (interps.length > 50) box.appendChild(el("div", { class: "dim" }, `… ${interps.length - 50} more`));
      }

      const roots = s.tricklingRoots || [];
      if (roots.length) {
        const rHead = el("div", { class: "row" });
        rHead.appendChild(el("span", { class: "k" }, "trickling roots: "));
        rHead.appendChild(el("span", { class: "v" }, roots.join(", ")));
        box.appendChild(rHead);
      }

      const inners = s.ø__innerStates ? [...s.ø__innerStates] : [];
      for (const inner of inners.slice(0, 200)) renderStateNode(box, inner);
      if (inners.length > 200) box.appendChild(el("div", { class: "dim" }, `… ${inners.length - 200} more substates`));

      host.appendChild(box);
    }

    function renderBindings() {
      const rows = hook.enumerateBindings();
      const MAX = 300;
      const capped = rows.slice(0, MAX);
      const t = el("table");
      const trh = el("tr");
      for (const h of ["Path", "#Effects", "Exprs", "Nodes"]) trh.appendChild(el("th", null, h));
      t.appendChild(trh);
      // Delegate clicks; avoids one closure per row.
      t.addEventListener("click", (e) => {
        const tr = /** @type {any} */ (e.target).closest("tr[data-idx]");
        if (!tr) return;
        const r = capped[+tr.dataset.idx];
        pinned = new Set(r.nodes);
        for (const n of r.nodes) flashNode(n);
      });
      const frag = document.createDocumentFragment();
      capped.forEach((r, i) => {
        const tr = el("tr", { class: "row click" });
        tr.dataset.idx = String(i);
        tr.appendChild(el("td", null, r.path));
        tr.appendChild(el("td", null, String(r.effectCount)));
        tr.appendChild(el("td", null, r.exprs.join(", ").slice(0, 80) || "-"));
        tr.appendChild(el("td", null, String(r.nodes.length)));
        frag.appendChild(tr);
      });
      t.appendChild(frag);
      body.appendChild(t);
      if (rows.length > MAX) body.appendChild(el("div", { class: "dim" }, `… ${rows.length - MAX} more not shown`));
    }

    function renderLog() {
      const bar = el("div", { class: "row" });
      const sel = el("select");
      for (const k of ["", "bind", "compose", "mutate", "trigger", "effect", "compile", "evaluate", "plugin", "cleanup", "warn"]) {
        sel.appendChild(el("option", { value: k }, k || "all"));
      }
      sel.value = logFilter;
      sel.onchange = () => { logFilter = sel.value; render(); };
      bar.appendChild(el("span", null, "Filter: "));
      bar.appendChild(sel);
      body.appendChild(bar);

      const log = hook.log.slice().reverse();
      let shown = 0;
      for (const ev of log) {
        if (logFilter && ev.kind !== logFilter) continue;
        if (shown++ >= 100) break;
        const d = el("details", { class: "row" });
        const sum = el("summary");
        sum.appendChild(el("span", { class: "k" }, ev.kind));
        sum.appendChild(el("span", { class: "v" }, " " + shortSummary(ev)));
        d.appendChild(sum);
        let filled = false;
        d.addEventListener("toggle", () => {
          if (d.open && !filled) {
            filled = true;
            d.appendChild(el("pre", { class: "dim" }, safeStringify(ev)));
          }
        });
        body.appendChild(d);
      }
    }

    function shortSummary(ev) {
      switch (ev.kind) {
        case "mutate": return `${ev.path} (${ev.op}${ev.method ? " " + ev.method : ""})`;
        case "trigger": return `${ev.path} → ${ev.effectCount}${ev.queued ? " [q]" : ""}`;
        case "effect": return `${ev.path} ${ev.pluginName || ""} ${ev.durationMs?.toFixed?.(2)}ms`;
        case "evaluate": return `${ev.expr} ${ev.durationMs?.toFixed?.(2)}ms${ev.ok ? "" : " ERR"}`;
        case "compile": return ev.expr;
        case "plugin": return `${ev.name} ${ev.phase}`;
        case "warn": return `[${ev.code}] ${ev.message}`;
        default: return "";
      }
    }

    // Log payloads carry ReactiveState / DOM nodes. Walking those with
    // JSON.stringify goes through Velin's Proxy and is effectively unbounded,
    // so we shallow-strip anything that isn't a primitive on the first hop.
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

    function renderEffects() {
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
      let shown = 0;
      for (const g of groups.values()) {
        if (shown++ >= 200) { body.appendChild(el("div", { class: "dim" }, `… ${groups.size - 200} more not shown`)); break; }
        const d = el("details", { class: "row" });
        d.appendChild(el("summary", null, `${g.key} — ${g.effects.size} effect(s), ${g.paths.size} path(s)`));
        let expanded = false;
        d.addEventListener("toggle", () => {
          if (!d.open || expanded) return;
          expanded = true;
          for (const e of g.effects) {
            const why = hook.whyDidThisRun(e, 8);
            d.appendChild(el("div", { class: "dim" }, "  why: " + (why.join(", ") || "-")));
          }
        });
        body.appendChild(d);
      }
    }

    function renderPerf() {
      const rows = [...hook.stats.expressionEvalTime.entries()]
        .map(([k, v]) => ({ expr: k, ...v, avg: v.totalMs / v.calls }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, 40);
      const t = el("table");
      const trh = el("tr");
      for (const h of ["Expression", "Calls", "Total ms", "Avg ms"]) trh.appendChild(el("th", null, h));
      t.appendChild(trh);
      for (const r of rows) {
        const tr = el("tr", { class: "row" });
        tr.appendChild(el("td", null, r.expr));
        tr.appendChild(el("td", null, String(r.calls)));
        tr.appendChild(el("td", null, r.totalMs.toFixed(2)));
        tr.appendChild(el("td", null, r.avg.toFixed(3)));
        t.appendChild(tr);
      }
      body.appendChild(t);
      const s = hook.stats;
      hook.refreshStats();
      body.appendChild(el("div", { class: "dim" },
        `updates: ${s.updateCounter} | effects: ${s.effectCount} | bindings: ${s.bindingsCount} | orphaned: ${s.orphanedEffectsSinceStart}`));
    }

    function renderWarnings() {
      if (!warnings.length) { body.appendChild(el("div", { class: "dim" }, "no warnings")); return; }
      for (const w of warnings.slice().reverse()) {
        const row = el("div", { class: "row warn" }, `[${w.code}] ${w.message}`);
        body.appendChild(row);
      }
    }

    render();

    window.__VELIN_DEVTOOLS_COMPANION__ = {
      version: VERSION,
      dispose() { host.remove(); delete window.__VELIN_DEVTOOLS_COMPANION__; },
    };
  }
})();
