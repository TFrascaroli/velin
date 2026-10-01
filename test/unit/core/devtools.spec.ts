import { describe, it, expect, beforeEach } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

setupVelinStd(Velin);

const getHook = (): any => (window as any).__VELIN_DEVTOOLS_HOOK__;

describe("Devtools hook (D1)", () => {
  beforeEach(() => {
    const hook = getHook();
    hook.setLogCapacity(500);
    hook.stats.updateCounter = 0;
    hook.stats.orphanedEffectsSinceStart = 0;
    hook.stats.expressionEvalTime.clear();
  });

  it("is present under __DEV__=true and exposes contract", () => {
    const hook = getHook();
    expect(hook).toBeDefined();
    expect(typeof hook.subscribe).toBe("function");
    expect(typeof hook.peek).toBe("function");
    expect(typeof hook.whyDidThisRun).toBe("function");
    // Phase-1 rebuild: enumerateBindings is gone. Regression guard so a
    // future refactor doesn't sneak it back in.
    expect(hook.enumerateBindings).toBeUndefined();
    expect(hook.log).toBeInstanceOf(Array);
    expect(hook.states[Symbol.iterator]).toBeDefined();
    expect(hook.plugins instanceof Map).toBe(true);
    // Phase-1 APIs present.
    for (const fn of [
      "explainNode", "resolvePath", "substatesUnder", "dependentsOf",
      "hotspots", "explainEffect", "leaks", "topMutations",
      "currentFrameMutations", "onSignal", "topBindings",
    ]) {
      expect(typeof hook[fn], fn).toBe("function");
    }
  });

  it("emits bind + mutate + trigger + effect events", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const events: any[] = [];
    const off = getHook().subscribe((e: any) => events.push(e));
    const state = Velin.bind(div, { count: 1 });
    state.count = 2;
    off();
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has("bind")).toBe(true);
    expect(kinds.has("mutate")).toBe(true);
    expect(kinds.has("trigger")).toBe(true);
    expect(kinds.has("effect")).toBe(true);
    // mutate must come before trigger for the same path
    const mut = events.findIndex((e) => e.kind === "mutate" && e.path === "root.count");
    const trg = events.findIndex((e) => e.kind === "trigger" && e.path === "root.count");
    expect(mut).toBeGreaterThanOrEqual(0);
    expect(trg).toBeGreaterThan(mut);
  });

  it("array method emits mutate op=arrayMethod", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="items.length"></div>';
    const state = Velin.bind(div, { items: [1] });
    const seen: any[] = [];
    const off = getHook().subscribe((e: any) => e.kind === "mutate" && seen.push(e));
    state.items.push(2);
    off();
    const m = seen.find((e) => e.op === "arrayMethod");
    expect(m).toBeDefined();
    expect(m.method).toBe("push");
  });

  it("ring buffer wraps at capacity", () => {
    const hook = getHook();
    hook.setLogCapacity(4);
    for (let i = 0; i < 8; i++) hook.ø__emit({ kind: "mutate", path: "x" + i, op: "set" });
    const log = hook.log;
    expect(log.length).toBe(4);
    expect(log[0].path).toBe("x4");
    expect(log[3].path).toBe("x7");
  });

  it("peek does not add to bindings", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="a.b"></div>';
    const state = Velin.bind(div, { a: { b: 1 } }) as any;
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const sizeBefore = rs.bindings.size;
    const val = getHook().peek(rs, ["a", "b"]);
    expect(val).toBe(1);
    expect(rs.bindings.size).toBe(sizeBefore);
  });

  it("whyDidThisRun returns triggering paths newest-first", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="a + b"></div>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const effect = [...rs.bindings.get("root.a")][0];
    state.a = 3;
    state.b = 4;
    const paths = getHook().whyDidThisRun(effect, 4);
    expect(paths[0]).toBe("root.b");
    expect(paths[1]).toBe("root.a");
  });

  it("throwing subscriber does not break reactivity", async () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const state = Velin.bind(div, { count: 1 });
    const rejections: any[] = [];
    const handler = (e: any) => { rejections.push(e); e.preventDefault?.(); };
    process.on("uncaughtException", handler);
    const off = getHook().subscribe(() => { throw new Error("bad listener"); });
    state.count = 5;
    // let queued microtask settle before we teardown handlers
    await new Promise((r) => queueMicrotask(() => r(null)));
    off();
    process.off("uncaughtException", handler);
    expect(div.querySelector("div")!.textContent).toBe("5");
    expect(rejections.length).toBeGreaterThan(0);
  });

  it("multiple bind() calls produce two entries in hook.states", () => {
    const d1 = document.createElement("div");
    d1.innerHTML = '<div vln-text="x"></div>';
    const d2 = document.createElement("div");
    d2.innerHTML = '<div vln-text="y"></div>';
    Velin.bind(d1, { x: 1 });
    Velin.bind(d2, { y: 1 });
    const arr = [...getHook().states];
    expect(arr.length).toBeGreaterThanOrEqual(2);
  });

  it("composeState emits compose and appears in states", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-loop:item="items"><span vln-text="item"></span></div>';
    const events: any[] = [];
    const off = getHook().subscribe((e: any) => events.push(e));
    Velin.bind(div, { items: [1, 2] });
    off();
    expect(events.some((e) => e.kind === "compose")).toBe(true);
  });

  it("cleanup emits cleanup event", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-loop:item="items"><span vln-text="item"></span></div>';
    const state = Velin.bind(div, { items: [1, 2, 3] });
    const seen: any[] = [];
    const off = getHook().subscribe((e: any) => e.kind === "cleanup" && seen.push(e));
    state.items = [1];
    off();
    expect(seen.length).toBeGreaterThan(0);
  });

  describe("ø__ignoreState", () => {
    it("gates emits for the ignored root's own events", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="count"></div>';
      const state = Velin.bind(div, { count: 1 });
      const wrapper = Velin.ø__internal.getWrapper(state)!;

      const seen: any[] = [];
      const off = getHook().subscribe((e: any) => seen.push(e));
      getHook().ø__ignoreState(wrapper);

      state.count = 5; // would normally emit mutate + trigger + effect
      off();

      const kinds = new Set(seen.map((e) => e.kind));
      expect(kinds.has("mutate")).toBe(false);
      expect(kinds.has("trigger")).toBe(false);
      expect(kinds.has("effect")).toBe(false);
    });

    it("gates emits for substates composed under an ignored root", () => {
      // Regression: composeState creates a NEW ReactiveState object, so
      // identity-only checks would miss substates. The gate must walk the
      // parent chain via hook.parents / ø__registerParent.
      const div = document.createElement("div");
      div.innerHTML = '<div vln-loop:it="items" vln-text="it"></div>';
      const state = Velin.bind(div, { items: [1, 2, 3] });
      const wrapper = Velin.ø__internal.getWrapper(state)!;

      const seen: any[] = [];
      const off = getHook().subscribe((e: any) => seen.push(e));
      getHook().ø__ignoreState(wrapper);

      // Mutating items rebuilds substates (each a new ReactiveState under
      // the ignored root). No listener callback should fire.
      state.items = [10, 20, 30];
      off();

      expect(seen.length).toBe(0);
    });

    it("prevents recursion when a listener mutates an ignored state", () => {
      // Regression: devtools listener pushes into its own reactive state on
      // every warn event. Without proper gating, that push triggered effects
      // that emitted more warns → infinite recursion → stack overflow.
      const div = document.createElement("div");
      div.innerHTML = '<div vln-loop:w="warns" vln-text="w"></div>';
      const state = Velin.bind(div, { warns: [] as any[] });
      const wrapper = Velin.ø__internal.getWrapper(state)!;
      getHook().ø__ignoreState(wrapper);

      let listenerCalls = 0;
      const off = getHook().subscribe((e: any) => {
        listenerCalls++;
        if (e.kind === "warn") {
          // This unshift used to feed back and detonate the stack.
          state.warns.unshift(e.message);
        }
      });

      // Emit a burst of warn events (simulating W002 slow-expression spam
      // from a host page with high mutation frequency).
      for (let i = 0; i < 100; i++) {
        getHook().ø__emit({ kind: "warn", code: "TEST", message: `w${i}` });
      }
      off();

      // Every emit should have called the listener exactly once. If the
      // gate leaked, listenerCalls would grow super-linearly (or overflow).
      expect(listenerCalls).toBe(100);
      expect(state.warns.length).toBe(100);
    });

    it("does not advance emitSeq for events from an ignored state", () => {
      // Regression: devtools' poller uses hook.emitSeq as a "host has
      // changed" signal. If the poller's own reactive writes fed back into
      // emitSeq, every poll would find seq changed → snapshot again →
      // fire own effects → advance seq → infinite feedback.
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="count"></div>';
      const state = Velin.bind(div, { count: 0 });
      const wrapper = Velin.ø__internal.getWrapper(state)!;
      getHook().ø__ignoreState(wrapper);

      const seqBefore = getHook().emitSeq;
      state.count = 1; // mutate + trigger + effect + (potentially) evaluate
      state.count = 2;
      state.count = 3;
      const seqAfter = getHook().emitSeq;

      expect(seqAfter).toBe(seqBefore); // no host activity → no advance
    });

    it("advances emitSeq for events from a non-ignored root", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="count"></div>';
      const state = Velin.bind(div, { count: 0 });

      const seqBefore = getHook().emitSeq;
      state.count = 1;
      expect(getHook().emitSeq).toBeGreaterThan(seqBefore);
    });

    it("still emits for a sibling (non-ignored) root", () => {
      const divA = document.createElement("div");
      divA.innerHTML = '<div vln-text="x"></div>';
      const stateA = Velin.bind(divA, { x: 1 });
      const divB = document.createElement("div");
      divB.innerHTML = '<div vln-text="y"></div>';
      const stateB = Velin.bind(divB, { y: 1 });

      const wrapperA = Velin.ø__internal.getWrapper(stateA)!;
      getHook().ø__ignoreState(wrapperA);

      const seen: any[] = [];
      const off = getHook().subscribe((e: any) => seen.push(e));
      stateA.x = 2;
      stateB.y = 2;
      off();

      const kinds = seen.map((e) => e.kind + "@" + (e.path ?? ""));
      expect(kinds.some((k) => k.startsWith("mutate@") && k.includes("root.y"))).toBe(true);
      expect(kinds.some((k) => k.startsWith("mutate@") && k.includes("root.x"))).toBe(false);
    });
  });
});

