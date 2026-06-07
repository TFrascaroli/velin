import { describe, it, expect, beforeEach } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-std";

describe("Performance Backstops", () => {
  beforeEach(() => {
    Velin.ø__updateCounter = 0;
    // Register standard plugins
    setupVelinStd(Velin);
  });

  it("should have predictable effect count during initial bind", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div vln-text="count"></div>';
    
    // Bind should trigger a predictable number of effects for initialization
    Velin.bind(root, { count: 1 });
    
    // Should be low and stable
    expect(Velin.ø__updateCounter).toBeLessThan(10);
  });

  it("should have linear effect growth for complex trees", () => {
    const root = document.createElement("div");
    // Generate a deep/wide tree
    let html = "";
    for (let i = 0; i < 20; i++) {
        html += `<div vln-text="count"></div>`;
    }
    root.innerHTML = html;
    
    Velin.bind(root, { count: 1 });
    
    // Triggering one change should only affect nodes bound to that prop
    Velin.ø__updateCounter = 0;
    Velin.ø__internal.boundState.root.state.count = 2;
    Velin.ø__internal.triggerEffects('root.count', Velin.ø__internal.boundState.root);
    
    // Each of the 20 nodes should have 1 effect triggered.
    expect(Velin.ø__updateCounter).toBe(20);
  });
});
