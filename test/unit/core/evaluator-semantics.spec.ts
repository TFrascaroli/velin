import { describe, it, expect } from "vitest";
import Velin from "../../../src/velin-core";

// Evaluator semantics that the AST walker must match JS on. Each case here
// was a real divergence (found in the 2026-11 parser study) before it was
// pinned down by a test.

function bound(init: any) {
  const state = Velin.bind(document.createElement("div"), init);
  const rs = Velin.ø__internal.getWrapper(state)!;
  return { state, run: (expr: string) => Velin.evaluate(rs, expr, true) };
}

describe("Evaluator — call receivers", () => {
  it("evaluates the receiver of a method call exactly once", () => {
    let calls = 0;
    const { run } = bound({
      api: {
        get() {
          calls++;
          return { name: "x", run: () => 42 };
        },
      },
    });
    expect(run("api.get().run()")).toBe(42);
    expect(calls).toBe(1);
  });

  it("evaluates a computed receiver key exactly once", () => {
    let keyReads = 0;
    const { run } = bound({
      get k() {
        keyReads++;
        return "fn";
      },
      obj: { fn: () => 7 },
    });
    expect(run("obj[k]()")).toBe(7);
    expect(keyReads).toBe(1);
  });

  it("still binds `this` to the receiver", () => {
    const { run } = bound({ counter: { n: 3, get() { return this.n; } } });
    expect(run("counter.get()")).toBe(3);
  });
});

describe("Evaluator — unary operators", () => {
  it("supports unary plus", () => {
    const { run } = bound({ s: "5", t: true });
    expect(run("+s + 1")).toBe(6);
    expect(run("+t")).toBe(1);
    expect(run("-s")).toBe(-5);
    expect(run("!s")).toBe(false);
  });
});

describe("Evaluator — object literals keep references", () => {
  it("a state object placed in a literal is the live object, not a snapshot", () => {
    const { state, run } = bound({ user: { name: "a" } });
    const r = run("{ u: user }");
    expect(r.u).toBe(state.user);
    state.user.name = "b";
    expect(r.u.name).toBe("b");
  });

  it("does not add a `constructor` key to nested objects", () => {
    const { run } = bound({ user: { name: "a" } });
    const r = run("{ u: user, plain: { x: 1 } }");
    expect(Object.keys(r.u)).toEqual(["name"]);
    expect(Object.keys(r.plain)).toEqual(["x"]);
    expect(r.plain.constructor).toBe(Object);
  });
});