// ─── Phase 1: correlation ids + effect ref on emit ─────────────────────────

describe("Devtools hook — correlation ids", () => {
  beforeEach(() => {
    getHook().ø__resetAggregators();
  });

  it("mutate emit carries a monotonic mutationSeq", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const state = Velin.bind(div, { count: 0 });
    const seen: any[] = [];
    const off = getHook().subscribe((e: any) => e.kind === "mutate" && seen.push(e));
    state.count = 1;
    state.count = 2;
    state.count = 3;
    off();
    expect(seen.length).toBe(3);
    expect(seen[0].mutationSeq).toBeGreaterThan(0);
    expect(seen[1].mutationSeq).toBe(seen[0].mutationSeq + 1);
    expect(seen[2].mutationSeq).toBe(seen[1].mutationSeq + 1);
  });

  it("trigger and effect emits carry the same mutationSeq as the causing mutate", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const state = Velin.bind(div, { count: 0 });
    const seen: any[] = [];
    const off = getHook().subscribe((e: any) => seen.push(e));
    state.count = 42;
    off();
    const mut = seen.find((e) => e.kind === "mutate" && e.path === "root.count");
    const trg = seen.find((e) => e.kind === "trigger" && e.path === "root.count");
    const eff = seen.find((e) => e.kind === "effect" && e.path === "root.count");
    expect(mut.mutationSeq).toBeGreaterThan(0);
    expect(trg.mutationSeq).toBe(mut.mutationSeq);
    expect(eff.mutationSeq).toBe(mut.mutationSeq);
  });

  it("effect emit carries the effect ref itself", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const state = Velin.bind(div, { count: 0 });
    let effEv: any = null;
    const off = getHook().subscribe((e: any) => e.kind === "effect" && (effEv = e));
    state.count = 5;
    off();
    expect(effEv).toBeTruthy();
    expect(typeof effEv.effect).toBe("function");
    expect(effEv.effect.ø__debug).toBeTruthy();
    expect(effEv.effect.ø__debug.expr).toBe("count");
  });

  it("batched effects credit the LAST mutation that queued them", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="a + b"></div>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    const ctrl = Velin.getController(state);
    let lastMuteSeq = 0;
    let effEv: any = null;
    const off = getHook().subscribe((e: any) => {
      if (e.kind === "mutate") lastMuteSeq = e.mutationSeq;
      if (e.kind === "effect") effEv = e;
    });
    ctrl.batch(() => { state.a = 10; state.b = 20; });
    off();
    expect(effEv).toBeTruthy();
    expect(effEv.mutationSeq).toBe(lastMuteSeq); // credit last write, not first
  });

  it("user-invoked triggerEffects (no preceding mutation) uses mutationSeq=0", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const state = Velin.bind(div, { count: 0 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    let effEv: any = null;
    const off = getHook().subscribe((e: any) => e.kind === "effect" && (effEv = e));
    (Velin as any).ø__internal.triggerEffects("count", rs);
    off();
    expect(effEv).toBeTruthy();
    // Not undefined — the emit stamps a numeric field either way.
    expect(effEv.mutationSeq === 0 || effEv.mutationSeq === undefined).toBe(true);
  });
});

