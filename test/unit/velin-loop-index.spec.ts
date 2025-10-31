import Velin from "../../src/velin-core";
import setupVelinStd from "../../src/velin-std.js";
import { describe, it, expect } from "vitest";

setupVelinStd(Velin);

describe("Loop Index Access", () => {
  it("colon syntax with $index", () => {
    const div = document.createElement('div');
    div.innerHTML = '<span vln-loop:item="items" vln-text="$index"></span>';

    Velin.bind(div, { items: ['a', 'b', 'c'] });

    const spans = div.querySelectorAll('span');
    console.log("$index contents:", Array.from(spans).map(s => s.textContent));
    expect(spans.length).toBe(3);
  });

  it("colon syntax with manual index tracking", () => {
    const div = document.createElement('div');
    div.innerHTML = '<span vln-loop:item="items.map((it, i) => ({item: it, index: i}))" vln-text="item.index"></span>';

    Velin.bind(div, { items: ['a', 'b', 'c'] });

    const spans = div.querySelectorAll('span');
    console.log("Manual index contents:", Array.from(spans).map(s => s.textContent));
  });
});
