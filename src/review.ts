import {
  assertAllowedAction,
  recordAutoSend,
  recordReview,
  type AuditEntry,
  type AutoSendConfidence,
} from "./audit";
import type { Job } from "./queue";

export const REVIEW_DECISIONS = ["approve", "reject", "auto-send"] as const;

export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface ReviewInput {
  decision: string;
  actor: string;
  elapsedMs: number;
  atMs: number;
  confidence?: AutoSendConfidence;
}

function assertReviewInput(input: ReviewInput): asserts input is ReviewInput & { decision: ReviewDecision } {
  if (!REVIEW_DECISIONS.includes(input.decision as ReviewDecision)) {
    assertAllowedAction(input.decision);
    throw new Error(`unknown review decision: ${input.decision}`);
  }
}

export function decide(log: AuditEntry[], job: Job, input: ReviewInput): AuditEntry[] {
  assertReviewInput(input);
  if (!job.id) throw new Error("review needs a job");
  if (!input.actor || !input.actor.trim()) throw new Error("review needs an actor");
  if (input.decision === "auto-send") {
    return recordAutoSend(log, job, input.actor, input.confidence ?? "low", input.elapsedMs, input.atMs);
  }
  return recordReview(log, job, input.decision, input.actor, input.elapsedMs, input.atMs);
}
