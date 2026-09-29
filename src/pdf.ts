export function hasCutContourSpot(bytes: Uint8Array | Buffer | string): boolean {
  const text = typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1");
  return /CutContour/i.test(text);
}

export function hasWhiteInkSpot(bytes: Uint8Array | Buffer | string): boolean {
  const text = typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1");
  return /WhiteInk|White\s*Ink|\/White\b/i.test(text);
}

export function readPdfDims(bytes: Uint8Array | Buffer | string): { width: number; height: number } | null {
  const text = typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("latin1");
  const box = text.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!box) return null;
  const width = Number(box[1]);
  const height = Number(box[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}
