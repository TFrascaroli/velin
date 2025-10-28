// import Velin from '../../src/velin-core';
import { describe, it, expect, vitest, beforeEach } from "vitest";
import Velin from "../../src/velin-all";

describe("Velin Public API", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
  });

  it("registerPlugin should store plugin and allow it to run", () => {
    const mock = { name: "testplugin", render: vitest.fn() };
    Velin.plugins.registerPlugin(mock);
    node.setAttribute("vln-testplugin", "true");
    Velin.bind(node, {});
    Velin.processNode(node, Velin.ø__internal.boundState.root!);
    expect(mock.render).toHaveBeenCalled();
  });
});

// describe('Velin ø__internal', () => {
//   it('states should store and retrieve state objects', () => {
//     const el = document.createElement('div');
//     Velin.ø__internal.pluginStates.set(el, { test: 123 });
//     expect(Velin.ø__internal.pluginStates.get(el)).toEqual({ test: 123 });
//   });

//   it('consumeAttribute should remove attribute and return its value', () => {
//     const el = document.createElement('div');
//     el.setAttribute('data-x', '1+2');
//     Velin.ø__internal.consumeAttribute(el, 'data-x', '1+2');
//     expect(el.getAttribute('reflect-data-x')).toBe('1+2');
//     expect(el.hasAttribute('data-x')).toBe(false);
//   });

// it('bound should be a defined object', () => {
//   expect(typeof Velin.ø__internal.boundState.root).toBe('object');
// });
// });