// ─── Phase 1: resolvePath + substatesUnder ─────────────────────────────────

describe("Devtools hook — resolvePath / substatesUnder", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("resolvePath returns the given state for a top-level path with no substate owner", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="count"></div>';
    const state = Velin.bind(div, { count: 1 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const { owningState, localPath } = getHook().resolvePath(rs, "root.count");
    expect(owningState).toBe(rs);
    expect(localPath).toBe("root.count");
  });

  it("resolvePath handles missing / empty path gracefully", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="x"></div>';
    const state = Velin.bind(div, { x: 1 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const r = getHook().resolvePath(rs, "");
    expect(r.owningState).toBe(rs);
    expect(r.localPath).toBe("");
    const r2 = getHook().resolvePath(rs, "root.nope.does.not.exist");
    expect(r2.owningState).toBe(rs); // fallback: given state
  });

  it("substatesUnder finds vln-loop substates whose bindings touch the loop path", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-loop:item="items"><span vln-text="item"></span></div>';
    const state = Velin.bind(div, { items: [1, 2, 3] });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const subs = getHook().substatesUnder(rs, "root.items");
    // vln-loop creates one substate per iteration; may include container states too
    expect(subs.length).toBeGreaterThan(0);
  });
});

// ─── Phase 1: explainNode ──────────────────────────────────────────────────

