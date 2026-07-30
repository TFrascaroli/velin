import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

/**
 * Comprehensive reactivity + shadowing coverage for the vln-vars object API.
 *
 * The scenarios here exist to categorically answer: "when a provider passes a
 * value into a template, and the template reads it, does the transformer run
 * live? Does it survive same-name shadowing between consumer and provided keys?
 * Does it survive nested fragments? Does it survive loops?"
 */
describe("Fragments: reactivity & shadowing", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) document.body.removeChild(container);
  });

  it("transformer receives updated value on provider mutation", () => {
    container.innerHTML = `
      <template id="t" vln-vars="{ n: doubleIt }">
        <span class="v" vln-text="n"></span>
      </template>
      <div vln-fragment="'t'" vln-vars="{ n: raw }"></div>
    `;
    const state = Velin.bind(container, {
      raw: 5,
      doubleIt: (v: number) => v * 2,
    });

    expect(container.querySelector(".v")?.textContent).toBe("10");
    state.raw = 7;
    expect(container.querySelector(".v")?.textContent).toBe("14");
  });

  it("transformer runs each time value updates (spy verification)", () => {
    const doubleIt = vi.fn((v: number) => v * 2);
    container.innerHTML = `
      <template id="t" vln-vars="{ n: doubleIt }">
        <span class="v" vln-text="n"></span>
      </template>
      <div vln-fragment="'t'" vln-vars="{ n: raw }"></div>
    `;
    const state = Velin.bind(container, { raw: 1, doubleIt });
    const initialCalls = doubleIt.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);

    state.raw = 2;
    expect(doubleIt.mock.calls.length).toBeGreaterThan(initialCalls);
    expect(container.querySelector(".v")?.textContent).toBe("4");

    state.raw = 3;
    expect(container.querySelector(".v")?.textContent).toBe("6");
  });

  it("transformer default (nullish fallback) applied and refreshed", () => {
    container.innerHTML = `
      <template id="t" vln-vars="{ name: defaultAnon }">
        <span class="v" vln-text="name"></span>
      </template>
      <div vln-fragment="'t'" vln-vars="{ name: current }"></div>
    `;
    const state = Velin.bind(container, {
      current: null as string | null,
      defaultAnon: (v: string | null) => v == null ? "anon" : v,
    });

    expect(container.querySelector(".v")?.textContent).toBe("anon");
    state.current = "Alice";
    expect(container.querySelector(".v")?.textContent).toBe("Alice");
    state.current = null;
    expect(container.querySelector(".v")?.textContent).toBe("anon");
  });

  it("transformer validation throws on bad input", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    container.innerHTML = `
      <template id="t" vln-vars="{ age: requirePositive }">
        <span class="v" vln-text="age"></span>
      </template>
      <div vln-fragment="'t'" vln-vars="{ age: n }"></div>
    `;
    Velin.bind(container, {
      n: -3,
      requirePositive: (v: number) => {
        if (v < 0) throw new Error("age must be >= 0");
        return v;
      },
    });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // ── The one that historically broke: same-name shadowing ───────────────
  //
  // Consumer's provider expression references identifier `user` that lives in a
  // parent scope (e.g. a loop iteration variable). The template also declares
  // `user`. The child scope for the fragment adds `user` as an interpolation
  // whose expression is `(varsExpr)["user"]` — evaluating that in the child
  // scope looks up `user`, finds the child's own interp, and recurses.
  //
  // The test asserts the pattern renders WITHOUT recursion.
  it("provider key can share a name with a parent-scope identifier (loop var)", () => {
    container.innerHTML = `
      <template id="tCard" vln-vars="['user']">
        <div class="card" vln-text="user.name"></div>
      </template>
      <div vln-loop:user="users">
        <div vln-fragment="'tCard'" vln-vars="{ user: user }"></div>
      </div>
    `;
    Velin.bind(container, {
      users: [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }],
    });

    const cards = container.querySelectorAll(".card");
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toBe("Alice");
    expect(cards[1].textContent).toBe("Bob");
    expect(cards[2].textContent).toBe("Charlie");
  });

  it("same-name shadowing also works when loop + fragment are on the SAME element", () => {
    container.innerHTML = `
      <template id="tCard" vln-vars="['user']">
        <div class="card" vln-text="user.name"></div>
      </template>
      <div vln-loop:user="users"
           vln-fragment="'tCard'"
           vln-vars="{ user: user }"></div>
    `;
    Velin.bind(container, {
      users: [{ name: "Alice" }, { name: "Bob" }],
    });

    const cards = container.querySelectorAll(".card");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toBe("Alice");
    expect(cards[1].textContent).toBe("Bob");
  });

  it("same-name shadowing reactively updates when the loop mutates", () => {
    container.innerHTML = `
      <template id="tCard" vln-vars="['user']">
        <div class="card" vln-text="user.name"></div>
      </template>
      <div vln-loop:user="users">
        <div vln-fragment="'tCard'" vln-vars="{ user: user }"></div>
      </div>
    `;
    const state = Velin.bind(container, {
      users: [{ name: "Alice" }, { name: "Bob" }] as { name: string }[],
    });

    let cards = container.querySelectorAll(".card");
    expect(Array.from(cards).map(c => c.textContent)).toEqual(["Alice", "Bob"]);

    // Mutate a user's name — should flow through fragment
    state.users[0].name = "Alicia";
    cards = container.querySelectorAll(".card");
    expect(cards[0].textContent).toBe("Alicia");
  });

  it("nested fragments with overlapping var names each see their own layer", () => {
    container.innerHTML = `
      <template id="outer" vln-vars="['user']">
        <div class="outer">
          <span class="ov" vln-text="user.name"></span>
          <div vln-fragment="'inner'" vln-vars="{ user: user }"></div>
        </div>
      </template>
      <template id="inner" vln-vars="['user']">
        <span class="iv" vln-text="'inner:' + user.name"></span>
      </template>
      <div vln-fragment="'outer'" vln-vars="{ user: current }"></div>
    `;
    const state = Velin.bind(container, {
      current: { name: "Alice" },
    });
    expect(container.querySelector(".ov")?.textContent).toBe("Alice");
    expect(container.querySelector(".iv")?.textContent).toBe("inner:Alice");

    state.current = { name: "Bob" };
    expect(container.querySelector(".ov")?.textContent).toBe("Bob");
    expect(container.querySelector(".iv")?.textContent).toBe("inner:Bob");
  });

  it("multiple consumers of same template with distinct providers", () => {
    container.innerHTML = `
      <template id="t" vln-vars="['label']">
        <span class="v" vln-text="label"></span>
      </template>
      <div id="a" vln-fragment="'t'" vln-vars="{ label: a }"></div>
      <div id="b" vln-fragment="'t'" vln-vars="{ label: b }"></div>
    `;
    const state = Velin.bind(container, { a: "one", b: "two" });
    expect(container.querySelector("#a .v")?.textContent).toBe("one");
    expect(container.querySelector("#b .v")?.textContent).toBe("two");

    state.a = "ONE";
    expect(container.querySelector("#a .v")?.textContent).toBe("ONE");
    expect(container.querySelector("#b .v")?.textContent).toBe("two");
  });

  it("transformer + shadowing: provider passes loop var, transformer applied", () => {
    container.innerHTML = `
      <template id="t" vln-vars="{ user: upperName }">
        <span class="v" vln-text="user"></span>
      </template>
      <div vln-loop:user="users">
        <div vln-fragment="'t'" vln-vars="{ user: user }"></div>
      </div>
    `;
    const state = Velin.bind(container, {
      users: [{ name: "alice" }, { name: "bob" }] as { name: string }[],
      upperName: (u: { name: string }) => u.name.toUpperCase(),
    });
    const vs = Array.from(container.querySelectorAll(".v")).map(v => v.textContent);
    expect(vs).toEqual(["ALICE", "BOB"]);

    state.users[0].name = "alicia";
    expect(container.querySelector(".v")?.textContent).toBe("ALICIA");
  });

  it("provider that computes on the fly (function call) stays reactive", () => {
    container.innerHTML = `
      <template id="t" vln-vars="['greeting']">
        <span class="v" vln-text="greeting"></span>
      </template>
      <div vln-fragment="'t'" vln-vars="{ greeting: hello(who) }"></div>
    `;
    const state = Velin.bind(container, {
      who: "World",
      hello: (name: string) => `Hi, ${name}!`,
    });
    expect(container.querySelector(".v")?.textContent).toBe("Hi, World!");
    state.who = "Alice";
    expect(container.querySelector(".v")?.textContent).toBe("Hi, Alice!");
  });
});
