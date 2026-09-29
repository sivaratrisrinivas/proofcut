import { NextResponse } from "next/server";
import { filterQueue, normalizeFilter } from "../../../src/queue";
import { loadSeedJobs } from "./seeds";

export async function GET(req: Request) {
  try {
    const filter = new URL(req.url).searchParams.get("filter") ?? "all";
    const jobs = await loadSeedJobs();
    return NextResponse.json({ jobs: filterQueue(jobs, normalizeFilter(filter)), total: jobs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "queue failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
