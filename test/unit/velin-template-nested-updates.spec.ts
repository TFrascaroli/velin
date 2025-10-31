import Velin from "../../src/velin-core";
import setupVelinStd from "../../src/velin-std.js";
import setupVelinTemplates from "../../src/velin-templates-and-fragments.js";
import { describe, it, expect } from "vitest";

setupVelinStd(Velin);
setupVelinTemplates(Velin);

describe("Template interpolation with nested property updates", () => {
  it("should update nested property through template variable", () => {
    // Create template in document
    const template = document.createElement("template");
    template.id = "testTpl";
    template.setAttribute("vln-vars", "item");
    template.innerHTML = '<span vln-text="item.html"></span>';
    document.body.appendChild(template);

    const div = document.createElement("div");
    div.innerHTML = '<div vln-fragment="\'testTpl\'" vln-var:item="items[0]"></div>';

    const state = Velin.bind(div, {
      items: [{ html: "initial" }],
    });

    const span = div.querySelector("span");
    expect(span?.textContent).toBe("initial");

    // Update using getSetter
    const reactiveState = Velin.ø__internal.boundState.root!;
    const setter = Velin.getSetter(reactiveState, "items[0].html");
    setter("updated");

    expect(span?.textContent).toBe("updated");

    // Cleanup
    template.remove();
  });

  it("should update nested property in loop with template", () => {
    // Create template in document
    const template = document.createElement("template");
    template.id = "itemTpl";
    template.setAttribute("vln-vars", "item");
    template.innerHTML = '<div class="item" vln-text="item.value"></div>';
    document.body.appendChild(template);

    const div = document.createElement("div");
    div.innerHTML = '<div vln-loop:it="items" vln-fragment="\'itemTpl\'" vln-var:item="it"></div>';

    const state = Velin.bind(div, {
      items: [{ value: "a" }, { value: "b" }],
    });

    const itemDivs = div.querySelectorAll(".item");
    expect(itemDivs[0]?.textContent).toBe("a");
    expect(itemDivs[1]?.textContent).toBe("b");

    // Update second item
    const reactiveState = Velin.ø__internal.boundState.root!;
    const setter = Velin.getSetter(reactiveState, "items[1].value");
    setter("updated-b");

    expect(itemDivs[1]?.textContent).toBe("updated-b");

    // Cleanup
    template.remove();
  });
});
