import { describe, expect, test } from "bun:test";
import { preflight } from "../src/preflight";
import { getSpec } from "../src/specs";
import {
  QUEUE_FILTERS,
  createJob,
  filterQueue,
  normalizeFilter,
  seedQueue,
  sortQueueByRisk,
  type Job,
} from "../src/queue";
import {
  assertAllowedAction,
  isAllowedAction,
  recordAutoSend,
  recordReview,
  shouldAutoSend,
  timeDecision,
  type AuditEntry,
} from "../src/audit";
import { HOLD_RATE_GUARD, MINUTES_SAVED_PER_AUTOPASS, TOUCHES_AFTER, TOUCHES_BEFORE, computeMetrics } from "../src/metrics";
import { WEAKEST_ROI_INPUT, computeRoi, defaultRoiInputs, roiAssumptions } from "../src/roi";

const diecut = () => getSpec("die-cut");
const clear = () => getSpec("clear");

function jobFor(id: string, fails: Partial<Record<string, boolean>>): Job {
  const px = fails["low-ppi"] ? 450 : 900;
  const r = preflight(
    px,
    px,
    { widthIn: 3, heightIn: 3 },
    {
      bleedWidthIn: fails["bleed"] ? 0.05 : 0.15,
      cutlinePresent: fails["cutline"] ? false : true,
      whiteInkPresent: fails["white-ink"] ? false : true,
      minTextPt: fails["tiny-text"] ? 4.5 : 12,
      colorMode: "CMYK",
      hasTransparency: false,
    },
    fails["white-ink"] || fails["tiny-text"] ? clear() : diecut(),
  );
  return createJob(id, `${id}.png`, r.productId, { widthIn: 3, heightIn: 3 }, r);
}

