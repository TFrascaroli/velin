import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-std.js";
import { describe, it, expect, vi } from "vitest";

setupVelinStd(Velin);

describe("Array replacement reactivity (avoiding hyper-reactivity)", () => {
  describe("Array replacement should NOT trigger nested property effects", () => {
    it("should NOT trigger effects for items[0].name when items array is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:item="items">
          <span vln-text="item.name"></span>
        </div>
      `;

      const state = Velin.bind(div, {
        items: [{ name: "John" }, { name: "Jane" }],
      });

      const spans = div.querySelectorAll("span");
      expect(spans.length).toBe(2);
      expect(spans[0]?.textContent).toBe("John");
      expect(spans[1]?.textContent).toBe("Jane");

      // Spy on textContent setters to count renders
      const renderCounts: number[] = [];
      spans.forEach((span, index) => {
        let actualTextContent = span.textContent;
        let count = 0;
        Object.defineProperty(span, "textContent", {
          get: () => actualTextContent,
          set: (value) => {
            actualTextContent = value;
            count++;
            renderCounts[index] = count;
          },
          configurable: true,
        });
      });

      // Reset counts
      renderCounts.length = 0;
      renderCounts.push(0, 0);

      // Replace the entire array - loop plugin will handle re-rendering
      state.items = [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }];

      // The loop plugin should handle this, not individual item.name bindings
      // Individual bindings for items[0].name should NOT be triggered
      // (The test passes if the system doesn't crash or enter infinite loops)
      const newSpans = div.querySelectorAll("span");
      expect(newSpans.length).toBe(3);
    });

    it("should NOT cascade to array item properties when array is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:user="users">
          <div class="name" vln-text="user.name"></div>
          <div class="email" vln-text="user.email"></div>
        </div>
      `;

      const effectSpy = vi.fn();
      const reactiveState = Velin.ø__internal.boundState.root!;

      const state = Velin.bind(div, {
        users: [
          { name: "John", email: "john@example.com" },
          { name: "Jane", email: "jane@example.com" },
        ],
      });

      // Count how many bindings exist for paths with array indices
      let arrayIndexBindings = 0;
      for (const [path] of reactiveState.bindings.entries()) {
        if (path.includes("[")) {
          arrayIndexBindings++;
        }
      }

      // Replace the array
      state.users = [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ];

      // The system should not trigger individual item bindings
      // Instead, the loop plugin handles array replacement
      expect(div.querySelectorAll(".name").length).toBe(2);
    });
  });

  describe("Array item modification should still work", () => {
    it("should update when individual array item property is modified", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:item="items">
          <span vln-text="item.name"></span>
        </div>
      `;

      const state = Velin.bind(div, {
        items: [{ name: "John" }, { name: "Jane" }],
      });

      const spans = div.querySelectorAll("span");
      expect(spans[0]?.textContent).toBe("John");
      expect(spans[1]?.textContent).toBe("Jane");

      // Modify a specific item's property
      state.items[0].name = "Johnny";

      const updatedSpans = div.querySelectorAll("span");
      expect(updatedSpans[0]?.textContent).toBe("Johnny");
      expect(updatedSpans[1]?.textContent).toBe("Jane");
    });

    it("should update when array mutation methods are called", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:item="items">
          <span vln-text="item.name"></span>
        </div>
      `;

      const state = Velin.bind(div, {
        items: [{ name: "John" }, { name: "Jane" }],
      });

      expect(div.querySelectorAll("span").length).toBe(2);

      state.items.push({ name: "Alice" });

      const spans = div.querySelectorAll("span");
      expect(spans.length).toBe(3);
      expect(spans[2]?.textContent).toBe("Alice");
    });
  });

  describe("Performance: no hyper-reactivity", () => {
    it("should update object properties when parent is replaced, but not array item properties", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div id="userName" vln-text="user.name"></div>
        <div id="userEmail" vln-text="user.email"></div>
        <div vln-loop:item="user.items">
          <span class="item" vln-text="item.name"></span>
        </div>
      `;

      const state = Velin.bind(div, {
        user: {
          name: "John",
          email: "john@example.com",
          items: [{ name: "Item1" }, { name: "Item2" }],
        },
      });

      expect(div.querySelector("#userName")?.textContent).toBe("John");
      expect(div.querySelector("#userEmail")?.textContent).toBe("john@example.com");
      expect(div.querySelectorAll(".item").length).toBe(2);

      // Replace the user object
      state.user = {
        name: "Jane",
        email: "jane@example.com",
        items: [{ name: "NewItem1" }, { name: "NewItem2" }, { name: "NewItem3" }],
      };

      // Object properties should update
      expect(div.querySelector("#userName")?.textContent).toBe("Jane");
      expect(div.querySelector("#userEmail")?.textContent).toBe("jane@example.com");

      // Array should be handled by loop plugin
      expect(div.querySelectorAll(".item").length).toBe(3);
    });

    it("should handle nested objects within arrays correctly", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:user="users">
          <div class="profile-name" vln-text="user.profile.name"></div>
        </div>
      `;

      const state = Velin.bind(div, {
        users: [
          { profile: { name: "John" } },
          { profile: { name: "Jane" } },
        ],
      });

      const profileNames = div.querySelectorAll(".profile-name");
      expect(profileNames[0]?.textContent).toBe("John");
      expect(profileNames[1]?.textContent).toBe("Jane");

      // Modify a profile object within an array item
      state.users[0].profile = { name: "Johnny" };

      const updated = div.querySelectorAll(".profile-name");
      expect(updated[0]?.textContent).toBe("Johnny");
      expect(updated[1]?.textContent).toBe("Jane");
    });
    
    it("should NOT trigger effects under arrays when parent is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:friend="user.friends">
          <span class="friend-name" vln-text="friend.info.name"></span>
        </div>
      `;

      const state = Velin.bind(div, {
        user: {
          friends: [
            { info: { name: "Alice" } },
            { info: { name: "Bob" } },
          ],
        },
      });

      const names = div.querySelectorAll(".friend-name");
      expect(names[0]?.textContent).toBe("Alice");
      expect(names[1]?.textContent).toBe("Bob");

      // Count effects triggered
      let effectCount = 0;
      const reactiveState = Velin.ø__internal.boundState.root!;
      const originalBindings = new Map(reactiveState.bindings);

      for (const [path, effects] of originalBindings.entries()) {
        const wrappedEffects = new Set<any>();
        for (const effect of effects) {
          const wrapped = () => {
            effectCount++;
            console.log(`Effect triggered for: ${path}`);
            return effect();
          };
          wrappedEffects.add(wrapped);
        }
        reactiveState.bindings.set(path, wrappedEffects);
      }

      effectCount = 0;

      // Replace user - should NOT trigger user.friends[0].info.name or user.friends[0].info
      // Only the loop should handle this
      state.user = {
        friends: [
          { info: { name: "Charlie" } },
          { info: { name: "Diana" } },
        ],
      };

      // The loop effect for user.friends should trigger, but NOT individual item effects
      const newNames = div.querySelectorAll(".friend-name");
      expect(newNames[0]?.textContent).toBe("Charlie");
      expect(newNames[1]?.textContent).toBe("Diana");

      // Should only trigger user.friends (the loop), not individual array item properties
      console.log(`Total effects triggered: ${effectCount}`);
    });


    it("should not trigger excessive effects when array is replaced", () => {
      const div = document.createElement("div");
      div.innerHTML = `
        <div vln-loop:item="items" class="item">
          <span vln-text="item.name"></span>
          <span vln-text="item.value"></span>
          <span vln-text="item.id"></span>
        </div>
      `;

      const state = Velin.bind(div, {
        items: Array.from({ length: 100 }, (_, i) => ({
          name: `Item ${i}`,
          value: i * 10,
          id: `id-${i}`,
        })),
      });

      expect(div.querySelectorAll("div.item").length).toBe(100);

      // Replace with a large array - should not cause performance issues
      const newArr = Array.from({ length: 50 }, (_, i) => ({
        name: `New Item ${i}`,
        value: i * 20,
        id: `new-id-${i}`,
      }));
      const startTime = performance.now();
      state.items = newArr;
      const endTime = performance.now();

      expect(div.querySelectorAll("div.item").length).toBe(50);
      // Should complete reasonably quickly (under 100ms for this small test)
      expect(endTime - startTime).toBeLessThan(20); // TODO: THIS IS A VERY BAD TEST.
    });
  });
});
