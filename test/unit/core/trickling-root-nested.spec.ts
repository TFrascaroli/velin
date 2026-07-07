import { describe, it, expect, beforeEach } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";

describe("Trickling root in nested loops", () => {
  beforeEach(() => {
    Velin.ø__updateCounter = 0;
    setupVelinStd(Velin);
  });

  it("should not register cell effects above the outer loop's trickling root", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <table>
        <tbody>
          <tr vln-loop:row="rows">
            <td vln-loop:col="cols" vln-text="row[col]"></td>
          </tr>
        </tbody>
      </table>
    `;

    const state = Velin.bind(root, {
      rows: [
        { a: 1, b: 2, c: 3 },
        { a: 4, b: 5, c: 6 },
      ],
      cols: ["a", "b", "c"],
    });

    const wrapper = (Velin as any).ø__internal.getWrapper(state);
    const bindings: Map<string, Set<any>> = wrapper.bindings;

    const rowsKey = "root.rows";
    const colsKey = "root.cols";
    const rowsEffects = bindings.get(rowsKey)?.size ?? 0;
    const colsEffects = bindings.get(colsKey)?.size ?? 0;

    // Print everything that touches rows / cols at the array level for diagnostics
    // eslint-disable-next-line no-console
    console.log(
      "rowsEffects=",
      rowsEffects,
      "colsEffects=",
      colsEffects,
      "allArrayLevelKeys=",
      Array.from(bindings.keys()).filter((k) =>
        k === "root.rows" || k === "root.cols",
      ),
    );

    // Expected: only the row-loop tracker registers on root.rows (=1).
    // If nested loops lose the outer trickling root, every cell registers an
    // effect on root.rows (2 rows * 3 cols = 6, plus the row loop = 7).
    expect(rowsEffects).toBe(1);
  });
});
