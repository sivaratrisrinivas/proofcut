import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");
const ROOT = join(import.meta.dir, "..");

interface L2Row {
  file: string;
  productId: string;
  kind: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
}

async function manifest(): Promise<L2Row[]> {
  return (await Bun.file(join(L2_DIR, "manifest.json")).json()) as L2Row[];
}

describe("l2 five-product coverage", () => {
  test("all five products present with pass and fault proof", async () => {
    const items = await manifest();
    const byProduct = new Map<string, L2Row[]>();
    for (const it of items) {
      const list = byProduct.get(it.productId) ?? [];
      list.push(it);
      byProduct.set(it.productId, list);
    }
    for (const id of ["die-cut", "clear", "holographic", "roll-label", "packaging-tape"]) {
      const rows = byProduct.get(id) ?? [];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((r) => r.expectedVerdict === "PASS")).toBe(true);
      expect(rows.some((r) => r.expectedVerdict === "SOFT-FAIL")).toBe(true);
    }
  });

  test("clear/holographic fail without white-ink, pass with it (pdfs + pngs)", async () => {
    const items = await manifest();
    for (const id of ["clear", "holographic"]) {
      const fails = items.filter((r) => r.productId === id && r.expectedFails.includes("white-ink"));
      expect(fails.length).toBeGreaterThan(0);
      expect(fails.some((r) => r.kind === "pdf")).toBe(true);
      expect(fails.some((r) => r.kind === "png")).toBe(true);
      for (const f of fails) {
        const r = await preflightFile(
          join(L2_DIR, f.file),
          { widthIn: f.orderedWidthIn, heightIn: f.orderedHeightIn },
          id,
        );
        expect(r.fails).toContain("white-ink");
      }
    }
  });

  test("roll-label and tape bleed rules enforced with proof files", async () => {
    const items = await manifest();
    for (const id of ["roll-label", "packaging-tape"]) {
      const fails = items.filter((r) => r.productId === id && r.expectedFails.includes("bleed"));
      expect(fails.length).toBeGreaterThan(0);
      for (const f of fails) {
        const r = await preflightFile(
          join(L2_DIR, f.file),
          { widthIn: f.orderedWidthIn, heightIn: f.orderedHeightIn },
          id,
        );
        expect(r.fails).toContain("bleed");
      }
    }
  });

  test("ext absorbed: no third corpus dir, 10 pdfs live in L2", async () => {
    expect(await Bun.file(join(ROOT, "corpus-ext", "manifest.json")).exists()).toBe(false);
    const items = await manifest();
    const pdfs = items.filter((r) => r.kind === "pdf");
    expect(pdfs.length).toBe(10);
    for (const p of pdfs) {
      expect(await Bun.file(join(L2_DIR, p.file)).exists()).toBe(true);
      expect(await Bun.file(join(L2_DIR, `${p.file}.sidecar.json`)).exists()).toBe(true);
    }
  });
});
