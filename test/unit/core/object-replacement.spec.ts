import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-std.js";
import { describe, it, expect, vi } from "vitest";

setupVelinStd(Velin);

describe("Object replacement reactivity", () => {
  describe("Basic object replacement", () => {
    it("should update when a parent object is completely replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="user.name"></div>';

      const state = Velin.bind(div, {
        user: { name: "John" },
      });

      const textDiv = div.querySelector("div");
      expect(textDiv?.textContent).toBe("John");

      // Replace the entire user object
      state.user = { name: "Jane" };
      expect(textDiv?.textContent).toBe("Jane");
    });

    it("should update when nested property is modified directly", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="user.name"></div>';

      const state = Velin.bind(div, {
        user: { name: "John" },
      });

      const textDiv = div.querySelector("div");
      expect(textDiv?.textContent).toBe("John");

      // Modify the nested property directly
      state.user.name = "Jane";
      expect(textDiv?.textContent).toBe("Jane");
    });

    it("should update multiple bindings when parent object is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div id="name" vln-text="user.name"></div>
        <div id="email" vln-text="user.email"></div>
      `;

      const state = Velin.bind(div, {
        user: { name: "John", email: "john@example.com" },
      });

      const nameDiv = div.querySelector("#name");
      const emailDiv = div.querySelector("#email");
      expect(nameDiv?.textContent).toBe("John");
      expect(emailDiv?.textContent).toBe("john@example.com");

      // Replace the entire user object
      state.user = { name: "Jane", email: "jane@example.com" };
      expect(nameDiv?.textContent).toBe("Jane");
      expect(emailDiv?.textContent).toBe("jane@example.com");
    });
  });

  describe("Deep nesting", () => {
    it("should handle deep nesting when parent object is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="user.profile.name"></div>';

      const state = Velin.bind(div, {
        user: { profile: { name: "John" } },
      });

      const textDiv = div.querySelector("div");
      expect(textDiv?.textContent).toBe("John");

      // Replace the user object with new nested structure
      state.user = { profile: { name: "Jane" } };
      expect(textDiv?.textContent).toBe("Jane");
    });

    it("should handle replacing intermediate object in chain", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="user.profile.name"></div>';

      const state = Velin.bind(div, {
        user: { profile: { name: "John" } },
      });

      const textDiv = div.querySelector("div");
      expect(textDiv?.textContent).toBe("John");

      // Replace just the profile object
      state.user.profile = { name: "Jane" };
      expect(textDiv?.textContent).toBe("Jane");
    });

    it("should handle very deep nesting (3+ levels)", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="app.user.profile.settings.theme"></div>';

      const state = Velin.bind(div, {
        app: { user: { profile: { settings: { theme: "dark" } } } },
      });

      const textDiv = div.querySelector("div");
      expect(textDiv?.textContent).toBe("dark");

      // Replace at various levels
      state.app.user.profile.settings = { theme: "light" };
      expect(textDiv?.textContent).toBe("light");

      state.app.user.profile = { settings: { theme: "blue" } };
      expect(textDiv?.textContent).toBe("blue");

      state.app.user = { profile: { settings: { theme: "red" } } };
      expect(textDiv?.textContent).toBe("red");

      state.app = { user: { profile: { settings: { theme: "green" } } } };
      expect(textDiv?.textContent).toBe("green");
    });
  });

  describe("Effect triggering behavior", () => {
    it("should trigger effect exactly once when parent is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = '<div vln-text="user.name"></div>';

      let effectRunCount = 0;

      const state = Velin.bind(div, {
        user: { name: "John" },
      });

      // Count how many times the effect actually runs
      const reactiveState = Velin.ø__internal.boundState.root!;
      const originalBindings = new Map(reactiveState.bindings);

      // Wrap all effects to count executions
      for (const [path, effects] of originalBindings.entries()) {
        const wrappedEffects = new Set<any>();
        for (const effect of effects) {
          const wrapped = () => {
            effectRunCount++;
            return effect();
          };
          wrappedEffects.add(wrapped);
        }
        reactiveState.bindings.set(path, wrappedEffects);
      }

      effectRunCount = 0; // Reset

      state.user = { name: "Jane" };

      // The effect should run exactly once, not multiple times
      expect(effectRunCount).toBe(1);

      const textDiv = div.querySelector("div");
      expect(textDiv?.textContent).toBe("Jane");
    });

    it("should trigger all child effects exactly once when parent is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div id="name" vln-text="user.name"></div>
        <div id="email" vln-text="user.email"></div>
        <div id="age" vln-text="user.age"></div>
      `;

      const state = Velin.bind(div, {
        user: { name: "John", email: "john@example.com", age: 30 },
      });

      const spies = {
        name: vi.fn(),
        email: vi.fn(),
        age: vi.fn(),
      };

      // Spy on all textContent setters
      ["name", "email", "age"].forEach((id) => {
        const el = div.querySelector(`#${id}`);
        let actualTextContent = el?.textContent;
        Object.defineProperty(el, "textContent", {
          get: () => actualTextContent,
          set: (value) => {
            spies[id as keyof typeof spies](value);
            actualTextContent = value;
          },
          configurable: true,
        });
      });

      // Clear initial binding calls
      Object.values(spies).forEach((spy) => spy.mockClear());

      // Replace parent object
      state.user = { name: "Jane", email: "jane@example.com", age: 25 };

      // Each binding should trigger exactly once
      expect(spies.name).toHaveBeenCalledTimes(1);
      expect(spies.name).toHaveBeenCalledWith("Jane");
      expect(spies.email).toHaveBeenCalledTimes(1);
      expect(spies.email).toHaveBeenCalledWith("jane@example.com");
      expect(spies.age).toHaveBeenCalledTimes(1);
      expect(spies.age).toHaveBeenCalledWith(25); // vln-text converts to number internally
    });
  });
});
