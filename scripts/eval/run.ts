// Preflight eval: runs every case with known answers through preflightFile
// (the same code the web app uses for samples) and scores it.
//
//   bun run eval            print tables, write evals/preflight-results.{json,md}
//   bun run eval --check    also fail if any score drops below evals/preflight-baseline.json
//   bun run eval --baseline write the current scores as the new baseline
//
// Sets:
//   L1    corpus/              60 geometry files  (dev: thresholds were frozen on these)
//   L2    corpus-l2-content/   42 art files       (dev: built with the same formulas as the checks)
//   fresh evals/fresh/         held-out cases from scripts/eval/generate_fresh.py,
//                              written separately, never used to build or tune a check
import { join } from "node:path";
import { preflightFile } from "../../src/preflightFile";

const ROOT = join(import.meta.dir, "..", "..");
const FAIL_CHECKS = ["low-ppi", "bleed", "cutline", "white-ink", "tiny-text", "dims-mismatch"] as const;
const WARN_CHECKS = ["rgb-black-auto-convert", "transparency-auto-convert"] as const;

interface Case {
  set: "L1" | "L2" | "fresh";
  file: string;
  dir: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
  expectedWarnings?: string[];
  fault?: string;
  encoding?: string;
  note?: string;
  kind: string;
}

interface Outcome extends Case {
  verdict: "PASS" | "SOFT-FAIL" | "ERROR";
  fails: string[];
  warnings: string[];
  error?: string;
  verdictOk: boolean;
  exact: boolean;
}

async function load(set: Case["set"], dir: string): Promise<Case[]> {
  const rows = (await Bun.file(join(ROOT, dir, "manifest.json")).json()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    set,
    dir,
    kind: String(r.kind ?? (String(r.file).endsWith(".pdf") ? "pdf" : "png")),
    file: String(r.file),
    productId: String(r.productId),
    orderedWidthIn: Number(r.orderedWidthIn),
    orderedHeightIn: Number(r.orderedHeightIn),
    expectedVerdict: r.expectedVerdict as Case["expectedVerdict"],
    expectedFails: (r.expectedFails as string[]) ?? [],
    expectedWarnings: r.expectedWarnings as string[] | undefined,
    fault: r.fault as string | undefined,
    encoding: r.encoding as string | undefined,
    note: r.note as string | undefined,
  }));
}

const sameSet = (a: string[], b: string[]) => [...a].sort().join(",") === [...b].sort().join(",");

async function run(c: Case): Promise<Outcome> {
  try {
    const r = await preflightFile(join(ROOT, c.dir, c.file), { widthIn: c.orderedWidthIn, heightIn: c.orderedHeightIn }, c.productId);
    const verdictOk = r.verdict === c.expectedVerdict;
    const warnOk = c.expectedWarnings ? sameSet(r.warnings.filter((w) => w !== "low-ppi-warn"), c.expectedWarnings) : true;
    return { ...c, verdict: r.verdict, fails: r.fails, warnings: r.warnings, verdictOk, exact: verdictOk && sameSet(r.fails, c.expectedFails) && warnOk };
  } catch (err) {
    return { ...c, verdict: "ERROR", fails: [], warnings: [], error: err instanceof Error ? err.message : String(err), verdictOk: false, exact: false };
  }
}

interface Confusion { tp: number; fn: number; fp: number; tn: number }

function confusion(items: Outcome[], expected: (o: Outcome) => boolean, predicted: (o: Outcome) => boolean): Confusion {
  const c = { tp: 0, fn: 0, fp: 0, tn: 0 };
  for (const o of items) {
    const e = expected(o);
    const p = predicted(o);
    if (e && p) c.tp++;
    else if (e) c.fn++;
    else if (p) c.fp++;
    else c.tn++;
  }
  return c;
}

