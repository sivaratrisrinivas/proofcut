import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("eval splits discipline", () => {
  test("train/dev/test disjoint, few-shot jobs held out of dev/test", async () => {
    const splits = (await Bun.file(join(import.meta.dir, "..", "evals", "splits.json")).json()) as {
      train_jobs: string[];
      dev: string[];
      test: string[];
    };
    expect(splits.train_jobs.sort()).toEqual(["l2-005", "l2-017", "l2-024"]);
    expect(splits.dev.length).toBe(16);
    expect(splits.test.length).toBe(14);
    expect(new Set(splits.dev).size).toBe(8);
    expect(new Set(splits.test).size).toBe(7);
    const devSet = new Set(splits.dev);
    for (const j of [...splits.dev, ...splits.test]) {
      expect(splits.train_jobs).not.toContain(j);
    }
    for (const j of splits.test) {
      expect(devSet.has(j)).toBe(false);
    }
  });
});
