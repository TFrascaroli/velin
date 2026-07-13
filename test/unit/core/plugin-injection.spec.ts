import { describe, it, expect, beforeEach } from "vitest";
import Velin from "../../../src/velin-all";

describe("PluginControl.plugins injection", () => {
  beforeEach(() => {
    // Clean up any leftover registrations from prior tests
    if ((Velin as any).plugins.get("inj-test-macro")) {
      (Velin as any).ø__internal?.plugins?.delete?.("inj-test-macro");
    }
  });

  it("injected plugins run immediately after the injector, in priority order", () => {
    const order: string[] = [];

    Velin.plugins.registerPlugin({
      name: "inj-a",
      priority: 5,
      render: () => {
        order.push("a");
      },
    });
    Velin.plugins.registerPlugin({
      name: "inj-b",
      priority: 5,
      render: () => {
        order.push("b");
      },
    });
    Velin.plugins.registerPlugin({
      name: "inj-macro",
      priority: 10, // runs before inj-b which is on the DOM at priority 5
      render: () => {
        order.push("macro");
        return {
          plugins: [
            { name: "vln-inj-a", value: "1" }, // injected — should slot in here
          ],
        };
      },
    });

    const root = document.createElement("div");
    root.setAttribute("vln-inj-macro", "1");
    root.setAttribute("vln-inj-b", "1");
    Velin.bind(root, {});

    // Expected: macro (DOM, prio 10) → a (injected after macro) → b (DOM, prio 5)
    expect(order).toEqual(["macro", "a", "b"]);
  });

  it("injected plugins do not leave reflect-* breadcrumbs on the DOM", () => {
    Velin.plugins.registerPlugin({
      name: "inj-emit",
      priority: 10,
      render: () => ({
        plugins: [{ name: "vln-inj-noop", value: "'x'" }],
      }),
    });
    Velin.plugins.registerPlugin({
      name: "inj-noop",
      priority: 5,
      render: () => {},
    });

    const root = document.createElement("div");
    root.setAttribute("vln-inj-emit", "1");
    Velin.bind(root, {});

    // The DOM-sourced attribute is reflected, the injected one is not.
    expect(root.hasAttribute("reflect-vln-inj-emit")).toBe(true);
    expect(root.hasAttribute("reflect-vln-inj-noop")).toBe(false);
  });
});