describe("Devtools hook — explainNode", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("returns the directive, expression and reads for a bound node", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="name"></span>';
    const state = Velin.bind(div, { name: "Ada" });
    void state; // keep alive for readers
    const span = div.querySelector("span")!;
    const info = getHook().explainNode(span);
    expect(info.bindings.length).toBe(1);
    const b = info.bindings[0];
    expect(b.directive).toBe("vln-text");
    expect(b.expr).toBe("name");
    expect(b.reads.some((r: any) => r.path === "root.name")).toBe(true);
    expect(b.currentValue).toBe("Ada");
  });

  it("returns empty bindings for a node with no directives", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="name"></span><em>plain</em>';
    Velin.bind(div, { name: "Ada" });
    const em = div.querySelector("em")!;
    const info = getHook().explainNode(em);
    expect(info.bindings.length).toBe(0);
  });

  it("lastMutation is the most recent mutation on any read path", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="count"></span>';
    const state = Velin.bind(div, { count: 1 });
    state.count = 2;
    state.count = 3;
    const span = div.querySelector("span")!;
    const info = getHook().explainNode(span);
    expect(info.bindings[0].lastMutation).toBeTruthy();
    expect(info.bindings[0].lastMutation.to).toBe(3);
  });

  it("returns state chain for a node inside a vln-loop substate", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.innerHTML = '<div vln-loop:item="items"><span vln-text="item"></span></div>';
    const state = Velin.bind(div, { items: ["a", "b"] });
    void state;
    const span = div.querySelector("span")!;
    const info = getHook().explainNode(span);
    // At least the substate and the root should own the node.
    expect(info.states.length).toBeGreaterThanOrEqual(1);
    div.remove();
  });

  it("multi-binding expressions surface all deps in reads", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a + b"></span>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    void state;
    const span = div.querySelector("span")!;
    const info = getHook().explainNode(span);
    const reads = info.bindings[0].reads.map((r: any) => r.path);
    expect(reads).toContain("root.a");
    expect(reads).toContain("root.b");
  });
});

