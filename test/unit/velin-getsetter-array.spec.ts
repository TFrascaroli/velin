import Velin from "../../src/velin-core";
import setupVelinStd from "../../src/velin-std.js";
import { describe, it, expect } from "vitest";

setupVelinStd(Velin);

describe("getSetter with array index paths", () => {
  it("should set nested array property", () => {
    const node = document.createElement("div");
    const state = Velin.bind(node, {
      examples: [
        { id: 1, html: null },
        { id: 2, html: null },
      ],
    });

    const reactiveState = Velin.ø__internal.boundState.root!;
    const setter = Velin.getSetter(reactiveState, "examples[0].html");
    setter("<div>test</div>");

    expect(state.examples[0].html).toBe("<div>test</div>");
  });

  it("should trigger effects on nested array property", () => {
    const div = document.createElement("div");
    div.innerHTML = '<span vln-text="examples[0].html"></span>';

    const state = Velin.bind(div, {
      examples: [{ html: "initial" }],
    });

    const span = div.querySelector("span");
    expect(span?.textContent).toBe("initial");

    const reactiveState = Velin.ø__internal.boundState.root!;
    const setter = Velin.getSetter(reactiveState, "examples[0].html");
    setter("updated");

    expect(span?.textContent).toBe("updated");
  });

  it("should work with dynamic index", () => {
    const node = document.createElement("div");
    const state = Velin.bind(node, {
      examples: [
        { value: "a" },
        { value: "b" },
        { value: "c" },
      ],
    });

    const reactiveState = Velin.ø__internal.boundState.root!;

    for (let i = 0; i < 3; i++) {
      const setter = Velin.getSetter(reactiveState, `examples[${i}].value`);
      setter(`updated-${i}`);
    }

    expect(state.examples[0].value).toBe("updated-0");
    expect(state.examples[1].value).toBe("updated-1");
    expect(state.examples[2].value).toBe("updated-2");
  });
});
