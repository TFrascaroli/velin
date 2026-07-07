import { describe, it, expect, beforeEach, vitest } from "vitest";
import Velin from "../../../src/velin-all";

describe("Velin Async Mutation Safety", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
  });

  it("should throw [VLN014] when mutating via contextualizedProxy after cleanup", async () => {
    const state = Velin.bind(node, { count: 0 });
    const rootState = Velin.ø__internal.getWrapper(state)!;
    
    // Create a substate so we can cleanup without rootState being null
    const substate = Velin.composeState(rootState, new Map());

    // Now clean up the substate
    Velin.cleanupState(rootState, substate);

    // Now try to evaluate an expression that mutates on the cleaned-up substate
    expect(() => {
        Velin.evaluate(substate, 'count = 1', true);
    }).toThrow("[VLN014]");
  });
});
