import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";

// Dumps live code-measured judge inputs per L2 job (fails + measured + warnings).
// Used to assemble validation bundles; never feeds few-shots.

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");
const OUT = join(import.meta.dir, "..", "evals", "judge-inputs.json");

interface ManifestRow {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
}

async function main(): Promise<void> {
  const manifest = (await Bun.file(join(L2_DIR, "manifest.json")).json()) as ManifestRow[];
  const out: Record<string, unknown> = {};
  for (const m of manifest) {
    if (!m.file.endsWith(".png") && !m.file.endsWith(".pdf")) continue;
    const r = await preflightFile(
      join(L2_DIR, m.file),
      { widthIn: m.orderedWidthIn, heightIn: m.orderedHeightIn },
      m.productId,
    );
    out[m.file.replace(/\.[^.]+$/, "")] = {
      fails: r.fails,
      measured: {
        ppi: Math.round(r.measurements.ppi),
        bleedWidthIn: Number(r.measurements.bleedWidthIn.toFixed(3)),
        pixelWidth: r.measurements.pixelWidth,
        pixelHeight: r.measurements.pixelHeight,
        minTextPt: r.measurements.minTextPt,
      },
      warnings: r.warnings,
    };
  }
  await writeFile(OUT, JSON.stringify(out, null, 1));
  console.log(`wrote judge inputs for ${Object.keys(out).length} jobs to evals/judge-inputs.json`);
}

await main();
