import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { preflight, type PreflightResult } from "../src/preflight";
import { getSpec } from "../src/specs";
import { preflightFile } from "../src/preflightFile";
import { buildChecklist, composeMessage } from "../src/draft";
import {
  EXPLAIN_PROMPT,
  REBUILD_PROMPT,
  WORDING_PROMPTS,
  assertCleanTone,
  explainFix,
  lintTone,
  suggestRebuild,
  wordingConfidence,
} from "../src/wording";
import { createJob, type Job } from "../src/queue";
import {
  assertAllowedAction,
  isAllowedAction,
  recordAutoSend,
  recordReview,
  shouldAutoSend,
  timeDecision,
  type AuditEntry,
} from "../src/audit";
import { computeMetrics } from "../src/metrics";

interface ManifestItem {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  bleedWidthIn: number;
  cutlinePresent: boolean;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
}

const diecut = () => getSpec("die-cut");
const clear = () => getSpec("clear");

const BASE_EXTRAS = {
  bleedWidthIn: 0.125,
  cutlinePresent: true,
  whiteInkPresent: true as boolean | null,
  minTextPt: 12 as number | null,
  colorMode: "CMYK" as string | null,
  hasTransparency: false as boolean | null,
};

const ORDERED_3X3 = { widthIn: 3, heightIn: 3 };

function extractNumbers(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function allowedNumbers(r: PreflightResult): number[] {
  const m = r.measurements;
  const out: number[] = [
    Math.round(m.ppi),
    Number(m.bleedWidthIn.toFixed(3)),
    m.pixelWidth,
    m.pixelHeight,
    ORDERED_3X3.widthIn,
    ORDERED_3X3.heightIn,
    300,
    200,
    0.125,
    6,
  ];
  if (typeof m.minTextPt === "number") out.push(m.minTextPt);
  return out;
}

function expectNumbersOnlyFromCode(text: string, r: PreflightResult): void {
  const allowed = allowedNumbers(r);
  for (const n of extractNumbers(text)) {
    const ok = allowed.some((a) => Math.abs(a - n) < 1e-9);
    expect(ok, `number ${n} in ${JSON.stringify(text)} is not code-measured`).toBe(true);
  }
}

function badSampleResults(): PreflightResult[] {
  return [
    preflight(216, 216, ORDERED_3X3, { ...BASE_EXTRAS }, diecut()),
    preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, bleedWidthIn: 0.05 }, diecut()),
    preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, cutlinePresent: false }, diecut()),
    preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, whiteInkPresent: false }, clear()),
    preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, minTextPt: 4.5 }, clear()),
    preflight(
      450, 450, ORDERED_3X3,
      { ...BASE_EXTRAS, bleedWidthIn: 0.05, whiteInkPresent: false, minTextPt: 4.5 },
      clear(),
    ),
  ];
}

describe("ticket 05 gate: fault coverage", () => {
  test("01 clean 300dpi die-cut passes", () => {
    const r = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS }, diecut());
    expect(r.pass).toBe(true);
    expect(r.verdict).toBe("PASS");
    expect(r.fails).toEqual([]);
  });

  test("02 low-PPI 72dpi flags soft-fail", () => {
    const r = preflight(216, 216, ORDERED_3X3, { ...BASE_EXTRAS }, diecut());
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("low-ppi");
  });

  test("03 missing bleed flags soft-fail", () => {
    const r = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, bleedWidthIn: 0.05 }, diecut());
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("bleed");
  });

  test("04 missing cutline flags soft-fail", () => {
    const r = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, cutlinePresent: false }, diecut());
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("cutline");
  });

  test("05 missing white ink on clear flags soft-fail", () => {
    const r = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, whiteInkPresent: false }, clear());
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("white-ink");
  });

  test("06 tiny text under 6pt flags soft-fail", () => {
    const r = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, minTextPt: 4.5 }, clear());
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("tiny-text");
  });

  test("07 RGB black and transparency warn with auto-convert yet still pass", () => {
    const rgb = preflight(
      900, 900, ORDERED_3X3,
      { ...BASE_EXTRAS, whiteInkPresent: true, colorMode: "RGB" },
      clear(),
    );
    expect(rgb.pass).toBe(true);
    expect(rgb.fails).toEqual([]);
    expect(rgb.warnings.some((w) => /rgb-black/.test(w) && /auto-convert/.test(w))).toBe(true);
    const tr = preflight(
      900, 900, ORDERED_3X3,
      { ...BASE_EXTRAS, whiteInkPresent: true, hasTransparency: true },
      clear(),
    );
    expect(tr.pass).toBe(true);
    expect(tr.fails).toEqual([]);
    expect(tr.warnings.some((w) => /transparency/.test(w) && /auto-convert/.test(w))).toBe(true);
  });

  test("08 adversarial 50dpi never passes", () => {
    const r = preflight(150, 150, ORDERED_3X3, { ...BASE_EXTRAS }, diecut());
    expect(r.pass).toBe(false);
    expect(r.verdict).toBe("SOFT-FAIL");
    expect(r.fails).toContain("low-ppi");
  });
});

