import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");

interface Candidate {
  jobId: string;
  file: string;
  productId: string;
  tone: string;
  note: string;
  explanation: { headline: string; body: string[] };
  rebuild: { steps: string[] };
  labels: { explain: null | string; rebuild: null | string };
}

describe("wording candidates (labeling input, not a judge)", () => {
  test("18 unlabeled candidates linked to message notes", async () => {
    const raw = await Bun.file(join(L2_DIR, "wording-candidates.jsonl")).text();
    const rows = raw.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Candidate);
    expect(rows.length).toBe(18);

    const notesRaw = await Bun.file(join(L2_DIR, "messages.jsonl")).text();
    const notes = notesRaw.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as { jobId: string; text: string });
    const noteByJob = new Map(notes.map((n) => [n.jobId, n.text]));
    for (const c of rows) {
      expect(c.note).toBe(noteByJob.get(c.jobId) ?? "missing-note");
      expect(c.explanation.headline.length).toBeGreaterThan(0);
      expect(c.explanation.body.length).toBeGreaterThan(0);
      expect(c.rebuild.steps.length).toBeGreaterThan(0);
      expect(c.labels).toEqual({ explain: null, rebuild: null });
    }
  });
});
