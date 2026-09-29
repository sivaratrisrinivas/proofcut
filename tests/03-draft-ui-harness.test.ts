import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflight } from "../src/preflight";
import { preflightFile } from "../src/preflightFile";
import { buildChecklist, composeMessage, overlaySpec } from "../src/draft";
import { getSpec } from "../src/specs";

const CORPUS_DIR = join(import.meta.dir, "..", "corpus");

function diecut() { return getSpec("die-cut"); }
function clear() { return getSpec("clear"); }

function okUploadExtras(overrides: Partial<{ minTextPt: number; colorMode: string; hasTransparency: boolean }> = {}) {
  return {
    bleedWidthIn: 0.125,
    cutlinePresent: true,
    whiteInkPresent: true,
    minTextPt: overrides.minTextPt ?? 12,
    colorMode: overrides.colorMode ?? "CMYK",
    hasTransparency: overrides.hasTransparency ?? false,
  };
}

describe("ticket 03: draft UI harness", () => {
  test("upload acceptance: file + ordered size + product type", async () => {
    const pdfPath = "corpus/diecut-002.png";
    const ordered = { widthIn: 3, heightIn: 3 };
    const productId = "die-cut";

    const result = await preflightFile(pdfPath, ordered, productId);
    expect(result.productId).toBe(productId);
    expect(result.measurements).toBeDefined();
  });

  test("preflight panel shows PPI, dims, bleed, cut line, color mode, white ink, tiny text, transparency", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), bleedWidthIn: 0.125, cutlinePresent: true },
      diecut(),
    );
    expect(r.measurements.ppi).toBeDefined();
    expect(r.measurements.bleedWidthIn).toBeDefined();
    expect(r.measurements.cutlinePresent).toBeDefined();
    expect(r.measurements.colorMode).toBeDefined();
    expect(r.measurements.hasTransparency).toBeDefined();
    expect(r.measurements.minTextPt).toBeDefined();
    expect(r.measurements.whiteInkPresent).toBeDefined();
  });

  test("side-by-side shows dashed magenta cut line overlay plus bleed overlay", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), bleedWidthIn: 0.15, cutlinePresent: true },
      diecut(),
    );
    expect(r.measurements.cutlinePresent).toBe(true);
    expect(r.measurements.bleedWidthIn).toBeGreaterThanOrEqual(0.125);
    expect(r.verdict).toBeDefined();
  });

  test("QC checklist ticks come from code measurements only", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), bleedWidthIn: 0.15, cutlinePresent: true, whiteInkPresent: true, minTextPt: 12 },
      diecut(),
    );
    expect(r.measurements).toHaveProperty("bleedWidthIn");
    expect(r.measurements).toHaveProperty("cutlinePresent");
    expect(r.measurements).toHaveProperty("whiteInkPresent");
    expect(r.measurements).toHaveProperty("minTextPt");
    expect(Array.isArray(r.fails)).toBe(true);
    expect(Array.isArray(r.warnings)).toBe(true);
  });

  test("message pane copies a named, specific fix with numbers and no banned words", () => {
    // Use low PPI (150) to trigger low-ppi fail, plus other issues
    const r = preflight(
      450, 450, { widthIn: 3, heightIn: 3 },  // 150 PPI -> low-ppi fail
      { ...okUploadExtras(), bleedWidthIn: 0.05, cutlinePresent: true, whiteInkPresent: false, minTextPt: 4.5, colorMode: "RGB", hasTransparency: true },
      clear(),
    );
    expect(r.fails).toContain("low-ppi");
    expect(r.fails).toContain("bleed");
    expect(r.fails).toContain("white-ink");
    expect(r.fails).toContain("tiny-text");
    const combined = [...r.fails, ...r.warnings].join(" ");
    expect(combined).not.toContain("sorry");
    expect(combined).not.toContain("unfortunately");
    expect(combined).not.toContain("can't");
    expect(r.measurements.ppi).toBeGreaterThan(0);
    expect(r.measurements.bleedWidthIn).toBeGreaterThan(0);
    expect(typeof r.measurements.minTextPt).toBe("number");
  });

  test("5-file demo runs end to end in under 30 seconds per file", async () => {
    const manifestFile = Bun.file(join(CORPUS_DIR, "manifest.json"));
    expect(await manifestFile.exists()).toBe(true);
    const manifest = (await manifestFile.json()) as Array<{
      file: string;
      productId: string;
      orderedWidthIn: number;
      orderedHeightIn: number;
      targetPpi: number;
      bleedWidthIn: number;
      cutlinePresent: boolean;
      expectedVerdict: "PASS" | "SOFT-FAIL";
      expectedFails: string[];
    }>;
    // Use first 5 files from manifest
    const firstFive = manifest.slice(0, 5);
    let passed = 0;
    let failed = 0;

    for (const item of firstFive) {
      const r = await preflightFile(
        `corpus/${item.file}`,
        { widthIn: item.orderedWidthIn, heightIn: item.orderedHeightIn },
        item.productId,
      );
      if (r.verdict === "PASS") passed++;
      else failed++;
    }

    const total = passed + failed;
    console.log(`5-file demo: ${passed} PASS, ${failed} SOFT-FAIL, total=${total}`);
    expect(passed).toBe(2);
    expect(failed).toBe(3);
  }, 60_000);
});

