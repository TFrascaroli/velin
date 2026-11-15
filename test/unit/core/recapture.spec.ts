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

describe("re-capture on structural change — keys added or removed in place", () => {
  const enumerating = () => ({
    user: { name: "a" },
    describe() {
      return Object.keys(this.user).map((k) => k + "=" + this.user[k]).join(";");
    },
  });

  it("adding a key to an object wakes readers of that object and tracks the key", () => {
    const { s, text } = mount('<i vln-text="describe()"></i>', enumerating());
    s.user.age = 3;
    expect(text()).toBe("name=a;age=3");
    s.user.age = 4;
    expect(text()).toBe("name=a;age=4");
  });

  it("deleting a key wakes readers of that object", () => {
    const { s, text } = mount('<i vln-text="describe()"></i>', enumerating());
    delete s.user.name;
    expect(text()).toBe("");
    s.user.name = "z";
    expect(text()).toBe("name=z");
  });

  it("a reader that never touched the object is not woken", () => {
    let runs = 0;
    const { s } = mount('<i vln-text="tick()"></i>', {
      user: { name: "a" },
      other: 1,
      tick() {
        runs++;
        return this.other;
      },
    });
    runs = 0;
    s.user.age = 3;
    delete s.user.name;
    expect(runs).toBe(0);
  });

  it("writing past the end of an array wakes readers of the array and tracks the slot", () => {
    const { s, text } = mount('<i vln-text="names.join(\',\')"></i>', { names: ["a", "b"] });
    s.names[3] = "d";
    expect(text()).toBe("a,b,,d");
    s.names[3] = "e";
    expect(text()).toBe("a,b,,e");
  });

  it("a dictionary filled key by key updates a count of its keys", () => {
    const { s, text } = mount('<i vln-text="size()"></i>', {
      cache: {},
      size() {
        return Object.keys(this.cache).length;
      },
    });
    expect(text()).toBe("0");
    s.cache.a = 1;
    s.cache.b = 2;
    expect(text()).toBe("2");
    delete s.cache.a;
    expect(text()).toBe("1");
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
