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
    Velin.processNode(node, Velin.ø__internal.getWrapper(state)!);
    
    // Trigger source event
    node.dispatchEvent(new CustomEvent("source"));
    expect(fn).toHaveBeenCalled();
  });

  it("should contain a single event using vln-evt-contain with a string", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.appendChild(child);

    const parentFn = vi.fn();
    parent.addEventListener("click", parentFn);

    parent.setAttribute("vln-evt-contain", "'click'");

    const state = Velin.bind(parent, {});
    Velin.processNode(parent, Velin.ø__internal.getWrapper(state)!);

    child.dispatchEvent(new CustomEvent("click", { bubbles: true }));
    expect(parentFn).not.toHaveBeenCalled();
  });

  it("should contain multiple events using vln-evt-contain with an array", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    parent.appendChild(child);

    const clickFn = vi.fn();
    const keyFn = vi.fn();
    parent.addEventListener("click", clickFn);
    parent.addEventListener("keypress", keyFn);

    parent.setAttribute("vln-evt-contain", "['click', 'keypress']");

    const state = Velin.bind(parent, {});
    Velin.processNode(parent, Velin.ø__internal.getWrapper(state)!);

    child.dispatchEvent(new CustomEvent("click", { bubbles: true }));
    child.dispatchEvent(new CustomEvent("keypress", { bubbles: true }));
    expect(clickFn).not.toHaveBeenCalled();
    expect(keyFn).not.toHaveBeenCalled();
  });
});
