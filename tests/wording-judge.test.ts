import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const PROMPT = join(import.meta.dir, "..", "evals", "explain-faithfulness.md");

describe("explain-faithfulness judge prompt", () => {
  test("has the four required components and a leakage-controlled split", async () => {
    const text = await Bun.file(PROMPT).text();
    expect(text).toContain("Result: Pass");
    expect(text).toContain("Result: Fail");
    expect(text).toContain('"critique"');
    expect(text).toContain('"result"');
    expect((text.match(/^### Example \d/mg) ?? []).length).toBeGreaterThanOrEqual(3);
    for (const job of ["l2-005", "l2-024", "l2-017"]) {
      expect(text).toContain(job);
    }
    expect(text).toContain("Exclude these three jobs from dev and test sets");
  });
});
