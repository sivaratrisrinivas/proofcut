import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  countPureBlackPixels,
  decodePng,
  hasTransparency,
  measureWhiteEdgeDepth,
  writePng,
} from "../src/png";
import { plan as extPdfPlan, type ExtItem } from "./generate-extensions-corpus";
import { getSpec } from "../src/specs";

// L2 content generator: ~25 PNGs with pixel-level ground truth.
//
// Q1 measurement split: bleed (white-edge scan), RGB-black blocks, and
// transparency are CONTENT-measured from decoded pixels via the 01 seam.
// Text height and cut-line stay sidecar-declared (no OCR / contour tracing
// until the production RIP path). Sidecars therefore carry ONLY
// cutlinePresent (+ minTextPt for text files); bleed/black/transparency
// live in manifest.json as measured ground truth.
//
// Bleed model: files are trim-sized (px = ordered * ppi). A white margin of
// edgeDepthPx eats into the required 0.125" bleed, so ground truth is
//   bleedWidthIn = max(0, 0.125 - edgeDepthPx / targetPpi).
// Ticket 03 implements this same formula from decoded pixels.
// Full-bleed art (edge 0) keeps the full 0.125" -> PASS.

export interface L2Item {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  pixelWidth: number;
  pixelHeight: number;
  edgeDepthPx: number;
  bleedWidthIn: number;
  blackPixelCount: number;
  blackFraction: number;
  hasTransparency: boolean;
  transparentPixelCount: number;
  minTextPt: number | null;
  cutlinePresent: boolean;
  whiteInkPresent: boolean | null;
  note?: string;
  sources: Record<string, string>;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
  expectedWarnings: string[];
}

export type L2ManifestRow = (L2Item & { kind: "png" }) | (ExtItem & { kind: "pdf" });

const OUT_DIR = join(import.meta.dir, "..", "corpus-l2-content");
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const INK: [number, number, number] = [40, 40, 45];

type RGB = [number, number, number];

interface Canvas {
  w: number;
  h: number;
  ch: 3 | 4;
  px: Buffer;
}

function canvas(w: number, h: number, ch: 3 | 4, bg: RGB, alpha = 255): Canvas {
  const px = Buffer.alloc(w * h * ch);
  for (let i = 0; i < w * h; i++) {
    px[i * ch] = bg[0];
    px[i * ch + 1] = bg[1];
    px[i * ch + 2] = bg[2];
    if (ch === 4) px[i * ch + 3] = alpha;
  }
  return { w, h, ch, px };
}

function rect(c: Canvas, x0: number, y0: number, x1: number, y1: number, rgb: RGB, alpha = 255): void {
  for (let y = Math.max(0, y0); y < Math.min(c.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(c.w, x1); x++) {
      const o = (y * c.w + x) * c.ch;
      c.px[o] = rgb[0];
      c.px[o + 1] = rgb[1];
      c.px[o + 2] = rgb[2];
      if (c.ch === 4) c.px[o + 3] = alpha;
    }
  }
}

function disc(c: Canvas, cx: number, cy: number, r: number, rgb: RGB): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < 0 || y >= c.h) continue;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || x >= c.w) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        const o = (y * c.w + x) * c.ch;
        c.px[o] = rgb[0];
        c.px[o + 1] = rgb[1];
        c.px[o + 2] = rgb[2];
      }
    }
  }
}

function ring(c: Canvas, cx: number, cy: number, r: number, thick: number, rgb: RGB): void {
  for (let y = Math.floor(cy - r - thick); y <= Math.ceil(cy + r + thick); y++) {
    if (y < 0 || y >= c.h) continue;
    for (let x = Math.floor(cx - r - thick); x <= Math.ceil(cx + r + thick); x++) {
      if (x < 0 || x >= c.w) continue;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (Math.abs(d - r) <= thick / 2) {
        const o = (y * c.w + x) * c.ch;
        c.px[o] = rgb[0];
        c.px[o + 1] = rgb[1];
        c.px[o + 2] = rgb[2];
      }
    }
  }
}

function sash(c: Canvas, slope: number, width: number, rgb: RGB): void {
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (Math.abs(y - slope * x) <= width / 2) {
        const o = (y * c.w + x) * c.ch;
        c.px[o] = rgb[0];
        c.px[o + 1] = rgb[1];
        c.px[o + 2] = rgb[2];
      }
    }
  }
}

