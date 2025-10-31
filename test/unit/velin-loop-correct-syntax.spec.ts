import Velin from "../../src/velin-core";
import setupVelinStd from "../../src/velin-std.js";
import { describe, it, expect } from "vitest";

setupVelinStd(Velin);

describe("Loop Correct Syntax (vln-loop:varName)", () => {
  describe("Basic loop rendering", () => {
    it("renders items with colon syntax", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop:item="items" vln-text="item"></span>';

      Velin.bind(div, { items: ['a', 'b', 'c'] });

      const spans = div.querySelectorAll('span');
      expect(spans.length).toBe(3);
      expect(spans[0].textContent).toBe('a');
      expect(spans[1].textContent).toBe('b');
      expect(spans[2].textContent).toBe('c');
    });

    it("provides $index for each iteration", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop:item="items" vln-text="$index"></span>';

      Velin.bind(div, { items: ['a', 'b', 'c'] });

      const spans = div.querySelectorAll('span');
      expect(spans.length).toBe(3);
      expect(spans[0].textContent).toBe('0');
      expect(spans[1].textContent).toBe('1');
      expect(spans[2].textContent).toBe('2');
    });

    it("provides both item and $index", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop:item="items" vln-text="$index + \': \' + item"></span>';

      Velin.bind(div, { items: ['apple', 'banana', 'cherry'] });

      const spans = div.querySelectorAll('span');
      expect(spans[0].textContent).toBe('0: apple');
      expect(spans[1].textContent).toBe('1: banana');
      expect(spans[2].textContent).toBe('2: cherry');
    });
  });

  describe("Index-based operations", () => {
    it("can use $index in class bindings", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop:item="items" vln-class="$index === 1 ? \'highlighted\' : \'normal\'"></span>';

      Velin.bind(div, { items: ['a', 'b', 'c'] });

      const spans = div.querySelectorAll('span');
      expect(spans[0].className).toBe('normal');
      expect(spans[1].className).toBe('highlighted');
      expect(spans[2].className).toBe('normal');
    });

    it("can use $index in event handlers", () => {
      const div = document.createElement('div');
      div.innerHTML = '<button vln-loop:item="items" vln-on:click="selectIndex($index)" vln-text="item"></button>';

      let selectedIdx = -1;
      Velin.bind(div, {
        items: ['a', 'b', 'c'],
        selectIndex: (idx: number) => { selectedIdx = idx; }
      });

      const buttons = div.querySelectorAll('button');
      (buttons[1] as HTMLButtonElement).click();
      expect(selectedIdx).toBe(1);
    });

    it("updates $index when array is reordered", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop:item="items" vln-text="$index"></span>';

      const state = Velin.bind(div, { items: ['a', 'b', 'c'] });

      // Reverse the array
      state.items = ['c', 'b', 'a'];

      const spans = div.querySelectorAll('span');
      // Indices should still be 0, 1, 2
      expect(spans[0].textContent).toBe('0');
      expect(spans[1].textContent).toBe('1');
      expect(spans[2].textContent).toBe('2');
    });
  });

  describe("Nested loops", () => {
    it("provides separate $index for each loop level", () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div vln-loop:group="groups" vln-attr:data-outer="$index">
          <span vln-loop:item="group.items" vln-attr:data-inner="$index" vln-text="item"></span>
        </div>
      `;

      Velin.bind(div, {
        groups: [
          { items: ['a1', 'a2'] },
          { items: ['b1', 'b2', 'b3'] }
        ]
      });

      const outerDivs = div.querySelectorAll('[data-outer]');
      expect(outerDivs[0].getAttribute('data-outer')).toBe('0');
      expect(outerDivs[1].getAttribute('data-outer')).toBe('1');

      const firstGroupSpans = outerDivs[0].querySelectorAll('span');
      expect(firstGroupSpans[0].getAttribute('data-inner')).toBe('0');
      expect(firstGroupSpans[1].getAttribute('data-inner')).toBe('1');

      const secondGroupSpans = outerDivs[1].querySelectorAll('span');
      expect(secondGroupSpans[0].getAttribute('data-inner')).toBe('0');
      expect(secondGroupSpans[1].getAttribute('data-inner')).toBe('1');
      expect(secondGroupSpans[2].getAttribute('data-inner')).toBe('2');
    });
  });

  describe("Documentation: INCORRECT syntaxes that DON'T work", () => {
    it("'item in items' syntax BREAKS - evaluates wrong variable and iterates over it", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop="item in items" vln-text="item"></span>';

      Velin.bind(div, {
        items: ['a', 'b', 'c'],
        item: 'outer-value' // This is what gets tracked!
      });

      const spans = div.querySelectorAll('span');
      // Loop tracks 'item' (a string), iterates over its characters!
      // "outer-value" has 11 characters, so 11 iterations
      expect(spans.length).toBe(11);
      // All spans show "outer-value" because that's what 'item' evaluates to
      expect(spans[0].textContent).toBe('outer-value');
    });

    it("'item, idx in items' syntax BREAKS - comma operator returns wrong value", () => {
      const div = document.createElement('div');
      div.innerHTML = '<span vln-loop="item, idx in items" vln-text="idx"></span>';

      Velin.bind(div, {
        items: ['a', 'b', 'c'],
        item: 'outer-value',
        idx: 'wrong!'
      });

      const spans = div.querySelectorAll('span');
      // Expression "item, idx in items" uses comma operator
      // Evaluates to "item" (not the array!), loops over string characters
      expect(spans.length).toBe(11);
      expect(spans[0].textContent).toBe('wrong!'); // Shows 'idx' from outer scope
    });
  });
});
