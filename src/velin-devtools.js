// @ts-nocheck
/**
 * Velin devtools companion, v0.3 drawer shell.
 *
 * Design (see .plans/devtools-v0.3-facelift.md):
 * - One side drawer. No modals. No toasts. No popovers.
 * - Icon rail on the left of the drawer swaps the main content in place.
 * - Breadcrumb at the top shows drill history (Esc / back-arrow walks it).
 * - Badge shows unread signal count; click opens the drawer on Signals.
 * - Plain DOM + hook.subscribe inside a shadow root. Not a Velin app.
 *
 * Iteration 1 ports Inspect (pick + provenance) and Signals (inbox).
 * Record / Leaks / Query / Explain are rail stubs that render a
 * "coming next" placeholder. Iteration 2 and 3 port them.
 */

(function () {
  if (typeof window === "undefined") return;
  if (window.__VELIN_DEVTOOLS_COMPANION__) return;

  const VERSION = "0.3.0-alpha.0";
  const HOOK_KEY = "__VELIN_DEVTOOLS_HOOK__";
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
    } catch { /* already a data property */ }

    const check = () => queueMicrotask(() => {
      if (!window[HOOK_KEY]) {
        console.warn("[Velin devtools] Velin was not built with __DEV__=true; devtools cannot attach.");
      }
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
    else check();
  }

  function attach(hook) {
    // ── Shadow root ────────────────────────────────────────────────────
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;inset:0;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;
    document.documentElement.appendChild(host);

    const $ = (sel) => shadow.querySelector(sel);

    const badge = $(".badge");
    const badgeCount = $(".badge .count");
    const drawer = $(".drawer");
    const crumbs = $(".crumbs");
    const bodyEl = $(".body");
    const railBtns = Array.from(shadow.querySelectorAll(".rail button"));

    // ── Rendering helpers ──────────────────────────────────────────────
    const el = (tag, attrs, ...children) => {
      const n = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        if (attrs[k] == null) continue;
        if (k === "class") n.className = attrs[k];
        else if (k === "style") n.style.cssText = attrs[k];
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
        else n.setAttribute(k, attrs[k]);
      }
      for (const c of children) {
        if (c == null || c === false) continue;
        n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
      return n;
    };
    const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
    const fmtAgo = (t) => {
      const dt = hook.ø__now() - t;
      if (dt < 1000) return "just now";
      if (dt < 60_000) return `${(dt / 1000).toFixed(1)}s ago`;
      return `${(dt / 60_000).toFixed(1)}m ago`;
    };
    const nodeLabel = (node) => {
      if (!node || node.nodeType !== 1) return "?";
      let seg = node.tagName.toLowerCase();
      if (node.id) return `<${seg}#${node.id}>`;
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
    const fmtPath = (p) => typeof p === "string" && p.startsWith("root.") ? p.slice(5) : p;

    // ── Navigation stack ───────────────────────────────────────────────
    // Each frame: { surface, label, data, build }.
    // build(data) must return a DOM node (the body).
    const stack = [];

    function navigate(frame) {
      stack.push(frame);
      renderFrame();
    }
    function navigateReplace(frame) {
      stack.length = 0;
      stack.push(frame);
      renderFrame();
    }
    function navigateUp() {
      if (stack.length <= 1) return;
      stack.pop();
      renderFrame();
    }
    function renderFrame() {
      const frame = stack[stack.length - 1];
      if (!frame) return;
      // Rail active state follows the current surface.
      railBtns.forEach((b) => b.classList.toggle("active", b.dataset.surface === frame.surface));
      // Breadcrumbs
      clear(crumbs);
      stack.forEach((f, i) => {
        const crumb = el("button", {
          class: "crumb" + (i === stack.length - 1 ? " current" : ""),
          onclick: () => { stack.length = i + 1; renderFrame(); },
        }, f.label);
        crumbs.appendChild(crumb);
        if (i < stack.length - 1) crumbs.appendChild(el("span", { class: "crumb-sep" }, "›"));
      });
      // Body
      clear(bodyEl);
      bodyEl.appendChild(frame.build(frame.data));
    }

    // ── Drawer open/close ──────────────────────────────────────────────
    let open = false;
    function openDrawer(initial) {
      open = true;
      drawer.classList.add("open");
      if (initial || !stack.length) {
        navigateReplace(initial || entries.inspect());
      }
      markSignalsRead();
    }
    function closeDrawer() {
      open = false;
      drawer.classList.remove("open");
      if (pickMode) cancelPickMode();
    }

    // ── Rail entries ───────────────────────────────────────────────────
    const entries = {
      inspect: () => ({ surface: "inspect", label: "Inspect", data: null, build: buildInspect }),
      record:  () => ({ surface: "record",  label: "Record",  data: null, build: buildPlaceholder("Record") }),
      leaks:   () => ({ surface: "leaks",   label: "Leaks",   data: null, build: buildPlaceholder("Leaks") }),
      signals: () => ({ surface: "signals", label: "Signals", data: null, build: buildSignals }),
      query:   () => ({ surface: "query",   label: "Query",   data: null, build: buildPlaceholder("Query") }),
    };

    railBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const key = b.dataset.surface;
        if (entries[key]) navigateReplace(entries[key]());
      });
    });

    // ── Badge + signals ────────────────────────────────────────────────
    /** @type {Map<string, {sig: any, count: number, unread: boolean}>} */
    const signalMap = new Map();
    const signalOrder = [];
    const SIGNAL_HISTORY_MAX = 100;

    function renderBadge() {
      const unread = [...signalMap.values()].reduce((a, s) => a + (s.unread ? 1 : 0), 0);
      badgeCount.textContent = unread || "";
      badgeCount.style.display = unread ? "inline-block" : "none";
      let sev = null;
      for (const s of signalMap.values()) {
        if (!s.unread) continue;
        if (s.sig.severity === "warn") { sev = "warn"; break; }
        if (!sev) sev = "info";
      }
      badge.classList.toggle("has-warn", sev === "warn");
      badge.classList.toggle("has-info", sev === "info" && sev !== "warn");
    }
    function markSignalsRead() {
      for (const s of signalMap.values()) s.unread = false;
      renderBadge();
    }
    function formatSignalMessage(sig) {
      const p = sig.payload || {};
      switch (sig.kind) {
        case "thrash":       return `${fmtPath(p.path)} × ${p.count}`;
        case "long-effect":  return `${p.expr || "?"} took ${(p.durationMs || 0).toFixed(1)}ms`;
        case "orphan-spike": return `${p.count} orphaned effects in ${p.windowMs}ms`;
        case "warn":         return `[${p.code}] ${p.message}`;
        default:             return sig.kind;
      }
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
      // If the drawer is open on Signals, re-render.
      const top = stack[stack.length - 1];
      if (open && top && top.surface === "signals") renderFrame();
    });

    // ── Surface: Inspect (pick + provenance) ───────────────────────────
    let pickMode = false;
    let pickHighlight = null;

    function startPickMode() {
      pickMode = true;
      badge.classList.add("picking");
      document.addEventListener("mousemove", onPickMove, true);
      document.addEventListener("click", onPickClick, true);
      document.addEventListener("keydown", onPickKey, true);
    }
    function cancelPickMode() {
      pickMode = false;
      badge.classList.remove("picking");
      document.removeEventListener("mousemove", onPickMove, true);
      document.removeEventListener("click", onPickClick, true);
      document.removeEventListener("keydown", onPickKey, true);
      clearPickHighlight();
    }
    function clearPickHighlight() {
      if (!pickHighlight) return;
      pickHighlight.style.outline = pickHighlight.__vlnPrevOutline || "";
      pickHighlight.style.outlineOffset = pickHighlight.__vlnPrevOffset || "";
      delete pickHighlight.__vlnPrevOutline;
      delete pickHighlight.__vlnPrevOffset;
      pickHighlight = null;
    }
    function isOurShadow(t) {
      const r = typeof t?.getRootNode === "function" ? t.getRootNode() : null;
      return r === shadow || (t && host.contains(t));
    }
    function onPickMove(e) {
      const t = e.target;
      if (!(t instanceof Element) || isOurShadow(t) || t === pickHighlight) {
        if (!(t instanceof Element) || isOurShadow(t)) clearPickHighlight();
        return;
      }
      clearPickHighlight();
      pickHighlight = t;
      t.__vlnPrevOutline = t.style.outline || "";
      t.__vlnPrevOffset = t.style.outlineOffset || "";
      t.style.outline = "2px solid var(--v-cyan, #7cf)";
      t.style.outlineOffset = "-2px";
    }
    function onPickClick(e) {
      const t = e.target;
      if (isOurShadow(t)) return;
      if (!(t instanceof Element)) return;
      e.preventDefault();
      e.stopPropagation();
      const node = pickHighlight || t;
      cancelPickMode();
      // Replace Inspect's frame data with the picked node + re-render.
      navigateReplace({ surface: "inspect", label: `Inspect ${nodeLabel(node)}`, data: node, build: buildInspect });
    }
    function onPickKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelPickMode(); }
    }
    function highlightExternal(node, on) {
      if (!(node instanceof Element)) return;
      if (on) {
        node.__vlnFlashPrev = node.style.outline || "";
        node.style.outline = "2px dashed var(--v-amber, #fa7)";
      } else {
        node.style.outline = node.__vlnFlashPrev || "";
        delete node.__vlnFlashPrev;
      }
    }

    function buildInspect(node) {
      if (!node) {
        return el("div", { class: "surface" },
          el("div", { class: "surface-head" },
            el("h3", null, "Inspect"),
            el("button", { class: "btn primary", onclick: startPickMode }, "Pick an element"),
          ),
          el("p", { class: "muted" },
            "Click an element in the page to see which states own it, which directives are bound, what each expression reads, and what mutated it last.",
          ),
          el("p", { class: "hint" }, "Shortcut: Ctrl+Shift+P"),
        );
      }
      const info = hook.explainNode(node);
      const root = el("div", { class: "surface" });

      root.appendChild(el("div", { class: "surface-head" },
        el("h3", null, nodeLabel(node)),
        el("button", { class: "btn", onclick: startPickMode }, "Pick another"),
      ));

      if (info.states.length) {
        root.appendChild(el("div", { class: "section-title" }, "states"));
        const chain = el("div", { class: "chain" });
        info.states.forEach((s, i) => {
          const sNode = hook.nodeFor(s);
          const label = el("span", {
            class: "chain-item",
            title: sNode ? nodeLabel(sNode) : "",
            onmouseenter: () => sNode && highlightExternal(sNode, true),
            onmouseleave: () => sNode && highlightExternal(sNode, false),
          }, sNode ? nodeLabel(sNode) : `state#${i}`);
          chain.appendChild(label);
          if (i < info.states.length - 1) chain.appendChild(el("span", { class: "chain-sep" }, "›"));
        });
        root.appendChild(chain);
      }

      if (!info.bindings.length) {
        root.appendChild(el("div", { class: "empty" }, "no Velin bindings on this node"));
        return root;
      }

      root.appendChild(el("div", { class: "section-title" }, "bindings"));
      for (const b of info.bindings) {
        const box = el("div", { class: "binding" });
        box.appendChild(el("div", { class: "binding-head" },
          el("span", { class: "directive" }, b.directive),
          el("code", { class: "expr" }, b.expr),
        ));
        box.appendChild(row("current", el("span", { class: "val" }, shortValue(b.currentValue))));

        if (b.reads && b.reads.length) {
          const chips = el("div", { class: "chips" });
          for (const r of b.reads) {
            chips.appendChild(el("button", {
              class: "chip",
              title: "Query dependents of this path",
              onclick: () => {
                // Query surface not ported yet in iteration 1.
                navigate({
                  surface: "query",
                  label: `Query ${fmtPath(r.path)}`,
                  data: { state: r.state, path: r.path },
                  build: buildPlaceholder("Query"),
                });
              },
            }, fmtPath(r.path)));
          }
          box.appendChild(row("reads", chips));
        }
        if (b.lastMutation) {
          const m = b.lastMutation;
          box.appendChild(row("last mut",
            el("span", { class: "val" },
              `${fmtPath(m.path)} → ${shortValue(m.to)}  `,
              el("span", { class: "dim" }, fmtAgo(m.t)),
            ),
          ));
        }
        root.appendChild(box);
      }
      return root;
    }
    function row(label, ...kids) {
      return el("div", { class: "row" },
        el("span", { class: "row-label" }, label),
        el("span", { class: "row-val" }, ...kids),
      );
    }

    // ── Surface: Signals ───────────────────────────────────────────────
    const SIGNAL_EXPLAINERS = {
      thrash: {
        what: "The path shown mutated more than 32× in a single animation frame. Usually a feedback loop or an unbatched write-loop.",
        why:  "Each mutation re-triggers every effect bound to it. Repeated writes multiply work.",
        action: "Open Record, reproduce the write. The driving path will show up in the top row. Fix the feedback loop or wrap the writes in a batch.",
      },
      "long-effect": {
        what: "This expression ran once and took longer than one frame (16ms).",
        why:  "Long single-run cost shows up as jank — scroll stutters, input lag, animation hitches.",
        action: "Open the effect from its row to see its reads, recent runs, and triggering path. Common fixes: narrow deps, defer the work.",
      },
      "orphan-spike": {
        what: "Effects are firing on DOM nodes that are no longer in the document.",
        why:  "Orphan effects hold references to dead nodes, prevent GC, and do wasted work.",
        action: "Open Leaks — the detached effects section lists what's firing and where it was registered.",
      },
      warn: {
        what: "Internal warning from Velin core.",
        why:  "Warns are usually not fatal, but indicate a bug or misconfiguration (detached effects, failed cleanups, suspicious state).",
        action: "Inspect the node (if the warn carries one) or Query the path (if it carries one).",
      },
    };

    function buildSignals() {
      const root = el("div", { class: "surface" });
      root.appendChild(el("div", { class: "surface-head" },
        el("h3", null, "Signals"),
        signalMap.size ? el("button", { class: "btn", onclick: () => {
          signalMap.clear(); signalOrder.length = 0; renderBadge(); renderFrame();
        } }, "Clear all") : null,
      ));
      root.appendChild(el("p", { class: "muted" },
        "The hook emits a signal when something crosses a threshold (thrash, long effect, orphan spike, warn). Entries persist for the session.",
      ));
      if (!signalMap.size) {
        root.appendChild(el("div", { class: "empty" }, "no signals recorded yet"));
        return root;
      }
      const list = el("div", { class: "sig-list" });
      for (let i = signalOrder.length - 1; i >= 0; i--) {
        const entry = signalMap.get(signalOrder[i]);
        if (!entry) continue;
        const sev = entry.sig.severity === "warn" ? "warn" : "info";
        const item = el("button", { class: `sig-item ${sev}` },
          el("div", { class: "sig-top" },
            el("span", { class: "sig-kind" }, entry.sig.kind),
            el("span", { class: "sig-msg" }, formatSignalMessage(entry.sig)),
            entry.count > 1 ? el("span", { class: "sig-count-chip" }, "×" + entry.count) : null,
            el("span", { class: "sig-when" }, fmtAgo(entry.sig.t || hook.ø__now())),
          ),
        );
        item.addEventListener("click", () => {
          navigate({
            surface: "signals",
            label: entry.sig.kind,
            data: entry.sig,
            build: buildSignalDetail,
          });
        });
        list.appendChild(item);
      }
      root.appendChild(list);
      return root;
    }

    function buildSignalDetail(sig) {
      const ex = SIGNAL_EXPLAINERS[sig.kind] || SIGNAL_EXPLAINERS.warn;
      const root = el("div", { class: "surface" });
      root.appendChild(el("div", { class: "surface-head" },
        el("h3", null, "Signal: " + sig.kind),
      ));
      root.appendChild(el("div", { class: "detail-headline" }, formatSignalMessage(sig)));
      root.appendChild(section("What happened", ex.what));
      root.appendChild(section("Why it matters", ex.why));
      root.appendChild(section("What to do",   ex.action));
      return root;
    }
    function section(title, body) {
      return el("div", { class: "detail-section" },
        el("div", { class: "detail-section-title" }, title),
        el("div", { class: "detail-section-body" }, body),
      );
    }

    // ── Placeholder surfaces (iteration 2+) ────────────────────────────
    function buildPlaceholder(name) {
      return () => el("div", { class: "surface" },
        el("div", { class: "surface-head" }, el("h3", null, name)),
        el("div", { class: "empty" },
          name + " moves into the drawer in the next iteration. For now, open the previous panel version to use it.",
        ),
      );
    }

    // ── Wiring ─────────────────────────────────────────────────────────
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      if (open) closeDrawer(); else openDrawer();
    });

    $(".drawer-close").addEventListener("click", closeDrawer);
    $(".crumbs-back").addEventListener("click", navigateUp);

    document.addEventListener("keydown", (e) => {
      if (!e.ctrlKey || !e.shiftKey) {
        if (e.key === "Escape" && open) {
          if (pickMode) return; // pickKey handles it
          if (stack.length > 1) { e.preventDefault(); navigateUp(); return; }
          e.preventDefault();
          closeDrawer();
        }
        return;
      }
      if (e.key === "V" || e.key === "v") {
        e.preventDefault();
        if (open) closeDrawer(); else openDrawer();
      } else if (e.key === "P" || e.key === "p") {
        e.preventDefault();
        if (!open) openDrawer(entries.inspect());
        if (!pickMode) startPickMode();
        else cancelPickMode();
      }
    });

    renderBadge();

    window.__VELIN_DEVTOOLS_COMPANION__ = {
      version: VERSION,
      dispose() {
        cancelPickMode();
        host.remove();
        delete window.__VELIN_DEVTOOLS_COMPANION__;
      },
    };
  }

  // ── Template ─────────────────────────────────────────────────────────
  const TEMPLATE = `
<style>
  :host {
    all: initial;
    --v-bg: #0f1115;
    --v-bg-2: #171a21;
    --v-bg-3: #1e222b;
    --v-fg: #e5e7eb;
    --v-fg-dim: #9ca3af;
    --v-fg-mute: #6b7280;
    --v-border: #2a2f3a;
    --v-cyan: #7cf;
    --v-green: #ad9;
    --v-amber: #fa7;
    --v-red: #f66;
    --v-radius: 6px;
    --v-space: 10px;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--v-fg);
  }
  * { box-sizing: border-box; }
  button { font: inherit; color: inherit; cursor: pointer; }

  /* Badge */
  .badge {
    position: fixed; right: 14px; bottom: 14px;
    pointer-events: auto;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--v-bg); color: var(--v-cyan);
    border: 1px solid var(--v-border);
    border-radius: 999px; padding: 5px 11px;
    cursor: pointer; user-select: none; font-weight: bold;
    box-shadow: 0 4px 16px #000a;
    transition: border-color .15s, transform .15s;
  }
  .badge:hover { border-color: var(--v-cyan); transform: translateY(-1px); }
  .badge.picking { border-color: var(--v-amber); color: var(--v-amber); }
  .badge.has-warn { border-color: var(--v-amber); }
  .badge.has-info { border-color: var(--v-green); }
  .badge .count {
    display: none; background: var(--v-red); color: #fff;
    padding: 0 5px; border-radius: 999px; min-width: 16px;
    text-align: center; font-size: 10px;
  }

  /* Drawer */
  .drawer {
    position: fixed; right: 0; top: 0; bottom: 0;
    width: 460px; max-width: 100vw;
    pointer-events: auto;
    background: var(--v-bg);
    border-left: 1px solid var(--v-border);
    display: grid;
    grid-template-columns: 44px 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas: "rail head" "rail body";
    transform: translateX(100%);
    transition: transform .18s ease-out;
    box-shadow: -8px 0 32px #0008;
  }
  .drawer.open { transform: translateX(0); }

  /* Rail */
  .rail {
    grid-area: rail;
    background: var(--v-bg-2);
    border-right: 1px solid var(--v-border);
    display: flex; flex-direction: column; align-items: stretch;
    padding: 6px 0;
    gap: 2px;
  }
  .rail button {
    background: transparent;
    border: 0; border-left: 2px solid transparent;
    color: var(--v-fg-mute);
    padding: 10px 0;
    display: flex; align-items: center; justify-content: center;
    transition: color .1s, background .1s, border-color .1s;
    position: relative;
  }
  .rail button:hover { color: var(--v-fg); background: var(--v-bg-3); }
  .rail button.active {
    color: var(--v-cyan);
    border-left-color: var(--v-cyan);
    background: var(--v-bg-3);
  }
  .rail .rail-icon { font-size: 16px; line-height: 1; }
  .rail button::after {
    content: attr(data-label);
    position: absolute; left: 100%; margin-left: 6px;
    background: var(--v-bg-3); color: var(--v-fg);
    padding: 2px 8px; border-radius: 3px;
    white-space: nowrap; font-size: 11px;
    opacity: 0; pointer-events: none;
    transition: opacity .1s;
    border: 1px solid var(--v-border);
    z-index: 1;
  }
  .rail button:hover::after { opacity: 1; }

  /* Head: breadcrumbs + close */
  .drawer-head {
    grid-area: head;
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--v-border);
    background: var(--v-bg-2);
  }
  .crumbs-back {
    background: transparent; border: 0; color: var(--v-fg-mute);
    padding: 2px 4px; border-radius: 3px;
  }
  .crumbs-back:hover { color: var(--v-fg); background: var(--v-bg-3); }
  .crumbs {
    display: flex; align-items: center; gap: 4px; flex: 1;
    overflow: hidden;
  }
  .crumb {
    background: transparent; border: 0; color: var(--v-fg-mute);
    padding: 2px 4px; border-radius: 3px;
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .crumb:hover { color: var(--v-fg); }
  .crumb.current { color: var(--v-fg); font-weight: bold; }
  .crumb-sep { color: var(--v-fg-mute); }
  .drawer-close {
    background: transparent; border: 0; color: var(--v-fg-mute);
    font-size: 18px; padding: 0 4px;
  }
  .drawer-close:hover { color: var(--v-red); }

  /* Body */
  .body {
    grid-area: body;
    overflow: auto;
    padding: 12px 14px;
  }

  /* Surface primitives */
  .surface { display: flex; flex-direction: column; gap: 10px; }
  .surface-head {
    display: flex; align-items: center; gap: 8px;
    padding-bottom: 6px; border-bottom: 1px solid var(--v-border);
  }
  .surface-head h3 { margin: 0; font-size: 13px; color: var(--v-cyan); font-weight: bold; flex: 1; }
  .section-title {
    color: var(--v-fg-mute); text-transform: uppercase;
    font-size: 10px; letter-spacing: 0.5px;
    margin-top: 4px;
  }
  .muted { color: var(--v-fg-dim); margin: 0; }
  .hint { color: var(--v-fg-mute); margin: 0; font-size: 11px; }
  .empty { color: var(--v-fg-mute); text-align: center; padding: 20px 10px; font-style: italic; }
  .dim { color: var(--v-fg-mute); }
  .val { color: var(--v-fg); word-break: break-word; }
  .expr { color: var(--v-green); background: var(--v-bg-2); padding: 1px 4px; border-radius: 3px; }

  .btn {
    background: var(--v-bg-2); color: var(--v-fg);
    border: 1px solid var(--v-border);
    border-radius: 3px; padding: 4px 10px;
  }
  .btn:hover { border-color: var(--v-cyan); color: var(--v-cyan); }
  .btn.primary { background: var(--v-bg-3); color: var(--v-cyan); border-color: var(--v-cyan); }
  .btn.primary:hover { background: var(--v-bg-2); }

  .row { display: flex; gap: 8px; align-items: baseline; margin: 2px 0; }
  .row-label {
    color: var(--v-fg-mute); min-width: 70px;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;
  }
  .row-val { color: var(--v-fg); flex: 1; }

  .chain { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chain-item {
    color: var(--v-green); background: var(--v-bg-2);
    padding: 2px 6px; border-radius: 3px; cursor: default;
  }
  .chain-item:hover { background: var(--v-bg-3); }
  .chain-sep { color: var(--v-fg-mute); }

  .binding {
    background: var(--v-bg-2);
    border-left: 2px solid var(--v-border);
    border-radius: 3px;
    padding: 8px 10px;
  }
  .binding-head { display: flex; gap: 8px; margin-bottom: 4px; align-items: center; }
  .directive { color: var(--v-cyan); font-weight: bold; }

  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chip {
    background: var(--v-bg-3); color: var(--v-cyan);
    border: 1px solid var(--v-border); border-radius: 3px;
    padding: 1px 6px;
  }
  .chip:hover { background: var(--v-bg-2); border-color: var(--v-cyan); }

  /* Signals */
  .sig-list { display: flex; flex-direction: column; gap: 2px; }
  .sig-item {
    background: var(--v-bg-2); border: 1px solid var(--v-border);
    border-left: 2px solid var(--v-cyan);
    border-radius: 3px;
    padding: 8px 10px;
    text-align: left;
  }
  .sig-item.warn { border-left-color: var(--v-amber); }
  .sig-item:hover { background: var(--v-bg-3); }
  .sig-top { display: flex; align-items: center; gap: 8px; }
  .sig-kind { color: var(--v-cyan); font-weight: bold; min-width: 90px; }
  .sig-item.warn .sig-kind { color: var(--v-amber); }
  .sig-msg { color: var(--v-fg); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sig-count-chip {
    background: var(--v-bg-3); color: var(--v-fg-dim);
    padding: 0 5px; border-radius: 999px; font-size: 10px;
  }
  .sig-when { color: var(--v-fg-mute); font-size: 10px; }

  .detail-headline {
    color: var(--v-fg); font-size: 13px;
    padding: 8px 10px; background: var(--v-bg-2);
    border-radius: 3px; border-left: 2px solid var(--v-cyan);
  }
  .detail-section { margin-top: 10px; }
  .detail-section-title {
    color: var(--v-cyan); text-transform: uppercase;
    font-size: 10px; letter-spacing: 0.5px; font-weight: bold;
    margin-bottom: 3px;
  }
  .detail-section-body { color: var(--v-fg); line-height: 1.55; }
</style>
<div class="badge" title="Velin devtools — click to open · Ctrl+Shift+V">
  ⓥ<span class="count"></span>
</div>
<div class="drawer">
  <div class="rail">
    <button data-surface="inspect" data-label="Inspect"><span class="rail-icon">⌖</span></button>
    <button data-surface="record"  data-label="Record"><span class="rail-icon">●</span></button>
    <button data-surface="leaks"   data-label="Leaks"><span class="rail-icon">⚠</span></button>
    <button data-surface="signals" data-label="Signals"><span class="rail-icon">◉</span></button>
    <button data-surface="query"   data-label="Query"><span class="rail-icon">?</span></button>
  </div>
  <div class="drawer-head">
    <button class="crumbs-back" title="Back (Esc)">‹</button>
    <div class="crumbs"></div>
    <button class="drawer-close" title="Close (Esc)">×</button>
  </div>
  <div class="body"></div>
</div>
`;

  whenHook(attach);
})();