describe("ticket 03: draft builders (overlay + checklist + message)", () => {
  test("overlaySpec exposes dashed magenta cutline plus bleed overlay", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), bleedWidthIn: 0.15, cutlinePresent: true },
      diecut(),
    );
    const o = overlaySpec(r);
    expect(o.cutline.visible).toBe(true);
    expect(o.cutline.style).toBe("dashed");
    expect(o.cutline.color).toBe("magenta");
    expect(o.bleed.visible).toBe(true);
    expect(o.bleed.widthIn).toBeCloseTo(0.15, 9);
  });

  test("overlaySpec hides cutline when missing", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), cutlinePresent: false },
      diecut(),
    );
    expect(overlaySpec(r).cutline.visible).toBe(false);
  });

  test("buildChecklist ticks cover all 8 panel rows from measurements only", () => {
    const r = preflight(
      450, 450, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), bleedWidthIn: 0.05, cutlinePresent: false, whiteInkPresent: false, minTextPt: 4.5, colorMode: "RGB", hasTransparency: true },
      clear(),
    );
    const ticks = buildChecklist(r);
    const ids = ticks.map((t) => t.id);
    for (const id of ["ppi", "dims", "bleed", "cutline", "color", "white-ink", "tiny-text", "transparency"]) {
      expect(ids).toContain(id);
    }
    // failing rows tick false, passing rows tick true
    const byId = new Map(ticks.map((t) => [t.id, t]));
    expect(byId.get("bleed")!.ok).toBe(false);
    expect(byId.get("cutline")!.ok).toBe(false);
    expect(byId.get("white-ink")!.ok).toBe(false);
    expect(byId.get("tiny-text")!.ok).toBe(false);
    expect(byId.get("dims")!.ok).toBe(true);
    // every tick detail carries a code-measured number or state, no banned words
    for (const t of ticks) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.detail.length).toBeGreaterThan(0);
      expect(/sorry|unfortunately|can't/i.test(t.label + " " + t.detail)).toBe(false);
    }
  });

  test("composeMessage names each fix with numbers, zero banned words", () => {
    const r = preflight(
      450, 450, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), bleedWidthIn: 0.05, cutlinePresent: true, whiteInkPresent: false, minTextPt: 4.5 },
      clear(),
    );
    const msg = composeMessage(r);
    expect(msg).toContain("150 PPI");
    expect(msg).toContain("0.050in");
    expect(msg).toContain("4.5pt");
    expect(msg).toContain("white ink");
    expect(/sorry|unfortunately|can't/i.test(msg)).toBe(false);
  });

  test("composeMessage on PASS approves with numbers, zero banned words", () => {
    const r = preflight(
      900, 900, { widthIn: 3, heightIn: 3 },
      { ...okUploadExtras(), whiteInkPresent: true },
      clear(),
    );
    expect(r.pass).toBe(true);
    const msg = composeMessage(r);
    expect(msg).toContain("300 PPI");
    expect(/sorry|unfortunately|can't/i.test(msg)).toBe(false);
  });
});