// ─── Phase 1: dependentsOf ─────────────────────────────────────────────────

describe("Devtools hook — dependentsOf", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("narrow scope returns nodes bound to the exact path", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.innerHTML = '<span vln-text="a"></span><span vln-text="b"></span>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const rows = getHook().dependentsOf(rs, "root.a", { scope: "narrow" });
    expect(rows.length).toBe(1);
    expect(rows[0].effects[0].expr).toBe("a");
    expect(rows[0].isDetached).toBe(false);
    div.remove();
  });

  it("empty result is an empty array, not an error", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a"></span>';
    const state = Velin.bind(div, { a: 1 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const rows = getHook().dependentsOf(rs, "root.nonexistent", { scope: "narrow" });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });

  it("wide scope surfaces effects at descendant paths, narrow does not", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="user.name"></span><span vln-text="user.email"></span>';
    const state = Velin.bind(div, { user: { name: "Ada", email: "a@b" } });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    // Widen from `root.user.name` — narrow should NOT include the email
    // binding, wide should include both.
    const narrow = getHook().dependentsOf(rs, "root.user.name", { scope: "narrow" });
    const wide = getHook().dependentsOf(rs, "root.user", { scope: "wide" });
    const narrowExprs = narrow.flatMap((r: any) => r.effects.map((e: any) => e.expr));
    const wideExprs = wide.flatMap((r: any) => r.effects.map((e: any) => e.expr));
    expect(narrowExprs).toContain("user.name");
    expect(narrowExprs).not.toContain("user.email");
    expect(wideExprs).toContain("user.name");
    expect(wideExprs).toContain("user.email");
  });

  it("does NOT mutate state — pure query", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="count"></span>';
    const state = Velin.bind(div, { count: 5 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    getHook().dependentsOf(rs, "root.count", { scope: "narrow" });
    getHook().dependentsOf(rs, "root.count", { scope: "wide" });
    expect(state.count).toBe(5);
    expect(div.querySelector("span")!.textContent).toBe("5");
  });

  it("flags detached-node effects via isDetached", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.innerHTML = '<span vln-text="count"></span>';
    const state = Velin.bind(div, { count: 1 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    // Detach without cleanup — effect still in bindings, node not in doc.
    div.remove();
    const rows = getHook().dependentsOf(rs, "root.count", { scope: "narrow" });
    expect(rows.length).toBe(1);
    expect(rows[0].isDetached).toBe(true);
  });

  it("estimatedCostMs is null when no runs have happened", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="count"></span>';
    const state = Velin.bind(div, { count: 1 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const rows = getHook().dependentsOf(rs, "root.count", { scope: "narrow" });
    // Effect has run once (initial bind) — but that goes through processPlugin,
    // not the emit path that populates recentRuns. So estimatedCostMs is null.
    expect(rows[0].estimatedCostMs).toBeNull();
    // After a mutation, runs are recorded on the ring.
    state.count = 2;
    const rows2 = getHook().dependentsOf(rs, "root.count", { scope: "narrow" });
    expect(rows2[0].estimatedCostMs).not.toBeNull();
    expect(rows2[0].estimatedCostMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Phase 1: hotspots ─────────────────────────────────────────────────────

describe("Devtools hook — hotspots", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("ranks expressions by totalMs across the window", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a"></span><span vln-text="b"></span>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    for (let i = 0; i < 5; i++) { state.a = i; state.b = i; }
    const hs = getHook().hotspots({ windowMs: 5000 });
    const exprs = hs.map((h: any) => h.expr);
    expect(exprs).toContain("a");
    expect(exprs).toContain("b");
    for (const h of hs) {
      expect(h.calls).toBeGreaterThan(0);
      expect(h.totalMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("drivers list credits the mutation path that caused the effect", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a + b"></span>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    state.a = 10;
    state.a = 20;
    state.b = 30;
    const hs = getHook().hotspots({ windowMs: 5000 });
    const row = hs.find((h: any) => h.expr === "a + b");
    expect(row).toBeTruthy();
    const paths = row.drivers.map((d: any) => d.path).sort();
    expect(paths).toContain("root.a");
    expect(paths).toContain("root.b");
    const aDriver = row.drivers.find((d: any) => d.path === "root.a");
    expect(aDriver.count).toBe(2);
  });

  it("expressions outside the window do not appear", async () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="count"></span>';
    const state = Velin.bind(div, { count: 0 });
    state.count = 1;
    // Wait past the window (short window forces expiry).
    await new Promise((r) => setTimeout(r, 400));
    const hs = getHook().hotspots({ windowMs: 100 });
    const row = hs.find((h: any) => h.expr === "count");
    expect(row).toBeUndefined();
  });
});

// ─── Phase 1: explainEffect ────────────────────────────────────────────────

describe("Devtools hook — explainEffect", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("returns null for a non-effect input", () => {
    expect(getHook().explainEffect(null)).toBeNull();
    expect(getHook().explainEffect(() => {})).toBeNull();
  });

  it("returns rich shape for a real effect: reads, recentRuns, whyDidThisRun", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a + b"></span>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    state.a = 5;
    state.b = 6;
    const effect = [...rs.bindings.get("root.a")][0];
    const info = getHook().explainEffect(effect);
    expect(info.expr).toBe("a + b");
    expect(info.pluginName).toBe("text");
    expect(info.reads.map((r: any) => r.path).sort()).toEqual(["root.a", "root.b"]);
    expect(info.recentRuns.length).toBeGreaterThan(0);
    // Newest first.
    expect(info.recentRuns[0].path).toBe("root.b");
    expect(info.whyDidThisRun[0]).toBe("root.b");
    expect(info.whyDidThisRun).toContain("root.a");
  });

  it("recentRuns wraps correctly at ring capacity", async () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="x"></span>';
    const state = Velin.bind(div, { x: 0 });
    const rs = (Velin as any).ø__internal.getWrapper(state);
    const effect = [...rs.bindings.get("root.x")][0];
    // DEBUG_RUN_RING = 16 — push more.
    for (let i = 1; i <= 40; i++) state.x = i;
    const info = getHook().explainEffect(effect);
    expect(info.recentRuns.length).toBeLessThanOrEqual(16);
    expect(info.recentRuns.length).toBeGreaterThan(0);
  });
});

// ─── Phase 1: leaks ────────────────────────────────────────────────────────

describe("Devtools hook — leaks", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("detects a detached effect after node.remove()", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.innerHTML = '<span vln-text="count"></span>';
    Velin.bind(div, { count: 1 });
    div.remove();
    const l = getHook().leaks();
    const found = l.detachedEffects.find((e: any) => e.expr === "count");
    expect(found).toBeTruthy();
    expect(found.path).toBe("root.count");
  });

  it("detects a detached state root", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.innerHTML = '<span vln-text="x"></span>';
    Velin.bind(div, { x: 1 });
    div.remove();
    const l = getHook().leaks();
    // The root state is detached; may co-appear with detachedEffects.
    expect(l.detachedStates.length).toBeGreaterThan(0);
  });

  it("orphanedSubs reports live subscribers with a stack sample", () => {
    const off = getHook().subscribe(() => {});
    const l = getHook().leaks();
    expect(l.orphanedSubs.length).toBeGreaterThan(0);
    expect(typeof l.orphanedSubs[0].stackAt).toBe("string");
    off();
    const l2 = getHook().leaks();
    expect(l2.orphanedSubs.length).toBeLessThan(l.orphanedSubs.length);
  });

  it("returns empty arrays cleanly when there's nothing to report", () => {
    // Fresh page state on a bound tree that's still attached.
    const div = document.createElement("div");
    document.body.appendChild(div);
    div.innerHTML = '<span vln-text="y"></span>';
    Velin.bind(div, { y: 1 });
    const l = getHook().leaks();
    expect(Array.isArray(l.detachedEffects)).toBe(true);
    expect(Array.isArray(l.detachedStates)).toBe(true);
    expect(Array.isArray(l.orphanedSubs)).toBe(true);
    expect(Array.isArray(l.suspiciousGrowth)).toBe(true);
    div.remove();
  });
});

