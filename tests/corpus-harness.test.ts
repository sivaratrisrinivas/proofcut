import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";

interface ManifestItem {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  bleedWidthIn: number;
  cutlinePresent: boolean;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
}

const CORPUS_DIR = join(import.meta.dir, "..", "corpus");

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

describe("corpus harness (die-cut)", () => {
  test("60-file corpus meets accuracy bar", async () => {
    const manifestFile = Bun.file(join(CORPUS_DIR, "manifest.json"));
    expect(await manifestFile.exists()).toBe(true);
    const items = (await manifestFile.json()) as ManifestItem[];
    expect(items.length).toBe(60);

    let correct = 0;
    let holds = 0;
    const latencies: number[] = [];

    for (const it of items) {
      const t0 = performance.now();
      const r = await preflightFile(
        join(CORPUS_DIR, it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      latencies.push(performance.now() - t0);

      if (r.verdict === "SOFT-FAIL") holds++;

      if (r.verdict === it.expectedVerdict) {
        // expected fail codes must all be present (allow extras like dims-mismatch? none expected)
        const covers = it.expectedFails.every((f) => r.fails.includes(f));
        if (covers) correct++;
      }

      // measurements within 2% of synthetic ground truth
      const ppiErr = Math.abs(r.measurements.ppi - it.targetPpi) / it.targetPpi;
      expect(ppiErr).toBeLessThanOrEqual(0.02);
      expect(r.measurements.bleedWidthIn).toBeCloseTo(it.bleedWidthIn, 9);
      expect(r.measurements.cutlinePresent).toBe(it.cutlinePresent);
    }

    const accuracy = correct / items.length;
    const holdRate = holds / items.length;
    latencies.sort((a, b) => a - b);
    const p95 = percentile(latencies, 95);

    console.log(
      `accuracy=${(accuracy * 100).toFixed(1)}% hold=${(holdRate * 100).toFixed(1)}% p95=${p95.toFixed(1)}ms`,
    );

    expect(accuracy).toBeGreaterThanOrEqual(0.9);
    expect(holdRate).toBeLessThan(0.4);
    expect(p95).toBeLessThan(30_000);
  }, 120_000);
});
