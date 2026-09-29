import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { preflightDemoPng, preflightUpload, type DemoSidecar } from "../../../src/upload";
import { listSpecs } from "../../../src/specs";

const ROOT = process.cwd();
const CORPUS_DIR = join(ROOT, "corpus");
const EXT_DIR = join(ROOT, "corpus-ext");

export async function GET() {
  let demoFiles: string[] = [];
  try {
    demoFiles = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".png")).sort().slice(0, 5);
  } catch {
    demoFiles = [];
  }
  return NextResponse.json({ products: listSpecs(), demoFiles });
}

function safeName(raw: string): string {
  const name = basename(raw);
  if (!/^[\w][\w.-]*\.(png|pdf)$/i.test(name)) throw new Error("unsupported demo file");
  return name;
}

async function demoPanel(name: string, ordered: { widthIn: number; heightIn: number }, productId: string) {
  const file = safeName(name);
  const dir = file.toLowerCase().endsWith(".pdf") ? EXT_DIR : CORPUS_DIR;
  const resolved = join(dir, file);
  if (!resolved.startsWith(dir)) throw new Error("unsupported demo file");
  const bytes = await readFile(resolved);
  const sidecar = JSON.parse(await readFile(`${resolved}.sidecar.json`, "utf8")) as DemoSidecar;
  return preflightDemoPng(bytes, sidecar, ordered, productId);
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const widthIn = Number(form.get("widthIn"));
    const heightIn = Number(form.get("heightIn"));
    const productId = String(form.get("productId") ?? "");
    if (!Number.isFinite(widthIn) || widthIn <= 0 || !Number.isFinite(heightIn) || heightIn <= 0) {
      return NextResponse.json({ error: "ordered size must be positive numbers" }, { status: 400 });
    }
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });
    const ordered = { widthIn, heightIn };

    const demoFile = form.get("demoFile");
    if (typeof demoFile === "string" && demoFile.length > 0) {
      return NextResponse.json(await demoPanel(demoFile, ordered, productId));
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
    const panel = preflightUpload(new Uint8Array(await file.arrayBuffer()), file.name, ordered, productId);
    return NextResponse.json(panel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "preflight failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
