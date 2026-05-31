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
    Velin.bind(root, {});
    
    expect(Velin.ø__internal.boundState.root.state.myRoute).toBeDefined();
    expect(Velin.ø__internal.boundState.root.state.myRoute.path).toBe(window.location.pathname);
  });

  it("should conditionally render based on vln-route", async () => {
    window.history.pushState({}, "", "/test-route");
    window.dispatchEvent(new Event('popstate'));
    
    root.innerHTML = `
      <div vln-router="myroute">
        <div id="target" vln-route:myroute="'/other'">Content</div>
      </div>
    `;
    
    Velin.bind(root, {
      myroute: { path: '/test-route', params: {}, query: {}, error: null, loading: false }
    });
    const target = root.querySelector("#target") as HTMLElement;
    
    expect(target.style.display).toBe("none");
    
    // Update state
    Velin.ø__internal.boundState.root.state.myroute.path = '/other';
    // Sync browser URL for the plugin
    Object.defineProperty(window, 'location', { value: { pathname: '/other' }, writable: true });
    
    // Force re-process
    Velin.processNode(root, Velin.ø__internal.boundState.root);
    
    // Allow reactivity to propagate
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(target.style.display).toBe("");
  });
});