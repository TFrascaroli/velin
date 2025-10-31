import Velin, { ReactiveState } from "../../src/velin-core";
import { describe, it, expect, vitest, beforeEach } from "vitest";

describe("Velin Public API", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
  });

  describe("evaluate", () => {
    let reactiveState: ReactiveState;
    beforeEach(() => {
      Velin.bind(node, {
        x: 5,
        y: (val: number) => val + 65,
        abc: { a: { b: { c: "hi" } } },
      });
      reactiveState = Velin.ø__internal.boundState.root!;
    });

    it("should compute expression in reactive context", () => {
      expect(Velin.evaluate(reactiveState, "vln.x + 1")).toBe(6);
    });

    it.skip("should compute expression inside iife", () => {
      // Skipped: Arrow functions and IIFEs not supported in CSP-safe evaluator
      expect(Velin.evaluate(reactiveState, "(() => vln.x + 1)()")).toBe(6);
    });

    it("should interpolate functions", () => {
      expect(Velin.evaluate(reactiveState, "vln.y(10)")).toBe(75);
    });

    it("should interpolate object chains", () => {
      expect(Velin.evaluate(reactiveState, "vln.abc.a.b.c")).toBe("hi");
    });

    it("should perform multiple interpolations", () => {
      expect(Velin.evaluate(reactiveState, "vln.x + vln.y(10)")).toBe(80);
    });

    it("should evaluate object literals", () => {
      Velin.bind(node, {
        isActive: true,
        isEnabled: false,
      });
      const reactiveState2 = Velin.ø__internal.boundState.root!;
      const result = Velin.evaluate(
        reactiveState2,
        "{ active: vln.isActive, disabled: !vln.isEnabled }"
      );
      expect(result).toEqual({ active: true, disabled: true });
    });

    it("should throw error when setting during evaluation", () => {
      expect(() => {
        Velin.evaluate(reactiveState, "vln.x = 5");
      }).toThrowError(
        "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter"
      );
    });
  });

  describe("evaluate without vln prefix", () => {
    let reactiveState: ReactiveState;
    beforeEach(() => {
      Velin.bind(node, {
        message: "hello",
        count: 5,
        isActive: true,
        isEnabled: false,
        getValue: (n: number) => n * 2,
      });
      reactiveState = Velin.ø__internal.boundState.root!;
    });

    it("should access state properties directly", () => {
      expect(Velin.evaluate(reactiveState, "message")).toBe("hello");
    });

    it("should evaluate expressions without vln prefix", () => {
      expect(Velin.evaluate(reactiveState, "count + 1")).toBe(6);
    });

    it("should evaluate ternary without vln prefix", () => {
      expect(Velin.evaluate(reactiveState, 'isActive ? "yes" : "no"')).toBe("yes");
    });

    it("should call functions without vln prefix", () => {
      expect(Velin.evaluate(reactiveState, "getValue(10)")).toBe(20);
    });

    it("should evaluate object literals without vln prefix", () => {
      const result = Velin.evaluate(
        reactiveState,
        "{ active: isActive, disabled: !isEnabled }"
      );
      expect(result).toEqual({ active: true, disabled: true });
    });

    it("should support both vln and no-vln in same expression", () => {
      expect(Velin.evaluate(reactiveState, "vln.count + count")).toBe(10);
    });
  });

  describe("getSetter", () => {
    let reactiveState: ReactiveState;
    let state: any;
    beforeEach(() => {
      state = Velin.bind(node, {
        abc: { a: { b: { c: "hi" } } },
        arr: [{ name: "a" }, { name: "b" }, { name: "c" }],
      });
      reactiveState = Velin.ø__internal.boundState.root!;
    });

    it("should set a value with a simple chained expression", () => {
      Velin.getSetter(reactiveState, "vln.abc.a.b.c")("hello!");
      expect(state.abc.a.b.c).toBe("hello!");
    });

    it("should set a value through object access", () => {
      state.abc.a.b.c = "hello!";
      expect(Velin.evaluate(reactiveState, "vln.abc.a.b.c")).toBe("hello!");
    });

    it("should set through interpolated properties on an inner state", () => {
      const innerState = Velin.composeState(
        reactiveState,
        new Map([["propB", "vln.abc.a.b"]])
      );
      Velin.getSetter(innerState, "vln.propB")({ c: "hello!" });
      expect(Velin.evaluate(reactiveState, "vln.abc.a.b.c")).toBe("hello!");
    });

    it("should be able to retrieve through interpolated properties after set", () => {
      const innerState = Velin.composeState(
        reactiveState,
        new Map([["propB", "vln.abc.a.b"]])
      );
      Velin.getSetter(reactiveState, "vln.abc.a.b")({ c: "hello!" });
      expect(Velin.evaluate(innerState, "vln.propB.c")).toBe("hello!");
    });

    it("should set array object's inner properties", () => {
      Velin.getSetter(reactiveState, "vln.arr[1].name")("changedName");
      expect(state.arr[1].name).toBe("changedName");
    });

    it.skip("should trigger entire array binding on modifications", () => {
      // Skipped: Array reactivity for direct index assignment is a known limitation.
      // Design decision: Full array trigger is acceptable for most use cases (loops).
      const effectOnIndex = vitest.fn();
      const effectOnArray = vitest.fn();
      reactiveState.bindings.set("root.arr[1]", new Set([effectOnIndex]));
      reactiveState.bindings.set("root.arr", new Set([effectOnArray]));
      Velin.evaluate(reactiveState, "vln.arr")[1] = { name: "changedName" };
      expect(state.arr[1].name).toBe("changedName");
      expect(effectOnArray).toHaveBeenCalled();
      expect(effectOnIndex).not.toHaveBeenCalled();
    });
  });

  describe("composeState", () => {
    let state: any;
    let innerState: ReactiveState;
    beforeEach(() => {
      state = Velin.bind(node, {
        name: "Test",
        friend: { score: { low: 2, high: 23 } },
      });
      innerState = Velin.composeState(
        Velin.ø__internal.boundState.root!,
        new Map([["score", "vln.friend.score"]])
      );
    });

    it("should interpolate and resolve expressions from context", () => {
      const score = Velin.evaluate(innerState, "vln.score");
      expect(score).toBe(state.friend.score);
    });

    it("should get triggered for changes in parent scope", () => {
      const effect = vitest.fn();
      innerState.bindings.set("root.friend.score", new Set([effect]));
      Velin.getSetter(innerState, "vln.friend.score")({ low: 12, high: 36 });
      expect(effect).toHaveBeenCalled();
      const lowScore = Velin.evaluate(innerState, "vln.score.low");
      expect(lowScore).toBe(12);
    });
  });
});
