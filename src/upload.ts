import { readPdfDims, hasCutContourSpot, hasWhiteInkSpot } from "./pdf";
import { readPngDims } from "./png";
import { computePpi, preflight, type MeasurementSources, type OrderedSize, type PreflightResult } from "./preflight";
import { measurePngContent } from "./preflightContent";
import { parseSidecar, preflightBytes } from "./preflightFile";
import { getSpec } from "./specs";
import { buildChecklist } from "./draft";

/**
 * measured: read from the file bytes. sidecar: declared in the file's
 * sidecar JSON. spec: the product does not need this check.
 * unavailable: this file type does not carry the signal.
 */
export type RowSource = "measured" | "sidecar" | "spec" | "unavailable";

export interface PanelRow {
  id: string;
  label: string;
  display: string;
  source: RowSource;
  ok: boolean | null;
}

export interface UploadPanel {
  rows: PanelRow[];
  result: PreflightResult | null;
  needsReview: boolean;
}

const ROW_IDS = ["ppi", "dims", "bleed", "cutline", "color", "white-ink", "tiny-text", "transparency"];

const ROW_SOURCE_KEY: Record<string, keyof MeasurementSources> = {
  ppi: "ppi",
  dims: "dims",
  bleed: "bleed",
  cutline: "cutline",
  color: "color",
  "white-ink": "whiteInk",
  "tiny-text": "text",
  transparency: "transparency",
};

function unknownRow(id: string, label: string, hint: string): PanelRow {
  return { id, label, display: `Unknown: ${hint}`, source: "unavailable", ok: null };
}

function assertPdfHeader(text: string, filename: string): void {
  if (!text.startsWith("%PDF")) throw new Error(`unsupported upload: ${filename} is not a PDF`);
}

/** One row per checklist tick, each tagged with where its number came from. */
export function panelRows(result: PreflightResult): PanelRow[] {
  const sources = result.sources ?? {};
  const rows = buildChecklist(result).map((t) => {
    const src = sources[ROW_SOURCE_KEY[t.id]];
    return {
      id: t.id,
      label: t.label,
      display: t.detail,
      source: (src === "content" ? "measured" : "sidecar") as RowSource,
      ok: t.ok,
    };
  });
  if (rows.map((r) => r.id).join(",") !== ROW_IDS.join(",")) {
    throw new Error("panel rows drifted from checklist");
  }
  return rows;
}

/** Runs one corpus sample: file bytes plus its sidecar JSON, same path as the harness. */
export function preflightSample(
  bytes: Uint8Array | Buffer,
  filename: string,
  sidecarJson: unknown,
  ordered: OrderedSize,
  productId: string,
): UploadPanel {
  const result = preflightBytes(bytes, filename, parseSidecar(sidecarJson, `${filename}.sidecar.json`), ordered, productId);
  return { rows: panelRows(result), result, needsReview: false };
}

