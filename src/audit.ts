import type { Verdict } from "./preflight";
import type { Job } from "./queue";

export type Decision = "approve" | "reject" | "auto-send";

export interface AuditEntry {
  jobId: string;
  actor: string;
  decision: Decision;
  verdict: Verdict;
  elapsedMs: number;
  atMs: number;
}

export type AutoSendConfidence = "high" | "low";

export const FORBIDDEN_ACTIONS = ["auto-charge", "auto-reprint", "auto-scrap"] as const;

export type ForbiddenAction = (typeof FORBIDDEN_ACTIONS)[number];

export function isAllowedAction(action: string): boolean {
  return !(FORBIDDEN_ACTIONS as readonly string[]).includes(action);
}

export function assertAllowedAction(action: string): void {
  if (!isAllowedAction(action)) {
    throw new Error(`forbidden action: ${action}`);
  }
}

export function timeDecision(startMs: number, endMs: number): number {
  const elapsed = endMs - startMs;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new Error("decision timer needs endMs >= startMs");
  }
  return elapsed;
}

export function logDecision(log: AuditEntry[], entry: AuditEntry): AuditEntry[] {
  if (!entry.jobId || !entry.actor) throw new Error("audit entry needs jobId and actor");
  if (!Number.isFinite(entry.elapsedMs) || entry.elapsedMs < 0) {
    throw new Error("audit entry needs elapsedMs >= 0");
  }
  if (!Number.isFinite(entry.atMs)) throw new Error("audit entry needs atMs");
  return [...log, entry];
}

export function recordReview(
  log: AuditEntry[],
  job: Job,
  decision: "approve" | "reject",
  actor: string,
  elapsedMs: number,
  atMs: number,
): AuditEntry[] {
  return logDecision(log, {
    jobId: job.id,
    actor,
    decision,
    verdict: job.result.verdict,
    elapsedMs,
    atMs,
  });
}

export function shouldAutoSend(verdict: Verdict, confidence: AutoSendConfidence): boolean {
  return verdict === "PASS" && confidence === "high";
}

export function recordAutoSend(
  log: AuditEntry[],
  job: Job,
  actor: string,
  confidence: AutoSendConfidence,
  elapsedMs: number,
  atMs: number,
): AuditEntry[] {
  if (!shouldAutoSend(job.result.verdict, confidence)) {
    throw new Error("auto-send allowed only for high-confidence PASS");
  }
  return logDecision(log, {
    jobId: job.id,
    actor,
    decision: "auto-send",
    verdict: job.result.verdict,
    elapsedMs,
    atMs,
  });
}
