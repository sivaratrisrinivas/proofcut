import { describe, expect, test } from "bun:test";
import { filterQueue, sortQueueByRisk } from "../src/queue";
import {
  SEED_DEFS,
  buildSeedJobs,
  type ResolvedSeed,
} from "../src/queueSeed";
import { decide } from "../src/review";
import type { AuditEntry } from "../src/audit";

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
    { id: "clean-2", file: "diecut-005.png", productId: "die-cut", ordered: { widthIn: 2, heightIn: 2 }, pixelWidth: 600, pixelHeight: 600, extras: { ...base } },
    { id: "ppi-1", file: "diecut-001.png", productId: "die-cut", ordered, pixelWidth: 450, pixelHeight: 450, extras: { ...base } },
    { id: "bleed-1", file: "diecut-003.png", productId: "die-cut", ordered, ...px, extras: { ...base, bleedWidthIn: 0.05 } },
    { id: "cut-1", file: "diecut-008.png", productId: "die-cut", ordered, ...px, extras: { ...base, cutlinePresent: false } },
    { id: "white-1", file: null, productId: "clear", ordered, ...px, extras: { ...base, whiteInkPresent: false } },
    { id: "text-1", file: null, productId: "clear", ordered, ...px, extras: { ...base, minTextPt: 4.5 } },
  ];
}

describe("ticket 08: queue seeds demo jobs covering all five fail types, riskiest first", () => {
  test("seed defs cover two cleans plus one job per fail type", () => {
    const ids = SEED_DEFS.map((d) => d.id).sort();
    expect(ids).toEqual(["bleed-1", "clean-1", "clean-2", "cut-1", "ppi-1", "text-1", "white-1"]);
  });

  test("built jobs filter to each of the five fail types", () => {
    const jobs = buildSeedJobs(resolved());
    expect(jobs.length).toBe(7);
    expect(jobs.every((j) => j.status === "queued")).toBe(true);
    for (const f of ["low-ppi", "bleed", "cutline", "white-ink", "tiny-text"] as const) {
      const hits = filterQueue(jobs, f);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      for (const h of hits) expect(h.result.fails).toContain(f);
    }
    expect(filterQueue(jobs, "all").length).toBe(jobs.length);
  });

  test("built jobs arrive sorted riskiest first", () => {
    const jobs = buildSeedJobs(resolved());
    const softFails = jobs.filter((j) => j.result.verdict === "SOFT-FAIL");
    expect(softFails.length).toBe(5);
    expect(softFails.map((j) => j.id)).toEqual(["ppi-1", "bleed-1", "cut-1", "white-1", "text-1"]);
    expect(sortQueueByRisk([...softFails].reverse()).map((j) => j.id)).toEqual([
      "ppi-1",
      "bleed-1",
      "cut-1",
      "white-1",
      "text-1",
    ]);
  });
});

describe("ticket 08: approve and reject log timer plus verdict plus actor", () => {
  test("approve and reject entries carry elapsedMs, verdict, actor", () => {
    const jobs = buildSeedJobs(resolved());
    const clean = jobs.find((j) => j.id === "clean-1")!;
    const ppi = jobs.find((j) => j.id === "ppi-1")!;
    let log: AuditEntry[] = [];
    log = decide(log, clean, { decision: "approve", actor: "demo-artist", elapsedMs: 240_000, atMs: 2_000 });
    log = decide(log, ppi, { decision: "reject", actor: "demo-artist", elapsedMs: 180_000, atMs: 3_000 });
    expect(log.length).toBe(2);
    expect(log[0]).toMatchObject({ jobId: "clean-1", actor: "demo-artist", decision: "approve", verdict: "PASS", elapsedMs: 240_000 });
    expect(log[1]).toMatchObject({ jobId: "ppi-1", actor: "demo-artist", decision: "reject", verdict: "SOFT-FAIL", elapsedMs: 180_000 });
  });

  test("bad timers and blank actors are rejected", () => {
    const jobs = buildSeedJobs(resolved());
    const clean = jobs.find((j) => j.id === "clean-1")!;
    expect(() => decide([], clean, { decision: "approve", actor: "demo-artist", elapsedMs: -1, atMs: 1 })).toThrow();
    expect(() => decide([], clean, { decision: "approve", actor: "  ", elapsedMs: 10, atMs: 1 })).toThrow();
  });
});

describe("ticket 08: soft-fail never auto-sends; never auto-charge, auto-reprint, auto-scrap", () => {
  test("only high-confidence PASS auto-sends with an audit entry", () => {
    const jobs = buildSeedJobs(resolved());
    const clean = jobs.find((j) => j.id === "clean-1")!;
    const ppi = jobs.find((j) => j.id === "ppi-1")!;
    const log = decide([], clean, { decision: "auto-send", actor: "system", elapsedMs: 500, atMs: 2_000, confidence: "high" });
    expect(log[0].decision).toBe("auto-send");
    expect(() => decide([], clean, { decision: "auto-send", actor: "system", elapsedMs: 500, atMs: 2_000, confidence: "low" })).toThrow();
    expect(() => decide([], clean, { decision: "auto-send", actor: "system", elapsedMs: 500, atMs: 2_000 })).toThrow();
    expect(() => decide([], ppi, { decision: "auto-send", actor: "system", elapsedMs: 500, atMs: 2_000, confidence: "high" })).toThrow();
  });

  test("forbidden and unknown actions are rejected", () => {
    const jobs = buildSeedJobs(resolved());
    const clean = jobs.find((j) => j.id === "clean-1")!;
    for (const d of ["auto-charge", "auto-reprint", "auto-scrap", "delete"]) {
      expect(() => decide([], clean, { decision: d, actor: "demo-artist", elapsedMs: 10, atMs: 1 })).toThrow();
    }
  });
});
