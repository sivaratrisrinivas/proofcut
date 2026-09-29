import { readPngDims } from "./png";
import { hasCutContourSpot, hasWhiteInkSpot } from "./pdf";
import { preflight, type OrderedSize, type PreflightExtras, type PreflightResult } from "./preflight";
import { getSpec } from "./specs";

export interface Sidecar {
  bleedWidthIn: number;
  cutlinePresent?: boolean;
  whiteInkPresent?: boolean | null;
  minTextPt?: number | null;
  colorMode?: string | null;
  hasTransparency?: boolean | null;
  pixelWidth?: number;
  pixelHeight?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function readSidecar(filePath: string): Promise<Sidecar> {
  const sidecarPath = `${filePath}.sidecar.json`;
  const f = Bun.file(sidecarPath);
  if (!(await f.exists())) {
    throw new Error(`missing sidecar: ${sidecarPath}`);
  }
  const json = (await f.json()) as Partial<Sidecar>;
  if (!isRecord(json) || typeof json.bleedWidthIn !== "number") {
    throw new Error(`bad sidecar: ${sidecarPath}`);
  }
  const out: Sidecar = { bleedWidthIn: json.bleedWidthIn };
  if (typeof json.cutlinePresent === "boolean") out.cutlinePresent = json.cutlinePresent;
  if (typeof json.whiteInkPresent === "boolean" || json.whiteInkPresent === null) {
    out.whiteInkPresent = json.whiteInkPresent;
  }
  if (typeof json.minTextPt === "number" || json.minTextPt === null) {
    out.minTextPt = json.minTextPt;
  }
  if (typeof json.colorMode === "string" || json.colorMode === null) {
    out.colorMode = json.colorMode;
  }
  if (typeof json.hasTransparency === "boolean" || json.hasTransparency === null) {
    out.hasTransparency = json.hasTransparency;
  }
  if (typeof json.pixelWidth === "number") out.pixelWidth = json.pixelWidth;
  if (typeof json.pixelHeight === "number") out.pixelHeight = json.pixelHeight;
  return out;
}

export async function preflightFile(
  filePath: string,
  ordered: OrderedSize,
  productId: string,
): Promise<PreflightResult> {
  const spec = getSpec(productId);
  const sidecar = await readSidecar(filePath);

  if (filePath.toLowerCase().endsWith(".pdf")) {
    const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());
    if (typeof sidecar.pixelWidth !== "number" || typeof sidecar.pixelHeight !== "number") {
      throw new Error(`pdf sidecar missing pixelWidth/pixelHeight: ${filePath}.sidecar.json`);
    }
    const extras: PreflightExtras = {
      bleedWidthIn: sidecar.bleedWidthIn,
      cutlinePresent: hasCutContourSpot(buf),
      whiteInkPresent: hasWhiteInkSpot(buf),
      minTextPt: sidecar.minTextPt ?? null,
      colorMode: sidecar.colorMode ?? null,
      hasTransparency: sidecar.hasTransparency ?? null,
    };
    return preflight(sidecar.pixelWidth, sidecar.pixelHeight, ordered, extras, spec);
  }

  const bytes = await Bun.file(filePath).arrayBuffer();
  const { width, height } = readPngDims(Buffer.from(bytes));
  const extras: PreflightExtras = {
    bleedWidthIn: sidecar.bleedWidthIn,
    cutlinePresent: sidecar.cutlinePresent ?? false,
    whiteInkPresent: sidecar.whiteInkPresent ?? null,
    minTextPt: sidecar.minTextPt ?? null,
    colorMode: sidecar.colorMode ?? null,
    hasTransparency: sidecar.hasTransparency ?? null,
  };
  return preflight(width, height, ordered, extras, spec);
}
