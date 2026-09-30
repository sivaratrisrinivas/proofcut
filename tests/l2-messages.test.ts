import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";
import { lintTone } from "../src/wording";

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");
const TONES = ["first-time", "revision", "angry-wismo"] as const;

interface Message {
  jobId: string;
  file: string;
  productId: string;
  tone: string;
  fails: string[];
  measured: {
    ppi: number;
    bleedWidthIn: number;
    pixelWidth: number;
    pixelHeight: number;
    minTextPt: number | null;
  };
  text: string;
}

interface ManifestRow {
  file: string;
  productId: string;
  kind: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  expectedVerdict: "PASS" | "SOFT-FAIL";
}

async function messages(): Promise<Message[]> {
  const raw = await Bun.file(join(L2_DIR, "messages.jsonl")).text();
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Message);
}

describe("l2 message layer", () => {
  test("15-20 records linked to real L2 SOFT-FAILs with valid tones", async () => {
    const rows = await messages();
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.length).toBeLessThanOrEqual(20);

    const manifest = (await Bun.file(join(L2_DIR, "manifest.json")).json()) as ManifestRow[];
    const softFails = new Map(manifest.filter((m) => m.expectedVerdict === "SOFT-FAIL").map((m) => [m.file, m]));
    const tones = new Set<string>();
    for (const m of rows) {
      expect(TONES as readonly string[]).toContain(m.tone);
      tones.add(m.tone);
      const linked = softFails.get(m.file);
      expect(linked).toBeDefined();
      expect(linked?.productId).toBe(m.productId);
      expect(m.jobId.length).toBeGreaterThan(0);
      expect(m.fails.length).toBeGreaterThan(0);
      expect(m.text.length).toBeGreaterThan(20);
    }
    for (const t of TONES) expect(tones.has(t)).toBe(true);
  });

  test("note numbers match fresh code-measured values and appear in text", async () => {
    const manifest = (await Bun.file(join(L2_DIR, "manifest.json")).json()) as ManifestRow[];
    const byFile = new Map(manifest.map((m) => [m.file, m]));
    for (const m of await messages()) {
      const row = byFile.get(m.file);
      const r = await preflightFile(
        join(L2_DIR, m.file),
        { widthIn: row!.orderedWidthIn, heightIn: row!.orderedHeightIn },
        m.productId,
      );
      expect(r.verdict).toBe("SOFT-FAIL");
      expect(m.measured.ppi).toBe(Math.round(r.measurements.ppi));
      expect(m.measured.bleedWidthIn).toBe(Number(r.measurements.bleedWidthIn.toFixed(3)));
      expect(m.measured.pixelWidth).toBe(r.measurements.pixelWidth);
      expect(m.measured.pixelHeight).toBe(r.measurements.pixelHeight);
      expect(m.measured.minTextPt).toBe(r.measurements.minTextPt);
      expect([...m.fails].sort()).toEqual([...r.fails].sort());

      const dims = `${m.measured.pixelWidth}x${m.measured.pixelHeight}px`;
      expect(m.text).toContain(String(m.measured.ppi));
      expect(m.text).toContain(m.measured.bleedWidthIn.toFixed(3));
      expect(m.text).toContain(dims);
      if (m.measured.minTextPt !== null && m.fails.includes("tiny-text")) {
        expect(m.text).toContain(`${m.measured.minTextPt}pt`);
      }
    }
  }, 120_000);

  test("zero banned words across all notes", async () => {
    for (const m of await messages()) {
      expect(lintTone(m.text)).toBe(true);
    }
  });
});
