import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

/**
 * `vln-template` evaluates the sibling `vln-vars` declaration in the scope
 * where the template physically lives — not the consumer's scope — because
 * registration happens at the template's own render, not at the fragment's.
 * That lets a declaration reference state-level identifiers even when a
 * consumer sits inside a substate that would shadow them.
 *
 * These tests exercise the "template scope wins" guarantee and the ordering
 * contract (templates must appear before their consumers in the DOM).
 */
describe("Templates: registration-scope semantics", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) document.body.removeChild(container);
  });

  it("transformer resolves in template's registration scope, not the consumer's (loop shadow)", () => {
    // Loop iteration variable `fmt` shadows the root's `fmt` inside the
    // consumer. The template's declaration `{ x: fmt }` is evaluated at
    // vln-template's own render — which is at root — so `fmt` resolves to
    // the actual transformer function, not a per-iteration string.
    container.innerHTML = `
      <template vln-template="tOwn" vln-vars="{ x: fmt }">
        <span class="v" vln-text="x"></span>
      </template>
      <div vln-loop:fmt="labels">
        <div vln-fragment="'tOwn'" vln-vars="{ x: raw }"></div>
      </div>
    `;
    Velin.bind(container, {
      raw: "hi",
      labels: ["first", "second"],
      fmt: (v: string) => v.toUpperCase(),
    });

    const values = Array.from(container.querySelectorAll(".v")).map(v => v.textContent);
    expect(values).toEqual(["HI", "HI"]);
  });

  it("declaration can be a state-level constant (array form)", () => {
    container.innerHTML = `
      <template vln-template="tConstArr" vln-vars="requiredVars">
        <span class="v" vln-text="user"></span>
      </template>
      <div vln-fragment="'tConstArr'" vln-vars="{ user: name }"></div>
    `;
    Velin.bind(container, {
      requiredVars: ["user"],
      name: "Alice",
    });

    expect(container.querySelector(".v")?.textContent).toBe("Alice");
  });

  it("declaration can be a state-level constant (object of transformers)", () => {
    container.innerHTML = `
      <template vln-template="tConstObj" vln-vars="modalVars">
        <span class="v" vln-text="user"></span>
      </template>
      <div vln-fragment="'tConstObj'" vln-vars="{ user: rawUser }"></div>
    `;
    Velin.bind(container, {
      modalVars: { user: (u: { name: string } | null) => u ? u.name : "anon" },
      rawUser: { name: "Alice" },
    });

    expect(container.querySelector(".v")?.textContent).toBe("Alice");
  });

  it("missing-var validation still runs when declaration is a state-level constant", () => {
    container.innerHTML = `
      <template vln-template="tConstReq" vln-vars="requiredVars">
        <div class="card"><span vln-text="user"></span></div>
      </template>
      <div vln-fragment="'tConstReq'" vln-vars="{ notUser: 'x' }"></div>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, { requiredVars: ["user"] });

    expect(container.querySelector(".card")).toBeFalsy();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("requires missing variables"));
    errSpy.mockRestore();
  });

  it("consumer that runs before its template's registration errors loudly", () => {
    // Consumer is FIRST in the DOM — its vln-fragment plugin fires before
    // the template's vln-template plugin can register. This is the order
    // contract violation; the plugin should refuse to render and print a
    // "not registered" hint pointing at the fix.
    container.innerHTML = `
      <div vln-fragment="'tOrder'" vln-vars="{ x: 1 }"></div>
      <template vln-template="tOrder" vln-vars="['x']">
        <span class="v" vln-text="x"></span>
      </template>
    `;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(container.querySelector(".v")).toBeFalsy();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Template "tOrder" is not registered')
    );
    errSpy.mockRestore();
  });

  it("duplicate registration on a still-connected node warns; first wins", () => {
    container.innerHTML = `
      <template vln-template="tDup" vln-vars="['x']">
        <span class="v" vln-text="'first:' + x"></span>
      </template>
      <template vln-template="tDup" vln-vars="['x']">
        <span class="v" vln-text="'second:' + x"></span>
      </template>
      <div vln-fragment="'tDup'" vln-vars="{ x: 'hello' }"></div>
    `;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Velin.bind(container, {});

    expect(container.querySelector(".v")?.textContent).toBe("first:hello");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate vln-template="tDup"')
    );
    warnSpy.mockRestore();
  });
});
