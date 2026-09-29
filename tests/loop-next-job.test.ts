import { describe, expect, test } from "bun:test";
import { buildSeedJobs, type ResolvedSeed } from "../src/queueSeed";
import { nextUndecidedJob } from "../src/loop";

function resolved(): ResolvedSeed[] {
  const px = { pixelWidth: 900, pixelHeight: 900 };
  const ordered = { widthIn: 3, heightIn: 3 };
  const base = {
    bleedWidthIn: 0.15,
    cutlinePresent: true,
    whiteInkPresent: true as boolean | null,
    minTextPt: 12 as number | null,
    colorMode: "CMYK" as string | null,
    hasTransparency: false as boolean | null,
  };
  return [
    { id: "clean-1", file: "diecut-002.png", productId: "die-cut", ordered, ...px, extras: { ...base } },
    { id: "ppi-1", file: "diecut-001.png", productId: "die-cut", ordered, pixelWidth: 450, pixelHeight: 450, extras: { ...base } },
  ];
}

describe("review loop: system presents the riskiest undecided job", () => {
  test("first call presents the riskiest job without any picking", () => {
    const jobs = buildSeedJobs(resolved());
    expect(nextUndecidedJob(jobs, new Set())!.id).toBe("ppi-1");
  });

  test("decided jobs are skipped in queue order", () => {
    const jobs = buildSeedJobs(resolved());
    expect(nextUndecidedJob(jobs, new Set(["ppi-1"]))!.id).toBe("clean-1");
  });

  test("empty loop when every job is decided", () => {
    const jobs = buildSeedJobs(resolved());
    expect(nextUndecidedJob(jobs, new Set(["ppi-1", "clean-1"]))).toBeNull();
    expect(nextUndecidedJob([], new Set())).toBeNull();
  });
});
