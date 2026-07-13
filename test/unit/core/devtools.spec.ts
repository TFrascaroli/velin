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
    expect(typeof hook.enumerateBindings).toBe("function");
    expect(hook.log).toBeInstanceOf(Array);
    expect(hook.states[Symbol.iterator]).toBeDefined();
    expect(hook.plugins instanceof Map).toBe(true);
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

  it("enumerateBindings row count matches sum of bindings.size across states", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="a"></div><div vln-text="b"></div>';
    Velin.bind(div, { a: 1, b: 2 });
    const rows = getHook().enumerateBindings();
    let sum = 0;
    for (const s of getHook().states) sum += s.bindings.size;
    expect(rows.length).toBe(sum);
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
