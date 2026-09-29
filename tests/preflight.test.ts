import { describe, expect, test } from "bun:test";
import { preflight } from "../src/preflight";
import { getSpec } from "../src/specs";

const diecut = () => getSpec("die-cut");
const okExtras = { bleedWidthIn: 0.125, cutlinePresent: true };

describe("preflight core thresholds (die-cut)", () => {
  test("clean 300dpi passes", () => {
    const r = preflight(900, 900, { widthIn: 3, heightIn: 3 }, okExtras, diecut());
    expect(r.pass).toBe(true);
    expect(r.verdict).toBe("PASS");
    expect(r.fails).toEqual([]);
    expect(r.measurements.ppi).toBeCloseTo(300, 5);
  });

  test("72dpi upscale fails soft on low-ppi", () => {
    const r = preflight(216, 216, { widthIn: 3, heightIn: 3 }, okExtras, diecut());
    expect(r.pass).toBe(false);
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("low-ppi");
  });

  test("under 200 fails, 200-299 warns, 300+ passes", () => {
    const below = preflight(199 * 3, 199 * 3, { widthIn: 3, heightIn: 3 }, okExtras, diecut());
    expect(below.fails).toContain("low-ppi");

    const warn = preflight(250 * 2, 250 * 2, { widthIn: 2, heightIn: 2 }, okExtras, diecut());
    expect(warn.pass).toBe(true);
    expect(warn.warnings).toContain("low-ppi-warn");

    const pass = preflight(300 * 2, 300 * 2, { widthIn: 2, heightIn: 2 }, okExtras, diecut());
    expect(pass.pass).toBe(true);
    expect(pass.warnings).toEqual([]);
  });

  test("missing bleed fails soft", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { bleedWidthIn: 0.05, cutlinePresent: true }, diecut(),
    );
    expect(r.pass).toBe(false);
    expect(r.fails).toContain("bleed");
  });

  test("missing cutline fails soft on die-cut", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { bleedWidthIn: 0.125, cutlinePresent: false }, diecut(),
    );
    expect(r.pass).toBe(false);
    expect(r.fails).toContain("cutline");
  });

  test("50dpi adversarial never passes", () => {
    const r = preflight(150, 150, { widthIn: 3, heightIn: 3 }, okExtras, diecut());
    expect(r.pass).toBe(false);
    expect(r.fails).toContain("low-ppi");
  });

  test("dims mismatch fails", () => {
    const r = preflight(900, 300, { widthIn: 3, heightIn: 3 }, okExtras, diecut());
    expect(r.fails).toContain("dims-mismatch");
  });
});

describe("preflight extensions (clear + text + color)", () => {
  const clear = () => getSpec("clear");
  const holo = () => getSpec("holographic");
  const diecut = () => getSpec("die-cut");
  const okExtras = { bleedWidthIn: 0.125, cutlinePresent: true };

  test("missing white ink on clear returns soft-fail", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, whiteInkPresent: false }, clear(),
    );
    expect(r.pass).toBe(false);
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("white-ink");
  });

  test("missing white ink on holo returns soft-fail", () => {
    const r = preflight(
      1240, 1240, { widthIn: 4, heightIn: 4 },
      { ...okExtras, whiteInkPresent: false }, holo(),
    );
    expect(r.fails).toContain("white-ink");
  });

  test("white ink present on clear passes", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, whiteInkPresent: true }, clear(),
    );
    expect(r.pass).toBe(true);
    expect(r.fails).toEqual([]);
  });

  test("die-cut ignores missing white ink", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, whiteInkPresent: false }, diecut(),
    );
    expect(r.pass).toBe(true);
  });

  test("text under 6pt returns soft-fail, 6pt passes", () => {
    const small = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, minTextPt: 4.5 }, clear(),
    );
    expect(small.fails).toContain("tiny-text");

    const atSix = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, minTextPt: 6 }, clear(),
    );
    expect(atSix.fails).not.toContain("tiny-text");

    const none = preflight(900, 900, { widthIn: 3, heightIn: 3 }, { ...okExtras, minTextPt: null }, clear());
    expect(none.fails).not.toContain("tiny-text");
  });

  test("rgb black warns with auto-convert note, still passes", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, whiteInkPresent: true, colorMode: "RGB" }, clear(),
    );
    expect(r.pass).toBe(true);
    expect(r.fails).toEqual([]);
    expect(r.warnings.some((w) => /rgb-black/.test(w) && /auto-convert/.test(w))).toBe(true);
  });

  test("transparency warns with auto-convert note, still passes", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, whiteInkPresent: true, hasTransparency: true }, clear(),
    );
    expect(r.pass).toBe(true);
    expect(r.warnings.some((w) => /transparency/.test(w) && /auto-convert/.test(w))).toBe(true);
  });

  test("cmyk without transparency has no color warnings", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okExtras, whiteInkPresent: true, colorMode: "CMYK", hasTransparency: false }, clear(),
    );
    expect(r.warnings).toEqual([]);
  });
});
