import { describe, expect, test } from "bun:test";
import { writePng, writeSolidPng } from "../src/png";
import { preflightSample, preflightUpload, type PanelRow } from "../src/upload";

const ORDERED_3X3 = { widthIn: 3, heightIn: 3 };

function pdfWith(spots: string, box = "0 0 216 216"): Uint8Array {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Page /MediaBox [${box}] /Resources << /ColorSpace << ${spots} >> >> >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
    "latin1",
  );
}

/** 900x900 art with a white band `margin` px deep across the top rows. */
function pngWithTopMargin(margin: number, opts: { black?: boolean; alphaCorner?: boolean } = {}): Buffer {
  const w = 900;
  const h = 900;
  const ch = opts.alphaCorner ? 4 : 3;
  const px = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * ch;
      let rgb = y < margin ? [255, 255, 255] : [30, 90, 200];
      if (opts.black && x >= 100 && x < 200 && y >= 300 && y < 360) rgb = [0, 0, 0];
      px[o] = rgb[0];
      px[o + 1] = rgb[1];
      px[o + 2] = rgb[2];
      if (ch === 4) px[o + 3] = x < 60 && y > 800 ? 0 : 255;
    }
  }
  return writePng(w, h, ch as 3 | 4, px);
}

function byId(rows: PanelRow[], id: string): PanelRow {
  const row = rows.find((r) => r.id === id);
  expect(row, `panel row ${id} exists`).toBeDefined();
  return row!;
}

describe("upload panel: a user PNG is measured from its pixels", () => {
  test("ppi and dims come from the bytes", () => {
    const panel = preflightUpload(writeSolidPng(900, 900), "art.png", ORDERED_3X3, "die-cut");
    expect(panel.rows.length).toBe(8);
    expect(byId(panel.rows, "ppi").source).toBe("measured");
    expect(byId(panel.rows, "ppi").display).toContain("300 PPI");
    expect(byId(panel.rows, "dims").display).toContain("900x900px");
  });

  test("full-bleed art measures 0.125in bleed from pixels and passes roll labels", () => {
    const panel = preflightUpload(pngWithTopMargin(0), "art.png", { widthIn: 3, heightIn: 3 }, "roll-label");
    expect(byId(panel.rows, "bleed").source).toBe("measured");
    expect(panel.result?.measurements.bleedWidthIn).toBeCloseTo(0.125, 6);
    expect(panel.result?.verdict).toBe("PASS");
    expect(byId(panel.rows, "cutline").source).toBe("spec");
  });

  test("a 30px white margin at 300 PPI measures 0.025in bleed and fails", () => {
    const panel = preflightUpload(pngWithTopMargin(30), "art.png", ORDERED_3X3, "roll-label");
    expect(panel.result?.measurements.bleedWidthIn).toBeCloseTo(0.025, 6);
    expect(panel.result?.fails).toEqual(["bleed"]);
    expect(byId(panel.rows, "bleed").ok).toBe(false);
  });

  test("RGB black and transparency are detected from pixels, warn only", () => {
    const panel = preflightUpload(pngWithTopMargin(0, { black: true, alphaCorner: true }), "art.png", ORDERED_3X3, "roll-label");
    expect(panel.result?.warnings).toContain("rgb-black-auto-convert");
    expect(panel.result?.warnings).toContain("transparency-auto-convert");
    expect(panel.result?.verdict).toBe("PASS");
    expect(byId(panel.rows, "color").source).toBe("measured");
    expect(byId(panel.rows, "transparency").display).toMatch(/transparency detected/i);
  });

  test("a PNG has no vector path, so die-cut fails the cut line check", () => {
    const panel = preflightUpload(pngWithTopMargin(0), "art.png", ORDERED_3X3, "die-cut");
    expect(byId(panel.rows, "cutline").display).toMatch(/no vector path/i);
    expect(panel.result?.fails).toEqual(["cutline"]);
  });

  test("white ink and tiny text are unknown for PNG and flag artist review", () => {
    const panel = preflightUpload(pngWithTopMargin(0), "art.png", ORDERED_3X3, "clear");
    expect(byId(panel.rows, "white-ink").source).toBe("unavailable");
    expect(byId(panel.rows, "tiny-text").source).toBe("unavailable");
    expect(panel.needsReview).toBe(true);
    expect(panel.result?.fails).not.toContain("white-ink");
  });

  test("72 PPI art fails resolution", () => {
    const panel = preflightUpload(writeSolidPng(216, 216), "art.png", ORDERED_3X3, "roll-label");
    expect(panel.result?.fails).toContain("low-ppi");
  });
});

describe("upload panel: PDF", () => {
  test("cut line and white ink spots come from the bytes, no verdict", () => {
    const bytes = pdfWith("/Separation /CutContour /DeviceCMYK /Separation /WhiteInk /DeviceCMYK");
    const panel = preflightUpload(bytes, "art.pdf", ORDERED_3X3, "clear");
    expect(byId(panel.rows, "cutline").source).toBe("measured");
    expect(byId(panel.rows, "cutline").display).toMatch(/present/i);
    expect(byId(panel.rows, "white-ink").display).toMatch(/present/i);
    expect(byId(panel.rows, "ppi").source).toBe("unavailable");
    expect(byId(panel.rows, "dims").display).toBe("3x3in page matches ordered shape");
    expect(panel.needsReview).toBe(true);
    expect(panel.result).toBeNull();
  });

  test("missing spots read as missing, wrong shape reads as differs", () => {
    const panel = preflightUpload(pdfWith("", "0 0 216 144"), "art.pdf", ORDERED_3X3, "holographic");
    expect(byId(panel.rows, "cutline").ok).toBe(false);
    expect(byId(panel.rows, "white-ink").ok).toBe(false);
    expect(byId(panel.rows, "dims").ok).toBe(false);
  });
});

describe("sample path", () => {
  test("sidecar plus pixels returns all eight rows and a verdict", () => {
    const panel = preflightSample(
      writeSolidPng(900, 900),
      "x.png",
      { bleedWidthIn: 0.15, cutlinePresent: true, whiteInkPresent: true, minTextPt: 12, colorMode: "CMYK", hasTransparency: false },
      ORDERED_3X3,
      "die-cut",
    );
    expect(panel.rows.length).toBe(8);
    expect(panel.rows.every((r) => r.source !== "unavailable")).toBe(true);
    expect(panel.needsReview).toBe(false);
    expect(panel.result?.verdict).toBe("PASS");
  });
});

describe("copy and errors", () => {
  test("panel copy stays concise with zero banned words", () => {
    const panels = [
      preflightUpload(writeSolidPng(900, 900), "art.png", ORDERED_3X3, "die-cut"),
      preflightUpload(pdfWith("/Separation /CutContour /DeviceCMYK"), "art.pdf", ORDERED_3X3, "clear"),
      preflightSample(writeSolidPng(450, 450), "x.png", { bleedWidthIn: 0.05, cutlinePresent: true }, ORDERED_3X3, "die-cut"),
    ];
    for (const p of panels) {
      for (const r of p.rows) {
        expect(r.label.length).toBeGreaterThan(0);
        expect(r.display.length).toBeGreaterThan(0);
        expect(/sorry|unfortunately|can't/i.test(`${r.label} ${r.display}`)).toBe(false);
      }
    }
  });

  test("unreadable upload throws instead of inventing numbers", () => {
    expect(() => preflightUpload(Buffer.from("not a file"), "art.png", ORDERED_3X3, "die-cut")).toThrow();
    expect(() => preflightUpload(Buffer.from("not a file"), "art.pdf", ORDERED_3X3, "die-cut")).toThrow();
  });
});
