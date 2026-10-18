import { describe, it, expect } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

setupVelinStd(Velin);

function mount(html: string, state: any) {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  const bound = Velin.bind(div, state);
  return { div, bound };
}

describe("getController + batch", () => {
  it("coalesces effects for the state returned by Velin.bind()", () => {
    let renders = 0;
    const { bound } = mount('<i vln-text="count(n)"></i>', { n: 0, count(v: number) { renders++; return v; } });
    renders = 0;
    Velin.getController(bound).batch(() => { bound.n = 1; bound.n = 2; bound.n = 3; });
    expect(renders).toBe(1);
  });

  it("accepts `this` inside a method called from vln-on", () => {
    let renders = 0;
    const { div, bound } = mount(
      '<button vln-on:click="load()">x</button><i vln-text="count(items.length)"></i>',
      {
        items: [] as number[],
        count(v: number) { renders++; return v; },
        load() { Velin.getController(this).batch(() => { for (let i = 0; i < 5; i++) this.items.push(i); }); },
      },
    );
    renders = 0;
    div.querySelector("button")!.dispatchEvent(new Event("click"));
    expect(bound.items.length).toBe(5);
    expect(renders).toBe(1);
  });

  it("batches the whole tree when called from inside a vln-loop row", () => {
    let renders = 0;
    const { div, bound } = mount(
      '<b vln-loop:row="rows"><button vln-on:click="resetAll()">r</button></b><i vln-text="count(total())"></i>',
      {
        rows: [{ v: 1 }, { v: 2 }, { v: 3 }],
        count(v: number) { renders++; return v; },
        total() { return this.rows.reduce((a: number, r: any) => a + r.v, 0); },
        resetAll() { Velin.getController(this).batch(() => { for (const r of this.rows) r.v = 0; }); },
      },
    );
    renders = 0;
    div.querySelector("button")!.dispatchEvent(new Event("click"));
    expect(bound.rows.map((r: any) => r.v)).toEqual([0, 0, 0]);
    expect(renders).toBe(1);
  });

  it("rejects things that are not Velin states", () => {
    expect(() => Velin.getController({})).toThrow(/not a Velin state/);
    expect(() => Velin.getController(null)).toThrow(/not a Velin state/);
  });

  it("rejects a handler scope used after the handler finished", () => {
    let captured: any;
    const { div } = mount('<button vln-on:click="grab()">g</button>', { grab() { captured = this; } });
    div.querySelector("button")!.dispatchEvent(new Event("click"));
    expect(() => Velin.getController(captured)).toThrow(/torn down/);
  });
});
