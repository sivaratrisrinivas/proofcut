import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const L2_DIR = join(import.meta.dir, "..", "corpus-l2-content");
const PERTURBATIONS = [
  "wrong-number",
  "wrong-fact",
  "wrong-action",
  "invented-fail",
  "invented-step",
  "invented-number",
  "dropped-fail",
  "vague",
  "banned-tone",
] as const;

interface Label {
  jobId: string;
  output: "explain" | "rebuild";
  unit: string;
  label: "pass" | "fail";
  rationale?: string;
  perturbation?: string;
  content: Record<string, unknown>;
}

interface Candidate {
  jobId: string;
  explanation: { headline: string; body: string[] };
  rebuild: { steps: string[] };
}

async function labels(): Promise<Label[]> {
  const raw = await Bun.file(join(L2_DIR, "wording-labels.jsonl")).text();
  return raw.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Label);
}

describe("wording labels (judge training data)", () => {
  test("20+/20+ per judge with rationales and valid tags", async () => {
    const rows = await labels();
    expect(rows.length).toBe(94);
    for (const output of ["explain", "rebuild"] as const) {
      const pass = rows.filter((r) => r.output === output && r.label === "pass");
      const fail = rows.filter((r) => r.output === output && r.label === "fail");
      expect(pass.length).toBe(26);
      expect(fail.length).toBe(21);
      for (const f of fail) {
        expect(PERTURBATIONS as readonly string[]).toContain(f.perturbation ?? "missing");
      }
    }
    for (const r of rows) {
      expect(r.rationale?.length).toBeGreaterThan(0);
      if (r.label === "pass") expect(r.perturbation).toBeUndefined();
    }
  });

  test("pass units match candidate outputs exactly", async () => {
    const rows = await labels();
    const raw = await Bun.file(join(L2_DIR, "wording-candidates.jsonl")).text();
    const cands = raw.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Candidate);
    const byJob = new Map(cands.map((c) => [c.jobId, c]));
    for (const r of rows) {
      if (r.label !== "pass") continue;
      const c = byJob.get(r.jobId);
      expect(c).toBeDefined();
      if (r.output === "explain") {
        if (r.unit === "row") {
          expect(r.content).toEqual({ headline: c!.explanation.headline, body: c!.explanation.body });
        } else {
          const idx = Number(r.unit.split(":")[1]);
          expect(r.content).toEqual({ line: c!.explanation.body[idx] });
        }
      } else if (r.unit === "row") {
        expect(r.content).toEqual({ steps: c!.rebuild.steps });
      } else {
        const idx = Number(r.unit.split(":")[1]);
        expect(r.content).toEqual({ step: c!.rebuild.steps[idx] });
      }
    }
  });
});
