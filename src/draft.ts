import type { PreflightResult } from "./preflight";

export interface OverlaySpec {
  cutline: { visible: boolean; style: "dashed"; color: "magenta" };
  bleed: { visible: boolean; widthIn: number };
}

export function overlaySpec(r: PreflightResult): OverlaySpec {
  return {
    cutline: { visible: r.measurements.cutlinePresent, style: "dashed", color: "magenta" },
    bleed: { visible: r.measurements.bleedWidthIn > 0, widthIn: r.measurements.bleedWidthIn },
  };
}

export interface ChecklistTick {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function buildChecklist(r: PreflightResult): ChecklistTick[] {
  const m = r.measurements;
  const fail = new Set(r.fails);
  return [
    {
      id: "ppi",
      label: "Resolution",
      ok: !fail.has("low-ppi"),
      detail: `${Math.round(m.ppi)} PPI at ordered size`,
    },
    {
      id: "dims",
      label: "Dimensions",
      ok: !fail.has("dims-mismatch"),
      detail: m.dimsMatch
        ? `${m.pixelWidth}x${m.pixelHeight}px matches ordered size`
        : `${m.pixelWidth}x${m.pixelHeight}px differs from ordered size`,
    },
    {
      id: "bleed",
      label: "Bleed",
      ok: !fail.has("bleed"),
      detail: `${m.bleedWidthIn.toFixed(3)}in past cut line (needs 0.125in)`,
    },
    {
      id: "cutline",
      label: "Cut line",
      ok: !fail.has("cutline"),
      detail: m.cutlinePresent ? "CutContour path present" : "CutContour path missing",
    },
    {
      id: "color",
      label: "Color mode",
      ok: true,
      detail:
        m.colorMode === "RGB"
          ? "RGB black detected, auto-converts to CMYK"
          : `${m.colorMode ?? "Unknown"} mode, no conversion needed`,
    },
    {
      id: "white-ink",
      label: "White ink",
      ok: !fail.has("white-ink"),
      detail:
        m.whiteInkPresent === true
          ? "White underbase present"
          : m.whiteInkPresent === false
            ? "White underbase missing"
            : "White underbase not required",
    },
    {
      id: "tiny-text",
      label: "Tiny text",
      ok: !fail.has("tiny-text"),
      detail:
        typeof m.minTextPt === "number"
          ? `Smallest text ${m.minTextPt}pt (minimum 6pt)`
          : "No text under review",
    },
    {
      id: "transparency",
      label: "Transparency",
      ok: true,
      detail:
        m.hasTransparency === true
          ? "Transparency detected, auto-flattens on export"
          : "No transparency",
    },
  ];
}

const BANNED = /sorry|unfortunately|can't/i;

export const BANNED_RE = BANNED;

function failLine(r: PreflightResult, code: string): string | null {
  const m = r.measurements;
  switch (code) {
    case "low-ppi":
      return `low-ppi: ${Math.round(m.ppi)} PPI at ordered size, needs 300 PPI. Rebuild art at higher resolution.`;
    case "bleed":
      return `bleed: ${m.bleedWidthIn.toFixed(3)}in past cut line, needs 0.125in. Extend art beyond the cut line.`;
    case "cutline":
      return `cutline: CutContour path missing for ${r.productId}. Add a CutContour spot path.`;
    case "white-ink":
      return `white-ink: white underbase missing for ${r.productId}. Add a white ink layer under color areas.`;
    case "tiny-text":
      return `tiny-text: smallest text ${m.minTextPt}pt, minimum 6pt. Enlarge text to 6pt or more.`;
    case "dims-mismatch":
      return `dims-mismatch: ${m.pixelWidth}x${m.pixelHeight}px differs from ordered size. Resize art to ordered size.`;
    default:
      return null;
  }
}

export function composeMessage(r: PreflightResult): string {
  if (r.pass) {
    return `Approved: ${Math.round(r.measurements.ppi)} PPI, bleed ${r.measurements.bleedWidthIn.toFixed(3)}in, cut line present. Ready to draft.`;
  }
  const lines = r.fails.map((f) => failLine(r, f)).filter((l): l is string => l !== null);
  const msg = lines.join("\n");
  if (BANNED.test(msg)) throw new Error("banned word in message");
  return msg;
}
