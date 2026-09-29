import type { Job } from "./queue";

export function nextUndecidedJob(jobs: Job[], decidedIds: ReadonlySet<string>): Job | null {
  return jobs.find((j) => !decidedIds.has(j.id)) ?? null;
}
