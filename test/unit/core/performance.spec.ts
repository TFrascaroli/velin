import { describe, it, expect, beforeEach } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

describe("Performance Backstops", () => {
  beforeEach(() => {
    (window as any).__VELIN_DEVTOOLS_HOOK__.stats.updateCounter = 0;
    // Register standard plugins
    setupVelinStd(Velin);
  });

  it("should have predictable effect count during initial bind", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div vln-text="count"></div>';
    
    // Bind should trigger a predictable number of effects for initialization
    Velin.bind(root, { count: 1 });
    
    // Should be low and stable
    expect((window as any).__VELIN_DEVTOOLS_HOOK__.stats.updateCounter).toBeLessThan(10);
  });

  it("should have linear effect growth for complex trees", () => {
    const root = document.createElement("div");
    // Generate a deep/wide tree
    let html = "";
    for (let i = 0; i < 20; i++) {
        html += `<div vln-text="count"></div>`;
    }
    root.innerHTML = html;
    
    const state = Velin.bind(root, { count: 1 });

    // Triggering one change should only affect nodes bound to that prop
    (window as any).__VELIN_DEVTOOLS_HOOK__.stats.updateCounter = 0;
    Velin.ø__internal.getWrapper(state)!.state.count = 2;
    Velin.ø__internal.triggerEffects('root.count', Velin.ø__internal.getWrapper(state)!);
    
    // Each of the 20 nodes should have 1 effect triggered.
    expect((window as any).__VELIN_DEVTOOLS_HOOK__.stats.updateCounter).toBe(20);
  });
});
