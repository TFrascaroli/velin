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
      <div vln-router="myRoute">
        <div id="target" vln-route:myRoute="'/other'">Content</div>
      </div>
    `;
    
    Velin.bind(root, {});
    const target = root.querySelector("#target") as HTMLElement;
    
    expect(target.style.display).toBe("none");
    
    // Update state
    Velin.ø__internal.boundState.root.state.myRoute.path = '/other';
    
    // Force re-process
    Velin.processNode(root, Velin.ø__internal.boundState.root);
    
    expect(target.style.display).toBe("");
  });
});