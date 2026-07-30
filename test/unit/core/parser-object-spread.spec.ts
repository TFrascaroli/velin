import { describe, it, expect } from "vitest";
import Velin from "../../../src/velin-all";

/**
 * Coverage for object spread `{...x}` in Velin's CSP-safe expression parser.
 * The parser tokenises `...` as a single PUNCTUATION and accepts spread
 * properties inside object literals; evalObjectLiteral copies own enumerable
 * props from the spread argument into the accumulator.
 */
describe("Parser: object spread", () => {
  function evalIn<T = any>(state: Record<string, any>, expr: string): T {
    const stateProxy = Velin.bind(document.createElement("div"), state);
    const rs = Velin.ø__internal.getWrapper(stateProxy)!;
    return Velin.evaluate(rs, expr);
  }

  it("spreads a plain object into a literal", () => {
    expect(evalIn({ a: { x: 1, y: 2 } }, "{ ...a }")).toEqual({ x: 1, y: 2 });
  });

  it("mixes spread with explicit keys — later entries override", () => {
    expect(
      evalIn({ defaults: { role: "guest", theme: "light" } }, "{ ...defaults, role: 'admin' }")
    ).toEqual({ role: "admin", theme: "light" });
  });

  it("multiple spreads compose in order", () => {
    expect(
      evalIn({ a: { x: 1 }, b: { y: 2, x: 99 } }, "{ ...a, ...b }")
    ).toEqual({ x: 99, y: 2 });
  });

  it("nullish spread argument is a no-op (no throw)", () => {
    expect(evalIn({ nada: null }, "{ ...nada, ok: 1 }")).toEqual({ ok: 1 });
  });
});
