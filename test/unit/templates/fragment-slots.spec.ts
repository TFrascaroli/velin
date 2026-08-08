import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

describe("Fragment slots (vln-inlet / vln-outlet)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("fills a default outlet from a bare <template vln-inlet>", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card"><div class="body"><div vln-outlet></div></div></div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet><p class="msg">Hello slot</p></template>
      </div>
    `;

    Velin.bind(container, {});

    const body = container.querySelector(".body");
    expect(body).toBeTruthy();
    expect(body?.querySelector(".msg")?.textContent).toBe("Hello slot");
    // Wrapper vanishes.
    expect(container.querySelector("[vln-inlet]")).toBeFalsy();
  });

  it("resolves directives in default-slot content against caller scope", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['title']">
        <div class="card">
          <h2 vln-text="title"></h2>
          <div vln-outlet></div>
        </div>
      </template>
      <div vln-fragment="'card'" vln-vars="{ title: 'Users' }">
        <template vln-inlet>
          <span class="who" vln-text="callerName"></span>
        </template>
      </div>
    `;

    Velin.bind(container, { callerName: "Alice" });

    expect(container.querySelector("h2")?.textContent).toBe("Users");
    expect(container.querySelector(".who")?.textContent).toBe("Alice");
  });

  it("supports vln-loop inside a default-slot inlet, bound to caller scope", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <ul class="card"><div vln-outlet></div></ul>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet>
          <li vln-loop:item="items" vln-text="item"></li>
        </template>
      </div>
    `;

    Velin.bind(container, { items: ["a", "b", "c"] });

    const lis = container.querySelectorAll("li");
    expect(Array.from(lis).map(l => l.textContent)).toEqual(["a", "b", "c"]);
  });

  it("fills a named outlet via matching vln-inlet (wrapper is discarded)", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card">
          <footer><div vln-outlet="'actions'"></div></footer>
        </div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet="'actions'">
          <button class="save">Save</button>
        </template>
      </div>
    `;

    Velin.bind(container, {});

    const footer = container.querySelector("footer");
    expect(footer?.querySelector(".save")?.textContent).toBe("Save");
    expect(footer?.querySelector("[vln-inlet]")).toBeFalsy();
  });

  it("mixes default + named outlets in one template", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['title']">
        <div class="card">
          <header vln-text="title"></header>
          <div class="body"><div vln-outlet></div></div>
          <footer><div vln-outlet="'actions'"></div></footer>
        </div>
      </template>
      <div vln-fragment="'card'" vln-vars="{ title: 'Users' }">
        <template vln-inlet><table class="rows"></table></template>
        <template vln-inlet="'actions'"><button class="save">Save</button></template>
      </div>
    `;

    Velin.bind(container, {});

    expect(container.querySelector("header")?.textContent).toBe("Users");
    expect(container.querySelector(".body .rows")).toBeTruthy();
    expect(container.querySelector("footer .save")).toBeTruthy();
  });

  it("direct child of a fragment that isn't a <template vln-inlet> errors and drops", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card">static</div>
      </template>
      <div vln-fragment="'card'">
        <p class="dropped">gone</p>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(container.querySelector(".card")?.textContent).toBe("static");
    expect(container.querySelector(".dropped")).toBeFalsy();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("<template vln-inlet"));
    errSpy.mockRestore();
  });

  it("<div vln-inlet> is rejected (must be <template>)", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card"><div vln-outlet></div></div>
      </template>
      <div vln-fragment="'card'">
        <div vln-inlet><p class="msg">nope</p></div>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(container.querySelector(".msg")).toBeFalsy();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("<template vln-inlet"));
    errSpy.mockRestore();
  });

  it("outlet with no matching inlet renders empty (no warning)", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card">
          <div class="body"><div vln-outlet></div></div>
        </div>
      </template>
      <div vln-fragment="'card'"></div>
    `;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Velin.bind(container, {});

    const body = container.querySelector(".body");
    expect(body).toBeTruthy();
    expect(body?.children.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("multiple named inlets with the same name → error, first wins", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div><div vln-outlet="'x'"></div></div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet="'x'"><span class="a">A</span></template>
        <template vln-inlet="'x'"><span class="b">B</span></template>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining(`vln-inlet="'x'" is already filled`));
    expect(container.querySelector(".a")).toBeTruthy();
    expect(container.querySelector(".b")).toBeFalsy();
    errSpy.mockRestore();
  });

  it("two bare vln-inlets (both default) → error, first wins", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div><div vln-outlet></div></div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet><span class="a">A</span></template>
        <template vln-inlet><span class="b">B</span></template>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("default slot"));
    expect(container.querySelector(".a")).toBeTruthy();
    expect(container.querySelector(".b")).toBeFalsy();
    errSpy.mockRestore();
  });

  it("inlet content updates reactively via caller-scope state", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card"><div vln-outlet></div></div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet><span class="msg" vln-text="msg"></span></template>
      </div>
    `;

    const state = Velin.bind(container, { msg: "hi" });
    expect(container.querySelector(".msg")?.textContent).toBe("hi");

    state.msg = "bye";
    expect(container.querySelector(".msg")?.textContent).toBe("bye");
  });

  it("inlet content does NOT see fragment (template) scope vars", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['title']">
        <div class="card">
          <h2 vln-text="title"></h2>
          <div vln-outlet></div>
        </div>
      </template>
      <div vln-fragment="'card'" vln-vars="{ title: 'A' }">
        <template vln-inlet><p class="peek" vln-text="title"></p></template>
      </div>
    `;

    Velin.bind(container, {});

    expect(container.querySelector("h2")?.textContent).toBe("A");
    expect(container.querySelector(".peek")?.textContent).toBe("");
  });

  it("event handlers in inlet content invoke caller-scope methods", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card"><div vln-outlet></div></div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet><button class="btn" vln-on:click="handle()">Go</button></template>
      </div>
    `;

    const handle = vi.fn();
    Velin.bind(container, { handle });

    (container.querySelector(".btn") as HTMLButtonElement).click();
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("named inlet coexists with default inlet", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card">
          <div class="body"><div vln-outlet></div></div>
          <footer><div vln-outlet="'actions'"></div></footer>
        </div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet><p class="def">default here</p></template>
        <template vln-inlet="'actions'"><button class="act">Do</button></template>
      </div>
    `;

    Velin.bind(container, {});

    expect(container.querySelector(".body .def")?.textContent).toBe("default here");
    expect(container.querySelector("footer .act")?.textContent).toBe("Do");
  });

  it("vln-outlet outside a fragment scope warns and renders empty", () => {
    container.innerHTML = `
      <div vln-outlet="'actions'"></div>
    `;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("only works inside a template")
    );
    warnSpy.mockRestore();
  });

  it("vln-inlet outside a fragment host warns", () => {
    container.innerHTML = `
      <template vln-inlet="'actions'"><button>x</button></template>
    `;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("must be on a <template>")
    );
    warnSpy.mockRestore();
  });

  it("vln-inlet wrapper carrying another vln-* directive is a hard error", () => {
    container.innerHTML = `
      <template vln-template="'card'">
        <div class="card"><div vln-outlet></div></div>
      </template>
      <div vln-fragment="'card'">
        <template vln-inlet vln-loop:x="items"><span vln-text="x"></span></template>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, { items: ["a", "b"] });

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Move them inside"));
    expect(container.querySelector("span")).toBeFalsy();
    errSpy.mockRestore();
  });

  it("template swap preserves slot content and re-mounts into the new template", () => {
    container.innerHTML = `
      <template vln-template="'a'"><div class="a-frame"><div vln-outlet></div></div></template>
      <template vln-template="'b'"><section class="b-frame"><div vln-outlet></div></section></template>
      <div vln-fragment="which">
        <template vln-inlet><p class="msg" vln-text="msg"></p></template>
      </div>
    `;

    const state = Velin.bind(container, { which: "a", msg: "hi" });
    expect(container.querySelector(".a-frame .msg")?.textContent).toBe("hi");
    expect(container.querySelector(".b-frame")).toBeFalsy();

    state.which = "b";
    expect(container.querySelector(".a-frame")).toBeFalsy();
    expect(container.querySelector(".b-frame .msg")?.textContent).toBe("hi");

    state.msg = "bye";
    expect(container.querySelector(".b-frame .msg")?.textContent).toBe("bye");
  });

  it("vln-fragment on a void element errors and does not mount", () => {
    container.innerHTML = `
      <template vln-template="'card'"><div class="card">x</div></template>
      <img vln-fragment="'card'">
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("void elements cannot hold children"));
    expect(container.querySelector(".card")).toBeFalsy();
    errSpy.mockRestore();
  });

  it("vln-inlet name that evaluates to a non-string errors and drops", () => {
    container.innerHTML = `
      <template vln-template="'card'"><div class="card"><div vln-outlet="'x'"></div></div></template>
      <div vln-fragment="'card'">
        <template vln-inlet="123"><span class="msg">nope</span></template>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("name must be a string"));
    expect(container.querySelector(".msg")).toBeFalsy();
    errSpy.mockRestore();
  });

  it("vln-outlet name that evaluates to a non-string errors and drops", () => {
    container.innerHTML = `
      <template vln-template="'card'"><div class="card"><div vln-outlet="42"></div></div></template>
      <div vln-fragment="'card'">
        <template vln-inlet><span class="msg">hi</span></template>
      </div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("name must be a string"));
    expect(container.querySelector(".msg")).toBeFalsy();
    errSpy.mockRestore();
  });

  it("vln-template id that evaluates to a non-string errors and does not register", () => {
    container.innerHTML = `
      <template vln-template="42"><div class="card">x</div></template>
      <div vln-fragment="'42'"></div>
    `;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("vln-template id must be a string"));
    // Consumer sees "not registered" — proves the id wasn't coerced.
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("is not registered"));
    errSpy.mockRestore();
  });

  it("original <template vln-inlet>.content is left intact after mounting (clone, don't move)", () => {
    // Extract the template ref before bind so we can inspect its .content after.
    container.innerHTML = `
      <template vln-template="'card'"><div><div vln-outlet></div></div></template>
      <div vln-fragment="'card'">
        <template vln-inlet id="inlet-src"><span class="msg">hi</span></template>
      </div>
    `;
    const inletSrc = container.querySelector("#inlet-src") as HTMLTemplateElement;
    expect(inletSrc.content.querySelector(".msg")).toBeTruthy();

    Velin.bind(container, {});

    // Fragment cleared the host, so the source template is gone from DOM —
    // but the reference we grabbed is still alive and its .content must be
    // untouched (we clone, we don't move).
    expect(inletSrc.content.querySelector(".msg")).toBeTruthy();
    expect(container.querySelector(".msg")?.textContent).toBe("hi");
  });
});