describe("ticket 05 gate: two-prompt wording layer", () => {
  test("09 exactly two prompts exist: explanation plus rebuild", () => {
    expect([...WORDING_PROMPTS]).toEqual(["explain", "rebuild"]);
    expect(typeof EXPLAIN_PROMPT).toBe("string");
    expect(typeof REBUILD_PROMPT).toBe("string");
    expect(EXPLAIN_PROMPT.length).toBeGreaterThan(0);
    expect(REBUILD_PROMPT.length).toBeGreaterThan(0);
    expect(EXPLAIN_PROMPT).not.toBe(REBUILD_PROMPT);
  });

  test("10 explanation rewords code numbers only and names each fix", () => {
    for (const r of badSampleResults()) {
      const e = explainFix(r);
      expect(e.prompt).toBe("explain");
      const full = [e.headline, ...e.body].join("\n");
      expect(e.body.length).toBeGreaterThan(0);
      expectNumbersOnlyFromCode(full, r);
      for (const f of r.fails) {
        const named = full.includes(f) || e.body.some((l) => l.startsWith(`${f}:`));
        expect(named, `fail ${f} is named in explanation`).toBe(true);
      }
    }
    const pass = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS }, diecut());
    const e = explainFix(pass);
    expectNumbersOnlyFromCode([e.headline, ...e.body].join("\n"), pass);
  });

  test("11 rebuild suggestion uses code numbers only and names the fix", () => {
    for (const r of badSampleResults()) {
      const s = suggestRebuild(r);
      expect(s.prompt).toBe("rebuild");
      expect(s.steps.length).toBeGreaterThan(0);
      expectNumbersOnlyFromCode(s.steps.join("\n"), r);
    }
    const pass = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS }, diecut());
    expect(suggestRebuild(pass).steps.length).toBeGreaterThan(0);
  });

  test("12 tone lint holds zero banned words on every user-facing string", () => {
    const results = [
      preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS }, diecut()),
      ...badSampleResults(),
    ];
    const texts: string[] = [];
    for (const r of results) {
      texts.push(composeMessage(r));
      for (const t of buildChecklist(r)) texts.push(`${t.label} ${t.detail}`);
      const e = explainFix(r);
      texts.push(e.headline, ...e.body);
      texts.push(...suggestRebuild(r).steps);
    }
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) {
      expect(lintTone(t), `banned word in ${JSON.stringify(t)}`).toBe(true);
      expect(() => assertCleanTone(t)).not.toThrow();
    }
    expect(() => assertCleanTone("sorry for the delay")).toThrow();
  });

  test("13 confidence is high on PASS, lower on SOFT-FAIL, and always waits for approve", () => {
    const pass = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS }, diecut());
    expect(wordingConfidence(pass)).toBe("high");
    expect(explainFix(pass).confidence).toBe("high");
    expect(explainFix(pass).needsApprove).toBe(true);
    expect(suggestRebuild(pass).needsApprove).toBe(true);

    const single = preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS, cutlinePresent: false }, diecut());
    expect(single.fails.length).toBe(1);
    expect(wordingConfidence(single)).toBe("medium");
    expect(explainFix(single).needsApprove).toBe(true);

    const multi = preflight(
      450, 450, ORDERED_3X3,
      { ...BASE_EXTRAS, bleedWidthIn: 0.05, whiteInkPresent: false, minTextPt: 4.5 },
      clear(),
    );
    expect(multi.fails.length).toBeGreaterThan(1);
    expect(wordingConfidence(multi)).toBe("low");
    expect(suggestRebuild(multi).needsApprove).toBe(true);
  });
});

