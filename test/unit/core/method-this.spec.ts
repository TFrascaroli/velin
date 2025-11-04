import Velin from "../../../src/velin-core";
import { describe, it, expect, beforeEach } from "vitest";

describe("Velin Method this binding", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
  });

  it("should bind 'this' in methods to reactive proxy", () => {
    const state = Velin.bind(node, {
      count: 0,

      increment() {
        this.count++;
      },

      decrement() {
        this.count--;
      },
    });

    expect(state.count).toBe(0);

    state.increment();
    expect(state.count).toBe(1);

    state.increment();
    expect(state.count).toBe(2);

    state.decrement();
    expect(state.count).toBe(1);
  });

  it("should allow methods to call other methods via this", () => {
    const state = Velin.bind(node, {
      firstName: "John",
      lastName: "Doe",

      getFullName() {
        return this.firstName + " " + this.lastName;
      },

      greet() {
        return "Hello, " + this.getFullName() + "!";
      },
    });

    expect(state.greet()).toBe("Hello, John Doe!");
  });

  it("should allow methods to access nested properties via this", () => {
    const state = Velin.bind(node, {
      user: {
        name: "Alice",
        score: 100,
      },

      incrementScore(amount: number) {
        this.user.score += amount;
      },

      resetUser() {
        this.user = { name: "Guest", score: 0 };
      },
    });

    state.incrementScore(50);
    expect(state.user.score).toBe(150);

    state.resetUser();
    expect(state.user.name).toBe("Guest");
    expect(state.user.score).toBe(0);
  });

  it("should work with async methods", async () => {
    const state = Velin.bind(node, {
      value: 0,
      loading: false,

      async loadData() {
        this.loading = true;
        await new Promise((resolve) => setTimeout(resolve, 10));
        this.value = 42;
        this.loading = false;
      },
    });

    expect(state.loading).toBe(false);
    expect(state.value).toBe(0);

    const promise = state.loadData();
    expect(state.loading).toBe(true);

    await promise;
    expect(state.loading).toBe(false);
    expect(state.value).toBe(42);
  });

  it("should bind this correctly when called via Velin.evaluate", () => {
    const state = Velin.bind(node, {
      count: 0,
      result: "",

      increment() {
        this.count++;
        return this.count;
      },

      getMessage() {
        return "Count is " + this.count;
      },
    });

    const reactiveState = Velin.ø__internal.boundState.root!;

    // Simulate directive call like vln-on:click="increment()"
    const result = Velin.evaluate(reactiveState, "increment()", true);
    expect(result).toBe(1);
    expect(state.count).toBe(1);

    // Call again
    Velin.evaluate(reactiveState, "increment()", true);
    expect(state.count).toBe(2);

    // Test method that accesses this
    const message = Velin.evaluate(reactiveState, "getMessage()");
    expect(message).toBe("Count is 2");
  });

  it("should work with arrow functions that capture this", () => {
    const capturedThis = { count: 0 };

    const state = Velin.bind(node, {
      count: 0,

      // Arrow function captures 'this' from surrounding scope
      increment: () => {
        capturedThis.count++;
      },

      // Regular method can access state
      getValue() {
        return this.count;
      },
    });

    state.increment();
    expect(capturedThis.count).toBe(1);
    expect(state.count).toBe(0); // State unchanged
  });
});
