import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readPngDims } from "../../../src/png";
import { SEED_DEFS, buildSeedJobs, type ResolvedSeed } from "../../../src/queueSeed";
import type { Job } from "../../../src/queue";
import type { DemoSidecar } from "../../../src/upload";

const ROOT = process.cwd();
const CORPUS_DIR = join(ROOT, "corpus");

const SYNTHETIC_PX = 900;

export async function loadSeedJobs(): Promise<Job[]> {
  const resolved: ResolvedSeed[] = [];
  for (const def of SEED_DEFS) {
    if (def.file === null) {
      if (!def.extras) throw new Error(`synthetic seed missing extras: ${def.id}`);
      resolved.push({
        id: def.id,
        file: null,
        productId: def.productId,
        ordered: def.ordered,
        pixelWidth: SYNTHETIC_PX,
        pixelHeight: SYNTHETIC_PX,
        extras: def.extras,
      });
      continue;
    }
    const bytes = await readFile(join(CORPUS_DIR, def.file));
    const { width, height } = readPngDims(bytes);
    const sidecar = JSON.parse(await readFile(join(CORPUS_DIR, `${def.file}.sidecar.json`), "utf8")) as DemoSidecar;
    resolved.push({
      id: def.id,
      file: def.file,
      productId: def.productId,
      ordered: def.ordered,
      pixelWidth: width,
      pixelHeight: height,
      extras: {
        bleedWidthIn: sidecar.bleedWidthIn,
        cutlinePresent: sidecar.cutlinePresent ?? false,
        whiteInkPresent: sidecar.whiteInkPresent ?? null,
        minTextPt: sidecar.minTextPt ?? null,
        colorMode: sidecar.colorMode ?? null,
        hasTransparency: sidecar.hasTransparency ?? null,
      },
    });
  }
  return buildSeedJobs(resolved);
}
