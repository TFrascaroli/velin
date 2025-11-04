import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-std.js";
import { describe, it, expect, beforeEach } from "vitest";

setupVelinStd(Velin);

describe("Object Shorthand Syntax", () => {
  let node: HTMLElement;
  let reactiveState: any;

  beforeEach(() => {
    node = document.createElement("div");
  });

  describe("evaluate()", () => {
    beforeEach(() => {
      Velin.bind(node, {
        username: "Alice",
        age: 30,
        isActive: true,
        count: 5
      });
      reactiveState = Velin.ø__internal.boundState.root!;
    });

    it("should evaluate shorthand single property", () => {
      const result = Velin.evaluate(reactiveState, "{ username }");
      expect(result).toEqual({ username: "Alice" });
    });

    it("should evaluate shorthand multiple properties", () => {
      const result = Velin.evaluate(reactiveState, "{ username, age, isActive }");
      expect(result).toEqual({
        username: "Alice",
        age: 30,
        isActive: true
      });
    });

    it("should mix shorthand and regular syntax", () => {
      const result = Velin.evaluate(reactiveState, "{ username, doubled: count * 2 }");
      expect(result).toEqual({
        username: "Alice",
        doubled: 10
      });
    });

    it("should handle trailing comma with shorthand", () => {
      const result = Velin.evaluate(reactiveState, "{ username, age, }");
      expect(result).toEqual({
        username: "Alice",
        age: 30
      });
    });

    it("should handle complex expressions with shorthand", () => {
      const result = Velin.evaluate(reactiveState,
        "{ username, age, active: isActive, nextAge: age + 1 }"
      );
      expect(result).toEqual({
        username: "Alice",
        age: 30,
        active: true,
        nextAge: 31
      });
    });

    it("should track dependencies for shorthand properties", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-text="obj.username"></span>';

      const state = Velin.bind(div, {
        username: "Bob",
        age: 25,
        obj: null as any
      });

      // Set obj using shorthand syntax evaluation
      const rs = Velin.ø__internal.boundState.root!;
      state.obj = Velin.evaluate(rs, "{ username, age }");

      const span = div.querySelector('span');
      expect(span?.textContent).toBe('Bob');

      // Update value - should reflect in obj
      state.username = "Charlie";
      state.obj = Velin.evaluate(rs, "{ username, age }");
      expect(span?.textContent).toBe('Charlie');
    });
  });

  describe("Nested objects with shorthand", () => {
    beforeEach(() => {
      Velin.bind(node, {
        x: 1,
        y: 2,
        nested: { a: 10, b: 20 }
      });
      reactiveState = Velin.ø__internal.boundState.root!;
    });

    it("should handle nested object with shorthand", () => {
      const result = Velin.evaluate(reactiveState, "{ x, y, nested }");
      expect(result).toEqual({
        x: 1,
        y: 2,
        nested: { a: 10, b: 20 }
      });
    });

    it("should handle shorthand in nested object creation", () => {
      const result = Velin.evaluate(reactiveState, "{ coord: { x, y } }");
      expect(result).toEqual({
        coord: { x: 1, y: 2 }
      });
    });
  });

  describe("Error cases", () => {
    beforeEach(() => {
      Velin.bind(node, { foo: "bar" });
      reactiveState = Velin.ø__internal.boundState.root!;
    });

    it("should error on shorthand with string key", () => {
      expect(() => {
        Velin.evaluate(reactiveState, '{ "foo" }');
      }).toThrow();
    });
  });
});
