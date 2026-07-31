import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

describe("Templates and Fragments", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it("should render a basic template with fragment", () => {
    container.innerHTML = `
      <template vln-template="testCard" vln-vars="['name']">
        <div class="card">
          <span vln-text="name"></span>
        </div>
      </template>
      <div vln-fragment="'testCard'" vln-vars="{ name: userName }"></div>
    `;

    const state = Velin.bind(container, {
      userName: "Alice"
    });

    const card = container.querySelector('.card');
    expect(card).toBeTruthy();
    expect(card?.textContent?.trim()).toBe("Alice");

    // Test reactivity
    state.userName = "Bob";
    expect(card?.textContent?.trim()).toBe("Bob");
  });

  it("should support dynamic template selection", () => {
    container.innerHTML = `
      <template vln-template="adminCard" vln-vars="['user']">
        <div class="admin">Admin: <span vln-text="user"></span></div>
      </template>
      <template vln-template="guestCard" vln-vars="['user']">
        <div class="guest">Guest: <span vln-text="user"></span></div>
      </template>
      <div vln-fragment="role + 'Card'" vln-vars="{ user: userName }"></div>
    `;

    Velin.bind(container, {
      userName: "Alice",
      role: "admin"
    });

    expect(container.querySelector('.admin')).toBeTruthy();
    expect(container.querySelector('.admin')?.textContent).toContain("Admin: Alice");
  });

  it("preserves camelCase names end-to-end (the case-sensitivity fix)", () => {
    container.innerHTML = `
      <template vln-template="userCard" vln-vars="['nodeId', 'displayName']">
        <div class="card">
          <span class="id" vln-text="nodeId"></span>
          <span class="name" vln-text="displayName"></span>
        </div>
      </template>
      <div vln-fragment="'userCard'"
           vln-vars="{ nodeId: currentId, displayName: currentName }"></div>
    `;

    Velin.bind(container, {
      currentId: "n-42",
      currentName: "Alice",
    });

    expect(container.querySelector('.id')?.textContent).toBe("n-42");
    expect(container.querySelector('.name')?.textContent).toBe("Alice");
  });

  it("should error when required variables are missing", () => {
    container.innerHTML = `
      <template vln-template="testCard" vln-vars="['name', 'email']">
        <div class="card"><span vln-text="name"></span></div>
      </template>
      <div id="fragment-host" vln-fragment="'testCard'" vln-vars="{ name: userName }"></div>
    `;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Velin.bind(container, { userName: "Eve" });

    expect(container.querySelector('.card')).toBeFalsy();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("requires missing variables")
    );

    consoleSpy.mockRestore();
  });

  it("supports spread on the consumer side", () => {
    container.innerHTML = `
      <template vln-template="card" vln-vars="['user', 'role']">
        <div class="card"><span vln-text="user + ':' + role"></span></div>
      </template>
      <div vln-fragment="'card'" vln-vars="{ ...defaults, user: currentUser }"></div>
    `;

    Velin.bind(container, {
      currentUser: "Alice",
      defaults: { role: "guest", user: "anon" },
    });

    expect(container.querySelector('.card')?.textContent).toBe("Alice:guest");
  });

  it("applies transformer functions from object declaration", () => {
    container.innerHTML = `
      <template vln-template="userCard" vln-vars="{ name: sanitizeName, count: doubleCount }">
        <div class="card">
          <span class="n" vln-text="name"></span>
          <span class="c" vln-text="count"></span>
        </div>
      </template>
      <div vln-fragment="'userCard'" vln-vars="{ name: rawName, count: rawCount }"></div>
    `;

    Velin.bind(container, {
      rawName: null,
      rawCount: "5",
      sanitizeName: (v: unknown) => v == null ? "anon" : v,
      doubleCount: (v: unknown) => Number(v) * 2,
    });

    expect(container.querySelector('.n')?.textContent).toBe("anon");
    expect(container.querySelector('.c')?.textContent).toBe("10");
  });

  it("throws from transformer surfaces as a console error and halts render", () => {
    container.innerHTML = `
      <template vln-template="card" vln-vars="{ age: requirePositive }">
        <div class="card"><span vln-text="age"></span></div>
      </template>
      <div vln-fragment="'card'" vln-vars="{ age: n }"></div>
    `;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Velin.bind(container, {
      n: -1,
      requirePositive: (v: number) => {
        if (v < 0) throw new Error("age must be >= 0");
        return v;
      },
    });

    // Transformer throws when the interpolation is read; the natural error
    // propagates out during initial processing.
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("rejects vln-vars declaration that doesn't evaluate to an array or object", () => {
    // `name, email` parses as a SequenceExpression → evaluates to the last
    // expression's value (a string), not an array or object.
    container.innerHTML = `
      <template vln-template="bad" vln-vars="name, email">
        <div class="card"><span vln-text="name"></span></div>
      </template>
      <div vln-fragment="'bad'" vln-vars="{ name: n, email: e }"></div>
    `;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Velin.bind(container, { n: "Alice", e: "a@b" });

    expect(container.querySelector('.card')).toBeFalsy();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("must evaluate to an array or object")
    );

    consoleSpy.mockRestore();
  });

  it("works with vln-vars in loops", () => {
    container.innerHTML = `
      <template vln-template="userCard" vln-vars="['user']">
        <div class="user-card" vln-text="user.name"></div>
      </template>
      <div vln-loop:iter="users">
        <div vln-fragment="'userCard'" vln-vars="{ user: iter }"></div>
      </div>
    `;

    Velin.bind(container, {
      users: [
        { name: "Alice" },
        { name: "Bob" },
        { name: "Charlie" }
      ]
    });

    const cards = container.querySelectorAll('.user-card');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toBe("Alice");
    expect(cards[1].textContent).toBe("Bob");
    expect(cards[2].textContent).toBe("Charlie");
  });

  it("auto-discovers keys from provided object when template has no declaration", () => {
    container.innerHTML = `
      <template vln-template="loose">
        <div class="card">
          <span class="a" vln-text="a"></span>
          <span class="b" vln-text="b"></span>
        </div>
      </template>
      <div vln-fragment="'loose'" vln-vars="{ a: x, b: y }"></div>
    `;

    Velin.bind(container, { x: "hello", y: "world" });

    expect(container.querySelector('.a')?.textContent).toBe("hello");
    expect(container.querySelector('.b')?.textContent).toBe("world");
  });
});
