import Velin from "../../src/velin-core";
import setupVelinStd from "../../src/velin-std.js";
import { describe, it, expect, beforeEach } from "vitest";

setupVelinStd(Velin);

describe("Loop Expression Parsing", () => {
  let node: HTMLElement;
  let reactiveState: any;

  beforeEach(() => {
    node = document.createElement("div");
    Velin.bind(node, {
      items: ['a', 'b', 'c'],
      item: 'outer-item',
      idx: 'outer-idx'
    });
    reactiveState = Velin.ø__internal.boundState.root!;
  });

  describe("Expression Evaluator", () => {
    it("should evaluate 'items' to the array", () => {
      const result = Velin.evaluate(reactiveState, "items");
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it("should evaluate 'item' to outer scope value", () => {
      const result = Velin.evaluate(reactiveState, "item");
      expect(result).toBe('outer-item');
    });

    it("should evaluate 'item in items' expression", () => {
      // In JavaScript, "item in items" uses the 'in' operator
      // which checks if property exists in object
      // Since 'item' evaluates to 'outer-item' (a string),
      // and arrays don't have that property, this should be false
      const result = Velin.evaluate(reactiveState, "item in items");
      console.log("'item in items' evaluates to:", result, typeof result);
      expect(typeof result).toBe('boolean');
    });

    it("should evaluate 'item, idx in items' with comma operator", () => {
      // Comma operator evaluates left to right and returns rightmost value
      // So this should be: (item), (idx in items)
      // Returns result of 'idx in items'
      const result = Velin.evaluate(reactiveState, "item, idx in items");
      console.log("'item, idx in items' evaluates to:", result, typeof result);
      // idx is 'outer-idx' (a string), not a valid array index
      expect(typeof result).toBe('boolean');
    });

    it("should evaluate '0 in items' to true", () => {
      const result = Velin.evaluate(reactiveState, "0 in items");
      expect(result).toBe(true); // Arrays have numeric indices
    });

    it("should evaluate 'undefined in items' to false", () => {
      const result = Velin.evaluate(reactiveState, "undefined in items");
      expect(result).toBe(false);
    });
  });

  describe("Loop Plugin Behavior", () => {
    it("renders with 'item in items' syntax", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop="item in items" vln-text="item"></span>';

      Velin.bind(div, { items: ['a', 'b', 'c'] });

      const spans = div.querySelectorAll('span');
      console.log("Loop rendered spans:", spans.length);
      console.log("Span contents:", Array.from(spans).map(s => s.textContent));

      // If this works, the loop plugin must be treating 'item in items' specially
      expect(spans.length).toBeGreaterThan(0);
    });

    it("renders with 'item, idx in items' syntax", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop="item, idx in items" vln-text="idx"></span>';

      Velin.bind(div, { items: ['a', 'b', 'c'] });

      const spans = div.querySelectorAll('span');
      console.log("Loop with index rendered spans:", spans.length);
      console.log("Index values:", Array.from(spans).map(s => s.textContent));
    });

    it("renders with colon syntax 'vln-loop:item'", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop:item="items" vln-text="item"></span>';

      Velin.bind(div, { items: ['a', 'b', 'c'] });

      const spans = div.querySelectorAll('span');
      console.log("Colon syntax rendered spans:", spans.length);
      console.log("Colon syntax contents:", Array.from(spans).map(s => s.textContent));
    });
  });
});
