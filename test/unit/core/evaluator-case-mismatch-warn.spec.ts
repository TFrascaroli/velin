import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Velin from "../../../src/velin-all";

/**
 * The evaluator warns when an expression references an identifier that
 * resolves to `undefined` but whose lowercased variant DOES resolve. Common
 * trigger: HTML lowercases attribute names, so `vln-loop:userItem="…"`
 * silently binds as `useritem` — any `userItem` reference inside the loop
 * would otherwise fail with an unrelated `undefined.name` crash.
 */
describe("Evaluator: case-mismatch warning", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) document.body.removeChild(container);
  });

  it("warns when a camelCase lookup misses but the lowercased name resolves", () => {
    // vln-loop:userItem is lowercased to vln-loop:useritem by the HTML
    // parser. Reading `userItem.name` inside the loop misses; the check
    // detects that `useritem` DOES resolve and warns with the fix.
    container.innerHTML = `
      <div vln-loop:useritem="items">
        <span vln-text="userItem.name"></span>
      </div>
    `;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The natural undefined.name crash surfaces as a plugin-render error;
    // we don't care about the crash here, just that the warning fired first.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      Velin.bind(container, { items: [{ name: "Alice" }] });
    } catch { /* natural error is expected — the warning is what we're testing */ }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("'userItem' not found")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Did you mean 'useritem'")
    );

    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("does not warn when both the exact and lowercased versions are absent", () => {
    // `Foo` doesn't exist and neither does `foo` — no warning to emit.
    container.innerHTML = `<div><span vln-text="Foo && Foo.name"></span></div>`;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Velin.bind(container, { bar: 1 });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Did you mean")
    );

    warnSpy.mockRestore();
  });
});