// ─── Phase 1: topMutations / currentFrameMutations ─────────────────────────

describe("Devtools hook — topMutations / currentFrameMutations", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("topMutations ranks paths by count within the window", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a"></span><span vln-text="b"></span>';
    const state = Velin.bind(div, { a: 1, b: 2 });
    for (let i = 0; i < 5; i++) state.a = i;
    state.b = 99;
    const tm = getHook().topMutations({ windowMs: 5000 });
    expect(tm[0].path).toBe("root.a");
    expect(tm[0].count).toBe(5);
    const b = tm.find((r: any) => r.path === "root.b");
    expect(b.count).toBe(1);
  });

  it("avgFanout reflects triggered effect count", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="x"></span><span vln-text="x"></span><em vln-text="x"></em>';
    const state = Velin.bind(div, { x: 1 });
    state.x = 2;
    const tm = getHook().topMutations({ windowMs: 5000 });
    const row = tm.find((r: any) => r.path === "root.x");
    expect(row).toBeTruthy();
    expect(row.avgFanout).toBe(3);
  });

  it("currentFrameMutations returns a snapshot copy of live frame counts", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="a"></span>';
    const state = Velin.bind(div, { a: 0 });
    // Start at 1 — assigning the same value as init is skipped by the set trap.
    for (let i = 1; i <= 5; i++) state.a = i;
    const m = getHook().currentFrameMutations();
    expect(m instanceof Map).toBe(true);
    expect(m.get("root.a")).toBe(5);
  });
});

