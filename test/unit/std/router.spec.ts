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

describe("vln-route params", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("fills params from the :segments of the matching route, decoded", async () => {
    window.location.hash = "/user/123/posts/new%20stuff";
    root.innerHTML = `
      <div vln-router="r">
        <div vln-route="'/user/:id/posts/:sort'"><i vln-text="r.params.id + '|' + r.params.sort"></i></div>
      </div>`;
    const state = Velin.bind(root, {}) as any;
    await new Promise((res) => setTimeout(res, 20));
    expect(root.querySelector("i")!.textContent).toBe("123|new stuff");
    expect(state.r.params).toEqual({ id: "123", sort: "new stuff" });
  });

  it("updates params when the hash changes to another match of the same route", async () => {
    window.location.hash = "/user/1";
    root.innerHTML = `<div vln-router="r"><div vln-route="'/user/:id'"><i vln-text="r.params.id"></i></div></div>`;
    Velin.bind(root, {});
    await new Promise((res) => setTimeout(res, 20));
    expect(root.querySelector("i")!.textContent).toBe("1");
    window.location.hash = "/user/2";
    await new Promise((res) => setTimeout(res, 20));
    expect(root.querySelector("i")!.textContent).toBe("2");
  });
});
