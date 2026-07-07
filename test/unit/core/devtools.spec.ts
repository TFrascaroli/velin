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
});
