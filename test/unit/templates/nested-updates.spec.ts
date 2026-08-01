import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard.js";
import setupVelinTemplates from "../../../src/velin-templates-and-fragments.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

setupVelinStd(Velin);
setupVelinTemplates(Velin);

describe("Template interpolation with nested property updates", () => {
  let div: HTMLDivElement;

  beforeEach(() => {
    // Attached to body so document.getElementById can find the <template>
    // that lives inside `div` (fragment plugin does an id lookup).
    div = document.createElement("div");
    document.body.appendChild(div);
  });

  afterEach(() => {
    if (div.parentNode) document.body.removeChild(div);
  });

  it("should update nested property through template variable", () => {
    div.innerHTML = `
      <template vln-template="'testTpl'" vln-vars="['item']"><span vln-text="item.html"></span></template>
      <div vln-fragment="'testTpl'" vln-vars="{ item: items[0] }"></div>
    `;

    const state = Velin.bind(div, {
      items: [{ html: "initial" }],
    });

    const span = div.querySelector("span");
    expect(span?.textContent).toBe("initial");

    // Update using getSetter
    const reactiveState = Velin.ø__internal.getWrapper(state)!;
    const setter = Velin.getSetter(reactiveState, "items[0].html");
    setter("updated");

    expect(span?.textContent).toBe("updated");
  });

  it("should update nested property in loop with template", () => {
    div.innerHTML = `
      <template vln-template="'itemTpl'" vln-vars="['item']"><div class="item" vln-text="item.value"></div></template>
      <div vln-loop:it="items" vln-fragment="'itemTpl'" vln-vars="{ item: it }"></div>
    `;

    const state = Velin.bind(div, {
      items: [{ value: "a" }, { value: "b" }],
    });

    const itemDivs = div.querySelectorAll(".item");
    expect(itemDivs[0]?.textContent).toBe("a");
    expect(itemDivs[1]?.textContent).toBe("b");

    // Update second item
    const reactiveState = Velin.ø__internal.getWrapper(state)!;
    const setter = Velin.getSetter(reactiveState, "items[1].value");
    setter("updated-b");

    expect(itemDivs[1]?.textContent).toBe("updated-b");
  });
});
