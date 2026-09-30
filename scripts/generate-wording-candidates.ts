import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preflightFile } from "../src/preflightFile";
import { explainFix, suggestRebuild } from "../src/wording";

// Labeling candidates for a future wording judge (one judge per failure mode).
// For each messages.jsonl note: the customer note + the code's explain/rebuild
// outputs, with null labels for a human to fill (pass/fail each, against:
// numbers-only-from-code + clean tone). Not a judge, not scoring.

const OUT_DIR = join(import.meta.dir, "..", "corpus-l2-content");

interface Message {
  jobId: string;
  file: string;
  productId: string;
  tone: "first-time" | "revision" | "angry-wismo";
  text: string;
}

interface ManifestRow {
  file: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
}

async function main(): Promise<void> {
  const raw = await Bun.file(join(OUT_DIR, "messages.jsonl")).text();
  const notes = raw.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Message);
  const manifest = (await Bun.file(join(OUT_DIR, "manifest.json")).json()) as ManifestRow[];
  const byFile = new Map(manifest.map((m) => [m.file, m]));
  const lines: string[] = [];

  for (const n of notes) {
    const row = byFile.get(n.file);
    if (!row) throw new Error(`candidates: manifest has no ${n.file}`);
    const r = await preflightFile(
      join(OUT_DIR, n.file),
      { widthIn: row.orderedWidthIn, heightIn: row.orderedHeightIn },
      n.productId,
    );
    const explanation = explainFix(r);
    const rebuild = suggestRebuild(r);
    lines.push(JSON.stringify({
      jobId: n.jobId,
      file: n.file,
      productId: n.productId,
      tone: n.tone,
      note: n.text,
      explanation: { headline: explanation.headline, body: explanation.body },
      rebuild: { steps: rebuild.steps },
      labels: { explain: null, rebuild: null },
    }));
  }

  await writeFile(join(OUT_DIR, "wording-candidates.jsonl"), lines.join("\n") + "\n");
  console.log(`wrote ${lines.length} wording candidates to corpus-l2-content/wording-candidates.jsonl`);
}

await main();