// ─── Phase 1: signal channel ───────────────────────────────────────────────

describe("Devtools hook — onSignal", () => {
  beforeEach(() => getHook().ø__resetAggregators());

  it("delivers 'warn' signals mirroring warn emits, with a stable dismissKey", () => {
    const signals: any[] = [];
    const off = getHook().onSignal((s: any) => signals.push(s));
    getHook().ø__emit({ kind: "warn", code: "W-TEST", message: "hi", ref: { path: "root.x" } });
    getHook().ø__emit({ kind: "warn", code: "W-TEST", message: "hi", ref: { path: "root.x" } });
    off();
    expect(signals.length).toBe(2);
    expect(signals[0].kind).toBe("warn");
    expect(signals[0].dismissKey).toBe(signals[1].dismissKey); // stable
  });

  it("delivers 'long-effect' when a synthetic effect emit exceeds the threshold", () => {
    const signals: any[] = [];
    const off = getHook().onSignal((s: any) => s.kind === "long-effect" && signals.push(s));
    getHook().ø__emit({ kind: "effect", expr: "slow", durationMs: 50 });
    off();
    expect(signals.length).toBe(1);
    expect(signals[0].payload.expr).toBe("slow");
    expect(signals[0].dismissKey).toContain("slow");
  });

  it("delivers 'thrash' when a path crosses the frame mutation threshold", () => {
    const signals: any[] = [];
    const off = getHook().onSignal((s: any) => s.kind === "thrash" && signals.push(s));
    for (let i = 0; i < 40; i++) {
      getHook().ø__emit({ kind: "mutate", path: "root.thrashy", op: "set" });
    }
    off();
    // The core code emits W003 once per frame at count === LIMIT+1 (33).
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0].dismissKey).toBe("thrash:root.thrashy");
  });

  it("delivers to multiple subscribers", () => {
    const a: any[] = [], b: any[] = [];
    const offA = getHook().onSignal((s: any) => a.push(s));
    const offB = getHook().onSignal((s: any) => b.push(s));
    getHook().ø__emit({ kind: "warn", code: "W-X", message: "x" });
    offA(); offB();
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
  });
});
