import l1Manifest from "../corpus/manifest.json" with { type: "json" };
import l2Manifest from "../corpus-l2-content/manifest.json" with { type: "json" };
import type { Verdict } from "./preflight";
import { getSpec } from "./specs";

// Sample files the web app can run. They are the same generated corpus the
// harness tests grade against, so every sample carries its ground truth.

export type SampleSet = "art" | "geometry";

export interface SampleEntry {
  file: string;
  set: SampleSet;
  dir: "corpus" | "corpus-l2-content";
  kind: "png" | "pdf";
  productId: string;
  productName: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  note: string;
  expectedVerdict: Verdict;
  expectedFails: string[];
}

interface ManifestRow {
  file: string;
  kind?: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi?: number;
  bleedWidthIn?: number;
  note?: string;
  expectedVerdict: string;
  expectedFails: string[];
}

function cleanNote(raw: string | undefined): string {
  if (!raw) return "";
  // Manifest notes end with the expected verdict ("-> bleed SOFT-FAIL").
  // The app shows ground truth after the run, so keep only the description.
  const text = raw
    .split("->")[0]
    .replace(/\b(PASS|SOFT-FAIL)\b.*$/, "")
    .replace(/[\s,:;]+$/, "")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pdfNote(row: ManifestRow): string {
  return row.file.startsWith("cut-")
    ? "Test PDF for the CutContour spot color check"
    : "Test PDF for the white ink spot color check";
}

function toEntry(row: ManifestRow, set: SampleSet): SampleEntry {
  const kind = row.file.toLowerCase().endsWith(".pdf") ? "pdf" : "png";
  const note =
    set === "geometry"
      ? `Flat fill built at ${row.targetPpi} PPI for the ordered size`
      : kind === "pdf"
        ? pdfNote(row)
        : cleanNote(row.note);
  return {
    file: row.file,
    set,
    dir: set === "art" ? "corpus-l2-content" : "corpus",
    kind,
    productId: row.productId,
    productName: getSpec(row.productId).displayName,
    orderedWidthIn: row.orderedWidthIn,
    orderedHeightIn: row.orderedHeightIn,
    note,
    expectedVerdict: row.expectedVerdict as Verdict,
    expectedFails: [...row.expectedFails],
  };
}

const CATALOG: SampleEntry[] = [
  ...(l2Manifest as ManifestRow[]).map((r) => toEntry(r, "art")),
  ...(l1Manifest as ManifestRow[]).map((r) => toEntry(r, "geometry")),
];
const BY_FILE = new Map(CATALOG.map((e) => [e.file, e]));

export function listSamples(): SampleEntry[] {
  return CATALOG;
}

/** Whitelist lookup: only files named in a manifest can be read. */
export function findSample(file: string): SampleEntry | undefined {
  return BY_FILE.get(file);
}
