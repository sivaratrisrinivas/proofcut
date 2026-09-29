import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ExtItem {
  file: string;
  productId: string;
  orderedWidthIn: number;
  orderedHeightIn: number;
  targetPpi: number;
  bleedWidthIn: number;
  cutContourInPdf: boolean;
  whiteInkInPdf: boolean;
  minTextPt: number | null;
  colorMode: string | null;
  hasTransparency: boolean | null;
  expectedVerdict: "PASS" | "SOFT-FAIL";
  expectedFails: string[];
  expectedWarnings: string[];
}

const OUT_DIR = join(import.meta.dir, "..", "corpus-ext");

function pdfBytes(opts: {
  widthIn: number;
  heightIn: number;
  cutContour: boolean;
  whiteInk: boolean;
}): Buffer {
  const wPt = Math.round(opts.widthIn * 72);
  const hPt = Math.round(opts.heightIn * 72);
  const spots: string[] = [];
  if (opts.cutContour) spots.push("/Separation /CutContour /DeviceCMYK");
  if (opts.whiteInk) spots.push("/Separation /WhiteInk /DeviceCMYK");
  const resources = spots.length > 0 ? ` /Resources << /ColorSpace << ${spots.join(" ")} >> >>` : "";
  const content =
    `%PDF-1.4\n` +
    `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n` +
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n` +
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}]${resources} /Contents 4 0 R >> endobj\n` +
    `4 0 obj << /Length 44 >> stream\nBT /F1 12 Tf 72 720 Td (ProofPilot ${wPt}x${hPt}) Tj ET\nendstream endobj\n` +
    `trailer << /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.from(content, "latin1");
}

function plan(): ExtItem[] {
  return [
    {
      file: "cut-001.pdf",
      productId: "die-cut",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 300,
      bleedWidthIn: 0.15,
      cutContourInPdf: true,
      whiteInkInPdf: false,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "PASS",
      expectedFails: [],
      expectedWarnings: [],
    },
    {
      file: "cut-002.pdf",
      productId: "die-cut",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 300,
      bleedWidthIn: 0.15,
      cutContourInPdf: false,
      whiteInkInPdf: false,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "SOFT-FAIL",
      expectedFails: ["cutline"],
      expectedWarnings: [],
    },
    {
      file: "cut-003.pdf",
      productId: "clear",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 300,
      bleedWidthIn: 0.15,
      cutContourInPdf: true,
      whiteInkInPdf: true,
      minTextPt: null,
      colorMode: "RGB",
      hasTransparency: null,
      expectedVerdict: "PASS",
      expectedFails: [],
      expectedWarnings: ["rgb-black-auto-convert"],
    },
    {
      file: "cut-004.pdf",
      productId: "clear",
      orderedWidthIn: 2,
      orderedHeightIn: 2,
      targetPpi: 300,
      bleedWidthIn: 0.15,
      cutContourInPdf: true,
      whiteInkInPdf: false,
      minTextPt: 8,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "SOFT-FAIL",
      expectedFails: ["white-ink"],
      expectedWarnings: [],
    },
    {
      file: "cut-005.pdf",
      productId: "die-cut",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 72,
      bleedWidthIn: 0.15,
      cutContourInPdf: true,
      whiteInkInPdf: false,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "SOFT-FAIL",
      expectedFails: ["low-ppi"],
      expectedWarnings: [],
    },
    {
      file: "white-001.pdf",
      productId: "clear",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 320,
      bleedWidthIn: 0.16,
      cutContourInPdf: true,
      whiteInkInPdf: true,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "PASS",
      expectedFails: [],
      expectedWarnings: [],
    },
    {
      file: "white-002.pdf",
      productId: "clear",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 320,
      bleedWidthIn: 0.16,
      cutContourInPdf: true,
      whiteInkInPdf: false,
      minTextPt: 4.5,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "SOFT-FAIL",
      expectedFails: ["white-ink", "tiny-text"],
      expectedWarnings: [],
    },
    {
      file: "white-003.pdf",
      productId: "holographic",
      orderedWidthIn: 4,
      orderedHeightIn: 4,
      targetPpi: 310,
      bleedWidthIn: 0.14,
      cutContourInPdf: true,
      whiteInkInPdf: true,
      minTextPt: null,
      colorMode: null,
      hasTransparency: true,
      expectedVerdict: "PASS",
      expectedFails: [],
      expectedWarnings: ["transparency-auto-convert"],
    },
    {
      file: "white-004.pdf",
      productId: "holographic",
      orderedWidthIn: 4,
      orderedHeightIn: 4,
      targetPpi: 310,
      bleedWidthIn: 0.14,
      cutContourInPdf: true,
      whiteInkInPdf: false,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "SOFT-FAIL",
      expectedFails: ["white-ink"],
      expectedWarnings: [],
    },
    {
      file: "white-005.pdf",
      productId: "clear",
      orderedWidthIn: 3,
      orderedHeightIn: 3,
      targetPpi: 150,
      bleedWidthIn: 0.16,
      cutContourInPdf: true,
      whiteInkInPdf: false,
      minTextPt: null,
      colorMode: null,
      hasTransparency: null,
      expectedVerdict: "SOFT-FAIL",
      expectedFails: ["low-ppi", "white-ink"],
      expectedWarnings: [],
    },
  ];
}

async function main() {
  const items = plan();
  await mkdir(OUT_DIR, { recursive: true });
  for (const it of items) {
    const pdf = pdfBytes({
      widthIn: it.orderedWidthIn,
      heightIn: it.orderedHeightIn,
      cutContour: it.cutContourInPdf,
      whiteInk: it.whiteInkInPdf,
    });
    await writeFile(join(OUT_DIR, it.file), pdf);
    const pixelWidth = Math.round(it.orderedWidthIn * it.targetPpi);
    const pixelHeight = Math.round(it.orderedHeightIn * it.targetPpi);
    await writeFile(
      join(OUT_DIR, `${it.file}.sidecar.json`),
      JSON.stringify(
        {
          bleedWidthIn: it.bleedWidthIn,
          pixelWidth,
          pixelHeight,
          minTextPt: it.minTextPt,
          colorMode: it.colorMode,
          hasTransparency: it.hasTransparency,
        },
        null,
        2,
      ),
    );
  }
  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(items, null, 2));
  const pass = items.filter((i) => i.expectedVerdict === "PASS").length;
  console.log(`wrote ${items.length} pdfs to corpus-ext/ (${pass} PASS, ${items.length - pass} SOFT-FAIL)`);
}

await main();
