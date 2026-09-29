import { NextResponse } from "next/server";
import { computeMetrics } from "../../../src/metrics";
import { loadSeedJobs } from "../queue/seeds";

export async function GET() {
  try {
    const dashboard = computeMetrics(await loadSeedJobs());
    return NextResponse.json({ dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : "metrics failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
