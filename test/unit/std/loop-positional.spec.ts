import { describe, it, expect, vi } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

setupVelinStd(Velin);

function mount(html: string, state: any) {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  return { div, s: Velin.bind(div, state) };
}
const texts = (div: Element, sel = "i") => [...div.querySelectorAll(sel)].map((n) => n.textContent);

const ROW = '<b vln-loop:x="items"><i vln-text="$index + \':\' + x.n"></i></b>';
const objs = (...ns: number[]) => ns.map((n) => ({ n }));

describe("vln-loop (positional) — DOM stays correct for every mutation shape", () => {
  it("push / pop", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2) });
    s.items.push({ n: 3 });
    expect(texts(div)).toEqual(["0:1", "1:2", "2:3"]);
    s.items.pop();
    expect(texts(div)).toEqual(["0:1", "1:2"]);
  });

  it("unshift / shift move every item to a new slot", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2) });
    s.items.unshift({ n: 0 });
    expect(texts(div)).toEqual(["0:0", "1:1", "2:2"]);
    s.items.shift();
    expect(texts(div)).toEqual(["0:1", "1:2"]);
  });

  it("splice in the middle", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2, 3, 4) });
    s.items.splice(1, 2, { n: 9 });
    expect(texts(div)).toEqual(["0:1", "1:9", "2:4"]);
  });

  it("sort and reverse", () => {
    const { div, s } = mount(ROW, { items: objs(3, 1, 2) });
    s.items.sort((a: any, b: any) => a.n - b.n);
    expect(texts(div)).toEqual(["0:1", "1:2", "2:3"]);
    s.items.reverse();
    expect(texts(div)).toEqual(["0:3", "1:2", "2:1"]);
  });

  it("replacing one slot with a different object", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2, 3) });
    s.items[1] = { n: 7 };
    expect(texts(div)).toEqual(["0:1", "1:7", "2:3"]);
  });

  it("primitive arrays: slot write, reverse with duplicates", () => {
    const { div, s } = mount('<b vln-loop:x="items"><i vln-text="x"></i></b>', { items: ["a", "a", "b"] });
    s.items[0] = "z";
    expect(texts(div)).toEqual(["z", "a", "b"]);
    s.items.reverse();
    expect(texts(div)).toEqual(["b", "a", "z"]);
  });

  it("replacing the whole array (new objects, and the same objects filtered)", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2, 3) });
    s.items = objs(5, 6);
    expect(texts(div)).toEqual(["0:5", "1:6"]);
    s.items = s.items.filter((x: any) => x.n === 6);
    expect(texts(div)).toEqual(["0:6"]);
  });

  it("field writes on a reused row still update it", () => {
    const { div, s } = mount(ROW, { items: objs(1, 2) });
    s.items.push({ n: 3 });
    s.items[0].n = 100;
    expect(texts(div)).toEqual(["0:100", "1:2", "2:3"]);
  });

  it("loop over a filtering getter follows filter changes", () => {
    const { div, s } = mount('<b vln-loop:x="visible"><i vln-text="x.n"></i></b>', {
      items: objs(1, 2, 3, 4),
      odd: false,
      get visible() { return this.items.filter((x: any) => !this.odd || x.n % 2); },
    });
    s.odd = true;
    expect(texts(div)).toEqual(["1", "3"]);
    s.odd = false;
    expect(texts(div)).toEqual(["1", "2", "3", "4"]);
    s.items.push({ n: 5 });
    expect(texts(div)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("vln-loop (positional) — appends don't re-render existing rows", () => {
  const COUNTED = '<b vln-loop:x="items"><i vln-text="see(x.n)"></i></b>';
  function counted(n: number) {
    const c = { runs: 0 };
    const m = mount(COUNTED, { items: objs(...Array.from({ length: n }, (_, i) => i)), see(v: number) { c.runs++; return v; } });
    return { c, s: m.s };
  }
  // What binding one brand-new row costs, measured rather than assumed.
  const newRowCost = () => counted(1).c.runs;

  it("push only pays for the new row", () => {
    const { c, s } = counted(20);
    c.runs = 0;
    s.items.push({ n: 99 });
    expect(c.runs).toBe(newRowCost());
  });

  it("unshift re-evaluates each existing row once (every slot changed) plus the new row", () => {
    const { c, s } = counted(3);
    c.runs = 0;
    s.items.unshift({ n: -1 });
    expect(c.runs).toBe(3 + newRowCost());
  });
});

describe("vln-loop (positional) — VLN022 warns when items move between rows", () => {
  const warns = (fn: () => void) => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try { fn(); return spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("VLN022")); }
    finally { spy.mockRestore(); }
  };

  it("warns once on in-place reorder, naming the keyed form", () => {
    const got = warns(() => {
      const { s } = mount(ROW, { items: objs(3, 1, 2) });
      s.items.sort((a: any, b: any) => a.n - b.n);
      s.items.reverse();
    });
    expect(got.length).toBe(1);
    expect(got[0]).toContain("{ collection: items, key: 'id' }");
  });

  it("stays quiet for appends, removals at the end, keyed loops and primitives", () => {
    const got = warns(() => {
      const a = mount(ROW, { items: objs(1, 2) });
      a.s.items.push({ n: 3 });
      a.s.items.pop();
      const k = mount(`<b vln-loop:x="{ collection: items, key: 'n' }"><i vln-text="x.n"></i></b>`, { items: objs(3, 1, 2) });
      k.s.items.sort((p: any, q: any) => p.n - q.n);
      const p = mount('<b vln-loop:x="items"><i vln-text="x"></i></b>', { items: ["b", "a"] });
      p.s.items.sort();
    });
    expect(got).toEqual([]);
  });
});
