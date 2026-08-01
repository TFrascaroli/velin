import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

/**
 * Coverage for the usability polish added on top of the templates rewrite:
 *   - vln-template evaluates its value as JS (bare id → undefined → error)
 *   - vln-fragment surfaces "did you forget quotes?" on undefined id
 *   - vln-fragment refuses void-element hosts
 *   - vln-fragment missing-vars message includes provider-type hint when the
 *     provider evaluates to a non-object
 *   - vln-var:* deprecation plugin errors instead of silently no-op'ing
 *   - Velin.debug.templates() returns a snapshot of live registrations
 *   - Duplicate registration flips to last-wins with a `replacing` warning
 */
describe("Templates: usability polish", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) document.body.removeChild(container);
  });

  it("vln-template with unquoted id (undefined lookup) errors with quote hint", () => {
    container.innerHTML = `
      <template vln-template="myCard" vln-vars="['x']">
        <span vln-text="x"></span>
      </template>
      <div vln-fragment="'myCard'" vln-vars="{ x: 1 }"></div>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("evaluated to undefined")
    );
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Did you forget quotes"));
    errSpy.mockRestore();
  });

  it("vln-template evaluated from a state expression resolving to a string", () => {
    container.innerHTML = `
      <template vln-template="tplId" vln-vars="['x']">
        <span class="v" vln-text="x"></span>
      </template>
      <div vln-fragment="tplId" vln-vars="{ x: 42 }"></div>
    `;
    Velin.bind(container, { tplId: "computed-id" });
    expect(container.querySelector(".v")?.textContent).toBe("42");
  });

  it("vln-fragment with unquoted id (undefined lookup) errors with quote hint", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['x']"><span vln-text="x"></span></template>
      <div vln-fragment="card" vln-vars="{ x: 1 }"></div>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("evaluated to undefined"));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Did you forget quotes"));
    errSpy.mockRestore();
  });

  it("vln-fragment on a void element (<img>) errors clearly", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['x']"><span vln-text="x"></span></template>
      <img vln-fragment="'card'" vln-vars="{ x: 1 }" />
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("void elements cannot hold children")
    );
    errSpy.mockRestore();
  });

  it("missing-vars error hints at spread when provider is a non-object", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['name']"><span vln-text="name"></span></template>
      <div vln-fragment="'card'" vln-vars="notAnObject"></div>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, { notAnObject: "hello" });
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("evaluated to string")
    );
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("did you mean `{...notAnObject}`")
    );
    errSpy.mockRestore();
  });

  it("missing-vars error hints at null-provider case", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['name']"><span vln-text="name"></span></template>
      <div vln-fragment="'card'" vln-vars="nothing"></div>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, { nothing: null });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("evaluated to null"));
    errSpy.mockRestore();
  });

  it("vln-var:* deprecation plugin errors instead of silently doing nothing", () => {
    container.innerHTML = `
      <template vln-template="'card'" vln-vars="['name']"><span vln-text="name"></span></template>
      <div vln-fragment="'card'" vln-var:name="'Alice'"></div>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("vln-var:name was removed"));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("vln-vars=\"{...}\""));
    errSpy.mockRestore();
  });

  it("Velin.debug.templates() returns live registrations only", () => {
    container.innerHTML = `
      <template vln-template="'debug-a'" vln-vars="['x']"><span></span></template>
      <template vln-template="'debug-b'"><span></span></template>
    `;
    Velin.bind(container, {});
    const debug = (Velin as any).debug;
    expect(typeof debug?.templates).toBe("function");
    const list = debug.templates();
    const ids = list.map((e: any) => e.id);
    expect(ids).toContain("debug-a");
    expect(ids).toContain("debug-b");
    for (const entry of list) {
      expect(entry).toHaveProperty("connected");
    }
  });

  it("last-wins duplicate policy: later template's body renders", () => {
    container.innerHTML = `
      <template vln-template="'dup-check'" vln-vars="['x']">
        <span class="v" vln-text="'first:' + x"></span>
      </template>
      <template vln-template="'dup-check'" vln-vars="['x']">
        <span class="v" vln-text="'second:' + x"></span>
      </template>
      <div vln-fragment="'dup-check'" vln-vars="{ x: 'hi' }"></div>
    `;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(container.querySelector(".v")?.textContent).toBe("second:hi");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("already registered — replacing")
    );
    warnSpy.mockRestore();
  });
});
