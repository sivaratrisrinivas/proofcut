import { preflight, type OrderedSize, type PreflightExtras } from "./preflight";
import { getSpec } from "./specs";
import { seedQueue, sortQueueByRisk, type Job } from "./queue";

export interface SeedDef {
  id: string;
  file: string | null;
  productId: string;
  ordered: OrderedSize;
  extras?: PreflightExtras;
}

export const SEED_DEFS: SeedDef[] = [
  { id: "clean-1", file: "diecut-002.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 3 } },
  { id: "clean-2", file: "diecut-005.png", productId: "die-cut", ordered: { widthIn: 2, heightIn: 2 } },
  { id: "ppi-1", file: "diecut-001.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 2 } },
  { id: "bleed-1", file: "diecut-003.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 2 } },
  { id: "cut-1", file: "diecut-008.png", productId: "die-cut", ordered: { widthIn: 4, heightIn: 6 } },
  {
    id: "white-1",
    file: null,
    productId: "clear",
    ordered: { widthIn: 3, heightIn: 3 },
    extras: {
      bleedWidthIn: 0.15,
      cutlinePresent: true,
      whiteInkPresent: false,
      minTextPt: 12,
      colorMode: "CMYK",
      hasTransparency: false,
    },
  },
  {
    id: "text-1",
    file: null,
    productId: "clear",
    ordered: { widthIn: 3, heightIn: 3 },
    extras: {
      bleedWidthIn: 0.15,
      cutlinePresent: true,
      whiteInkPresent: true,
      minTextPt: 4.5,
      colorMode: "CMYK",
      hasTransparency: false,
    },
  },
];

export interface ResolvedSeed {
  id: string;
  file: string | null;
  productId: string;
  ordered: OrderedSize;
  pixelWidth: number;
  pixelHeight: number;
  extras: PreflightExtras;
}

export function buildSeedJobs(seeds: ResolvedSeed[]): Job[] {
  return sortQueueByRisk(
    seedQueue(
      seeds.map((s) => ({
        id: s.id,
        file: s.file ?? `${s.id} (synthetic seed)`,
        productId: s.productId,
        ordered: s.ordered,
        result: preflight(s.pixelWidth, s.pixelHeight, s.ordered, s.extras, getSpec(s.productId)),
      })),
    ),
  );
}