function dotGrid(c: Canvas, step: number, r: number, rgb: RGB): void {
  for (let gy = step / 2; gy < c.h; gy += step) {
    for (let gx = step / 2; gx < c.w; gx += step) {
      disc(c, gx, gy, r, rgb);
    }
  }
}

function checker(c: Canvas, cell: number, a: RGB, b: RGB): void {
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const rgb = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) ? a : b;
      const o = (y * c.w + x) * c.ch;
      c.px[o] = rgb[0];
      c.px[o + 1] = rgb[1];
      c.px[o + 2] = rgb[2];
    }
  }
}

/** Simulated text lines: solid bars of exact cap-height, near-black ink. */
function textBars(c: Canvas, lines: number, barH: number, gap: number, rgb: RGB = INK): void {
  const x0 = Math.floor(c.w * 0.2);
  const x1 = Math.floor(c.w * 0.8);
  const total = lines * barH + (lines - 1) * gap;
  let y = Math.floor((c.h - total) / 2);
  for (let i = 0; i < lines; i++) {
    rect(c, x0, y, x1, y + barH, rgb);
    y += barH + gap;
  }
}

function whiteMargin(c: Canvas, m: number): void {
  rect(c, 0, 0, c.w, m, WHITE);
  rect(c, 0, c.h - m, c.w, c.h, WHITE);
  rect(c, 0, 0, m, c.h, WHITE);
  rect(c, c.w - m, 0, c.w, c.h, WHITE);
}

interface Spec {
  name: string;
  productId: string;
  wIn: number;
  hIn: number;
  ppi: number;
  ch: 3 | 4;
  draw: (c: Canvas) => void;
  edgeDepthPx: number;
  blackPixelCount: number;
  transparentPixelCount: number;
  minTextPt: number | null;
  cutlinePresent: boolean;
  whiteInkPresent?: boolean | null;
  note?: string;
}

