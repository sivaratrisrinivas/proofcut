import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  countPureBlackPixels,
  decodePng,
  hasTransparency,
  measureWhiteEdgeDepth,
} from "../src/png";

interface L2Item {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  pixelWidth: number;
  pixelHeight: number;
  edgeDepthPx: number;
  bleedWidthIn: number;
  blackPixelCount: number;
  blackFraction: number;
  hasTransparency: boolean;
  transparentPixelCount: number;
  minTextPt: number | null;
  cutlinePresent: boolean;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
}

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");
const L1_DIR = join(import.meta.dir, "..", "corpus");

describe("l2 content corpus", () => {
  test("25 files agree with manifest ground truth within 2% through the 01 seam", async () => {
    const manifestFile = Bun.file(join(L2_DIR, "manifest.json"));
    expect(await manifestFile.exists()).toBe(true);
    const items = (await manifestFile.json()) as L2Item[];
    expect(items.length).toBe(25);

    for (const it of items) {
      const buf = Buffer.from(await Bun.file(join(L2_DIR, it.file)).arrayBuffer());
      const d = decodePng(buf);
      expect(d.width).toBe(it.pixelWidth);
      expect(d.height).toBe(it.pixelHeight);

      const edge = measureWhiteEdgeDepth(d);
      const edgeErr = Math.abs(edge - it.edgeDepthPx) / it.pixelHeight;
      expect(edgeErr).toBeLessThanOrEqual(0.02);

      const blacks = countPureBlackPixels(d);
      const blackErr = it.blackPixelCount > 0 ? Math.abs(blacks - it.blackPixelCount) / it.blackPixelCount : blacks === 0 ? 0 : 1;
      expect(blackErr).toBeLessThanOrEqual(0.02);

      expect(hasTransparency(d)).toBe(it.hasTransparency);

      // Manifest bleed follows the ticket-03 contract: margin eats required bleed.
      const bleed = Math.max(0, 0.125 - edge / it.targetPpi);
      expect(Math.abs(it.bleedWidthIn - bleed)).toBeLessThan(1e-9);

      // Sidecars carry ONLY cut-line + text height per the Q1 split.
      const sidecar = (await Bun.file(join(L2_DIR, `${it.file}.sidecar.json`)).json()) as Record<string, unknown>;
      expect(Object.keys(sidecar).sort()).toEqual(
        it.minTextPt === null ? ["cutlinePresent"] : ["cutlinePresent", "minTextPt"],
      );
      expect(sidecar["cutlinePresent"]).toBe(it.cutlinePresent);
      if (it.minTextPt !== null) expect(sidecar["minTextPt"]).toBe(it.minTextPt);
    }
  }, 60_000);

  test("L1 corpus untouched (still 60 files, same names on disk)", async () => {
    const manifest = (await Bun.file(join(L1_DIR, "manifest.json")).json()) as { file: string }[];
    expect(manifest.length).toBe(60);
    const onDisk = (await readdir(L1_DIR)).filter((f) => f.endsWith(".png")).sort();
    expect(onDisk).toEqual(manifest.map((it) => it.file).sort());
  });
});
