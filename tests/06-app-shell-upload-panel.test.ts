import { describe, expect, test } from "bun:test";
import { writeSolidPng } from "../src/png";
import { preflightDemoPng, preflightUpload, type PanelRow } from "../src/upload";

const ORDERED_3X3 = { widthIn: 3, heightIn: 3 };

function pdfWith(spots: string): Uint8Array {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Page /MediaBox [0 0 216 216] /Resources << /ColorSpace << ${spots} >> >> >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
    "latin1",
  );
}

function byId(rows: PanelRow[], id: string): PanelRow {
  const row = rows.find((r) => r.id === id);
  expect(row, `panel row ${id} exists`).toBeDefined();
  return row!;
}

describe("ticket 06: upload panel rows", () => {
  test("png upload measures ppi and dims from bytes", () => {
    const bytes = writeSolidPng(900, 900);
    const panel = preflightUpload(bytes, "art.png", ORDERED_3X3, "die-cut");
    expect(panel.rows.length).toBe(8);
    const ppi = byId(panel.rows, "ppi");
    expect(ppi.source).toBe("measured");
    expect(ppi.display).toContain("300 PPI");
    const dims = byId(panel.rows, "dims");
    expect(dims.source).toBe("measured");
    expect(dims.display).toContain("900x900px");
  });

  test("png upload reports raster cutline truth and unknown bleed", () => {
    const bytes = writeSolidPng(900, 900);
    const panel = preflightUpload(bytes, "art.png", ORDERED_3X3, "die-cut");
    const cutline = byId(panel.rows, "cutline");
    expect(cutline.source).toBe("measured");
    expect(cutline.display).toMatch(/no vector path/i);
    const bleed = byId(panel.rows, "bleed");
    expect(bleed.source).toBe("unavailable");
    expect(bleed.display).toMatch(/unknown/i);
  });

  test("incomplete raw upload needs artist review and carries no verdict", () => {
    const bytes = writeSolidPng(900, 900);
    const panel = preflightUpload(bytes, "art.png", ORDERED_3X3, "die-cut");
    expect(panel.needsReview).toBe(true);
    expect(panel.result).toBeNull();
  });

  test("pdf upload measures cutline and white-ink spots from bytes", () => {
    const bytes = pdfWith("/Separation /CutContour /DeviceCMYK /Separation /WhiteInk /DeviceCMYK");
    const panel = preflightUpload(bytes, "art.pdf", ORDERED_3X3, "clear");
    expect(byId(panel.rows, "cutline").source).toBe("measured");
    expect(byId(panel.rows, "cutline").display).toMatch(/present/i);
    expect(byId(panel.rows, "white-ink").source).toBe("measured");
    expect(byId(panel.rows, "white-ink").display).toMatch(/present/i);
    expect(byId(panel.rows, "ppi").source).toBe("unavailable");
    expect(panel.needsReview).toBe(true);
    expect(panel.result).toBeNull();
  });

  test("demo sidecar path returns all eight rows plus a verdict", () => {
    const bytes = writeSolidPng(900, 900);
    const panel = preflightDemoPng(
      bytes,
      { bleedWidthIn: 0.15, cutlinePresent: true, whiteInkPresent: true, minTextPt: 12, colorMode: "CMYK", hasTransparency: false },
      ORDERED_3X3,
      "die-cut",
    );
    expect(panel.rows.length).toBe(8);
    expect(panel.rows.every((r) => r.source !== "unavailable")).toBe(true);
    expect(panel.needsReview).toBe(false);
    expect(panel.result?.verdict).toBe("PASS");
    expect(panel.result?.productId).toBe("die-cut");
  });

  test("panel copy stays concise with zero banned words", () => {
    const panels = [
      preflightUpload(writeSolidPng(900, 900), "art.png", ORDERED_3X3, "die-cut"),
      preflightUpload(pdfWith("/Separation /CutContour /DeviceCMYK"), "art.pdf", ORDERED_3X3, "clear"),
      preflightDemoPng(writeSolidPng(450, 450), { bleedWidthIn: 0.05, cutlinePresent: true }, ORDERED_3X3, "die-cut"),
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
