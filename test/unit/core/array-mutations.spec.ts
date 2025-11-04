import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-std.js";
import { describe, it, expect } from "vitest";

setupVelinStd(Velin);

describe("Array mutation methods reactivity", () => {
  it("should trigger reactivity on push()", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="items.length"></div>';

    const state = Velin.bind(div, {
      items: [1, 2, 3],
    });

    const textDiv = div.querySelector("div");
    expect(textDiv?.textContent).toBe("3");

    state.items.push(4);
    expect(textDiv?.textContent).toBe("4");
  });

  it("should trigger reactivity on splice()", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="items.length"></div>';

    const state = Velin.bind(div, {
      items: [1, 2, 3, 4],
    });

    const textDiv = div.querySelector("div");
    expect(textDiv?.textContent).toBe("4");

    state.items.splice(1, 1);
    expect(textDiv?.textContent).toBe("3");
  });

  it("should trigger reactivity on pop()", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-text="items.length"></div>';

    const state = Velin.bind(div, {
      items: [1, 2, 3],
    });

    const textDiv = div.querySelector("div");
    expect(textDiv?.textContent).toBe("3");

    state.items.pop();
    expect(textDiv?.textContent).toBe("2");
  });

  it("should update vln-loop on push()", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-loop:item="items" vln-text="item"></div>';

    const state = Velin.bind(div, {
      items: [1, 2, 3],
    });

    expect(div.querySelectorAll("div").length).toBe(3);

    state.items.push(4);
    expect(div.querySelectorAll("div").length).toBe(4);
  });

  it("should update vln-loop on splice()", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div vln-loop:item="items" vln-text="item"></div>';

    const state = Velin.bind(div, {
      items: [1, 2, 3, 4],
    });

    expect(div.querySelectorAll("div").length).toBe(4);

    state.items.splice(1, 1);
    expect(div.querySelectorAll("div").length).toBe(3);
  });
});
