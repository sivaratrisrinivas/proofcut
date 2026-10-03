import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { samplePath } from "../../../src/samplePath";
import { findSample } from "../../../src/catalog";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const sample = findSample(name);
  if (!sample || sample.kind !== "png") {
    return NextResponse.json({ error: "unsupported demo file" }, { status: 400 });
  }
  try {
    const bytes = await readFile(samplePath(sample));
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "demo file not found" }, { status: 404 });
  }
}
