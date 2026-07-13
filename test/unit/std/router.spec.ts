import { describe, it, expect, beforeEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

describe("Velin Router", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("should sync URL with state using vln-router", () => {
    root.setAttribute("vln-router", "myRoute");
    const state = Velin.bind(root, {});

    expect(Velin.ø__internal.getWrapper(state)!.state.myRoute).toBeDefined();
    expect(Velin.ø__internal.getWrapper(state)!.state.myRoute.path).toBe(window.location.pathname);
  });

  it("should conditionally render based on vln-route", async () => {
    root.innerHTML = `
      <div vln-router="myRoute">
        <div id="target" vln-route="'/other'">Content</div>
      </div>
    `;
    
    const state = Velin.bind(root, {
      myRoute: { path: '/test-route', params: {}, query: {}, error: null, loading: false }
    });

    expect(root.querySelector("#target")).toBeNull();

    Velin.ø__internal.getWrapper(state)!.state.myRoute.path = '/other';
    Velin.ø__internal.triggerEffects('root.myRoute.path', Velin.ø__internal.getWrapper(state)!);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const target = root.querySelector("#target");
    expect(target).not.toBeNull();
    expect(target?.textContent).toBe("Content");
  });

  it("should handle dynamic route parameters", async () => {
    // Set the hash manually to match
    window.location.hash = '/user/123';
    
    root.innerHTML = `
      <div vln-router="myRoute">
        <div id="target" vln-route="'/user/:id'">Content</div>
      </div>
    `;
    
    // Initialize without pre-setting path in state, let router plugin initialize it from hash
    Velin.bind(root, { myRoute: {} });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const target = root.querySelector("#target");
    expect(target).not.toBeNull();
  });

  it("should provide navigateTo function", () => {
    root.setAttribute("vln-router", "myRoute");
    const state = Velin.bind(root, {});

    const routeState = Velin.ø__internal.getWrapper(state)!.state.myRoute;
    expect(typeof routeState.navigateTo).toBe("function");
    
    routeState.navigateTo('/new-path');
    expect(window.location.hash).toBe('#/new-path');
  });

});
