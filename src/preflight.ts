export interface ProductSpec {
  id: string;
  displayName: string;
  minPassPpi: number;
  failBelowPpi: number;
  bleedRequiredIn: number;
  cutlineRequired: boolean;
  whiteInkRequired: boolean;
}

export type Verdict = "PASS" | "SOFT-FAIL";

export interface OrderedSize {
  widthIn: number;
  heightIn: number;
}

export interface PreflightExtras {
  bleedWidthIn: number;
  cutlinePresent: boolean;
  whiteInkPresent?: boolean | null;
  minTextPt?: number | null;
  colorMode?: string | null;
  hasTransparency?: boolean | null;
}

export interface Measurements {
  pixelWidth: number;
  pixelHeight: number;
  ppi: number;
  dimsMatch: boolean;
  bleedWidthIn: number;
  cutlinePresent: boolean;
  whiteInkPresent: boolean | null;
  minTextPt: number | null;
  colorMode: string | null;
  hasTransparency: boolean | null;
}

export interface PreflightResult {
  pass: boolean;
  verdict: Verdict;
  fails: string[];
  warnings: string[];
  measurements: Measurements;
  productId: string;
}

const EPS = 1e-9;

export function computePpi(
  pixelWidth: number,
  pixelHeight: number,
  ordered: OrderedSize,
): number {
  const ppiW = pixelWidth / ordered.widthIn;
  const ppiH = pixelHeight / ordered.heightIn;
  return Math.min(ppiW, ppiH);
}

export function preflight(
  pixelWidth: number,
  pixelHeight: number,
  ordered: OrderedSize,
  extras: PreflightExtras,
  spec: ProductSpec,
): PreflightResult {
  const fails: string[] = [];
  const warnings: string[] = [];

  const ppi = computePpi(pixelWidth, pixelHeight, ordered);

  if (ppi + EPS < spec.failBelowPpi) {
    fails.push("low-ppi");
  } else if (ppi + EPS < spec.minPassPpi) {
    warnings.push("low-ppi-warn");
  }

  if (extras.bleedWidthIn + EPS < spec.bleedRequiredIn) {
    fails.push("bleed");
  }

  if (spec.cutlineRequired && !extras.cutlinePresent) {
    fails.push("cutline");
  }

  if (spec.whiteInkRequired && extras.whiteInkPresent === false) {
    fails.push("white-ink");
  }

  const minTextPt = extras.minTextPt;
  if (typeof minTextPt === "number" && Number.isFinite(minTextPt) && minTextPt + EPS < 6) {
    fails.push("tiny-text");
  }

  if (extras.colorMode === "RGB") {
    warnings.push("rgb-black-auto-convert");
  }

  if (extras.hasTransparency === true) {
    warnings.push("transparency-auto-convert");
  }

  const expectedAspect = ordered.widthIn / ordered.heightIn;
  const actualAspect = pixelWidth / pixelHeight;
  const aspectErr = Math.abs(actualAspect - expectedAspect) / expectedAspect;
  const dimsMatch = aspectErr <= 0.02;
  if (!dimsMatch) {
    fails.push("dims-mismatch");
  }

  const verdict: Verdict = fails.length === 0 ? "PASS" : "SOFT-FAIL";

  return {
    pass: verdict === "PASS",
    verdict,
    fails,
    warnings,
    measurements: {
      pixelWidth,
      pixelHeight,
      ppi,
      dimsMatch,
      bleedWidthIn: extras.bleedWidthIn,
      cutlinePresent: extras.cutlinePresent,
      whiteInkPresent: extras.whiteInkPresent ?? null,
      minTextPt: extras.minTextPt ?? null,
      colorMode: extras.colorMode ?? null,
      hasTransparency: extras.hasTransparency ?? null,
    },
    productId: spec.id,
  };
}