function demoQueue(): Job[] {
  return seedQueue([
    { id: "clean-1", file: "clean-1.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("clean-1", {}).result },
    { id: "clean-2", file: "clean-2.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("clean-2", {}).result },
    { id: "ppi-1", file: "ppi-1.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("ppi-1", { "low-ppi": true }).result },
    { id: "bleed-1", file: "bleed-1.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("bleed-1", { bleed: true }).result },
    { id: "cut-1", file: "cut-1.png", productId: "die-cut", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("cut-1", { cutline: true }).result },
    { id: "white-1", file: "white-1.png", productId: "clear", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("white-1", { "white-ink": true }).result },
    { id: "text-1", file: "text-1.png", productId: "clear", ordered: { widthIn: 3, heightIn: 3 }, result: jobFor("text-1", { "tiny-text": true }).result },
  ]);
}

describe("ticket 04: queue seeds demo jobs and filters by fail type", () => {
  test("seeded queue filters to each of the five fail types", () => {
    const q = demoQueue();
    expect(q.length).toBe(7);
    expect(q.every((j) => j.status === "queued")).toBe(true);
    for (const f of ["low-ppi", "bleed", "cutline", "white-ink", "tiny-text"] as const) {
      const hits = filterQueue(q, f);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      for (const h of hits) expect(h.result.fails).toContain(f);
    }
    expect(filterQueue(q, "all").length).toBe(q.length);
  });

  test("filter names accept display variants and riskiest holds sort first", () => {
    expect(normalizeFilter("Low-PPI")).toBe("low-ppi");
    expect(normalizeFilter("cut line")).toBe("cutline");
    expect(normalizeFilter("white ink")).toBe("white-ink");
    expect(normalizeFilter("tiny text")).toBe("tiny-text");
    expect(QUEUE_FILTERS).toContain("white-ink");
    const q = demoQueue();
    const sorted = sortQueueByRisk(filterQueue(q, "all").filter((j) => j.result.verdict === "SOFT-FAIL"));
    expect(sorted.length).toBe(5);
    expect(sorted[0].result.fails).toContain("low-ppi");
  });
});

describe("ticket 04: approve and reject log timer plus verdict plus actor", () => {
  test("review entries carry elapsedMs, verdict, actor", () => {
    const q = demoQueue();
    let log: AuditEntry[] = [];
    const start = 1_000;
    const end = 1_000 + 4 * 60 * 1_000;
    const elapsed = timeDecision(start, end);
    expect(elapsed).toBe(240_000);
    log = recordReview(log, q[0], "approve", "artist-1", elapsed, end);
    log = recordReview(log, q[2], "reject", "artist-1", elapsed, end);
    expect(log.length).toBe(2);
    expect(log[0]).toMatchObject({ jobId: "clean-1", actor: "artist-1", decision: "approve", verdict: "PASS", elapsedMs: 240_000 });
    expect(log[1]).toMatchObject({ jobId: "ppi-1", actor: "artist-1", decision: "reject", verdict: "SOFT-FAIL" });
  });

  test("bad timers are rejected", () => {
    expect(() => timeDecision(200, 100)).toThrow();
  });
});

describe("ticket 04: auto-send guards", () => {
  test("high-confidence PASS auto-sends with audit log, SOFT-FAIL never auto-sends", () => {
    const q = demoQueue();
    expect(shouldAutoSend("PASS", "high")).toBe(true);
    expect(shouldAutoSend("PASS", "low")).toBe(false);
    expect(shouldAutoSend("SOFT-FAIL", "high")).toBe(false);
    let log: AuditEntry[] = [];
    log = recordAutoSend(log, q[0], "system", "high", 500, 2_000);
    expect(log[0].decision).toBe("auto-send");
    expect(() => recordAutoSend(log, q[2], "system", "high", 500, 2_000)).toThrow();
    expect(() => recordAutoSend(log, q[0], "system", "low", 500, 2_000)).toThrow();
  });

  test("never auto-charge, auto-reprint, or auto-scrap", () => {
    for (const a of ["auto-charge", "auto-reprint", "auto-scrap"]) {
      expect(isAllowedAction(a)).toBe(false);
      expect(() => assertAllowedAction(a)).toThrow();
    }
    expect(isAllowedAction("auto-send")).toBe(true);
    expect(isAllowedAction("approve")).toBe(true);
  });
});

describe("ticket 04: dashboard shows auto-pass, touches, minutes saved, hold rate", () => {
  test("dashboard math on decided demo queue", () => {
    const q = demoQueue().map((j) => ({ ...j, status: "approved" as const }));
    const d = computeMetrics(q);
    expect(d.total).toBe(7);
    expect(d.passes).toBe(2);
    expect(d.holds).toBe(5);
    expect(d.autoPassPct).toBeCloseTo((2 / 7) * 100, 9);
    expect(d.touchesPerJob).toBeCloseTo(TOUCHES_AFTER, 9);
    expect(TOUCHES_BEFORE).toBe(3);
    expect(d.minutesSaved).toBe(2 * MINUTES_SAVED_PER_AUTOPASS);
    expect(HOLD_RATE_GUARD).toBe(0.4);
  });

  test("corpus hold rate stays under 40 percent guard", async () => {
    const manifestFile = Bun.file("corpus/manifest.json");
    const manifest = (await manifestFile.json()) as Array<{
      file: string;
      productId: string;
      orderedWidthIn: number;
      orderedHeightIn: number;
      expectedVerdict: "PASS" | "SOFT-FAIL";
    }>;
    const { preflightFile } = await import("../src/preflightFile");
    const jobs: Job[] = [];
    for (const [i, it] of manifest.entries()) {
      const r = await preflightFile(
        `corpus/${it.file}`,
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      jobs.push(createJob(`corpus-${i}`, it.file, it.productId, { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn }, r));
    }
    const d = computeMetrics(jobs);
    expect(d.holdRate).toBeLessThan(0.4);
    expect(d.holdGuardOk).toBe(true);
  }, 120_000);
});

describe("ticket 04: ROI sliders with defaults, labeled assumptions, weakest input", () => {
  test("defaults to 100k orders per month and labels weakest input", () => {
    const inputs = defaultRoiInputs();
    expect(inputs.ordersPerMonth).toBe(100_000);
    expect(WEAKEST_ROI_INPUT).toBe("ordersPerMonth");
    const assumptions = roiAssumptions();
    const weakest = assumptions.filter((a) => a.weakest);
    expect(weakest.length).toBe(1);
    expect(weakest[0].key).toBe("ordersPerMonth");
    for (const a of assumptions) {
      expect(a.label).toMatch(/assumed/i);
      expect(a.range.length).toBeGreaterThan(0);
    }
  });

  test("savings equal labor plus reprints with capture applied", () => {
    const inputs = defaultRoiInputs();
    const r = computeRoi(inputs);
    const labor = 100_000 * 0.55 * 11.5 * 0.6;
    const reprint = 100_000 * 0.02 * 26.5;
    expect(r.laborMonthly).toBeCloseTo(labor, 6);
    expect(r.reprintMonthly).toBeCloseTo(reprint, 6);
    expect(r.grossMonthly).toBeCloseTo(labor + reprint, 6);
    expect(r.capturedMonthly).toBeCloseTo((labor + reprint) * 0.225, 6);
    expect(r.capturedAnnual).toBeCloseTo((labor + reprint) * 0.225 * 12, 4);
  });
});
