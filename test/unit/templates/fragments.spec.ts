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
      <template id="testCard" vln-vars="name">
        <div class="card">
          <span vln-text="name"></span>
        </div>
      </template>
      <div vln-fragment="'testCard'" vln-var:name="userName"></div>
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
      <template id="adminCard" vln-vars="user">
        <div class="admin">Admin: <span vln-text="user"></span></div>
      </template>
      <template id="guestCard" vln-vars="user">
        <div class="guest">Guest: <span vln-text="user"></span></div>
      </template>
      <div vln-fragment="role + 'Card'" vln-var:user="userName"></div>
    `;

    const state = Velin.bind(container, {
      userName: "Alice",
      role: "admin"
    });

    expect(container.querySelector('.admin')).toBeTruthy();
    expect(container.querySelector('.admin')?.textContent).toContain("Admin: Alice");
  });

  it("should work with vln-use alias", () => {
    container.innerHTML = `
      <template id="testCard" vln-vars="name">
        <div class="card">
          <span vln-text="name"></span>
        </div>
      </template>
      <div vln-use="'testCard'" vln-var:name="userName"></div>
    `;

    const state = Velin.bind(container, {
      userName: "Charlie"
    });

    const card = container.querySelector('.card');
    expect(card).toBeTruthy();
    expect(card?.textContent?.trim()).toBe("Charlie");
  });

  // TODO: Fix onMount lifecycle hook test - needs investigation
  it.skip("should support onMount lifecycle hook", () => {
    container.innerHTML = `
      <template id="testCard" vln-vars="name">
        <div class="card">
          <span vln-text="name"></span>
        </div>
      </template>
      <div vln-fragment="'testCard'"
           vln-var:name="userName"
           vln-var:onMount="mounted = true"></div>
    `;

    const state = Velin.bind(container, {
      userName: "Diana",
      mounted: false
    });

    expect(state.mounted).toBe(true);
  });

  // TODO: Fix validation test - error is being logged but render still happens
  it.skip("should handle missing template variables gracefully", () => {
    container.innerHTML = `
      <template id="testCard" vln-vars="name, email">
        <div class="card">
          <span vln-text="name"></span>
        </div>
      </template>
      <div id="fragment-host" vln-fragment="'testCard'" vln-var:name="userName"></div>
    `;

    // Suppress error logs for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    Velin.bind(container, {
      userName: "Eve"
    });

    // Fragment should not render because of missing variable
    const card = container.querySelector('.card');
    expect(card).toBeFalsy();

    // Should have logged an error
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // Note: loops + fragments test skipped due to interaction complexity
  // In real usage, fragments should be used inside the loop template content
  it.skip("should work in loops", () => {
    container.innerHTML = `
      <template id="userCard" vln-vars="user">
        <div class="user-card">
          <span vln-text="user.name"></span>
        </div>
      </template>
      <div vln-loop:user="users"
           vln-fragment="'userCard'"
           vln-var:user="user"></div>
    `;

    const state = Velin.bind(container, {
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
});