function plan(): Spec[] {
  const BLUE: RGB = [30, 90, 160];
  const RED: RGB = [200, 60, 70];
  const GOLD: RGB = [240, 200, 60];
  const GREEN: RGB = [40, 140, 90];
  const GRAY: RGB = [200, 200, 205];
  const LIGHT: RGB = [230, 230, 235];

  return [
    {
      name: "l2-001.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { dotGrid(c, 60, 6, GOLD); ring(c, c.w / 2, c.h / 2, 270, 14, GOLD); disc(c, c.w / 2, c.h / 2, 108, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "logo rings on brand blue, full bleed",
    },
    {
      name: "l2-002.png", productId: "die-cut", wIn: 2, hIn: 2, ppi: 300, ch: 3,
      draw: (c) => { sash(c, 0.5, 90, GOLD); disc(c, c.w * 0.7, c.h * 0.3, 110, RED); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "diagonal sash art, full bleed",
    },
    {
      name: "l2-003.png", productId: "die-cut", wIn: 4, hIn: 4, ppi: 300, ch: 3,
      draw: (c) => { dotGrid(c, 80, 8, LIGHT); ring(c, c.w / 2, c.h / 2, 380, 20, GOLD); ring(c, c.w / 2, c.h / 2, 300, 12, RED); disc(c, c.w / 2, c.h / 2, 150, BLUE); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "concentric logo on green, full bleed",
    },
    {
      name: "l2-004.png", productId: "die-cut", wIn: 3, hIn: 2, ppi: 300, ch: 3,
      draw: (c) => { checker(c, 60, GRAY, LIGHT); textBars(c, 3, 33, 12); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 8, cutlinePresent: true,
      note: "8pt text bars over checker, full bleed",
    },
    {
      name: "l2-005.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); disc(c, c.w / 2, c.h / 2, 250, GOLD); whiteMargin(c, 30); },
      edgeDepthPx: 30, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "30px white margin @300dpi -> bleed 0.025in SOFT-FAIL",
    },
    {
      name: "l2-006.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 150, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GREEN); disc(c, c.w / 2, c.h / 2, 130, GOLD); whiteMargin(c, 15); },
      edgeDepthPx: 15, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "150dpi + 15px margin -> low-ppi + bleed SOFT-FAIL",
    },
    {
      name: "l2-007.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, RED); disc(c, c.w / 2, c.h / 2, 250, GOLD); rect(c, 0, c.h - 30, c.w, c.h, WHITE); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "bottom-only 30px white bar: invisible to top-row scan, PASS by construction",
    },
    {
      name: "l2-008.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GRAY); rect(c, 400, 420, 500, 480, BLACK); disc(c, 200, 200, 120, BLUE); },
      edgeDepthPx: 0, blackPixelCount: 6000, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "100x60 RGB-black block, warn-only -> PASS",
    },
    {
      name: "l2-009.png", productId: "die-cut", wIn: 4, hIn: 4, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); rect(c, 500, 550, 700, 700, BLACK); ring(c, 300, 300, 180, 16, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 30000, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "200x150 RGB-black block, warn-only -> PASS",
    },
    {
      name: "l2-010.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 4,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GREEN); disc(c, c.w / 2, c.h / 2, 250, GOLD); rect(c, 0, 0, 80, 80, GREEN, 0); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 6400, minTextPt: null, cutlinePresent: true,
      note: "80x80 transparent corner, warn-only -> PASS",
    },
    {
      name: "l2-011.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 4,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); sash(c, -0.4, 100, RED); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "opaque RGBA control, no transparency",
    },
    {
      name: "l2-012.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, LIGHT); textBars(c, 4, 21, 14); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 5, cutlinePresent: true,
      note: "5pt text bars (21px @300dpi) -> tiny-text SOFT-FAIL",
    },
    {
      name: "l2-013.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, LIGHT); textBars(c, 3, 33, 12); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 8, cutlinePresent: true,
      note: "8pt text bars (33px @300dpi) -> PASS",
    },
    {
      name: "l2-014.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, LIGHT); textBars(c, 3, 25, 12); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 6, cutlinePresent: true,
      note: "6pt boundary text bars (25px @300dpi) -> PASS",
    },
    {
      name: "l2-015.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); disc(c, c.w / 2, c.h / 2, 250, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: false,
      note: "no cutline sidecar -> cutline SOFT-FAIL",
    },
    {
      name: "l2-016.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GREEN); disc(c, c.w / 2, c.h / 2, 250, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "cutline present control -> PASS",
    },
    {
      name: "l2-017.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 72, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, RED); disc(c, c.w / 2, c.h / 2, 60, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "72dpi upscale -> low-ppi SOFT-FAIL",
    },
    {
      name: "l2-018.png", productId: "die-cut", wIn: 2, hIn: 2, ppi: 150, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); sash(c, 0.6, 40, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "150dpi -> low-ppi SOFT-FAIL",
    },
    {
      name: "l2-019.png", productId: "roll-label", wIn: 4, hIn: 2, ppi: 300, ch: 3,
      draw: (c) => { checker(c, 50, GRAY, LIGHT); disc(c, c.w / 2, c.h / 2, 150, RED); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: false,
      note: "roll-label needs no cutline -> PASS without one",
    },
    {
      name: "l2-020.png", productId: "roll-label", wIn: 4, hIn: 2, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GREEN); textBars(c, 2, 33, 12); whiteMargin(c, 36); },
      edgeDepthPx: 36, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 8, cutlinePresent: false,
      note: "36px margin -> bleed 0.005in SOFT-FAIL (text still 8pt PASS)",
    },
    {
      name: "l2-021.png", productId: "roll-label", wIn: 4, hIn: 2, ppi: 150, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); disc(c, c.w / 2, c.h / 2, 120, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: false,
      note: "150dpi roll-label -> low-ppi SOFT-FAIL",
    },
    {
      name: "l2-022.png", productId: "die-cut", wIn: 2, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { ring(c, c.w / 2, c.h / 3, 180, 16, GOLD); ring(c, c.w / 2, (2 * c.h) / 3, 140, 12, RED); disc(c, c.w / 2, c.h / 2, 60, BLUE); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "stacked logo rings 2x3 -> PASS",
    },
    {
      name: "l2-023.png", productId: "die-cut", wIn: 4, hIn: 6, ppi: 300, ch: 3,
      draw: (c) => { sash(c, 0.3, 140, RED); sash(c, -0.3, 140, GOLD); disc(c, c.w / 2, c.h / 2, 320, BLUE); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "cross-sash poster 4x6 -> PASS",
    },
    {
      name: "l2-024.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GRAY); rect(c, 390, 410, 510, 490, BLACK); disc(c, 200, 650, 120, GREEN); whiteMargin(c, 30); },
      edgeDepthPx: 30, blackPixelCount: 9600, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true,
      note: "combo: 120x80 black block + 30px margin -> bleed SOFT-FAIL",
    },
    {
      name: "l2-025.png", productId: "die-cut", wIn: 3, hIn: 3, ppi: 300, ch: 4,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); disc(c, c.w / 2, c.h / 2, 250, GOLD); rect(c, 700, 700, 760, 760, BLUE, 0); whiteMargin(c, 30); },
      edgeDepthPx: 30, blackPixelCount: 0, transparentPixelCount: 3600, minTextPt: null, cutlinePresent: true,
      note: "combo: 60x60 transparent patch + 30px margin -> bleed SOFT-FAIL",
    },
    {
      name: "l2-026.png", productId: "clear", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); disc(c, c.w / 2, c.h / 2, 250, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true, whiteInkPresent: false,
      note: "clear without white ink -> white-ink SOFT-FAIL",
    },
    {
      name: "l2-027.png", productId: "clear", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GREEN); disc(c, c.w / 2, c.h / 2, 250, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true, whiteInkPresent: true,
      note: "clear with white ink control -> PASS",
    },
    {
      name: "l2-028.png", productId: "holographic", wIn: 4, hIn: 4, ppi: 310, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, RED); sash(c, 0.4, 120, GOLD); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: true, whiteInkPresent: false,
      note: "holographic without white ink -> white-ink SOFT-FAIL",
    },
    {
      name: "l2-029.png", productId: "holographic", wIn: 4, hIn: 4, ppi: 310, ch: 4,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, BLUE); disc(c, c.w / 2, c.h / 2, 340, GOLD); rect(c, 0, 0, 70, 70, BLUE, 0); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 4900, minTextPt: null, cutlinePresent: true, whiteInkPresent: true,
      note: "holographic with white ink + 70x70 transparent corner -> PASS with warning",
    },
    {
      name: "l2-030.png", productId: "clear", wIn: 3, hIn: 3, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, LIGHT); textBars(c, 4, 19, 12); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 4.5, cutlinePresent: true, whiteInkPresent: false,
      note: "combo: 4.5pt text + no white ink -> white-ink + tiny-text SOFT-FAIL",
    },
    {
      name: "l2-031.png", productId: "packaging-tape", wIn: 4, hIn: 2, ppi: 300, ch: 3,
      draw: (c) => { checker(c, 50, GRAY, LIGHT); disc(c, c.w / 2, c.h / 2, 150, RED); },
      edgeDepthPx: 0, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: null, cutlinePresent: false,
      note: "tape needs no cutline -> PASS without one",
    },
    {
      name: "l2-032.png", productId: "packaging-tape", wIn: 4, hIn: 2, ppi: 300, ch: 3,
      draw: (c) => { rect(c, 0, 0, c.w, c.h, GREEN); textBars(c, 2, 33, 12); whiteMargin(c, 36); },
      edgeDepthPx: 36, blackPixelCount: 0, transparentPixelCount: 0, minTextPt: 8, cutlinePresent: false,
      note: "36px margin on tape -> bleed SOFT-FAIL",
    },
  ];
}

