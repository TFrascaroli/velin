// @ts-nocheck
/**
 * Velin devtools companion, phase 2 rebuild. Loads as a separate script
 * against a .dev.js Velin build; a no-op against prod builds (no hook).
 *
 * Design (see .plans/devtools-improvements.md phase 2):
 * - Question-first UI, not a data warehouse. Six queries → six surfaces.
 * - Primary entry is pick-mode: click a node → provenance popover.
 * - Persistent hotspots panel polls only while it's open. Nothing else polls.
 * - Signal-driven notifications: hook.onSignal → badge count + toast.
 * - Panel body is plain DOM + subscribe. NOT a Velin app — deliberately
 *   sidesteps the "reactive machinery to debug reactive machinery" trap.
 * - Shadow root isolates styles + prevents host page from styling us.
 */

(function () {
  if (typeof window === "undefined") return;
  if (window.__VELIN_DEVTOOLS_COMPANION__) return;

  const VERSION = "0.2.0-alpha.0";
  const HOOK_KEY = "__VELIN_DEVTOOLS_HOOK__";
  const TOAST_LIFETIME_MS = 4000;
  const OFF_BY_QS = new URLSearchParams(location.search).get("velin-devtools") === "off";
  const OFF_BY_LS = typeof localStorage !== "undefined" && localStorage.getItem("velinDevtools") === "off";
  if (OFF_BY_QS || OFF_BY_LS) return;

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

    const check = () => queueMicrotask(() => {
      if (!window[HOOK_KEY]) {
        console.warn("[Velin devtools] Velin was not built with __DEV__=true; devtools cannot attach.");
      }
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", check);
    } else {
      check();
    }
  }

  function attach(hook) {
    // ── Shadow root ──────────────────────────────────────────────────────
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;inset:0;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE_HTML;
    document.documentElement.appendChild(host);

    const $ = (sel) => shadow.querySelector(sel);
    const $$ = (sel) => shadow.querySelectorAll(sel);

    const badge = $(".badge");
    const badgeCount = $(".badge .count");
    const cmdbar = $(".cmdbar");
    const popover = $(".popover");
    const modal = $(".modal");
    const modalBody = $(".modal-body");
    const modalTitle = $(".modal-title");
    const toasts = $(".toasts");

    // ── State ────────────────────────────────────────────────────────────
    // All UI state is plain JS. Mutators call the relevant re-render.
    const state = {
      cmdbarOpen: false,
      pickMode: false,
      pickedNode: null,
      openModal: null,        // 'hotspots' | 'leaks' | 'dependents' | 'explain-effect' | 'signal' | 'signals' | null
      dependentsScope: "narrow",
      dependentsState: null,  // ReactiveState currently being queried
      dependentsPath: null,   // string
    };

    // Signals in-flight. Map keyed by dismissKey; { sig, count, unread }.
    const signalMap = new Map();
    const signalOrder = [];  // insertion order, newest last
    const SIGNAL_HISTORY_MAX = 100;

    // Currently-highlighted node under the pick cursor (so we can un-outline).
    let pickHighlight = null;

    // ── Rendering helpers ────────────────────────────────────────────────
    const el = (tag, attrs, ...children) => {
      const n = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        if (k === "class") n.className = attrs[k];
        else if (k === "style") n.style.cssText = attrs[k];
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
        else if (k === "html") n.innerHTML = attrs[k];
        else n.setAttribute(k, attrs[k]);
      }
      for (const c of children) {
        if (c == null || c === false) continue;
        n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
      return n;
    };
    const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
    const fmtMs = (n) => (n == null ? "—" : (+n).toFixed(2) + "ms");
    const fmtAgo = (t) => {
      const dt = hook.ø__now() - t;
      if (dt < 1000) return "just now";
      if (dt < 60_000) return `${(dt / 1000).toFixed(1)}s ago`;
      return `${(dt / 60_000).toFixed(1)}m ago`;
    };
    const nodeLabel = (node) => {
      if (!node || node.nodeType !== 1) return "?";
      let seg = node.tagName.toLowerCase();
      if (node.id) return `${seg}#${node.id}`;
      if (node.classList && node.classList.length) seg += `.${node.classList[0]}`;
      return `<${seg}>`;
    };
    const shortValue = (v) => {
      if (v === undefined) return "undefined";
      if (v === null) return "null";
      if (typeof v === "string") return JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v);
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      if (Array.isArray(v)) return `[…${v.length}]`;
      if (typeof v === "object") return "{…}";
      return String(v);
    };

    // ── Badge + command bar ──────────────────────────────────────────────
    function renderBadge() {
      const unread = [...signalMap.values()].reduce((a, s) => a + (s.unread ? 1 : 0), 0);
      badgeCount.textContent = unread || "";
      badgeCount.style.display = unread ? "inline-block" : "none";
      // Severity color for the badge ring
      let sev = null;
      for (const s of signalMap.values()) {
        if (!s.unread) continue;
        if (s.sig.severity === "warn") { sev = "warn"; break; }
        if (!sev) sev = "info";
      }
      badge.classList.toggle("has-warn", sev === "warn");
      badge.classList.toggle("has-info", sev === "info" && sev !== "warn");
    }

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      state.cmdbarOpen = !state.cmdbarOpen;
      cmdbar.classList.toggle("open", state.cmdbarOpen);
      // Opening the bar marks all signals read.
      if (state.cmdbarOpen) markAllSignalsRead();
    });

    cmdbar.addEventListener("click", (e) => {
      const cmd = e.target && e.target.dataset && e.target.dataset.cmd
        || (e.target.closest && e.target.closest("[data-cmd]")?.dataset.cmd);
      if (!cmd) return;
      switch (cmd) {
        case "pick": startPickMode(); break;
        case "hotspots": openHotspots(); break;
        case "leaks": openLeaks(); break;
        case "dependents": openDependentsPrompt(); break;
        case "signals": openSignalsInbox(); break;
        case "close": closeAll(); break;
      }
    });

    function renderSigCount() {
      const el = cmdbar.querySelector(".sig-count");
      const n = signalMap.size;
      el.textContent = n ? String(n) : "";
      el.style.display = n ? "inline-block" : "none";
    }

    function closeAll() {
      state.cmdbarOpen = false;
      cmdbar.classList.remove("open");
      closeModal();
      closePopover();
      if (state.pickMode) cancelPickMode();
    }

    // ── Modals ───────────────────────────────────────────────────────────
    function openModalWith(title, body, name) {
      state.openModal = name;
      modalTitle.textContent = title;
      clear(modalBody);
      modalBody.appendChild(body);
      modal.classList.add("open");
    }
    function closeModal() {
      state.openModal = null;
      modal.classList.remove("open");
    }
    $(".modal-close").addEventListener("click", closeModal);

    // ── Popover (provenance) ─────────────────────────────────────────────
    function positionPopoverNear(rect) {
      const pw = 380, ph = 300;
      const vw = window.innerWidth, vh = window.innerHeight;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
      if (top + ph > vh - 8) top = Math.max(8, rect.top - ph - 6);
      popover.style.left = left + "px";
      popover.style.top = top + "px";
    }
    function showPopover(contentBuilder, anchorNode) {
      clear(popover);
      popover.appendChild(contentBuilder());
      popover.classList.add("open");
      if (anchorNode && anchorNode.getBoundingClientRect) {
        positionPopoverNear(anchorNode.getBoundingClientRect());
      } else {
        popover.style.left = "auto";
        popover.style.top = "auto";
        popover.style.right = "16px";
        popover.style.bottom = "56px";
      }
    }
    function closePopover() {
      popover.classList.remove("open");
      clear(popover);
    }
    // Popover has its own × via event delegation
    popover.addEventListener("click", (e) => {
      if (e.target && e.target.dataset && e.target.dataset.role === "close-popover") closePopover();
    });

    // ── Signals ──────────────────────────────────────────────────────────
    function markAllSignalsRead() {
      for (const s of signalMap.values()) s.unread = false;
      renderBadge();
    }
    function pushToast(sig) {
      const toast = el("div", { class: `toast ${sig.severity || "info"}` },
        el("span", { class: "toast-kind" }, sig.kind),
        el("span", { class: "toast-msg" }, formatSignalMessage(sig)),
      );
      toast.addEventListener("click", () => {
        openSignalDetail(sig);
        toast.remove();
      });
      toasts.appendChild(toast);
      setTimeout(() => toast.remove(), TOAST_LIFETIME_MS);
    }
    function formatSignalMessage(sig) {
      const p = sig.payload || {};
      switch (sig.kind) {
        case "thrash":      return `${p.path} × ${p.count}`;
        case "long-effect": return `${p.expr || "?"} took ${fmtMs(p.durationMs)}`;
        case "orphan-spike": return `${p.count} orphaned effects in ${p.windowMs}ms`;
        case "warn":        return `[${p.code}] ${p.message}`;
        default:            return sig.kind;
      }
    }

    // One-line and three-line explanations per signal kind. UI reads these
    // from the signal; keeps copy out of the signal payload.
    const SIGNAL_EXPLAINERS = {
      thrash: {
        headline: "A single value is being written many times per frame.",
        what: "The path shown mutated more than 32 times in a single animation frame. Usually a feedback loop (an effect that writes something that re-triggers itself) or an unbatched write-loop that should be wrapped in `batch()`.",
        why:  "Each mutation re-triggers every effect bound to it, so repeated writes multiply work. 32×/frame is cheap to detect but the real cost is at 100× or 1000×.",
        action: "Open hotspots — the mutating path will show up as a top driver. Click into the expression firing on it, read the recent-runs trace, and either batch the writes or fix the feedback loop.",
        drill: (sig) => el("button", { class: "btn primary", onclick: () => openHotspots() }, "open hotspots"),
      },
      "long-effect": {
        headline: "A single effect run took longer than one frame.",
        what: "This expression ran once and took the time shown. Over 16ms means the UI dropped a frame while this ran.",
        why:  "Long single-run cost shows up as jank: scroll stutters, input lag, animation hitches. Rare long runs are tolerable; recurring ones are not.",
        action: "Open the effect's trace to see what state paths it reads and when it recently ran. Common fixes: narrow dependencies, defer the work (idle/async), or avoid DOM reads inside the expression.",
        drill: (sig) => sig.payload?.effect
          ? el("button", { class: "btn primary", onclick: () => openExplainEffect(sig.payload.effect) }, "explain this effect")
          : null,
      },
      "orphan-spike": {
        headline: "Effects are firing on nodes that aren't in the document.",
        what: "In the window shown, more than 10 effects ran against DOM nodes that are no longer attached to the page.",
        why:  "An orphaned effect holds a reference to a dead node (preventing GC) and does wasted work every time its deps change. The root cause is almost always a missing cleanup — DOM was removed outside Velin's own teardown path.",
        action: "Run a leak scan. The 'detached effects' section lists which expressions are firing on dead nodes and where they were registered.",
        drill: () => el("button", { class: "btn primary", onclick: () => openLeaks() }, "run leak scan"),
      },
      warn: {
        headline: "Internal warning from Velin core.",
        what: "Velin's internals emitted a warn-level event. The code identifies the condition (see Velin docs for codes), and the message describes what happened.",
        why:  "Warns surface things that aren't fatal but usually indicate a bug or misconfiguration — detached effects, failed cleanups, suspicious state transitions.",
        action: "If the warn carries a node reference, pick-mode the node and inspect its provenance. If it carries a path, run dependents on it.",
        drill: null,
      },
    };

    function openSignalDetail(sig) {
      const p = sig.payload || {};
      const ex = SIGNAL_EXPLAINERS[sig.kind] || SIGNAL_EXPLAINERS.warn;
      const body = el("div", { class: "sigdetail" });
      body.appendChild(el("div", { class: "code big" }, formatSignalMessage(sig)));
      body.appendChild(el("div", { class: "section-help" }, ex.headline));
      const dl = el("dl", { class: "explainer" },
        el("dt", null, "What happened"),  el("dd", null, ex.what),
        el("dt", null, "Why it matters"), el("dd", null, ex.why),
        el("dt", null, "What to do"),     el("dd", null, ex.action),
      );
      body.appendChild(dl);
      const drill = ex.drill && ex.drill(sig);
      if (drill) body.appendChild(el("div", { class: "row", style: "margin-top:10px" }, drill));
      // Mark it read since the user is now looking at it.
      const key = sig.dismissKey || null;
      if (key) {
        const entry = signalMap.get(key);
        if (entry) { entry.unread = false; renderBadge(); }
      }
      openModalWith("Signal: " + sig.kind, body, "signal");
    }

    function openSignalsInbox() {
      state.cmdbarOpen = false;
      cmdbar.classList.remove("open");
      const body = el("div", { class: "sig-inbox" });
      body.appendChild(el("div", { class: "section-help" },
        "Signals the hook has emitted this session. Click one to see what happened and what to do about it. The hook also fires toasts for new signals, but those auto-dismiss — this list persists."));
      const list = el("div", { class: "sig-list" });
      const render = () => {
        clear(list);
        if (!signalMap.size) {
          list.appendChild(el("div", { class: "empty" }, "no signals recorded yet"));
          return;
        }
        // Newest last in signalOrder; render reversed.
        for (let i = signalOrder.length - 1; i >= 0; i--) {
          const key = signalOrder[i];
          const entry = signalMap.get(key);
          if (!entry) continue;
          const sev = entry.sig.severity === "warn" ? "warn" : "info";
          const row = el("div", { class: `sig-item ${sev}${entry.unread ? " unread" : ""}` },
            el("span", { class: "sig-kind" }, entry.sig.kind),
            el("span", { class: "sig-msg" }, formatSignalMessage(entry.sig)),
            entry.count > 1 ? el("span", { class: "sig-count-chip" }, "×" + entry.count) : null,
            el("span", { class: "sig-when" }, fmtAgo(entry.sig.t || hook.ø__now())),
          );
          row.addEventListener("click", () => openSignalDetail(entry.sig));
          list.appendChild(row);
        }
      };
      render();
      body.appendChild(list);
      body.appendChild(el("div", { class: "row", style: "margin-top:10px" },
        el("button", { class: "btn", onclick: () => { signalMap.clear(); signalOrder.length = 0; renderBadge(); renderSigCount(); render(); } }, "clear all"),
      ));
      openModalWith("Signals", body, "signals");
    }

    hook.onSignal((sig) => {
      const key = sig.dismissKey || (sig.kind + ":" + Math.random());
      let entry = signalMap.get(key);
      if (!entry) {
        entry = { sig, count: 0, unread: true };
        signalMap.set(key, entry);
        signalOrder.push(key);
        if (signalOrder.length > SIGNAL_HISTORY_MAX) {
          const drop = signalOrder.shift();
          signalMap.delete(drop);
        }
      } else {
        entry.sig = sig;
        entry.unread = true;
      }
      entry.count++;
      renderBadge();
      renderSigCount();
      pushToast(sig);
    });

    // ── Pick mode ────────────────────────────────────────────────────────
    // We attach capture-phase listeners on the document. On mousemove we
    // outline the hovered element; on click we freeze it and show the
    // provenance popover. Clicks on our own shadow host escape the capture.
    function startPickMode() {
      state.pickMode = true;
      state.cmdbarOpen = false;
      cmdbar.classList.remove("open");
      badge.classList.add("picking");
      document.addEventListener("mousemove", onPickMove, true);
      document.addEventListener("click", onPickClick, true);
      document.addEventListener("keydown", onPickKey, true);
    }
    function cancelPickMode() {
      state.pickMode = false;
      badge.classList.remove("picking");
      document.removeEventListener("mousemove", onPickMove, true);
      document.removeEventListener("click", onPickClick, true);
      document.removeEventListener("keydown", onPickKey, true);
      clearPickHighlight();
    }
    function clearPickHighlight() {
      if (pickHighlight) {
        pickHighlight.style.outline = pickHighlight.__vlnPrevOutline || "";
        pickHighlight.style.outlineOffset = pickHighlight.__vlnPrevOffset || "";
        delete pickHighlight.__vlnPrevOutline;
        delete pickHighlight.__vlnPrevOffset;
        pickHighlight = null;
      }
    }
    function isOurShadow(target) {
      const path = (typeof target?.getRootNode === "function") ? target.getRootNode() : null;
      return path === shadow || (target && target.closest && target.closest && host.contains(target));
    }
    function onPickMove(e) {
      const t = e.target;
      if (!t || !(t instanceof Element)) return;
      if (isOurShadow(t)) { clearPickHighlight(); return; }
      if (t === pickHighlight) return;
      clearPickHighlight();
      pickHighlight = t;
      t.__vlnPrevOutline = t.style.outline || "";
      t.__vlnPrevOffset = t.style.outlineOffset || "";
      t.style.outline = "2px solid #7cf";
      t.style.outlineOffset = "-2px";
    }
    function onPickClick(e) {
      const t = e.target;
      if (isOurShadow(t)) return; // let our own UI handle it
      if (!(t instanceof Element)) return;
      e.preventDefault(); e.stopPropagation();
      const node = pickHighlight || t;
      cancelPickMode();
      openProvenance(node);
    }
    function onPickKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelPickMode(); }
    }

    // ── Provenance popover (Q1) ──────────────────────────────────────────
    function openProvenance(node) {
      state.pickedNode = node;
      const info = hook.explainNode(node);
      showPopover(() => buildProvenanceView(node, info), node);
    }
    function buildProvenanceView(node, info) {
      const root = el("div", { class: "prov" });
      root.appendChild(el("div", { class: "prov-header" },
        el("span", { class: "prov-node" }, nodeLabel(node)),
        el("span", { class: "flex-spacer" }),
        el("button", { class: "iconbtn", "data-role": "close-popover", title: "Close" }, "×"),
      ));
      // States chain
      if (info.states.length) {
        root.appendChild(el("div", { class: "prov-section-title" }, "states"));
        const chain = el("div", { class: "prov-states" });
        info.states.forEach((s, i) => {
          const sNode = hook.nodeFor(s);
          chain.appendChild(el("span", {
            class: "prov-state",
            title: sNode ? nodeLabel(sNode) : "",
            onmouseenter: () => sNode && highlightExternal(sNode, true),
            onmouseleave: () => sNode && highlightExternal(sNode, false),
          }, sNode ? nodeLabel(sNode) : `state#${i}`));
          if (i < info.states.length - 1) chain.appendChild(el("span", { class: "prov-arrow" }, " › "));
        });
        root.appendChild(chain);
      }
      if (!info.bindings.length) {
        root.appendChild(el("div", { class: "empty" }, "no Velin bindings on this node"));
        return root;
      }
      root.appendChild(el("div", { class: "prov-section-title" }, "bindings"));
      for (const b of info.bindings) {
        const box = el("div", { class: "prov-binding" });
        box.appendChild(el("div", { class: "prov-binding-head" },
          el("span", { class: "prov-directive" }, b.directive),
          el("span", { class: "prov-expr" }, b.expr),
        ));
        box.appendChild(el("div", { class: "prov-row" },
          el("span", { class: "prov-label" }, "current"),
          el("span", { class: "prov-val" }, shortValue(b.currentValue)),
        ));
        if (b.reads && b.reads.length) {
          const readsRow = el("div", { class: "prov-row" }, el("span", { class: "prov-label" }, "reads"));
          const readsChips = el("span", { class: "prov-reads" });
          for (const r of b.reads) {
            readsChips.appendChild(el("button", {
              class: "chip",
              title: "Show dependents",
              onclick: () => openDependents(r.state, r.path),
            }, r.path));
          }
          readsRow.appendChild(readsChips);
          box.appendChild(readsRow);
        }
        if (b.lastMutation) {
          const m = b.lastMutation;
          box.appendChild(el("div", { class: "prov-row" },
            el("span", { class: "prov-label" }, "last mut"),
            el("span", { class: "prov-val" },
              `${m.path} ${m.op || ""}${m.method ? " " + m.method : ""} → ${shortValue(m.to)} (${fmtAgo(m.t)})`),
          ));
        }
        root.appendChild(box);
      }
      return root;
    }

    // ── Dependents (Q2) ──────────────────────────────────────────────────
    function openDependentsPrompt() {
      state.openModal = "dependents";
      const body = el("div", { class: "dep" });
      body.appendChild(el("div", { class: "muted" }, "Enter a path (e.g. root.count) — pick a bound root state first, if there are multiple."));
      const rootStates = [...hook.states].filter((s) => !hook.parentOf(s));
      const select = el("select", { class: "field" });
      rootStates.forEach((s, i) => {
        const n = hook.nodeFor(s);
        select.appendChild(el("option", { value: String(i) }, n ? nodeLabel(n) : `state#${i}`));
      });
      const input = el("input", { class: "field", type: "text", placeholder: "root.count" });
      const scopeToggle = el("select", { class: "field" },
        el("option", { value: "narrow" }, "narrow"),
        el("option", { value: "wide" }, "wide"),
      );
      const runBtn = el("button", { class: "btn primary" }, "query");
      const out = el("div", { class: "dep-results" });
      runBtn.addEventListener("click", () => {
        const s = rootStates[+select.value];
        const path = input.value.trim();
        state.dependentsScope = scopeToggle.value;
        if (!s || !path) return;
        renderDependentsInto(out, s, path, scopeToggle.value);
      });
      body.appendChild(el("div", { class: "row" }, select, input, scopeToggle, runBtn));
      body.appendChild(out);
      openModalWith("Dependents", body, "dependents");
    }
    function openDependents(rs, path) {
      // Called from provenance popover.
      state.dependentsState = rs;
      state.dependentsPath = path;
      const body = el("div", { class: "dep" });
      body.appendChild(el("div", { class: "dep-head" },
        el("span", { class: "muted" }, "path"),
        el("code", { class: "code" }, path),
      ));
      const scopeToggle = el("div", { class: "row" },
        scopeBtn("narrow"),
        scopeBtn("wide"),
      );
      body.appendChild(scopeToggle);
      const out = el("div", { class: "dep-results" });
      body.appendChild(out);
      renderDependentsInto(out, rs, path, state.dependentsScope);
      openModalWith("Dependents of " + path, body, "dependents");

      function scopeBtn(k) {
        const b = el("button", { class: "btn" + (state.dependentsScope === k ? " active" : "") }, k);
        b.addEventListener("click", () => {
          state.dependentsScope = k;
          scopeToggle.querySelectorAll("button").forEach((btn) => btn.classList.toggle("active", btn.textContent === k));
          renderDependentsInto(out, rs, path, k);
        });
        return b;
      }
    }
    function renderDependentsInto(container, rs, path, scope) {
      clear(container);
      const rows = hook.dependentsOf(rs, path, { scope });
      if (!rows.length) {
        container.appendChild(el("div", { class: "empty" }, "no dependents — nobody watches this path"));
        return;
      }
      const table = el("table", { class: "grid" });
      table.appendChild(el("tr", null,
        el("th", null, "Node"),
        el("th", null, "Expressions"),
        el("th", { class: "num" }, "≈ ms"),
        el("th", null, ""),
      ));
      for (const r of rows) {
        const exprs = r.effects.map((e) => e.expr).filter(Boolean).join(", ") || "—";
        const nodeCell = el("td", null,
          el("span", { class: "node-label" + (r.isDetached ? " detached" : "") }, nodeLabel(r.node)),
          r.isDetached ? el("span", { class: "badge-warn" }, "detached") : null,
        );
        const tr = el("tr", { class: "clickable" },
          nodeCell,
          el("td", { class: "expr" }, exprs),
          el("td", { class: "num" }, fmtMs(r.estimatedCostMs)),
          el("td", null,
            r.effects[0] ? el("button", {
              class: "iconbtn", title: "Explain effect",
              onclick: (e) => { e.stopPropagation(); openExplainEffect(r.effects[0].effect); },
            }, "?") : null,
          ),
        );
        tr.addEventListener("mouseenter", () => r.node && highlightExternal(r.node, true));
        tr.addEventListener("mouseleave", () => r.node && highlightExternal(r.node, false));
        tr.addEventListener("click", () => r.node && flashExternal(r.node));
        table.appendChild(tr);
      }
      container.appendChild(table);
    }

    // ── Hotspots (Q3) — persistent panel, polls only while open ──────────
    // Hotspots: record/stop model. While recording we subscribe to the
    // hook's effect-emit stream and accumulate durations per expression
    // (and per driving path, via mutationSeq correlation). On stop we
    // render the aggregate frozen for that session. No decay, no polling.
    /** @type {null | { started: number; buffer: Map<string, {calls:number,totalMs:number,maxMs:number,drivers:Map<string,number>,sampleEffect:any}>; mutations: Map<number,string>; unsubscribe: () => void }} */
    let recording = null;

    function openHotspots() {
      state.cmdbarOpen = false;
      cmdbar.classList.remove("open");
      const body = el("div", { class: "hot" });
      body.appendChild(el("div", { class: "section-help" },
        "Record a performance session: press Record, interact with the page, press Stop. The table shows every expression that ran during the capture, how often, and how long. Nothing is sampled or decayed — the recording is a complete capture."));
      const recBtn = el("button", { class: "btn primary" }, "● Record");
      const timer = el("span", { class: "muted" }, "");
      const summary = el("div", { class: "muted" });
      const out = el("div", { class: "hot-results" });

      // Ambient perf summary — always current, independent of recording.
      const renderSummary = () => {
        hook.refreshStats();
        summary.textContent =
          `states: ${[...hook.states].length}  ·  bindings: ${hook.stats.bindingsCount}  ·  ` +
          `effects: ${hook.stats.effectCount}  ·  orphaned effects since start: ${hook.stats.orphanedEffectsSinceStart}`;
      };
      renderSummary();

      let timerId = null;
      const updateTimer = () => {
        if (!recording) return;
        const dt = hook.ø__now() - recording.started;
        timer.textContent = `recording · ${(dt / 1000).toFixed(1)}s`;
      };
      const stop = () => {
        if (!recording) return;
        recording.unsubscribe();
        clearInterval(timerId); timerId = null;
        const elapsed = hook.ø__now() - recording.started;
        const rows = flattenRecording(recording.buffer);
        renderCapture(out, rows, elapsed);
        recording = null;
        recBtn.textContent = "● Record";
        recBtn.classList.remove("recording");
        timer.textContent = `captured · ${(elapsed / 1000).toFixed(1)}s · ${rows.length} expressions`;
        renderSummary();
      };
      const start = () => {
        if (recording) return;
        clear(out);
        out.appendChild(el("div", { class: "empty small" }, "capturing… interact with the page, then press Stop."));
        recording = {
          started: hook.ø__now(),
          buffer: new Map(),
          mutations: new Map(),
          unsubscribe: hook.subscribe((ev) => {
            if (!recording) return;
            if (ev.kind === "mutate") {
              recording.mutations.set(ev.mutationSeq, ev.path);
            } else if (ev.kind === "effect") {
              const expr = ev.expr || "(no expr)";
              let b = recording.buffer.get(expr);
              if (!b) {
                b = { calls: 0, totalMs: 0, maxMs: 0, drivers: new Map(), sampleEffect: ev.effect };
                recording.buffer.set(expr, b);
              }
              b.calls++;
              const dt = ev.durationMs || 0;
              b.totalMs += dt;
              if (dt > b.maxMs) b.maxMs = dt;
              const driver = recording.mutations.get(ev.mutationSeq);
              if (driver) b.drivers.set(driver, (b.drivers.get(driver) || 0) + 1);
            }
          }),
        };
        recBtn.textContent = "■ Stop";
        recBtn.classList.add("recording");
        timerId = setInterval(updateTimer, 100);
        updateTimer();
      };
      recBtn.addEventListener("click", () => recording ? stop() : start());

      body.appendChild(el("div", { class: "row" }, recBtn, timer, el("span", { class: "flex-spacer" })));
      body.appendChild(el("div", { class: "muted", style: "font-size:11px;margin:0 0 8px" },
        "total: cumulative time in this expression during the capture · max: slowest single run · driven by: mutations that triggered it, with counts"));
      body.appendChild(out);
      body.appendChild(el("div", { class: "prov-section-title" }, "ambient state"));
      body.appendChild(summary);

      // Modal cleanup — stop any active recording on close.
      const prevCloseModal = closeModal;
      modal.querySelector(".modal-close").onclick = () => {
        if (recording) { recording.unsubscribe(); clearInterval(timerId); recording = null; }
        prevCloseModal();
        modal.querySelector(".modal-close").onclick = () => closeModal();
      };
      openModalWith("Hotspots", body, "hotspots");
    }
    function flattenRecording(buffer) {
      const rows = [];
      for (const [expr, b] of buffer) {
        rows.push({
          expr, calls: b.calls, totalMs: b.totalMs, maxMs: b.maxMs,
          drivers: [...b.drivers.entries()].map(([path, count]) => ({ path, count }))
                     .sort((a, b) => b.count - a.count),
          sampleEffect: b.sampleEffect,
        });
      }
      rows.sort((a, b) => b.totalMs - a.totalMs);
      return rows;
    }
    function renderCapture(container, rows, elapsedMs) {
      clear(container);
      if (!rows.length) {
        container.appendChild(el("div", { class: "empty" },
          `no expressions ran during the ${(elapsedMs / 1000).toFixed(1)}s capture`));
        return;
      }
      const table = el("table", { class: "grid" });
      table.appendChild(el("tr", null,
        el("th", null, "Expression"),
        el("th", { class: "num" }, "total"),
        el("th", { class: "num" }, "calls"),
        el("th", { class: "num" }, "max"),
        el("th", null, "driven by"),
      ));
      for (const r of rows) {
        const drivers = r.drivers.slice(0, 3).map((d) => `${d.path}×${d.count}`).join(", ") || "—";
        const tr = el("tr", { class: "clickable" },
          el("td", { class: "expr" }, r.expr),
          el("td", { class: "num" }, fmtMs(r.totalMs)),
          el("td", { class: "num" }, String(r.calls)),
          el("td", { class: "num" }, fmtMs(r.maxMs)),
          el("td", { class: "dim" }, drivers),
        );
        tr.addEventListener("click", () => {
          if (r.sampleEffect) openExplainEffect(r.sampleEffect);
        });
        table.appendChild(tr);
      }
      container.appendChild(table);
    }

    // ── Leaks (Q4) — on-demand ───────────────────────────────────────────
    function openLeaks() {
      state.cmdbarOpen = false;
      cmdbar.classList.remove("open");
      const body = el("div", { class: "leaks" });
      body.appendChild(el("div", { class: "section-help" },
        "A leak scan walks every live effect and compares it to the current DOM. It won't tell you whether something IS a leak — only what's suspicious. A growing count across normal interactions is the real signal."));
      const runBtn = el("button", { class: "btn primary" }, "run scan");
      const out = el("div");
      body.appendChild(el("div", { class: "row" }, runBtn, el("span", { class: "muted" }, "scan is on-demand; it is cheap but not free")));
      body.appendChild(out);
      runBtn.addEventListener("click", () => renderLeaksInto(out));
      openModalWith("Leaks", body, "leaks");
      renderLeaksInto(out); // initial scan
    }
    const LEAK_SECTIONS = {
      detachedEffects: {
        title: "Detached effects",
        blurb: "Effects still bound to DOM nodes that have been removed from the document. Each one holds a reference to a dead node and prevents it from being garbage-collected. Not always a bug — some teardowns are deferred — but a count that keeps growing is a smell.",
      },
      detachedStates: {
        title: "Detached state roots",
        blurb: "ReactiveStates whose root element is gone but still hold live bindings. Usually means an app wasn't cleaned up when its container was removed.",
      },
      orphanedSubs: {
        title: "Live hook subscribers",
        blurb: "Code that called `hook.subscribe()` but never released. Every subscriber receives every event — too many hurts perf. Expand to see where each was registered.",
      },
      suspiciousGrowth: {
        title: "Suspicious growth",
        blurb: "Internal buffers (log ring, aggregator maps, etc.) that at least doubled in size since the previous scan. Baseline is captured on first scan.",
      },
    };
    function renderLeaksInto(container) {
      clear(container);
      const r = hook.leaks();
      const sect = (key, items, formatter) => {
        const meta = LEAK_SECTIONS[key];
        const s = el("details", { class: "leak-section" });
        const summaryEl = el("summary", null, `${meta.title}  (${items.length})`);
        if (!items.length) summaryEl.appendChild(el("span", { class: "muted", style: "margin-left:6px" }, "✓ none"));
        s.appendChild(summaryEl);
        s.appendChild(el("div", { class: "section-help", style: "margin:4px 0 8px" }, meta.blurb));
        if (!items.length) {
          s.appendChild(el("div", { class: "empty small" }, "nothing to report"));
        } else {
          for (const it of items) s.appendChild(formatter(it));
        }
        if (items.length) s.open = true;
        return s;
      };
      container.appendChild(sect("detachedEffects", r.detachedEffects, (e) => {
        const row = el("div", { class: "leak-row clickable" },
          el("code", { class: "code" }, e.path),
          el("span", { class: "dim" }, " · "),
          el("span", { class: "expr" }, e.expr),
        );
        row.addEventListener("click", () => openExplainEffect(e.effect));
        return row;
      }));
      container.appendChild(sect("detachedStates", r.detachedStates, (s) =>
        el("div", { class: "leak-row" }, nodeLabel(s.rootNode))
      ));
      container.appendChild(sect("orphanedSubs", r.orphanedSubs, (s) =>
        el("details", { class: "sub-row" },
          el("summary", null, `subscriber added ${fmtAgo(s.addedAt)}`),
          el("pre", { class: "raw" }, s.stackAt || "(no stack)"),
        )
      ));
      container.appendChild(sect("suspiciousGrowth", r.suspiciousGrowth, (g) =>
        el("div", { class: "leak-row" }, `${g.what}: ${g.size}  (+${g.delta})`)
      ));
    }

    // ── Explain effect (Q6) — modal ──────────────────────────────────────
    function openExplainEffect(effect) {
      if (!effect) return;
      const info = hook.explainEffect(effect);
      if (!info) return;
      const body = el("div", { class: "eff" });
      body.appendChild(el("div", { class: "row" },
        el("code", { class: "code big" }, info.expr || "(no expr)"),
      ));
      body.appendChild(el("div", { class: "muted" },
        `${info.pluginName || "?"}${info.subkey ? ":" + info.subkey : ""}   on ${nodeLabel(info.node)}`));
      body.appendChild(el("div", { class: "prov-section-title" }, "reads"));
      const readsRow = el("div", { class: "prov-reads" });
      for (const r of info.reads) {
        readsRow.appendChild(el("button", {
          class: "chip",
          onclick: () => openDependents(r.state, r.path),
        }, r.path));
      }
      body.appendChild(readsRow);
      body.appendChild(el("div", { class: "prov-section-title" }, "recent runs"));
      if (!info.recentRuns.length) {
        body.appendChild(el("div", { class: "empty small" }, "no runs recorded yet"));
      } else {
        const table = el("table", { class: "grid" });
        table.appendChild(el("tr", null,
          el("th", { class: "num" }, "#"),
          el("th", null, "when"),
          el("th", null, "trigger path"),
          el("th", { class: "num" }, "mutSeq"),
          el("th", { class: "num" }, "ms"),
        ));
        info.recentRuns.forEach((r, i) => {
          table.appendChild(el("tr", null,
            el("td", { class: "num" }, String(i + 1)),
            el("td", { class: "dim" }, fmtAgo(r.t)),
            el("td", { class: "expr" }, r.path || "—"),
            el("td", { class: "num" }, r.mutationSeq ? String(r.mutationSeq) : "—"),
            el("td", { class: "num" }, fmtMs(r.durationMs)),
          ));
        });
        body.appendChild(table);
      }
      body.appendChild(el("div", { class: "prov-section-title" }, "why did this run"));
      body.appendChild(el("div", { class: "wdtr" }, info.whyDidThisRun.length
        ? info.whyDidThisRun.map((p) => el("code", { class: "chip static" }, p))
        : [el("span", { class: "empty small" }, "no recorded trigger paths yet")]));
      openModalWith("Effect: " + (info.expr || "?"), body, "explain-effect");
    }

    // ── External DOM helpers (on host page, not shadow) ──────────────────
    function highlightExternal(node, on) {
      if (!(node instanceof Element)) return;
      if (on) {
        node.__vlnPrevOutline2 = node.style.outline || "";
        node.__vlnPrevOffset2 = node.style.outlineOffset || "";
        node.style.outline = "2px dashed #fa7";
        node.style.outlineOffset = "-2px";
      } else {
        node.style.outline = node.__vlnPrevOutline2 || "";
        node.style.outlineOffset = node.__vlnPrevOffset2 || "";
        delete node.__vlnPrevOutline2;
        delete node.__vlnPrevOffset2;
      }
    }
    function flashExternal(node) {
      if (!(node instanceof Element)) return;
      const prev = node.style.outline;
      const prevT = node.style.transition;
      node.style.transition = "outline 0.4s";
      node.style.outline = "2px solid #7cf";
      setTimeout(() => { node.style.outline = prev; node.style.transition = prevT; }, 400);
    }

    // Escape close on modal
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (state.pickMode) return; // handled in pick keydown
      if (state.openModal) { e.preventDefault(); closeModal(); return; }
      if (popover.classList.contains("open")) { e.preventDefault(); closePopover(); return; }
      if (state.cmdbarOpen) { e.preventDefault(); state.cmdbarOpen = false; cmdbar.classList.remove("open"); }
    });

    // Global hotkeys
    document.addEventListener("keydown", (e) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.key === "V" || e.key === "v") {
        e.preventDefault();
        state.cmdbarOpen = !state.cmdbarOpen;
        cmdbar.classList.toggle("open", state.cmdbarOpen);
        if (state.cmdbarOpen) markAllSignalsRead();
      } else if (e.key === "P" || e.key === "p") {
        e.preventDefault();
        if (!state.pickMode) startPickMode(); else cancelPickMode();
      }
    });

    // Register the panel's shadow-host state as ignored so devtools' own
    // click/hover DOM (if any of it turned reactive) never pollutes the log.
    // The panel is plain DOM so no reactive state exists — but if a future
    // change wires anything to Velin.bind on the shadow root, this line
    // keeps it from feeding back.
    // (Nothing to ignore right now — sentinel comment for future me.)

    renderBadge();

    window.__VELIN_DEVTOOLS_COMPANION__ = {
      version: VERSION,
      dispose() {
        if (recording) { recording.unsubscribe(); recording = null; }
        cancelPickMode();
        host.remove();
        delete window.__VELIN_DEVTOOLS_COMPANION__;
      },
    };
  }

  function safeReplacer(_k, v) {
    if (v instanceof Node) return `<${(v.nodeName || "node").toLowerCase()}>`;
    if (typeof v === "function") return "[fn]";
    return v;
  }

  const TEMPLATE_HTML = `
<style>
  :host { all: initial; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #ddd; }
  * { box-sizing: border-box; }
  .badge { position: fixed; right: 12px; bottom: 12px; z-index: 1; pointer-events: auto;
           display: inline-flex; align-items: center; gap: 6px;
           background: #111d; color: #7cf; border: 1px solid #444;
           border-radius: 999px; padding: 4px 10px; cursor: pointer;
           box-shadow: 0 4px 16px #000a; user-select: none; font-weight: bold;
           transition: box-shadow 0.15s, border-color 0.15s; }
  .badge:hover { border-color: #7cf; }
  .badge.picking { border-color: #fa7; color: #fa7; box-shadow: 0 0 0 2px #fa7 inset; }
  .badge.has-warn { border-color: #fa7; }
  .badge.has-info { border-color: #ad9; }
  .badge .count { display: none; background: #f66; color: #fff; padding: 0 5px;
                  border-radius: 999px; min-width: 16px; text-align: center; font-size: 10px; }

  .cmdbar { position: fixed; right: 12px; bottom: 46px; z-index: 1;
            pointer-events: auto; display: none; background: #111d;
            border: 1px solid #444; border-radius: 6px; padding: 6px;
            box-shadow: 0 6px 24px #000a; }
  .cmdbar.open { display: flex; gap: 4px; align-items: center; }
  .cmdbar button { font: inherit; background: #222; color: #ddd;
                   border: 1px solid #555; border-radius: 3px;
                   padding: 3px 8px; cursor: pointer; }
  .cmdbar button:hover { background: #333; border-color: #7cf; color: #7cf; }
  .cmdbar .title { color: #7cf; font-weight: bold; padding: 0 6px; }

  .popover { position: fixed; z-index: 2; pointer-events: auto;
             width: 380px; max-height: 60vh; overflow: auto;
             background: #111f; border: 1px solid #7cf; border-radius: 6px;
             padding: 8px 10px; box-shadow: 0 6px 24px #000a;
             display: none; }
  .popover.open { display: block; }

  .modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
           z-index: 2; pointer-events: auto;
           width: min(720px, 90vw); max-height: 80vh;
           background: #111f; border: 1px solid #444; border-radius: 8px;
           display: none; flex-direction: column;
           box-shadow: 0 12px 48px #000c; }
  .modal.open { display: flex; }
  .modal-header { display: flex; align-items: center; gap: 6px;
                  padding: 6px 10px; background: #1a1a1a; border-bottom: 1px solid #333;
                  border-radius: 8px 8px 0 0; }
  .modal-title { color: #7cf; font-weight: bold; flex: 1; }
  .modal-close { font: inherit; background: transparent; color: #ddd;
                 border: 0; cursor: pointer; font-size: 16px; padding: 0 4px; }
  .modal-close:hover { color: #f66; }
  .modal-body { padding: 10px 12px; overflow: auto; }

  .toasts { position: fixed; right: 12px; bottom: 56px; z-index: 3;
            pointer-events: none; display: flex; flex-direction: column-reverse;
            gap: 4px; max-width: 320px; }
  .toast { pointer-events: auto; background: #222; border: 1px solid #444;
           border-left: 3px solid #7cf; border-radius: 4px;
           padding: 4px 8px; cursor: pointer;
           animation: slidein 0.2s ease-out; }
  .toast.warn { border-left-color: #fa7; }
  .toast .toast-kind { color: #7cf; font-weight: bold; margin-right: 6px; }
  .toast.warn .toast-kind { color: #fa7; }
  .toast .toast-msg { color: #ddd; }
  @keyframes slidein { from { transform: translateX(20px); opacity: 0; } }

  .row { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
  .flex-spacer { flex: 1; }
  .muted, .dim { color: #888; }
  .empty { color: #888; text-align: center; padding: 12px; }
  .empty.small { padding: 4px; font-style: italic; }
  .code { font: inherit; background: #0a0a0a; padding: 1px 4px; border-radius: 3px; color: #eda; }
  .code.big { font-size: 13px; }
  .btn { font: inherit; background: #222; color: #ddd; border: 1px solid #555;
         border-radius: 3px; padding: 3px 8px; cursor: pointer; }
  .btn:hover { border-color: #7cf; }
  .btn.active { background: #234; color: #7cf; border-color: #7cf; }
  .btn.primary { background: #234; color: #7cf; border-color: #7cf; }
  .btn.primary:hover { background: #345; }
  .iconbtn { font: inherit; background: transparent; color: #888; border: 0;
             cursor: pointer; padding: 0 4px; }
  .iconbtn:hover { color: #7cf; }
  .field { font: inherit; background: #0a0a0a; color: #ddd; border: 1px solid #555;
           border-radius: 3px; padding: 3px 6px; }

  .grid { width: 100%; border-collapse: collapse; margin: 6px 0; }
  .grid th, .grid td { text-align: left; padding: 3px 6px;
                       border-bottom: 1px solid #333; vertical-align: top; }
  .grid th { color: #7cf; position: sticky; top: 0; background: #1a1a1a;
             font-weight: normal; text-transform: uppercase; font-size: 10px; }
  .grid td.num, .grid th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .grid td.expr { color: #eda; font-family: ui-monospace, monospace; }
  .grid tr.clickable { cursor: pointer; }
  .grid tr.clickable:hover { background: #1e1e1e; }
  .node-label { color: #7cf; }
  .node-label.detached { color: #f66; text-decoration: line-through; }
  .badge-warn { display: inline-block; margin-left: 6px; padding: 0 4px;
                background: #a33; color: #fff; border-radius: 3px;
                font-size: 10px; }

  .prov-header { display: flex; align-items: center; gap: 6px;
                 padding-bottom: 4px; border-bottom: 1px solid #333; }
  .prov-node { color: #7cf; font-weight: bold; }
  .prov-section-title { color: #888; text-transform: uppercase; font-size: 10px;
                        margin: 8px 0 4px; letter-spacing: 0.5px; }
  .prov-states { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
  .prov-state { color: #ad9; cursor: pointer; padding: 1px 4px;
                border-radius: 3px; background: #1a1a1a; }
  .prov-state:hover { background: #233; }
  .prov-arrow { color: #555; }
  .prov-binding { margin: 6px 0; padding: 6px 8px; background: #161616;
                  border-left: 2px solid #345; border-radius: 3px; }
  .prov-binding-head { display: flex; gap: 8px; margin-bottom: 3px; }
  .prov-directive { color: #7cf; font-weight: bold; }
  .prov-expr { color: #eda; }
  .prov-row { display: flex; gap: 8px; margin: 2px 0; align-items: baseline; }
  .prov-label { color: #888; min-width: 60px; font-size: 10px;
                text-transform: uppercase; }
  .prov-val { color: #ddd; word-break: break-word; flex: 1; }
  .prov-reads { display: inline-flex; flex-wrap: wrap; gap: 3px; }
  .chip { font: inherit; background: #223; color: #7cf; border: 1px solid #345;
          border-radius: 3px; padding: 1px 5px; cursor: pointer; }
  .chip:hover { background: #345; }
  .chip.static { cursor: default; }

  .dep-head { display: flex; gap: 6px; margin-bottom: 6px; align-items: baseline; }

  .leak-section { margin: 8px 0; padding: 4px 0; }
  .leak-section > summary { cursor: pointer; color: #ddd; padding: 3px 0;
                            border-bottom: 1px solid #333; }
  .leak-row { padding: 3px 6px; }
  .leak-row.clickable { cursor: pointer; }
  .leak-row.clickable:hover { background: #1e1e1e; }
  .sub-row { padding: 3px 0; }
  .sub-row > summary { cursor: pointer; color: #ad9; }
  .raw { margin: 4px 0 4px 12px; padding: 6px 8px; background: #0a0a0a;
         border-left: 2px solid #333; color: #aaa; white-space: pre-wrap;
         font-size: 11px; overflow: auto; max-height: 200px; }

  .wdtr { display: flex; flex-wrap: wrap; gap: 3px; }
  .btn.recording { background: #432; color: #fa7; border-color: #fa7; }
  .btn.recording::before { content: "● "; color: #f66; animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .section-help { color: #aaa; font-size: 11px; margin: 0 0 6px; line-height: 1.4; }
  .explainer { margin: 8px 0 4px; }
  .explainer dt { color: #7cf; font-weight: bold; margin-top: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  .explainer dd { margin: 2px 0 0; color: #ddd; }
  .sig-count { display: none; background: #f66; color: #fff; padding: 0 4px;
               border-radius: 999px; min-width: 14px; margin-left: 4px;
               text-align: center; font-size: 10px; }
  .sig-list { display: flex; flex-direction: column; gap: 2px; }
  .sig-item { padding: 6px 8px; background: #161616; border-left: 2px solid #345;
              border-radius: 3px; cursor: pointer; display: flex; align-items: baseline; gap: 6px; }
  .sig-item.warn { border-left-color: #fa7; }
  .sig-item:hover { background: #1e1e1e; }
  .sig-item.unread { background: #1a1a1f; }
  .sig-kind { color: #7cf; font-weight: bold; min-width: 90px; }
  .sig-item.warn .sig-kind { color: #fa7; }
  .sig-when { color: #666; font-size: 10px; margin-left: auto; }
  .sig-count-chip { background: #333; color: #ddd; padding: 0 5px; border-radius: 999px; font-size: 10px; }
</style>
<div class="badge" title="Velin devtools — click to open, Ctrl+Shift+V">
  ⓥ<span class="count"></span>
</div>
<div class="cmdbar">
  <span class="title">Velin devtools</span>
  <button data-cmd="pick" title="Pick an element (Ctrl+Shift+P)">pick</button>
  <button data-cmd="hotspots" title="Record a perf session">hotspots</button>
  <button data-cmd="dependents" title="Dependents of a path">dependents</button>
  <button data-cmd="leaks" title="Scan for leaks">leaks</button>
  <button data-cmd="signals" title="Recent notifications">signals<span class="sig-count"></span></button>
  <button data-cmd="close" title="Close">×</button>
</div>
<div class="popover"></div>
<div class="modal">
  <div class="modal-header">
    <span class="modal-title"></span>
    <button class="modal-close" title="Close">×</button>
  </div>
  <div class="modal-body"></div>
</div>
<div class="toasts"></div>
`;

  whenHook(attach);
})();
