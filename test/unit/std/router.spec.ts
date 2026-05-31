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

  it("should conditionally render based on vln-route", () => {
    // Manually trigger a path change for test
    window.history.pushState({}, "", "/test-route");
    
    root.innerHTML = `
      <div vln-router="myRoute">
        <div id="target" vln-route="'/test-route'">Content</div>
      </div>
    `;
    
    Velin.bind(root, {});
    const target = root.querySelector("#target") as HTMLElement;
    expect(target.style.display).toBe("");
    
    window.history.pushState({}, "", "/other");
  });
});
