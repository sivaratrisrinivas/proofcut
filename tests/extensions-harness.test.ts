import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";

interface ExtItem {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  bleedWidthIn: number;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
  expectedWarnings: string[];
}

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");

describe("extensions harness (pdf cutcontour + white-ink)", () => {
  test("10-file pdf corpus verdicts correctly", async () => {
    const manifestFile = Bun.file(join(L2_DIR, "manifest.json"));
    expect(await manifestFile.exists()).toBe(true);
    const items = ((await manifestFile.json()) as (ExtItem & { kind: string })[]).filter(
      (it) => it.kind === "pdf",
    );
    expect(items.length).toBe(10);

    let correct = 0;
    for (const it of items) {
      const r = await preflightFile(
        join(L2_DIR, it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      if (r.verdict === it.expectedVerdict) {
        const failsCover = it.expectedFails.every((f) => r.fails.includes(f));
        const warnsCover = it.expectedWarnings.every((w) => r.warnings.includes(w));
        if (failsCover && warnsCover) correct++;
        else console.log(`mismatch ${it.file}: fails=${r.fails} warnings=${r.warnings}`);
      } else {
        console.log(`verdict mismatch ${it.file}: got ${r.verdict} want ${it.expectedVerdict} fails=${r.fails}`);
      }

      const ppiErr = Math.abs(r.measurements.ppi - it.targetPpi) / it.targetPpi;
      expect(ppiErr).toBeLessThanOrEqual(0.02);
      expect(r.measurements.bleedWidthIn).toBeCloseTo(it.bleedWidthIn, 9);
    }

    const accuracy = correct / items.length;
    console.log(`ext accuracy=${(accuracy * 100).toFixed(1)}%`);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
