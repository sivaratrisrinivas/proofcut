import type { Job } from "./queue";

export const TOUCHES_BEFORE = 3;
export const TOUCHES_AFTER = 1;
export const MINUTES_SAVED_PER_AUTOPASS = 16;
export const HOLD_RATE_GUARD = 0.4;

export interface Dashboard {
  total: number;
  passes: number;
  holds: number;
  autoPassPct: number;
  holdRate: number;
  touchesPerJob: number;
  minutesSaved: number;
  holdGuardOk: boolean;
}

export function computeMetrics(jobs: Job[]): Dashboard {
  const total = jobs.length;
  if (total === 0) {
    return {
      total: 0,
      passes: 0,
      holds: 0,
      autoPassPct: 0,
      holdRate: 0,
      touchesPerJob: 0,
      minutesSaved: 0,
      holdGuardOk: true,
    };
  }
  let passes = 0;
  let decidedTouches = 0;
  for (const j of jobs) {
    if (j.result.verdict === "PASS") passes++;
    if (j.status !== "queued") decidedTouches += TOUCHES_AFTER;
  }
  const holds = total - passes;
  const autoPassPct = (passes / total) * 100;
  const holdRate = holds / total;
  return {
    total,
    passes,
    holds,
    autoPassPct,
    holdRate,
    touchesPerJob: decidedTouches / total,
    minutesSaved: passes * MINUTES_SAVED_PER_AUTOPASS,
    holdGuardOk: holdRate < HOLD_RATE_GUARD,
  };
}
