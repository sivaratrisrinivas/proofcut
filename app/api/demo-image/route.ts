import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const CORPUS_DIR = join(ROOT, "corpus");

export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name") ?? "";
    if (!/^[\w][\w.-]*\.png$/i.test(name)) {
      return NextResponse.json({ error: "unsupported demo file" }, { status: 400 });
    }
    const resolved = join(CORPUS_DIR, name);
    if (!resolved.startsWith(CORPUS_DIR)) {
      return NextResponse.json({ error: "unsupported demo file" }, { status: 400 });
    }
    const bytes = await readFile(resolved);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "demo file not found" }, { status: 404 });
  }
}
