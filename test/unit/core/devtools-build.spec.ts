import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const DIST = path.resolve(__dirname, "../../../dist/build");

const coreArtifacts = [
  "velin-core.min.js",
  "velin-all.min.js",
  "velin-events.min.js",
  "velin-router.min.js",
  "velin-standard.min.js",
  "velin-templates-and-fragments.min.js",
];

describe("Devtools build hygiene", () => {
  it.each(coreArtifacts)("%s must not leak devtools bytes", (f) => {
    const p = path.join(DIST, f);
    if (!fs.existsSync(p)) return; // dist may not be built in CI-lite
    const c = fs.readFileSync(p, "utf8");
    expect(c).not.toContain("__VELIN_DEVTOOLS_HOOK__");
    expect(c).not.toContain("ø__devtools");
    expect(c).not.toContain("velin-devhook");
  });

  it("velin-devtools.min.js exists and references the hook", () => {
    const p = path.join(DIST, "velin-devtools.min.js");
    if (!fs.existsSync(p)) return;
    const c = fs.readFileSync(p, "utf8");
    expect(c).toContain("__VELIN_DEVTOOLS_HOOK__");
  });
});
