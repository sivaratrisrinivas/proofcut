import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeSolidPng } from "../src/png";

export interface CorpusItem {
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

const OUT_DIR = join(import.meta.dir, "..", "corpus");
const SIZES = [
  { w: 3, h: 3 },
  { w: 2, h: 2 },
  { w: 4, h: 4 },
  { w: 3, h: 2 },
  { w: 4, h: 6 },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function plan(): CorpusItem[] {
  const rand = mulberry32(20260930);
  const items: CorpusItem[] = [];
  let n = 0;
  const nextName = () => `diecut-${String(++n).padStart(3, "0")}.png`;

  const add = (
    kind: "clean" | "warn" | "low-ppi" | "bleed" | "cutline",
  ) => {
    const size = pick(rand, SIZES);
    // Keep pixels bounded for speed: cap 4x6@300 (1200x1800) is max, fine.
    let targetPpi: number;
    let bleed = 0.125 + rand() * 0.075;
    let cutline = true;
    let expectedVerdict: CorpusItem["expectedVerdict"] = "PASS";
    let expectedFails: string[] = [];

    if (kind === "clean") {
      targetPpi = 300 + Math.floor(rand() * 51);
    } else if (kind === "warn") {
      targetPpi = 210 + Math.floor(rand() * 80);
    } else if (kind === "low-ppi") {
      const choices = [72, 96, 120, 150, 180];
      targetPpi = pick(rand, choices);
      expectedVerdict = "SOFT-FAIL";
      expectedFails = ["low-ppi"];
    } else if (kind === "bleed") {
      targetPpi = 300 + Math.floor(rand() * 30);
      bleed = [0, 0.05, 0.08, 0.1][Math.floor(rand() * 4)];
      expectedVerdict = "SOFT-FAIL";
      expectedFails = ["bleed"];
    } else {
      targetPpi = 300 + Math.floor(rand() * 30);
      cutline = false;
      expectedVerdict = "SOFT-FAIL";
      expectedFails = ["cutline"];
    }

    items.push({
      file: nextName(),
      productId: "die-cut",
      orderedWidthIn: size.w,
      orderedHeightIn: size.h,
      targetPpi,
      bleedWidthIn: bleed,
      cutlinePresent: cutline,
      expectedVerdict,
      expectedFails,
    });
  };

  for (let i = 0; i < 32; i++) add("clean");
  for (let i = 0; i < 6; i++) add("warn");
  for (let i = 0; i < 8; i++) add("low-ppi");
  for (let i = 0; i < 7; i++) add("bleed");
  for (let i = 0; i < 7; i++) add("cutline");

  // Deterministic shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  // Renumber after shuffle for stable names
  items.forEach((it, idx) => {
    it.file = `diecut-${String(idx + 1).padStart(3, "0")}.png`;
  });
  return items;
}

async function main() {
  const items = plan();
  await mkdir(OUT_DIR, { recursive: true });
  for (const it of items) {
    const pxW = Math.round(it.orderedWidthIn * it.targetPpi);
    const pxH = Math.round(it.orderedHeightIn * it.targetPpi);
    const png = writeSolidPng(pxW, pxH);
    await writeFile(join(OUT_DIR, it.file), png);
    await writeFile(
      join(OUT_DIR, `${it.file}.sidecar.json`),
      JSON.stringify(
        { bleedWidthIn: it.bleedWidthIn, cutlinePresent: it.cutlinePresent },
        null,
        2,
      ),
    );
  }
  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(items, null, 2));
  const pass = items.filter((i) => i.expectedVerdict === "PASS").length;
  console.log(`wrote ${items.length} files to corpus/ (${pass} PASS, ${items.length - pass} SOFT-FAIL)`);
}

await main();
