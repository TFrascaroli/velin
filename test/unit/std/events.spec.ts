import { describe, it, expect, beforeEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

describe("Velin Event Orchestration", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
  });

  it("should alias events using vln-evt-alias", () => {
    const fn = vi.fn();
    node.addEventListener("aliased", fn);
    node.setAttribute("vln-evt-alias:aliased", "'source'");
    
    // Process the node
    const state = Velin.bind(document.body, {});
    Velin.processNode(node, Velin.ø__internal.boundState.root!);
    
    // Trigger source event
    node.dispatchEvent(new CustomEvent("source"));
    expect(fn).toHaveBeenCalled();
  });

  it("should contain events using vln-evt-contain", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.appendChild(child);
    
    const parentFn = vi.fn();
    parent.addEventListener("click", parentFn);
    
    // vln-evt-contain takes a string (comma separated) instead of array
    parent.setAttribute("vln-evt-contain", "'click'");
    
    Velin.bind(parent, {});
    Velin.processNode(parent, Velin.ø__internal.boundState.root!);
    
    child.dispatchEvent(new CustomEvent("click", { bubbles: true }));
    expect(parentFn).not.toHaveBeenCalled();
  });
});
