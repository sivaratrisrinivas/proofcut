import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { GET as getSamples, POST } from "../app/api/preflight/route";
import { GET as getImage } from "../app/api/demo-image/route";
import { listSamples } from "../src/catalog";
import { writePng, writeSolidPng } from "../src/png";

// The README says the app measures PNG pixels for bleed, RGB black and
// transparency, and that the corpus is 60 L1 geometry files plus 42 L2 art
// files across five products. These tests run the real API handlers so the
// data the web app uses is the data the README describes.

const ROOT = join(import.meta.dir, "..");

function form(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new NextRequest("http://local/api/preflight", { method: "POST", body: fd });
}

describe("sample catalog matches the README corpus", () => {
  test("60 L1 geometry files and 42 L2 art files, all on disk with sidecars", async () => {
    const body = await (await getSamples()).json();
    const samples = body.samples as Array<{ file: string; set: string; kind: string; productId: string }>;
    expect(samples.filter((s) => s.set === "geometry").length).toBe(60);
    const art = samples.filter((s) => s.set === "art");
    expect(art.length).toBe(42);
    expect(art.filter((s) => s.kind === "png").length).toBe(32);
    expect(art.filter((s) => s.kind === "pdf").length).toBe(10);
    expect(new Set(art.map((s) => s.productId))).toEqual(
      new Set(["die-cut", "clear", "holographic", "roll-label", "packaging-tape"]),
    );
    for (const s of listSamples()) {
      expect(existsSync(join(ROOT, s.dir, s.file)), s.file).toBe(true);
      expect(existsSync(join(ROOT, s.dir, `${s.file}.sidecar.json`)), `${s.file} sidecar`).toBe(true);
    }
    expect(body.products.length).toBe(5);
  });

  test("L1 includes 72 dpi low-resolution cases", () => {
    expect(listSamples().some((s) => s.set === "geometry" && /at 72 PPI/.test(s.note))).toBe(true);
  });

  test("sample notes never leak the expected verdict", () => {
    for (const s of listSamples()) expect(/PASS|SOFT-FAIL|->/.test(s.note), s.file).toBe(false);
  });
});

describe("every sample, run through the API, matches its ground truth", () => {
  for (const s of listSamples()) {
    test(`${s.file} -> ${s.expectedVerdict}`, async () => {
      const res = await POST(
        form({
          demoFile: s.file,
          widthIn: String(s.orderedWidthIn),
          heightIn: String(s.orderedHeightIn),
          productId: s.productId,
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.verdict).toBe(s.expectedVerdict);
      expect([...body.result.fails].sort()).toEqual([...s.expectedFails].sort());
      expect(body.groundTruth.matches).toBe(true);
      const bleed = body.rows.find((r: { id: string }) => r.id === "bleed");
      if (s.set === "art" && s.kind === "png") {
        // README: bleed, RGB black and transparency come straight from the pixels.
        expect(bleed.source).toBe("measured");
        expect(body.rows.find((r: { id: string }) => r.id === "color").source).toBe("measured");
        expect(body.rows.find((r: { id: string }) => r.id === "transparency").source).toBe("measured");
      }
      if (s.kind === "pdf") {
        expect(body.rows.find((r: { id: string }) => r.id === "cutline").source).toBe("measured");
        expect(body.rows.find((r: { id: string }) => r.id === "white-ink").source).toBe("measured");
      }
    });
  }

  test("changing the order turns off the ground truth match", async () => {
    const body = await (await POST(form({ demoFile: "l2-001.png", widthIn: "6", heightIn: "6", productId: "die-cut" }))).json();
    expect(body.groundTruth.sameOrder).toBe(false);
    expect(body.groundTruth.matches).toBe(false);
    expect(body.result.fails).toContain("low-ppi");
  });
});

describe("upload and input errors", () => {
  test("user PNG gets a measured verdict", async () => {
    const px = Buffer.alloc(600 * 600 * 3, 120);
    const file = new File([new Uint8Array(writePng(600, 600, 3, px))], "mine.png", { type: "image/png" });
    const body = await (await POST(form({ file, widthIn: "2", heightIn: "2", productId: "roll-label" }))).json();
    expect(body.result.verdict).toBe("PASS");
    expect(body.rows.find((r: { id: string }) => r.id === "bleed").source).toBe("measured");
  });

  test("rejects bad input with plain messages", async () => {
    const png = new File([new Uint8Array(writeSolidPng(10, 10))], "a.png");
    const cases: Array<[Record<string, string | File>, number]> = [
      [{ file: png, widthIn: "0", heightIn: "2", productId: "die-cut" }, 400],
      [{ file: png, widthIn: "abc", heightIn: "2", productId: "die-cut" }, 400],
      [{ file: png, widthIn: "2", heightIn: "2", productId: "nope" }, 400],
      [{ widthIn: "2", heightIn: "2", productId: "die-cut" }, 400],
      [{ file: new File([], "e.png"), widthIn: "2", heightIn: "2", productId: "die-cut" }, 400],
      [{ file: new File(["x"], "a.jpg"), widthIn: "2", heightIn: "2", productId: "die-cut" }, 400],
      [{ file: new File(["garbage"], "a.png"), widthIn: "2", heightIn: "2", productId: "die-cut" }, 422],
      [{ file: new File([new Uint8Array(4_600_000)], "big.png"), widthIn: "2", heightIn: "2", productId: "die-cut" }, 413],
      [{ demoFile: "../package.json", widthIn: "2", heightIn: "2", productId: "die-cut" }, 400],
    ];
    for (const [fields, status] of cases) {
      const res = await POST(form(fields));
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    }
  });
});

describe("sample image route", () => {
  test("serves corpus PNGs from both sets", async () => {
    for (const name of ["l2-005.png", "diecut-001.png"]) {
      const res = await getImage(new NextRequest(`http://local/api/demo-image?name=${name}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
    }
  });

  test("refuses PDFs, unknown names and traversal", async () => {
    for (const name of ["cut-001.pdf", "nope.png", "../package.json", "..%2Fpackage.json"]) {
      const res = await getImage(new NextRequest(`http://local/api/demo-image?name=${name}`));
      expect(res.status).toBe(400);
    }
  });
});