function expectedFor(s: Spec, bleedWidthIn: number): { verdict: "PASS" | "SOFT-FAIL"; fails: string[] } {
  const spec = getSpec(s.productId);
  const fails: string[] = [];
  if (s.ppi < spec.failBelowPpi) fails.push("low-ppi");
  if (bleedWidthIn < spec.bleedRequiredIn) fails.push("bleed");
  if (spec.cutlineRequired && !s.cutlinePresent) fails.push("cutline");
  if (spec.whiteInkRequired && s.whiteInkPresent === false) fails.push("white-ink");
  if (s.minTextPt !== null && s.minTextPt < 6) fails.push("tiny-text");
  return { verdict: fails.length === 0 ? "PASS" : "SOFT-FAIL", fails };
}

function expectedWarningsFor(s: Spec): string[] {
  const warnings: string[] = [];
  if (s.blackPixelCount > 0) warnings.push("rgb-black-auto-convert");
  if (s.transparentPixelCount > 0) warnings.push("transparency-auto-convert");
  return warnings;
}

async function main(): Promise<void> {
  const specs = plan();
  await mkdir(OUT_DIR, { recursive: true });
  const items: L2ManifestRow[] = [];
  let failures = 0;

  for (const s of specs) {
    const pxW = Math.round(s.wIn * s.ppi);
    const pxH = Math.round(s.hIn * s.ppi);
    const bg: RGB = [30, 90, 160];
    const c = canvas(pxW, pxH, s.ch, bg);
    s.draw(c);
    const png = writePng(pxW, pxH, s.ch, c.px);
    await writeFile(join(OUT_DIR, s.name), png);

    const sidecar: Record<string, unknown> = { cutlinePresent: s.cutlinePresent };
    if (s.minTextPt !== null) sidecar["minTextPt"] = s.minTextPt;
    if (s.whiteInkPresent != null) sidecar["whiteInkPresent"] = s.whiteInkPresent;
    await writeFile(join(OUT_DIR, `${s.name}.sidecar.json`), JSON.stringify(sidecar, null, 2));

    // Self-verify through the 01 seam: exact agreement with ground truth.
    const decoded = decodePng(png);
    const edge = measureWhiteEdgeDepth(decoded);
    const blacks = countPureBlackPixels(decoded);
    const transp = hasTransparency(decoded);
    let transparentCount = 0;
    if (s.ch === 4) {
      for (let o = 3; o < decoded.pixels.length; o += 4) {
        if (decoded.pixels[o] < 250) transparentCount++;
      }
    }
    const bleedWidthIn = Math.max(0, getSpec(s.productId).bleedRequiredIn - edge / s.ppi);
    const problems: string[] = [];
    if (decoded.width !== pxW || decoded.height !== pxH) problems.push(`dims ${decoded.width}x${decoded.height} != ${pxW}x${pxH}`);
    if (edge !== s.edgeDepthPx) problems.push(`edge ${edge} != truth ${s.edgeDepthPx}`);
    if (blacks !== s.blackPixelCount) problems.push(`blacks ${blacks} != truth ${s.blackPixelCount}`);
    if (transp !== (s.transparentPixelCount > 0)) problems.push(`transparency ${transp} != truth ${s.transparentPixelCount > 0}`);
    if (transparentCount !== s.transparentPixelCount) problems.push(`transparentCount ${transparentCount} != truth ${s.transparentPixelCount}`);
    if (problems.length > 0) {
      failures++;
      console.error(`${s.name}: SELF-CHECK FAILED: ${problems.join("; ")}`);
    }

    const { verdict, fails } = expectedFor(s, bleedWidthIn);
    items.push({
      kind: "png",
      file: s.name,
      productId: s.productId,
      orderedWidthIn: s.wIn,
      orderedHeightIn: s.hIn,
      targetPpi: s.ppi,
      pixelWidth: pxW,
      pixelHeight: pxH,
      edgeDepthPx: s.edgeDepthPx,
      bleedWidthIn,
      blackPixelCount: s.blackPixelCount,
      blackFraction: s.blackPixelCount / (pxW * pxH),
      hasTransparency: s.transparentPixelCount > 0,
      transparentPixelCount: s.transparentPixelCount,
      minTextPt: s.minTextPt,
      cutlinePresent: s.cutlinePresent,
      whiteInkPresent: s.whiteInkPresent ?? null,
      ...(s.note ? { note: s.note } : {}),
      sources: {
        ppi: "dims",
        bleed: "content",
        blackPixelCount: "content",
        transparency: "content",
        text: "sidecar",
        cutline: "sidecar",
        whiteInk: "sidecar",
      },
      expectedVerdict: verdict,
      expectedFails: fails,
      expectedWarnings: expectedWarningsFor(s),
    });
  }

  for (const e of extPdfPlan()) {
    items.push({ ...e, kind: "pdf" });
  }

  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(items, null, 2));
  const pngCount = specs.length;
  const pass = items.filter((i) => i.expectedVerdict === "PASS").length;
  console.log(`wrote ${pngCount} pngs + ${items.length - pngCount} pdfs to corpus-l2-content/ (${pass} PASS, ${items.length - pass} SOFT-FAIL)`);
  if (failures > 0) {
    console.error(`${failures} self-check failures`);
    process.exit(1);
  }
}

await main();
