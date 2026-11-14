import { describe, it, expect } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

setupVelinStd(Velin);

// Dependencies are captured once per binding (ADR 0003) — except when the
// write that re-runs a binding is structural: an object or array replaced,
// or an array mutated in place. Then the binding re-captures, so items and
// fields that did not exist at first render become dependencies too.

function mount(html: string, state: any) {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  const s = Velin.bind(div, state);
  const rs = Velin.ø__internal.getWrapper(s)!;
  const text = (sel = "i") => div.querySelector(sel)!.textContent;
  const bound = (path: string) => (rs.bindings.get(path)?.size ?? 0) > 0;
  return { div, s, rs, text, bound };
}

describe("re-capture on structural change — growing collections", () => {
  it("a getter over an array hears about items pushed after first render", () => {
    const { s, text } = mount('<i vln-text="doneCount"></i>', {
      tasks: [{ done: false }, { done: true }],
      get doneCount() {
        return this.tasks.filter((t: any) => t.done).length;
      },
    });
    expect(text()).toBe("1");
    s.tasks.push({ done: false });
    expect(text()).toBe("1");
    s.tasks[2].done = true;
    expect(text()).toBe("2");
  });

  it("a primitive array read through a method hears about slots added later", () => {
    const { s, text } = mount('<i vln-text="names.join(\',\')"></i>', { names: ["a", "b"] });
    s.names.push("c");
    expect(text()).toBe("a,b,c");
    s.names[2] = "z";
    expect(text()).toBe("a,b,z");
  });

  it("bindings on removed items are dropped", () => {
    const { s, bound } = mount('<i vln-text="doneCount"></i>', {
      tasks: [{ done: false }, { done: true }],
      get doneCount() {
        return this.tasks.filter((t: any) => t.done).length;
      },
    });
    expect(bound("root.tasks[1].done")).toBe(true);
    s.tasks.pop();
    expect(bound("root.tasks[1].done")).toBe(false);
    expect(bound("root.tasks[0].done")).toBe(true);
  });

  it("works inside a batch", () => {
    const { s, text } = mount('<i vln-text="doneCount"></i>', {
      tasks: [{ done: false }],
      get doneCount() {
        return this.tasks.filter((t: any) => t.done).length;
      },
    });
    Velin.getController(s).batch(() => {
      s.tasks.push({ done: true });
      s.tasks.push({ done: true });
    });
    expect(text()).toBe("2");
    s.tasks[2].done = false;
    expect(text()).toBe("1");
  });
});

describe("re-capture on structural change — replaced objects", () => {
  it("a method reading every field of an object sees fields added by a replacement", () => {
    const { s, text } = mount('<i vln-text="describe()"></i>', {
      user: { name: "a" },
      describe() {
        return Object.keys(this.user).map((k) => k + "=" + this.user[k]).join(";");
      },
    });
    expect(text()).toBe("name=a");
    s.user = { name: "b", age: 3 };
    expect(text()).toBe("name=b;age=3");
    s.user.age = 4;
    expect(text()).toBe("name=b;age=4");
  });

  it("replacing an object with null and back re-subscribes to its fields", () => {
    const { s, text } = mount('<i vln-text="user ? user.name : \'-\'"></i>', { user: { name: "a" } });
    s.user = null;
    expect(text()).toBe("-");
    s.user = { name: "c" };
    expect(text()).toBe("c");
    s.user.name = "d";
    expect(text()).toBe("d");
  });
});

describe("re-capture on structural change — primitive writes stay one-shot (ADR 0003)", () => {
  it("a primitive write does not re-capture", () => {
    const { s, text, bound } = mount('<i vln-text="flag ? a : b"></i>', { flag: true, a: "A", b: "B" });
    expect(bound("root.a")).toBe(true);
    expect(bound("root.b")).toBe(false);
    s.flag = false;
    expect(text()).toBe("B");
    // Still one-shot: the branch read on this run is not subscribed.
    expect(bound("root.b")).toBe(false);
  });

  it("a structural write re-captures the branch read on that run", () => {
    const { s, text, bound } = mount('<i vln-text="user ? user.name : fallback"></i>', {
      user: { name: "a" },
      fallback: "F",
    });
    expect(bound("root.fallback")).toBe(false);
    s.user = null;
    expect(text()).toBe("F");
    expect(bound("root.fallback")).toBe(true);
    s.fallback = "G";
    expect(text()).toBe("G");
  });
});
