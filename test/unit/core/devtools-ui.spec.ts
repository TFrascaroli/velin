import { describe, it, expect, beforeAll } from "vitest";
import Velin from "../../../src/velin-core";
import setupVelinStd from "../../../src/velin-standard";
import "../../../src/velin-devtools.js";

setupVelinStd(Velin);

// Smoke tests for the drawer: every surface and every drill-down must render
// without throwing. These click through the real shadow DOM.

const hook = (): any => (window as any).__VELIN_DEVTOOLS_HOOK__;
const companion = (): any => (window as any).__VELIN_DEVTOOLS_COMPANION__;
const shadow = (): ShadowRoot =>
  [...document.documentElement.children].find((c: any) => c.shadowRoot && c.shadowRoot.querySelector(".drawer"))!.shadowRoot!;
const bodyText = () => (shadow().querySelector(".body") as HTMLElement).textContent || "";
const click = (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  (el as HTMLElement).click();
};
const byText = (sel: string, text: string) =>
  [...shadow().querySelectorAll(sel)].find((n) => (n.textContent || "").includes(text));

function longTaskFrom(fn: () => void) {
  const t0 = performance.now();
  fn();
  const t1 = performance.now();
  hook().ø__emitSignal({
    kind: "long-task",
    severity: "warn",
    payload: { durationMs: t1 - t0 + 50, startTime: t0, window: hook().explainWindow(t0, t1 + 50, { live: false }) },
    dismissKey: `long-task:${t0}`,
  });
}

describe("Devtools drawer — smoke", () => {
  let div: HTMLElement;
  beforeAll(() => {
    div = document.createElement("div");
    div.innerHTML = '<button vln-on:click="load()">go</button><b vln-loop:t="items"><i vln-text="t"></i></b>';
    document.body.appendChild(div);
    Velin.bind(div, { items: [] as number[], load() { for (let i = 0; i < 5; i++) this.items.push(i); } });
  });

  it("renders every rail surface", () => {
    for (const s of ["inspect", "record", "leaks", "signals", "query"]) {
      companion().open(s);
      expect(bodyText().length, s).toBeGreaterThan(0);
    }
  });

  it("long-task detail → handler, writes, batch advice → cascade → explain", () => {
    hook().ø__resetAggregators();
    longTaskFrom(() => div.querySelector("button")!.dispatchEvent(new Event("click")));
    companion().open("signals");
    click(byText(".sig-item", "long-task"));
    const text = bodyText();
    expect(text).toContain("load()");
    expect(text).toContain("items");
    expect(text).toContain("/write");
    // Handlers are batched, so a write loop inside one has nothing to batch
    // away: no advice.
    expect(text).not.toContain("re-ran after each write");

    click(byText("button", "tree"));
    expect(bodyText()).toContain("Cascade");

    click(shadow().querySelector("tr.clickable"));
    expect(bodyText()).toContain("recent runs");
  });

  it("explainer-style signal details render (thrash, warn)", () => {
    hook().ø__emitSignal({ kind: "thrash", severity: "warn", payload: { path: "root.x", count: 33 }, dismissKey: "thrash:test" });
    hook().ø__emitSignal({ kind: "warn", severity: "info", payload: { code: "W-UI", message: "hello" }, dismissKey: "warn:ui" });
    for (const kind of ["thrash", "W-UI"]) {
      companion().open("signals");
      click(byText(".sig-item", kind));
      expect(bodyText()).toContain("What to do");
    }
  });

  it("re-selecting the active surface pops back to its root frame", () => {
    companion().open("signals");
    click(shadow().querySelector(".sig-item"));
    expect(shadow().querySelectorAll(".crumb").length).toBeGreaterThan(1);
    companion().open("signals");
    expect(shadow().querySelectorAll(".crumb").length).toBe(1);
    expect(shadow().querySelector(".sig-list")).toBeTruthy();
  });

  it("a long task with no Velin work says so", () => {
    hook().ø__resetAggregators();
    longTaskFrom(() => { /* nothing reactive */ });
    companion().open("signals");
    const rows = [...shadow().querySelectorAll(".sig-item")].filter((n) => (n.textContent || "").includes("no Velin work"));
    click(rows[0]);
    expect(bodyText()).toContain("No Velin handler ran");
  });
});
