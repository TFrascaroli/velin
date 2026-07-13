import Velin from "../../src/velin-core";
import { describe, it, expect, beforeEach } from "vitest";

describe("Velin Getter this binding", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
    node.innerHTML = '<span id="fullname"></span>';
  });

  it("should bind 'this' in getter to reactive proxy", () => {
    const state = Velin.bind(node, {
      firstName: "John",
      lastName: "Doe",

      get fullName() {
        return this.firstName + " " + this.lastName;
      },
    });

    expect(state.fullName).toBe("John Doe");
  });

  it("should track dependencies in getter", () => {
    const state = Velin.bind(node, {
      firstName: "John",
      lastName: "Doe",

      get fullName() {
        return this.firstName + " " + this.lastName;
      },
    });

    // Change firstName and verify getter recomputes
    state.firstName = "Jane";
    expect(state.fullName).toBe("Jane Doe");

    // Change lastName and verify getter recomputes
    state.lastName = "Smith";
    expect(state.fullName).toBe("Jane Smith");
  });

  it("should work with nested property access in getter", () => {
    const state = Velin.bind(node, {
      user: {
        first: "John",
        last: "Doe",
      },

      get displayName() {
        return this.user.first + " " + this.user.last;
      },
    });

    expect(state.displayName).toBe("John Doe");

    state.user.first = "Jane";
    expect(state.displayName).toBe("Jane Doe");
  });

  it("should work when getter calls methods on this", () => {
    const state = Velin.bind(node, {
      firstName: "John",
      lastName: "Doe",

      get fullName() {
        return this.formatName();
      },

      formatName() {
        return `${this.firstName} ${this.lastName}`;
      },
    });

    expect(state.fullName).toBe("John Doe");

    state.firstName = "Jane";
    expect(state.fullName).toBe("Jane Doe");
  });
});
