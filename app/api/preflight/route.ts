import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findSample, listSamples } from "../../../src/catalog";
import { preflightSample, preflightUpload } from "../../../src/upload";
import { listSpecs } from "../../../src/specs";
import { MAX_UPLOAD_BYTES } from "../../../src/limits";

export const runtime = "nodejs";


export async function GET() {
  const samples = listSamples().map((s) => ({
    file: s.file,
    set: s.set,
    kind: s.kind,
    productId: s.productId,
    productName: s.productName,
    orderedWidthIn: s.orderedWidthIn,
    orderedHeightIn: s.orderedHeightIn,
    note: s.note,
  }));
  return NextResponse.json(
    { products: listSpecs(), samples, maxUploadBytes: MAX_UPLOAD_BYTES },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Send the file as multipart form data.");
  }
  const widthIn = Number(form.get("widthIn"));
  const heightIn = Number(form.get("heightIn"));
  const productId = String(form.get("productId") ?? "");
  if (!Number.isFinite(widthIn) || widthIn <= 0 || !Number.isFinite(heightIn) || heightIn <= 0) {
    return bad("Ordered width and height must be positive numbers.");
  }
  if (widthIn > 120 || heightIn > 120) return bad("Ordered size must be 120 inches or less per side.");
  if (!listSpecs().some((p) => p.id === productId)) return bad("Pick a product.");
  const ordered = { widthIn, heightIn };

  try {
    const sampleName = form.get("demoFile");
    if (typeof sampleName === "string" && sampleName.length > 0) {
      const sample = findSample(sampleName);
      if (!sample) return bad("Unknown sample file.");
      const path = join(process.cwd(), sample.dir, sample.file);
      const [bytes, sidecarText] = await Promise.all([readFile(path), readFile(`${path}.sidecar.json`, "utf8")]);
      const panel = preflightSample(bytes, sample.file, JSON.parse(sidecarText), ordered, productId);
      const sameOrder =
        sample.productId === productId &&
        Math.abs(sample.orderedWidthIn - widthIn) < 1e-9 &&
        Math.abs(sample.orderedHeightIn - heightIn) < 1e-9;
      return NextResponse.json({
        ...panel,
        groundTruth: {
          expectedVerdict: sample.expectedVerdict,
          expectedFails: sample.expectedFails,
          sameOrder,
          matches:
            sameOrder &&
            panel.result?.verdict === sample.expectedVerdict &&
            [...(panel.result?.fails ?? [])].sort().join(",") === [...sample.expectedFails].sort().join(","),
        },
      });
    }

    const file = form.get("file");
    if (!(file instanceof File)) return bad("Choose a PNG or PDF file, or pick a sample.");
    if (file.size === 0) return bad("That file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) return bad("Files over 4.5 MB do not fit the host limit. Export a smaller PNG.", 413);
    if (!/\.(png|pdf)$/i.test(file.name)) return bad("Only PNG and PDF files are supported.");
    return NextResponse.json(preflightUpload(new Uint8Array(await file.arrayBuffer()), file.name, ordered, productId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "preflight failed";
    const friendly = /^not a png|^unsupported upload/.test(message)
      ? `This file could not be read (${message}).`
      : message;
    return bad(friendly, 422);
  }
}
