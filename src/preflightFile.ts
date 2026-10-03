import { hasCutContourSpot, hasWhiteInkSpot } from "./pdf";
import {
  computePpi,
  preflight,
  type MeasurementSources,
  type OrderedSize,
  type PreflightExtras,
  type PreflightResult,
} from "./preflight";
import { measurePngContent } from "./preflightContent";
import { getSpec } from "./specs";

export interface Sidecar {
  bleedWidthIn?: number;
  cutlinePresent?: boolean;
  whiteInkPresent?: boolean | null;
  minTextPt?: number | null;
  colorMode?: string | null;
  hasTransparency?: boolean | null;
  pixelWidth?: number;
  pixelHeight?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keeps only well-typed sidecar fields; anything else is dropped, never guessed. */
export function parseSidecar(json: unknown, label = "sidecar"): Sidecar {
  if (!isRecord(json)) {
    throw new Error(`bad sidecar: ${label}`);
  }
  const out: Sidecar = {};
  if (typeof json.bleedWidthIn === "number") out.bleedWidthIn = json.bleedWidthIn;
  if (typeof json.cutlinePresent === "boolean") out.cutlinePresent = json.cutlinePresent;
  if (typeof json.whiteInkPresent === "boolean" || json.whiteInkPresent === null) {
    out.whiteInkPresent = json.whiteInkPresent as boolean | null;
  }
  if (typeof json.minTextPt === "number" || json.minTextPt === null) {
    out.minTextPt = json.minTextPt as number | null;
  }
  if (typeof json.colorMode === "string" || json.colorMode === null) {
    out.colorMode = json.colorMode as string | null;
  }
  if (typeof json.hasTransparency === "boolean" || json.hasTransparency === null) {
    out.hasTransparency = json.hasTransparency as boolean | null;
  }
  if (typeof json.pixelWidth === "number") out.pixelWidth = json.pixelWidth;
  if (typeof json.pixelHeight === "number") out.pixelHeight = json.pixelHeight;
  return out;
}

export async function readSidecar(filePath: string): Promise<Sidecar> {
  const sidecarPath = `${filePath}.sidecar.json`;
  const f = Bun.file(sidecarPath);
  if (!(await f.exists())) {
    throw new Error(`missing sidecar: ${sidecarPath}`);
  }
  return parseSidecar(await f.json(), sidecarPath);
}

export async function preflightFile(
  filePath: string,
  ordered: OrderedSize,
  productId: string,
): Promise<PreflightResult> {
  const sidecar = await readSidecar(filePath);
  const bytes = Buffer.from(await Bun.file(filePath).arrayBuffer());
  return preflightBytes(bytes, filePath, sidecar, ordered, productId);
}

/**
 * Pure core shared by the harness (preflightFile) and the web app. PNG:
 * size, bleed, RGB black and transparency come from decoded pixels unless
 * the sidecar declares them; cut line, white ink and text come from the
 * sidecar. PDF: cut line and white ink come from the PDF bytes; size,
 * bleed and text come from the sidecar.
 */
export function preflightBytes(
  bytes: Uint8Array | Buffer,
  filename: string,
  sidecar: Sidecar,
  ordered: OrderedSize,
  productId: string,
): PreflightResult {
  const spec = getSpec(productId);

  if (filename.toLowerCase().endsWith(".pdf")) {
    const buf = Buffer.from(bytes);
    if (typeof sidecar.pixelWidth !== "number" || typeof sidecar.pixelHeight !== "number") {
      throw new Error(`pdf sidecar missing pixelWidth/pixelHeight: ${filename}.sidecar.json`);
    }
    if (typeof sidecar.bleedWidthIn !== "number") {
      throw new Error(`pdf sidecar missing bleedWidthIn: ${filename}.sidecar.json`);
    }
    const extras: PreflightExtras = {
      bleedWidthIn: sidecar.bleedWidthIn,
      cutlinePresent: hasCutContourSpot(buf),
      whiteInkPresent: hasWhiteInkSpot(buf),
      minTextPt: sidecar.minTextPt ?? null,
      colorMode: sidecar.colorMode ?? null,
      hasTransparency: sidecar.hasTransparency ?? null,
    };
    const result = preflight(sidecar.pixelWidth, sidecar.pixelHeight, ordered, extras, spec);
    const sources: MeasurementSources = {
      ppi: "sidecar",
      dims: "sidecar",
      bleed: "sidecar",
      cutline: "content",
      whiteInk: "content",
      text: "sidecar",
      color: "sidecar",
      transparency: "sidecar",
    };
    return { ...result, sources };
  }

  const content = measurePngContent(Buffer.from(bytes));
  const ppi = computePpi(content.pixelWidth, content.pixelHeight, ordered);
  // Declared beats measured: legacy L1 sidecars carry injected bleed faults and
  // the L1 gate is frozen; L2 sidecars declare no bleed, so pixels rule there.
  const bleedWidthIn =
    sidecar.bleedWidthIn ??
    Math.max(0, spec.bleedRequiredIn - content.edgeDepthPx / ppi);
  const colorMode = sidecar.colorMode ?? (content.blackPixelCount > 0 ? "RGB" : null);
  const extras: PreflightExtras = {
    bleedWidthIn,
    cutlinePresent: sidecar.cutlinePresent ?? false,
    whiteInkPresent: sidecar.whiteInkPresent ?? null,
    minTextPt: sidecar.minTextPt ?? null,
    colorMode,
    hasTransparency: sidecar.hasTransparency ?? content.hasTransparency,
  };
  const result = preflight(content.pixelWidth, content.pixelHeight, ordered, extras, spec);
  const declared = (v: unknown): "content" | "sidecar" => (v != null ? "sidecar" : "content");
  const sources: MeasurementSources = {
    ppi: "content",
    dims: "content",
    bleed: declared(sidecar.bleedWidthIn),
    cutline: "sidecar",
    whiteInk: "sidecar",
    text: "sidecar",
    color: declared(sidecar.colorMode),
    transparency: declared(sidecar.hasTransparency),
  };
  return { ...result, sources };
}
