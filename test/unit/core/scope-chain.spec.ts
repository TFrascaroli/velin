import { describe, it, expect } from "vitest";
import Velin from "../../../src/velin-all";

/**
 * Coverage for the prototypal-chain scope model in composeState.
 *
 * Each composed scope holds ONLY its own interpolations plus a per-scope
 * state Proxy that closes over its enclosing scope. Lookups walk the chain
 * on miss; interpolation expressions evaluate in the ENCLOSING scope, so an
 * expression that shares an identifier name with the interpolation itself
 * resolves via JS-closure semantics instead of self-shadow recursion.
 *
 * Higher-level shadow-safety coverage via the vln-vars fragment API is in
 * test/unit/templates/fragments-reactivity.spec.ts.
 */
describe("Scope chain: low-level composeState", () => {
  // Small helper — Velin doesn't expose `setupState` publicly; `bind` on a
  // detached element produces a fully-initialised root reactive state.
  function makeRoot<T extends object>(obj: T) {
    const stateProxy = Velin.bind(document.createElement("div"), obj);
    return Velin.ø__internal.getWrapper(stateProxy)!;
  }

  it("interpolation expression resolves in enclosing scope, not the composed scope (no shadow recursion)", () => {
    // Root state has `user = 'Alice'`. Compose a child scope that adds
    // `user` as an EXPR interpolation whose expression IS the identifier
    // `user`. Under the old flat-merge model, reading `user` in the child
    // scope would hit the child's own `user` interp and recurse forever.
    // Under the prototypal-chain model the expression evaluates in the
    // enclosing (root) scope, so `user` resolves to the root's value.
    const root = makeRoot({ user: "Alice" });
    const child = Velin.composeState(root, {
      user: { expr: "user" },
    });

    expect(child.state.user).toBe("Alice");
    (root.state as any).user = "Bob";
    expect(child.state.user).toBe("Bob");
  });

  it("interpolation.transform is applied to the evaluated value", () => {
    // Attach a `transform` fn to an EXPR interpolation. Reading through
    // the scope proxy should return transform(evaluatedValue).
    const root = makeRoot({ n: 3 });
    const child = Velin.composeState(root, {
      doubled: { expr: "n", transform: (v: number) => v * 2 },
    });

    expect(child.state.doubled).toBe(6);
    (root.state as any).n = 5;
    expect(child.state.doubled).toBe(10);
  });
});