function fmtIn(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function pdfPanel(bytes: Uint8Array | Buffer, filename: string, ordered: OrderedSize, productId: string): UploadPanel {
  const spec = getSpec(productId);
  const text = Buffer.from(bytes).toString("latin1");
  assertPdfHeader(text, filename);
  const cutline = hasCutContourSpot(text);
  const whiteInk = hasWhiteInkSpot(text);
  const box = readPdfDims(text);
  let dims: PanelRow = unknownRow("dims", "Dimensions", "no readable media box");
  if (box) {
    const wIn = box.width / 72;
    const hIn = box.height / 72;
    const aspectErr = Math.abs(wIn / hIn - ordered.widthIn / ordered.heightIn) / (ordered.widthIn / ordered.heightIn);
    const match = aspectErr <= 0.02;
    dims = {
      id: "dims",
      label: "Dimensions",
      display: `${fmtIn(wIn)}x${fmtIn(hIn)}in page ${match ? "matches" : "differs from"} ordered shape`,
      source: "measured",
      ok: match,
    };
  }
  const rows: PanelRow[] = [
    unknownRow("ppi", "Resolution", "PDF needs rasterizing for PPI"),
    dims,
    unknownRow("bleed", "Bleed", "no cut-line reference measured yet"),
    spec.cutlineRequired
      ? {
          id: "cutline",
          label: "Cut line",
          display: cutline ? "CutContour path present" : "CutContour path missing",
          source: "measured",
          ok: cutline,
        }
      : { id: "cutline", label: "Cut line", display: `Not required for ${spec.displayName}`, source: "spec", ok: true },
    unknownRow("color", "Color mode", "not extracted from PDF yet"),
    spec.whiteInkRequired
      ? {
          id: "white-ink",
          label: "White ink",
          display: whiteInk ? "White underbase present" : "White underbase missing",
          source: "measured",
          ok: whiteInk,
        }
      : { id: "white-ink", label: "White ink", display: `Not required for ${spec.displayName}`, source: "spec", ok: true },
    unknownRow("tiny-text", "Tiny text", "no OCR on upload yet"),
    unknownRow("transparency", "Transparency", "not extracted from PDF yet"),
  ];
  return { rows, result: null, needsReview: true };
}

function pngDimsOnlyPanel(bytes: Uint8Array | Buffer, ordered: OrderedSize, productId: string, why: string): UploadPanel {
  const { width, height } = readPngDims(bytes);
  const ppi = computePpi(width, height, ordered);
  const probe = preflight(width, height, ordered, { bleedWidthIn: 0, cutlinePresent: false }, getSpec(productId));
  const rows: PanelRow[] = [
    { id: "ppi", label: "Resolution", display: `${Math.round(ppi)} PPI at ordered size`, source: "measured", ok: !probe.fails.includes("low-ppi") },
    {
      id: "dims",
      label: "Dimensions",
      display: `${width}x${height}px ${probe.measurements.dimsMatch ? "matches" : "differs from"} ordered size`,
      source: "measured",
      ok: probe.measurements.dimsMatch,
    },
    unknownRow("bleed", "Bleed", why),
    unknownRow("cutline", "Cut line", why),
    unknownRow("color", "Color mode", why),
    unknownRow("white-ink", "White ink", why),
    unknownRow("tiny-text", "Tiny text", "no OCR on upload yet"),
    unknownRow("transparency", "Transparency", why),
  ];
  return { rows, result: null, needsReview: true };
}

/**
 * A file the user picked, with no sidecar. PNG: every pixel check is
 * measured from decoded pixels and the verdict follows the frozen
 * thresholds. A PNG carries no vector path, so products that need a cut
 * line fail that check. White ink and text size are not stored in a PNG,
 * so they show as unknown. PDF: cut line, white ink and page size are read
 * from the bytes; PPI and bleed need a raster step, so there is no verdict.
 */
export function preflightUpload(
  bytes: Uint8Array | Buffer,
  filename: string,
  ordered: OrderedSize,
  productId: string,
): UploadPanel {
  const spec = getSpec(productId);
  if (filename.toLowerCase().endsWith(".pdf")) return pdfPanel(bytes, filename, ordered, productId);

  readPngDims(bytes); // throws on anything that is not a PNG
  let content: ReturnType<typeof measurePngContent>;
  try {
    content = measurePngContent(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("unsupported png")) {
      return pngDimsOnlyPanel(bytes, ordered, productId, msg.replace(/^unsupported png:\s*/, "pixels not decoded, "));
    }
    throw err;
  }
  const ppi = computePpi(content.pixelWidth, content.pixelHeight, ordered);
  const bleedWidthIn = Math.max(0, spec.bleedRequiredIn - content.edgeDepthPx / ppi);
  const result = preflight(
    content.pixelWidth,
    content.pixelHeight,
    ordered,
    {
      bleedWidthIn,
      cutlinePresent: false,
      whiteInkPresent: null,
      minTextPt: null,
      colorMode: content.blackPixelCount > 0 ? "RGB" : null,
      hasTransparency: content.hasTransparency,
    },
    spec,
  );
  const withSources: PreflightResult = {
    ...result,
    sources: { ppi: "content", dims: "content", bleed: "content", cutline: "content", color: "content", transparency: "content" },
  };
  const rows = panelRows(withSources).map((r): PanelRow => {
    if (r.id === "cutline") {
      return spec.cutlineRequired
        ? { ...r, display: "No vector path in a PNG file", source: "measured" }
        : { ...r, display: `Not required for ${spec.displayName}`, source: "spec" };
    }
    if (r.id === "color") {
      return { ...r, display: content.blackPixelCount > 0 ? "RGB black detected, auto-converts to CMYK" : "No pure RGB black found" };
    }
    if (r.id === "white-ink") {
      return spec.whiteInkRequired
        ? unknownRow("white-ink", "White ink", "a PNG does not store a white ink layer")
        : { ...r, display: `Not required for ${spec.displayName}`, source: "spec" };
    }
    if (r.id === "tiny-text") return unknownRow("tiny-text", "Tiny text", "no OCR on upload yet");
    return r;
  });
  return { rows, result: withSources, needsReview: rows.some((r) => r.source === "unavailable") };
}
