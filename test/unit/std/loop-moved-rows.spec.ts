import { describe, it, expect } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

setupVelinStd(Velin);

// Unkeyed loops track rows by position. When an item moves to another slot,
// the row now showing it must follow later edits to that item — not just
// render it once on the move.

function mount(html: string, state: any) {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return { div, s: Velin.bind(div, state) };
}
const texts = (div: Element, sel = "i") => [...div.querySelectorAll(sel)].map((n) => n.textContent);
const ROW = '<b vln-loop:x="items"><i vln-text="x.n"></i></b>';
const objs = (...ns: number[]) => ns.map((n) => ({ n }));

describe("vln-loop (positional) — moved items keep updating their new row", () => {
  it("unshift, then edit the item that moved to slot 1", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2) });
    s.items.unshift({ n: 0 });
    expect(texts(div)).toEqual(["0", "1", "2"]);
    s.items[1].n = 100;
    expect(texts(div)).toEqual(["0", "100", "2"]);
    s.items[0].n = 7;
    expect(texts(div)).toEqual(["7", "100", "2"]);
  });

  it("sort, then edit the item now first", () => {
    const { div, s } = mount(ROW, { items: objs(3, 1, 2) });
    s.items.sort((a: any, b: any) => a.n - b.n);
    expect(texts(div)).toEqual(["1", "2", "3"]);
    s.items[0].n = 50;
    expect(texts(div)).toEqual(["50", "2", "3"]);
  });

  it("delete the first row, then edit the item that took its slot (CRUD shape)", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2, 3) });
    s.items.splice(0, 1);
    expect(texts(div)).toEqual(["2", "3"]);
    s.items[0].n = 9;
    expect(texts(div)).toEqual(["9", "3"]);
    s.items[1].n = 8;
    expect(texts(div)).toEqual(["9", "8"]);
  });

  it("two moves in a row", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2) });
    s.items.unshift({ n: 0 });
    s.items.unshift({ n: -1 });
    expect(texts(div)).toEqual(["-1", "0", "1", "2"]);
    s.items[2].n = 10;
    s.items[3].n = 20;
    expect(texts(div)).toEqual(["-1", "0", "10", "20"]);
  });

  it("replace a slot's object, then edit the new object", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2, 3) });
    s.items[1] = { n: 7 };
    expect(texts(div)).toEqual(["1", "7", "3"]);
    s.items[1].n = 8;
    expect(texts(div)).toEqual(["1", "8", "3"]);
  });

  it("replace the whole array, then edit an item", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2) });
    s.items = objs(5, 6, 7);
    expect(texts(div)).toEqual(["5", "6", "7"]);
    s.items[2].n = 70;
    expect(texts(div)).toEqual(["5", "6", "70"]);
  });

  it("nested fields of a moved item", () => {
    const { div, s } = mount('<b vln-loop:x="items"><i vln-text="x.p.n"></i></b>', {
      items: [{ p: { n: 1 } }, { p: { n: 2 } }],
    });
    s.items.reverse();
    expect(texts(div)).toEqual(["2", "1"]);
    s.items[0].p.n = 20;
    expect(texts(div)).toEqual(["20", "1"]);
  });
});