/** Wilson 95% interval, so small counts show their uncertainty. */
function wilson(k: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const pct = (k: number, n: number) => (n === 0 ? "n/a" : `${((100 * k) / n).toFixed(1)}%`);
const pctCi = (k: number, n: number) => {
  const ci = wilson(k, n);
  return ci ? `${pct(k, n)} (${k}/${n}, ${(100 * ci[0]).toFixed(0)} to ${(100 * ci[1]).toFixed(0)})` : "n/a";
};

function summary(items: Outcome[]) {
  const v = confusion(items, (o) => o.expectedVerdict === "SOFT-FAIL", (o) => o.verdict !== "PASS");
  return {
    n: items.length,
    verdictCorrect: items.filter((o) => o.verdictOk).length,
    exact: items.filter((o) => o.exact).length,
    errors: items.filter((o) => o.verdict === "ERROR").length,
    verdict: v,
  };
}

function checkTable(items: Outcome[]) {
  const rows: Array<{ check: string } & Confusion> = [];
  for (const chk of FAIL_CHECKS) {
    rows.push({ check: chk, ...confusion(items, (o) => o.expectedFails.includes(chk), (o) => o.fails.includes(chk)) });
  }
  const withWarn = items.filter((o) => o.expectedWarnings);
  for (const chk of WARN_CHECKS) {
    rows.push({ check: chk, ...confusion(withWarn, (o) => o.expectedWarnings!.includes(chk), (o) => o.warnings.includes(chk)) });
  }
  return rows;
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

const args = new Set(process.argv.slice(2));
const started = performance.now();
const cases = [...(await load("L1", "corpus")), ...(await load("L2", "corpus-l2-content")), ...(await load("fresh", "evals/fresh"))];
const outcomes: Outcome[] = [];
for (const c of cases) outcomes.push(await run(c));
const ms = Math.round(performance.now() - started);

const sets = groupBy(outcomes, (o) => o.set);
const fresh = sets.get("fresh") ?? [];
const md: string[] = [];
md.push("# Preflight eval results", "", `Generated by \`bun run eval\`. ${outcomes.length} cases, ${ms} ms.`, "");
md.push("Positive class is SOFT-FAIL (the file needs a fix). TPR is the share of bad files caught. TNR is the share of good files let through. Ranges are 95% Wilson intervals.", "");
md.push("## Verdicts by set", "", "| Set | Cases | Verdict right | Exact (verdict, fails, warnings) | TPR (bad caught) | TNR (good passed) | Precision | TP | FN | FP | TN |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [name, items] of sets) {
  const s = summary(items);
  const v = s.verdict;
  md.push(`| ${name} | ${s.n} | ${pct(s.verdictCorrect, s.n)} | ${pct(s.exact, s.n)} | ${pctCi(v.tp, v.tp + v.fn)} | ${pctCi(v.tn, v.tn + v.fp)} | ${pct(v.tp, v.tp + v.fp)} | ${v.tp} | ${v.fn} | ${v.fp} | ${v.tn} |`);
}
md.push("", "## Per check", "");
for (const [name, items] of [["L1 + L2 (dev)", [...(sets.get("L1") ?? []), ...(sets.get("L2") ?? [])]], ["fresh (held out)", fresh]] as const) {
  md.push(`### ${name}`, "", "| Check | TPR (caught) | TNR (no false alarm) | TP | FN | FP | TN |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of checkTable(items as Outcome[])) {
    md.push(`| ${r.check} | ${pctCi(r.tp, r.tp + r.fn)} | ${pctCi(r.tn, r.tn + r.fp)} | ${r.tp} | ${r.fn} | ${r.fp} | ${r.tn} |`);
  }
  md.push("");
}
const breakdown = (title: string, items: Outcome[], key: (o: Outcome) => string) => {
  md.push(`## ${title}`, "", "| Group | Cases | Verdict right | Exact |", "| --- | --- | --- | --- |");
  for (const [g, xs] of groupBy(items, key)) md.push(`| ${g} | ${xs.length} | ${pct(xs.filter((o) => o.verdictOk).length, xs.length)} | ${pct(xs.filter((o) => o.exact).length, xs.length)} |`);
  md.push("");
};
breakdown("By product, dev (L1 + L2)", outcomes.filter((o) => o.set !== "fresh"), (o) => o.productId);
breakdown("By product, fresh (held out)", fresh, (o) => o.productId);
breakdown("Fresh set by fault built in", fresh, (o) => o.fault?.split(" ")[0] ?? "");
breakdown("Fresh set by file encoding", fresh, (o) => o.encoding ?? "");

const misses = outcomes.filter((o) => !o.exact);
md.push("## Every miss", "", "| Set | File | Product | Built as | Expected | Got |", "| --- | --- | --- | --- | --- | --- |");
const fmt = (v: string, f: string[], w: string[]) => `${v}${f.length ? ` [${f.join(", ")}]` : ""}${w.length ? ` warn [${w.map((x) => x.replace("-auto-convert", "")).join(", ")}]` : ""}`;
for (const o of misses) {
  md.push(`| ${o.set} | ${o.file} | ${o.productId} | ${o.note ?? ""} | ${fmt(o.expectedVerdict, o.expectedFails, o.expectedWarnings ?? [])} | ${o.error ? `ERROR ${o.error}` : fmt(o.verdict, o.fails, o.warnings.filter((w) => w !== "low-ppi-warn"))} |`);
}
md.push("");

const scores: Record<string, { n: number; verdictCorrect: number; exact: number }> = {};
for (const [name, items] of sets) {
  const s = summary(items);
  scores[name] = { n: s.n, verdictCorrect: s.verdictCorrect, exact: s.exact };
}
await Bun.write(join(ROOT, "evals", "preflight-results.md"), md.join("\n"));
await Bun.write(
  join(ROOT, "evals", "preflight-results.json"),
  JSON.stringify({ scores, sets: Object.fromEntries([...sets].map(([k, v]) => [k, { ...summary(v), checks: checkTable(v) }])), misses: misses.map(({ dir, ...o }) => o) }, null, 1) + "\n",
);
console.log(md.slice(0, md.indexOf("## By product, dev (L1 + L2)")).join("\n"));
console.log(`misses: ${misses.length} (full list in evals/preflight-results.md)`);

const baselinePath = join(ROOT, "evals", "preflight-baseline.json");
if (args.has("--baseline")) {
  await Bun.write(baselinePath, JSON.stringify(scores, null, 1) + "\n");
  console.log("baseline written");
}
if (args.has("--check")) {
  const base = (await Bun.file(baselinePath).json()) as typeof scores;
  const problems: string[] = [];
  for (const [name, b] of Object.entries(base)) {
    const s = scores[name];
    if (!s) problems.push(`${name}: set missing`);
    else {
      if (s.n !== b.n) problems.push(`${name}: case count ${s.n} vs baseline ${b.n}`);
      if (s.verdictCorrect < b.verdictCorrect) problems.push(`${name}: verdicts right ${s.verdictCorrect} < baseline ${b.verdictCorrect}`);
      if (s.exact < b.exact) problems.push(`${name}: exact ${s.exact} < baseline ${b.exact}`);
    }
  }
  for (const name of ["L1", "L2"]) if (scores[name] && scores[name].exact !== scores[name].n) problems.push(`${name}: corpus must stay at 100%`);
  if (problems.length) {
    console.error(`eval gate failed:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("eval gate passed (no score below baseline)");
}
