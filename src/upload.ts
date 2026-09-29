import { hasCutContourSpot, hasWhiteInkSpot, readPdfDims } from "./pdf";
import { readPngDims } from "./png";
import { computePpi, preflight, type OrderedSize, type PreflightResult } from "./preflight";
import { getSpec } from "./specs";
import { buildChecklist } from "./draft";

export type RowSource = "measured" | "sidecar" | "unavailable";

export interface PanelRow {
  id: string;
  label: string;
  display: string;
  source: RowSource;
}

export interface UploadPanel {
  rows: PanelRow[];
  result: PreflightResult | null;
  needsReview: boolean;
}

export interface DemoSidecar {
  bleedWidthIn: number;
  cutlinePresent?: boolean;
  whiteInkPresent?: boolean | null;
  minTextPt?: number | null;
  colorMode?: string | null;
  hasTransparency?: boolean | null;
}

const ROW_IDS = ["ppi", "dims", "bleed", "cutline", "color", "white-ink", "tiny-text", "transparency"];

function unknownRow(id: string, label: string, hint: string): PanelRow {
  return { id, label, display: `Unknown: ${hint}`, source: "unavailable" };
}

function assertPdfHeader(text: string, filename: string): void {
  if (!text.startsWith("%PDF")) throw new Error(`unsupported upload: ${filename} is not a PDF`);
}

export function preflightUpload(
  bytes: Uint8Array | Buffer,
  filename: string,
  ordered: OrderedSize,
  productId: string,
): UploadPanel {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const text = Buffer.from(bytes).toString("latin1");
    assertPdfHeader(text, filename);
    const cutline = hasCutContourSpot(text);
    const whiteInk = hasWhiteInkSpot(text);
    const box = readPdfDims(text);
    const rows: PanelRow[] = [
      unknownRow("ppi", "Resolution", "PDF needs rasterizing for PPI"),
      box
        ? { id: "dims", label: "Dimensions", display: `${box.width}x${box.height}pt media box`, source: "measured" }
        : unknownRow("dims", "Dimensions", "no readable media box"),
      unknownRow("bleed", "Bleed", "no cut-line reference measured yet"),
      {
        id: "cutline",
        label: "Cut line",
        display: cutline ? "CutContour path present" : "CutContour path missing",
        source: "measured",
      },
      unknownRow("color", "Color mode", "not extracted from PDF yet"),
      {
        id: "white-ink",
        label: "White ink",
        display: whiteInk ? "White underbase present" : "White underbase missing",
        source: "measured",
      },
      unknownRow("tiny-text", "Tiny text", "no OCR on upload yet"),
      unknownRow("transparency", "Transparency", "not extracted from PDF yet"),
    ];
    return { rows, result: null, needsReview: true };
  }

  const { width, height } = readPngDims(bytes);
  const ppi = computePpi(width, height, ordered);
  const probe = preflight(
    width,
    height,
    ordered,
    {
      bleedWidthIn: 0,
      cutlinePresent: false,
      whiteInkPresent: null,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
    },
    getSpec(productId),
  );
  const rows: PanelRow[] = [
    { id: "ppi", label: "Resolution", display: `${Math.round(ppi)} PPI at ordered size`, source: "measured" },
    {
      id: "dims",
      label: "Dimensions",
      display: probe.measurements.dimsMatch
        ? `${width}x${height}px matches ordered size`
        : `${width}x${height}px differs from ordered size`,
      source: "measured",
    },
    unknownRow("bleed", "Bleed", "no cut-line reference in raster upload"),
    {
      id: "cutline",
      label: "Cut line",
      display: "No vector path in raster upload",
      source: "measured",
    },
    unknownRow("color", "Color mode", "not extracted from raster upload"),
    unknownRow("white-ink", "White ink", "not extractable from raster upload"),
    unknownRow("tiny-text", "Tiny text", "no OCR on upload yet"),
    unknownRow("transparency", "Transparency", "not extracted from raster upload"),
  ];
  return { rows, result: null, needsReview: true };
}

export function preflightDemoPng(
  bytes: Uint8Array | Buffer,
  sidecar: DemoSidecar,
  ordered: OrderedSize,
  productId: string,
): UploadPanel {
  const { width, height } = readPngDims(bytes);
  const result = preflight(
    width,
    height,
    ordered,
    {
      bleedWidthIn: sidecar.bleedWidthIn,
      cutlinePresent: sidecar.cutlinePresent ?? false,
      whiteInkPresent: sidecar.whiteInkPresent ?? null,
      minTextPt: sidecar.minTextPt ?? null,
      colorMode: sidecar.colorMode ?? null,
      hasTransparency: sidecar.hasTransparency ?? null,
    },
    getSpec(productId),
  );
  const rows: PanelRow[] = buildChecklist(result).map((t) => ({
    id: t.id,
    label: t.label,
    display: t.detail,
    source: t.id === "ppi" || t.id === "dims" ? ("measured" as RowSource) : ("sidecar" as RowSource),
  }));
  if (rows.map((r) => r.id).join(",") !== ROW_IDS.join(",")) {
    throw new Error("panel rows drifted from checklist");
  }
  return { rows, result, needsReview: false };
}
