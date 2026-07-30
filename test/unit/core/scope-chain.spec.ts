import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
 * Two angles here: (1) low-level primitive (compose + interpolation.transform)
 * proves the machinery itself is correct; (2) end-user pattern via the OLD
 * `vln-loop:x` + `vln-var:x` fragment API reproduces the historical shadow
 * bug and confirms it's gone.
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

describe("Scope chain: vln-loop + vln-var: same-name shadow (historical bug)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) document.body.removeChild(container);
  });

  it("vln-var:user='user' under vln-loop:user='users' renders correctly (no recursion)", () => {
    // Historical bug: fragment plugin creates a child scope with `user` as
    // an EXPR interpolation whose expression is the string 'user'. Under
    // the loop scope (which also defines `user`), the child's `user`
    // interp evaluates its expression, hits the child's own `user` interp,
    // recurses. The pre-refactor test in fragments.spec.ts was `.skip`ped
    // for exactly this reason.
    container.innerHTML = `
      <template id="userCard" vln-vars="user">
        <div class="card" vln-text="user.name"></div>
      </template>
      <div vln-loop:user="users">
        <div vln-fragment="'userCard'" vln-var:user="user"></div>
      </div>
    `;
    Velin.bind(container, {
      users: [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }],
    });

    const cards = container.querySelectorAll(".card");
    expect(cards).toHaveLength(3);
    expect(Array.from(cards).map((c) => c.textContent)).toEqual([
      "Alice",
      "Bob",
      "Charlie",
    ]);
  });
});
