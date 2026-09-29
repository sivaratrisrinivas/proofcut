import { NextResponse } from "next/server";
import { decide } from "../../../src/review";
import type { AutoSendConfidence } from "../../../src/audit";
import { loadSeedJobs } from "../queue/seeds";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      jobId?: unknown;
      decision?: unknown;
      actor?: unknown;
      elapsedMs?: unknown;
      atMs?: unknown;
      confidence?: unknown;
    };
    if (typeof body.jobId !== "string" || !body.jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    const jobs = await loadSeedJobs();
    const job = jobs.find((j) => j.id === body.jobId);
    if (!job) return NextResponse.json({ error: `unknown job: ${body.jobId}` }, { status: 404 });
    const entry = decide([], job, {
      decision: typeof body.decision === "string" ? body.decision : "",
      actor: typeof body.actor === "string" ? body.actor : "",
      elapsedMs: typeof body.elapsedMs === "number" ? body.elapsedMs : NaN,
      atMs: typeof body.atMs === "number" ? body.atMs : Date.now(),
      confidence: typeof body.confidence === "string" ? (body.confidence as AutoSendConfidence) : undefined,
    })[0];
    return NextResponse.json({ entry, jobId: job.id, verdict: job.result.verdict });
  } catch (err) {
    const message = err instanceof Error ? err.message : "review failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
