import type { OrderedSize, PreflightResult } from "./preflight";

export type JobStatus = "queued" | "approved" | "rejected" | "auto-sent";

export interface Job {
  id: string;
  file: string;
  productId: string;
  ordered: OrderedSize;
  result: PreflightResult;
  status: JobStatus;
}

export type FailFilter = "all" | "low-ppi" | "bleed" | "cutline" | "white-ink" | "tiny-text";

export const QUEUE_FILTERS: FailFilter[] = [
  "all",
  "low-ppi",
  "bleed",
  "cutline",
  "white-ink",
  "tiny-text",
];

const RISK_ORDER: FailFilter[] = ["low-ppi", "bleed", "cutline", "white-ink", "tiny-text"];

export function normalizeFilter(raw: string): FailFilter {
  const v = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (v === "all") return "all";
  if (v === "low-ppi" || v === "lowppi") return "low-ppi";
  if (v === "cut-line" || v === "cutline") return "cutline";
  if (v === "white-ink" || v === "whiteink") return "white-ink";
  if (v === "tiny-text" || v === "tinytext") return "tiny-text";
  if (v === "bleed") return "bleed";
  throw new Error(`unknown fail filter: ${raw}`);
}

export function createJob(
  id: string,
  file: string,
  productId: string,
  ordered: OrderedSize,
  result: PreflightResult,
): Job {
  return { id, file, productId, ordered, result, status: "queued" };
}

export interface DemoSeed {
  id: string;
  file: string;
  productId: string;
  ordered: OrderedSize;
  result: PreflightResult;
}

export function seedQueue(seeds: DemoSeed[]): Job[] {
  return seeds.map((s) => createJob(s.id, s.file, s.productId, s.ordered, s.result));
}

export function filterQueue(jobs: Job[], filter: FailFilter | string): Job[] {
  const f = typeof filter === "string" ? normalizeFilter(filter) : filter;
  if (f === "all") return [...jobs];
  return jobs.filter((j) => j.result.fails.includes(f));
}

function riskiestRank(j: Job): number {
  for (let i = 0; i < RISK_ORDER.length; i++) {
    if (j.result.fails.includes(RISK_ORDER[i])) return i;
  }
  return RISK_ORDER.length;
}

export function sortQueueByRisk(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const ra = riskiestRank(a);
    const rb = riskiestRank(b);
    if (ra !== rb) return ra - rb;
    return b.result.fails.length - a.result.fails.length;
  });
}
