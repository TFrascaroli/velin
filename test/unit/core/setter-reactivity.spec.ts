import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Initialize standard plugins for the test
setupVelinStd(Velin);

describe("Velin Setter Reactivity", () => {
  let node: HTMLElement;

  beforeEach(() => {
    node = document.createElement("div");
  });

  it("should bind 'this' in setter to reactive proxy", () => {
    let capturedThis: any;
    const state = Velin.bind(node, {
      _val: 0,
      set val(v: number) {
        capturedThis = this;
        this._val = v;
      }
    });

    state.val = 10;
    expect(state._val).toBe(10);
    // Check if capturedThis is the proxy (it should have ø__velinObj)
    expect(capturedThis.ø__velinObj).toBe(true);
    expect(capturedThis).toBe(state);
  });

  it("should trigger reactive updates for properties changed inside a setter", () => {
    node.innerHTML = '<span vln-text="red"></span>';
    
    const state = Velin.bind(node, {
      red: 0,
      set color(v: { r: number }) {
        this.red = v.r;
      }
    });

    const span = node.querySelector('span')!;
    expect(span.textContent).toBe("0");

    // This should trigger the setter, which updates 'red', which should trigger the vln-text update
    state.color = { r: 255 };
    
    expect(state.red).toBe(255);
    expect(span.textContent).toBe("255");
  });

  it("should not cause infinite recursion on data properties", () => {
    const state = Velin.bind(node, {
      data: 0
    });

    // If there's recursion, this will throw a RangeError (Stack overflow)
    expect(() => {
      state.data = 10;
    }).not.toThrow();
    
    expect(state.data).toBe(10);
  });

  it("should work with complex state-to-state synchronization (Live Editor use case)", () => {
    node.innerHTML = `
      <div id="display" vln-text="count"></div>
      <div id="status" vln-text="active"></div>
    `;

    const state = Velin.bind(node, {
      count: 0,
      active: false,
      get sync() {
        return JSON.stringify({ count: this.count, active: this.active });
      },
      set sync(json: string) {
        const data = JSON.parse(json);
        if (data.count !== undefined) this.count = data.count;
        if (data.active !== undefined) this.active = data.active;
      }
    });

    const display = node.querySelector('#display')!;
    const status = node.querySelector('#status')!;

    expect(display.textContent).toBe("0");
    expect(status.textContent).toBe("false");

    // Update state via the sync setter
    state.sync = JSON.stringify({ count: 42, active: true });

    expect(state.count).toBe(42);
    expect(state.active).toBe(true);
    expect(display.textContent).toBe("42");
    expect(status.textContent).toBe("true");
  });

  it("should support setters on objects within arrays", () => {
    node.innerHTML = '<div vln-loop:item="items"><span vln-text="item.val"></span></div>';
    
    const state = Velin.bind(node, {
      items: [
        {
          _v: 1,
          get val() { return this._v; },
          set val(newV) { this._v = newV; }
        }
      ]
    });

    const span = node.querySelector('span')!;
    expect(span.textContent).toBe("1");

    state.items[0].val = 99;
    
    expect(state.items[0]._v).toBe(99);
    expect(span.textContent).toBe("99");
  });
});
