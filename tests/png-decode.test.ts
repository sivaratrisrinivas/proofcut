import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import {
  countPureBlackPixels,
  decodePng,
  hasTransparency,
  measureWhiteEdgeDepth,
  writePng,
  writeSolidPng,
} from "../src/png";

type RGBA = [number, number, number, number];

function crc32Table(): Int32Array {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC_T = crc32Table();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Test-local encoder: filter-0 baseline (mirrors spike generator). */
function encodeFilter0(w: number, h: number, at: (x: number, y: number) => RGBA, colorType: 2 | 6): Buffer {
  const ch = colorType === 2 ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const stride = w * ch;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (stride + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = at(x, y);
      raw[off + 1 + x * ch] = r;
      raw[off + 1 + x * ch + 1] = g;
      raw[off + 1 + x * ch + 2] = b;
      if (ch === 4) raw[off + 1 + x * ch + 3] = a;
    }
  }
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", Buffer.from(deflateSync(raw))), chunk("IEND", Buffer.alloc(0))]);
}

/** Test-local encoder applying one PNG filter per row (covers filters 1-4). */
function encodeWithFilter(
  w: number,
  h: number,
  pixels: Buffer,
  ch: number,
  filter: 0 | 1 | 2 | 3 | 4,
  colorType: 2 | 6,
): Buffer {
  const stride = w * ch;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (stride + 1);
    raw[off] = filter;
    for (let x = 0; x < stride; x++) {
      const orig = pixels[y * stride + x];
      const left = x >= ch ? pixels[y * stride + x - ch] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= ch && y > 0 ? pixels[(y - 1) * stride + x - ch] : 0;
      const pred =
        filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      raw[off + 1 + x] = (orig - pred) & 255;
    }
  }
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", Buffer.from(deflateSync(raw))), chunk("IEND", Buffer.alloc(0))]);
}

describe("01 decoder seam", () => {
  test("decodes solid RGB PNG from writeSolidPng", () => {
    const buf = writeSolidPng(16, 12, [240, 240, 245]);
    const d = decodePng(buf);
    expect(d.width).toBe(16);
    expect(d.height).toBe(12);
    expect(d.channels).toBe(3);
    expect(d.pixels.length).toBe(16 * 12 * 3);
    expect(d.pixels[0]).toBe(240);
    expect(d.pixels[1]).toBe(240);
    expect(d.pixels[2]).toBe(245);
  });

  test("ground truth A: 20px white edge within 2%", () => {
    const fileA = encodeFilter0(400, 400, (x, y) =>
      x < 20 || y < 20 || x >= 380 || y >= 380 ? [255, 255, 255, 255] : [120, 120, 130, 255], 2);
    const d = decodePng(fileA);
    const edge = measureWhiteEdgeDepth(d);
    expect(edge).toBe(20);
    expect(Math.abs(edge - 20) / 400).toBeLessThanOrEqual(0.02);
  });

  test("ground truth B: 60x40 pure-black block within 2%", () => {
    const fileB = encodeFilter0(300, 300, (x, y) =>
      x >= 50 && x < 110 && y >= 80 && y < 120 ? [0, 0, 0, 255] : [200, 200, 205, 255], 2);
    const d = decodePng(fileB);
    const blacks = countPureBlackPixels(d);
    expect(blacks).toBe(2400);
    expect(Math.abs(blacks - 2400) / 2400).toBeLessThanOrEqual(0.02);
  });

  test("ground truth C: transparency detected, opaque file clean", () => {
    const fileC = encodeFilter0(200, 200, (x, y) =>
      x < 40 && y < 40 ? [200, 200, 205, 0] : [200, 200, 205, 255], 6);
    const fileB = encodeFilter0(300, 300, (x, y) =>
      x >= 50 && x < 110 && y >= 80 && y < 120 ? [0, 0, 0, 255] : [200, 200, 205, 255], 2);
    expect(hasTransparency(decodePng(fileC))).toBe(true);
    expect(hasTransparency(decodePng(fileB))).toBe(false);
  });

  test("all 5 unfilter filters round-trip identical pixels", () => {
    const w = 8;
    const h = 6;
    const ch = 3;
    const pixels = Buffer.alloc(w * h * ch);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        pixels[(y * w + x) * ch] = (x * 37 + y * 91) & 255;
        pixels[(y * w + x) * ch + 1] = (x * 53 + y * 17) & 255;
        pixels[(y * w + x) * ch + 2] = (x * 11 + y * 71) & 255;
      }
    }
    for (const filter of [0, 1, 2, 3, 4] as const) {
      const buf = encodeWithFilter(w, h, pixels, ch, filter, 2);
      const d = decodePng(buf);
      expect(d.width).toBe(w);
      expect(d.height).toBe(h);
      expect(Buffer.from(d.pixels).equals(pixels)).toBe(true);
    }
  });

  test("RGBA round-trip preserves alpha", () => {
    const w = 4;
    const h = 4;
    const ch = 4;
    const pixels = Buffer.from([
      200, 200, 205, 0, 200, 200, 205, 128, 200, 200, 205, 255, 10, 20, 30, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 100, 110, 120, 200, 50, 60, 70, 10,
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      250, 251, 252, 249, 0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255,
    ]);
    const buf = encodeWithFilter(w, h, pixels, ch, 4, 6);
    const d = decodePng(buf);
    expect(d.channels).toBe(4);
    expect(Buffer.from(d.pixels).equals(pixels)).toBe(true);
  });

  test("rejects bad signature and unsupported color type", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow();
    const gray = encodeFilter0(4, 4, () => [10, 20, 30, 255], 2);
    // Corrupt IHDR color type byte (offset 16+9=25) to 5, which the PNG spec does not define.
    const bad = Buffer.from(gray);
    bad[25] = 5;
    expect(() => decodePng(bad)).toThrow();
  });

  test("writePng RGB round-trips through decodePng", () => {
    const pixels = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    const buf = writePng(2, 2, 3, pixels);
    const d = decodePng(buf);
    expect(d.width).toBe(2);
    expect(d.height).toBe(2);
    expect(d.channels).toBe(3);
    expect(Buffer.from(d.pixels).equals(pixels)).toBe(true);
  });

  test("writePng RGBA round-trips alpha through decodePng", () => {
    const pixels = Buffer.from([200, 200, 205, 0, 10, 20, 30, 255, 0, 0, 0, 128, 255, 255, 255, 200]);
    const buf = writePng(2, 2, 4, pixels);
    const d = decodePng(buf);
    expect(d.channels).toBe(4);
    expect(Buffer.from(d.pixels).equals(pixels)).toBe(true);
  });
});
