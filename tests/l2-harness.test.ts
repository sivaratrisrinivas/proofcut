import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");

interface L2Row {
  file: string;
  productId: string;
  kind: "png" | "pdf";
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  bleedWidthIn: number;
  blackPixelCount?: number;
  hasTransparency?: boolean | null;
  minTextPt?: number | null;
  cutlinePresent?: boolean;
  whiteInkPresent?: boolean | null;
  colorMode?: string | null;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
  expectedWarnings: string[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

describe("l2 harness gate (42 rows, content-measured)", () => {
  test("accuracy 90%+ with hold, p95, and 2% measurement lines", async () => {
    const items = (await Bun.file(join(L2_DIR, "manifest.json")).json()) as L2Row[];
    expect(items.length).toBe(42);

    let correct = 0;
    let holds = 0;
    let maxMeasErr = 0;
    const latencies: number[] = [];

    for (const it of items) {
      const t0 = performance.now();
      const r = await preflightFile(
        join(L2_DIR, it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      latencies.push(performance.now() - t0);

      if (r.verdict === "SOFT-FAIL") holds++;
      if (
        r.verdict === it.expectedVerdict &&
        it.expectedFails.every((f) => r.fails.includes(f)) &&
        it.expectedWarnings.every((w) => r.warnings.includes(w))
      ) {
        correct++;
      }

      // 2% measurement guard, both kinds (tracked for the report line).
      const ppiErr = Math.abs(r.measurements.ppi - it.targetPpi) / it.targetPpi;
      expect(ppiErr).toBeLessThanOrEqual(0.02);
      maxMeasErr = Math.max(maxMeasErr, ppiErr);
      if (it.kind === "pdf") {
        expect(r.measurements.bleedWidthIn).toBeCloseTo(it.bleedWidthIn, 9);
      } else {
        const bleedErr =
          it.bleedWidthIn > 0 ? Math.abs(r.measurements.bleedWidthIn - it.bleedWidthIn) / it.bleedWidthIn : r.measurements.bleedWidthIn;
        expect(bleedErr).toBeLessThanOrEqual(0.02);
        maxMeasErr = Math.max(maxMeasErr, bleedErr);
        expect(r.measurements.minTextPt).toBe(it.minTextPt ?? null);
        if (it.cutlinePresent !== undefined) expect(r.measurements.cutlinePresent).toBe(it.cutlinePresent);
        expect(r.measurements.whiteInkPresent).toBe(it.whiteInkPresent ?? null);
        expect(r.measurements.colorMode).toBe((it.blackPixelCount ?? 0) > 0 ? "RGB" : null);
        if (it.hasTransparency !== undefined) expect(r.measurements.hasTransparency).toBe(it.hasTransparency);
      }
    }

    const accuracy = correct / items.length;
    const holdRate = holds / items.length;
    latencies.sort((a, b) => a - b);
    const p95 = percentile(latencies, 95);

    console.log(
      `l2 accuracy=${(accuracy * 100).toFixed(1)}% hold=${(holdRate * 100).toFixed(1)}% p95=${p95.toFixed(1)}ms meas<=${(maxMeasErr * 100).toFixed(2)}%`,
    );

    expect(accuracy).toBeGreaterThanOrEqual(0.9);
    expect(maxMeasErr).toBeLessThanOrEqual(0.02);
    expect(p95).toBeLessThan(30_000);
  }, 120_000);

  test("harness script wires both layers", async () => {
    const pkg = (await Bun.file(join(import.meta.dir, "..", "package.json")).json()) as {
      scripts: Record<string, string>;
    };
    expect(typeof pkg.scripts["harness"]).toBe("string");
    expect(pkg.scripts["harness"]).toMatch(/corpus-harness/);
    expect(pkg.scripts["harness"]).toMatch(/l2-harness/);
  });
});
