// import Velin from '../../src/velin-core';
import { describe, it, expect, vi, vitest, beforeEach, afterEach } from "vitest";
import Velin from "../../../src/velin-all";

describe("Velin Public API", () => {
  let node: HTMLElement;
  beforeEach(() => {
    node = document.createElement("div");
  });

  it("registerPlugin should store plugin and allow it to run", () => {
    const mock = { name: "testplugin", render: vitest.fn() };
    Velin.plugins.registerPlugin(mock);
    node.setAttribute("vln-testplugin", "true");
    const state = Velin.bind(node, {});
    Velin.processNode(node, Velin.ø__internal.getWrapper(state)!);
    expect(mock.render).toHaveBeenCalled();
  });

  it("should log a helpful error for unknown plugins", () => {
    node.setAttribute("vln-unknown-plugin", "true");
    Velin.plugins.registerPlugin({ name: "known1", render: () => {} });
    Velin.plugins.registerPlugin({ name: "known2", render: () => {} });

    const state = Velin.bind(document.createElement("div"), {});
    const rootState = Velin.ø__internal.getWrapper(state)!;

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Unknown plugin throws inside its synthetic render, caught by the error
    // boundary: logged, treated as halt, no propagation.
    expect(() => Velin.processNode(node, rootState)).not.toThrow();
    const messages = errSpy.mock.calls.map((c) => String(c[1]?.message ?? c[1] ?? ""));
    expect(messages.some((m) => /Available plugins:.*known1, known2/.test(m))).toBe(true);
    errSpy.mockRestore();
  });
});

describe("Velin plugin render error boundary", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("catches render throws, logs them, and halts the subtree", () => {
    const boomRender = vitest.fn(() => {
      throw new Error("kaboom");
    });
    const childRender = vitest.fn();
    Velin.plugins.registerPlugin({ name: "boomplugin", render: boomRender });
    Velin.plugins.registerPlugin({ name: "childplugin", render: childRender });

    const root = document.createElement("div");
    root.innerHTML = `
      <div vln-boomplugin="true">
        <span vln-childplugin="true"></span>
      </div>
    `;

    expect(() => Velin.bind(root, {})).not.toThrow();
    expect(boomRender).toHaveBeenCalledTimes(1);
    // Subtree should be halted — the child plugin under the throwing node
    // must not have rendered.
    expect(childRender).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    const messages = errSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("boomplugin"))).toBe(true);
  });

  it("continues processing sibling nodes after a render throw", () => {
    Velin.plugins.registerPlugin({
      name: "throwplugin",
      render: () => {
        throw new Error("nope");
      },
    });
    const siblingRender = vitest.fn();
    Velin.plugins.registerPlugin({ name: "siblingplugin", render: siblingRender });

    const root = document.createElement("div");
    root.innerHTML = `
      <div vln-throwplugin="true"></div>
      <div vln-siblingplugin="true"></div>
    `;

    expect(() => Velin.bind(root, {})).not.toThrow();
    expect(siblingRender).toHaveBeenCalled();
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
//   expect(typeof Velin.ø__internal.getWrapper(state)).toBe('object');
// });
// });