describe("ticket 05 gate: corpus hardening", () => {
  test("14 accuracy stays 90 percent or better on the 60-file corpus", async () => {
    const manifest = (await Bun.file(join("corpus", "manifest.json")).json()) as ManifestItem[];
    expect(manifest.length).toBe(60);
    let correct = 0;
    for (const it of manifest) {
      const r = await preflightFile(
        join("corpus", it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      if (r.verdict === it.expectedVerdict && it.expectedFails.every((f) => r.fails.includes(f))) {
        correct++;
      }
    }
    expect(correct / manifest.length).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  test("15 p95 preflight latency stays under 30 seconds", async () => {
    const manifest = (await Bun.file(join("corpus", "manifest.json")).json()) as ManifestItem[];
    const lat: number[] = [];
    for (const it of manifest) {
      const t0 = performance.now();
      await preflightFile(
        join("corpus", it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      lat.push(performance.now() - t0);
    }
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.min(lat.length - 1, Math.ceil(0.95 * lat.length) - 1)];
    expect(p95).toBeLessThan(30_000);
  }, 120_000);

  test("16 hold rate stays under 40 percent on the corpus", async () => {
    const manifest = (await Bun.file(join("corpus", "manifest.json")).json()) as ManifestItem[];
    const jobs: Job[] = [];
    for (const [i, it] of manifest.entries()) {
      const r = await preflightFile(
        join("corpus", it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      jobs.push(createJob(`corpus-${i}`, it.file, it.productId, { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn }, r));
    }
    const d = computeMetrics(jobs);
    expect(d.holdRate).toBeLessThan(0.4);
    expect(d.holdGuardOk).toBe(true);
  }, 120_000);

  test("17 measurements stay within 2 percent of corpus ground truth", async () => {
    const manifest = (await Bun.file(join("corpus", "manifest.json")).json()) as ManifestItem[];
    for (const it of manifest) {
      const r = await preflightFile(
        join("corpus", it.file),
        { widthIn: it.orderedWidthIn, heightIn: it.orderedHeightIn },
        it.productId,
      );
      const ppiErr = Math.abs(r.measurements.ppi - it.targetPpi) / it.targetPpi;
      expect(ppiErr).toBeLessThanOrEqual(0.02);
      expect(r.measurements.bleedWidthIn).toBeCloseTo(it.bleedWidthIn, 9);
      expect(r.measurements.cutlinePresent).toBe(it.cutlinePresent);
    }
  }, 120_000);
});

describe("ticket 05 gate: audit plus demo prep", () => {
  test("18 audit log records timed approve and reject, SOFT-FAIL never auto-sends", () => {
    const passJob = createJob(
      "clean-1", "clean-1.png", "die-cut", ORDERED_3X3,
      preflight(900, 900, ORDERED_3X3, { ...BASE_EXTRAS }, diecut()),
    );
    const failJob = createJob(
      "ppi-1", "ppi-1.png", "die-cut", ORDERED_3X3,
      preflight(216, 216, ORDERED_3X3, { ...BASE_EXTRAS }, diecut()),
    );
    let log: AuditEntry[] = [];
    const elapsed = timeDecision(1_000, 1_000 + 4 * 60 * 1_000);
    log = recordReview(log, passJob, "approve", "artist-1", elapsed, 2_000);
    log = recordReview(log, failJob, "reject", "artist-1", elapsed, 3_000);
    expect(log[0]).toMatchObject({ jobId: "clean-1", actor: "artist-1", decision: "approve", verdict: "PASS" });
    expect(log[1]).toMatchObject({ jobId: "ppi-1", actor: "artist-1", decision: "reject", verdict: "SOFT-FAIL" });

    expect(shouldAutoSend("PASS", "high")).toBe(true);
    expect(shouldAutoSend("SOFT-FAIL", "high")).toBe(false);
    expect(shouldAutoSend("PASS", "low")).toBe(false);
    log = recordAutoSend(log, passJob, "system", "high", 500, 4_000);
    expect(log.at(-1)!.decision).toBe("auto-send");
    expect(() => recordAutoSend(log, failJob, "system", "high", 500, 5_000)).toThrow();

    for (const a of ["auto-charge", "auto-reprint", "auto-scrap"]) {
      expect(isAllowedAction(a)).toBe(false);
      expect(() => assertAllowedAction(a)).toThrow();
    }
  });

  test("19 demo prep ships README plus 3-minute script with ROI, overlays, before-after, production path", async () => {
    const readme = await Bun.file(join(import.meta.dir, "..", "README.md")).text();
    const script = await Bun.file(join(import.meta.dir, "..", "docs", "demo-script.md")).text();
    const low = readme.toLowerCase();
    for (const needle of ["roi", "orders per month", "assum", "weakest", "300", "0.125", "6pt", "audit", "guru", "rip", "reply", "shadow"]) {
      expect(low.includes(needle), `README misses ${needle}`).toBe(true);
    }
    const slow = script.toLowerCase();
    for (const needle of ["72dpi", "magenta", "bleed", "roi", "guru", "rip", "reply"]) {
      expect(slow.includes(needle), `demo script misses ${needle}`).toBe(true);
    }
    expect(slow.includes("20") && slow.includes("4")).toBe(true);
  });
});
