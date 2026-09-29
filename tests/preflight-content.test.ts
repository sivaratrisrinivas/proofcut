import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { writePng } from "../src/png";
import { measurePngContent } from "../src/preflightContent";
import { preflightFile } from "../src/preflightFile";

function rgbCanvas(w: number, h: number, bg: [number, number, number]): Buffer {
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = bg[0];
    px[i * 3 + 1] = bg[1];
    px[i * 3 + 2] = bg[2];
  }
  return px;
}

function whiteMargin(px: Buffer, w: number, h: number, m: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < m || y >= h - m || x < m || x >= w - m) {
        const o = (y * w + x) * 3;
        px[o] = 255;
        px[o + 1] = 255;
        px[o + 2] = 255;
      }
    }
  }
}

describe("measurePngContent pixel facts", () => {
  test("reports dims, edge depth, black and transparency facts", () => {
    const px = rgbCanvas(100, 80, [30, 90, 160]);
    whiteMargin(px, 100, 80, 10);
    const f = measurePngContent(writePng(100, 80, 3, px));
    expect(f.pixelWidth).toBe(100);
    expect(f.pixelHeight).toBe(80);
    expect(f.edgeDepthPx).toBe(10);
    expect(f.blackPixelCount).toBe(0);
    expect(f.hasTransparency).toBe(false);
  });

  test("counts an exact black block", () => {
    const px = rgbCanvas(60, 60, [200, 200, 205]);
    for (let y = 10; y < 30; y++) {
      for (let x = 5; x < 25; x++) {
        const o = (y * 60 + x) * 3;
        px[o] = 0;
        px[o + 1] = 0;
        px[o + 2] = 0;
      }
    }
    const f = measurePngContent(writePng(60, 60, 3, px));
    expect(f.edgeDepthPx).toBe(0);
    expect(f.blackPixelCount).toBe(400);
    expect(f.blackFraction).toBeCloseTo(400 / 3600, 12);
  });

  test("detects alpha transparency on RGBA, opaque RGB has none", () => {
    const rgba = Buffer.alloc(20 * 20 * 4);
    for (let i = 0; i < 20 * 20; i++) {
      rgba[i * 4] = 40;
      rgba[i * 4 + 1] = 140;
      rgba[i * 4 + 2] = 90;
      rgba[i * 4 + 3] = 255;
    }
    rgba[3] = 0;
    const t = measurePngContent(writePng(20, 20, 4, rgba));
    expect(t.hasTransparency).toBe(true);

    const opaque = measurePngContent(writePng(20, 20, 3, rgbCanvas(20, 20, [40, 140, 90])));
    expect(opaque.hasTransparency).toBe(false);
  });
});

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");

interface L2Item {
  file: string;
  productId: string;
  kind?: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  bleedWidthIn: number;
  blackPixelCount: number;
  hasTransparency: boolean;
  minTextPt: number | null;
  cutlinePresent: boolean;
  whiteInkPresent?: boolean | null;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
}

describe("l2 content wiring", () => {
  test("preflight over L2 lands within 2% of manifest with source labels", async () => {
    const items = ((await Bun.file(join(L2_DIR, "manifest.json")).json()) as L2Item[]).filter(
      (it) => it.kind === "png",
    );
    expect(items.length).toBe(32);
    for (const it of items) {
      const r = await preflightFile(
        join(L2_DIR, it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      expect(r.verdict).toBe(it.expectedVerdict);
      expect(it.expectedFails.every((f) => r.fails.includes(f))).toBe(true);

      const ppiErr = Math.abs(r.measurements.ppi - it.targetPpi) / it.targetPpi;
      expect(ppiErr).toBeLessThanOrEqual(0.02);
      const bleedErr =
        it.bleedWidthIn > 0 ? Math.abs(r.measurements.bleedWidthIn - it.bleedWidthIn) / it.bleedWidthIn : r.measurements.bleedWidthIn;
      expect(bleedErr).toBeLessThanOrEqual(0.02);

      expect(r.sources?.bleed).toBe("content");
      expect(r.sources?.text).toBe("sidecar");
      expect(r.sources?.cutline).toBe("sidecar");
      expect(r.measurements.minTextPt).toBe(it.minTextPt);
      expect(r.measurements.cutlinePresent).toBe(it.cutlinePresent);
      expect(r.measurements.whiteInkPresent).toBe(it.whiteInkPresent ?? null);

      // RGB-black and transparency travel content -> verdict per row.
      expect(r.sources?.color).toBe("content");
      expect(r.sources?.transparency).toBe("content");
      expect(r.measurements.hasTransparency).toBe(it.hasTransparency);
      if (it.blackPixelCount > 0) {
        expect(r.measurements.colorMode).toBe("RGB");
        expect(r.warnings.some((w) => /rgb-black/.test(w))).toBe(true);
      } else {
        expect(r.measurements.colorMode).toBeNull();
      }
      if (it.hasTransparency) {
        expect(r.warnings.some((w) => /transparency/.test(w))).toBe(true);
      } else {
        expect(r.warnings.some((w) => /transparency/.test(w))).toBe(false);
      }
    }
  }, 60_000);

  test("L1 legacy sidecar bleed still wins over content (frozen gate)", async () => {
    const r = await preflightFile(
      join(import.meta.dir, "..", "corpus", "diecut-001.png"),
      { widthIn: 3, heightIn: 2 },
      "die-cut",
    );
    expect(r.sources?.bleed).toBe("sidecar");
    expect(r.measurements.bleedWidthIn).not.toBeCloseTo(0.125, 9);
  });
});
