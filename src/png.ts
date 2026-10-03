import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function writeSolidPng(width: number, height: number, rgb = [240, 240, 245]): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = rgb[0];
    pixels[i * 3 + 1] = rgb[1];
    pixels[i * 3 + 2] = rgb[2];
  }
  return writePng(width, height, 3, pixels);
}

export function writePng(width: number, height: number, channels: 3 | 4, pixels: Buffer): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("writePng: bad dims");
  }
  if (channels !== 3 && channels !== 4) throw new Error("writePng: channels must be 3 or 4");
  if (pixels.length !== width * height * channels) throw new Error("writePng: pixel length mismatch");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 3 ? 2 : 6;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.from(deflateSync(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function readPngDims(buf: Buffer | Uint8Array): { width: number; height: number } {
  const b = Buffer.from(buf);
  if (b.length < 33) throw new Error("not a png: too short");
  if (!b.subarray(0, 8).equals(PNG_SIG)) throw new Error("not a png: bad signature");
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("not a png: bad IHDR dims");
  }
  return { width, height };
}

export interface DecodedPng {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Buffer;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Allowed bit depths per PNG color type (PNG spec, table 11.1).
const DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};
const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// Adam7 passes: [xStart, yStart, xStep, yStep].
const ADAM7: Array<[number, number, number, number]> = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** Largest image the decoder accepts, in pixels (keeps serverless memory bounded). */
export const MAX_DECODE_PIXELS = 40_000_000;

function unfilter(raw: Buffer, offset: number, _w: number, h: number, bpp: number, rowBytes: number): Buffer {
  const out = Buffer.alloc(rowBytes * h);
  let cursor = offset;
  for (let y = 0; y < h; y++) {
    const filter = raw[cursor++];
    if (filter > 4) throw new Error(`not a png: bad filter ${filter} on row ${y}`);
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bpp ? out[row + x - bpp] : 0;
      const up = y > 0 ? out[prev + x] : 0;
      const upLeft = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      const v = raw[cursor++];
      out[row + x] =
        filter === 0 ? v
        : filter === 1 ? (v + left) & 255
        : filter === 2 ? (v + up) & 255
        : filter === 3 ? (v + ((left + up) >> 1)) & 255
        : (v + paethPredictor(left, up, upLeft)) & 255;
    }
  }

  return out;
}

/**
 * Decodes any non-animated PNG (gray, gray+alpha, RGB, RGBA, palette; 1 to 16
 * bit; plain or Adam7 interlaced) to 8-bit RGB or RGBA. 16-bit samples keep
 * the high byte. A tRNS chunk turns the output into RGBA.
 */
export function decodePng(buf: Buffer | Uint8Array): DecodedPng {
  const b = Buffer.from(buf);
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("not a png: bad signature");
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let interlace = 0;
  let seenIhdr = false;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos + 8 <= b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString("ascii", pos + 4, pos + 8);
    if (pos + 12 + len > b.length) throw new Error("not a png: truncated chunk");
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      seenIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (!DEPTHS[colorType] || !DEPTHS[colorType].includes(bitDepth)) {
        throw new Error(`unsupported png: bitDepth=${bitDepth} colorType=${colorType}`);
      }
      if (interlace !== 0 && interlace !== 1) throw new Error("unsupported png: unknown interlace method");
      if (width <= 0 || height <= 0) throw new Error("not a png: bad IHDR dims");
      if (width * height > MAX_DECODE_PIXELS) {
        throw new Error(`unsupported png: ${width}x${height}px is over the ${MAX_DECODE_PIXELS / 1e6}M pixel limit`);
      }
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      trns = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (!seenIhdr) throw new Error("not a png: missing IHDR");
  if (idat.length === 0) throw new Error("not a png: missing IDAT");
  if (colorType === 3 && !palette) throw new Error("not a png: palette image without PLTE");

  const samples = SAMPLES[colorType];
  const bitsPerPixel = samples * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const hasAlpha = colorType === 4 || colorType === 6 || trns !== null;
  const channels: 3 | 4 = hasAlpha ? 4 : 3;
  const pixels = Buffer.alloc(width * height * channels);
  let raw: Buffer;
  try {
    raw = Buffer.from(inflateSync(Buffer.concat(idat)));
  } catch {
    throw new Error("not a png: IDAT inflate failed");
  }

  const maxSample = (1 << bitDepth) - 1;
  const readSample = (row: Buffer, rowStart: number, index: number): number => {
    if (bitDepth === 8) return row[rowStart + index];
    if (bitDepth === 16) return row.readUInt16BE(rowStart + index * 2);
    const bitPos = index * bitDepth;
    const byte = row[rowStart + (bitPos >> 3)];
    const shift = 8 - bitDepth - (bitPos & 7);
    return (byte >> shift) & maxSample;
  };
  const to8 = (v: number): number =>
    bitDepth === 8 ? v : bitDepth === 16 ? v >> 8 : Math.round((v * 255) / maxSample);
  const trnsGray = trns && colorType === 0 && trns.length >= 2 ? trns.readUInt16BE(0) : null;
  const trnsRgb =
    trns && colorType === 2 && trns.length >= 6
      ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)]
      : null;

  const put = (x: number, y: number, row: Buffer, rowStart: number, px: number) => {
    const o = (y * width + x) * channels;
    let r: number, g: number, bl: number, a = 255;
    if (colorType === 0) {
      const v = readSample(row, rowStart, px);
      r = g = bl = to8(v);
      if (trnsGray !== null && v === trnsGray) a = 0;
    } else if (colorType === 2) {
      const vr = readSample(row, rowStart, px * 3);
      const vg = readSample(row, rowStart, px * 3 + 1);
      const vb = readSample(row, rowStart, px * 3 + 2);
      r = to8(vr);
      g = to8(vg);
      bl = to8(vb);
      if (trnsRgb && vr === trnsRgb[0] && vg === trnsRgb[1] && vb === trnsRgb[2]) a = 0;
    } else if (colorType === 3) {
      const idx = readSample(row, rowStart, px);
      if (idx * 3 + 2 >= palette!.length) throw new Error("not a png: palette index out of range");
      r = palette![idx * 3];
      g = palette![idx * 3 + 1];
      bl = palette![idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    } else if (colorType === 4) {
      r = g = bl = to8(readSample(row, rowStart, px * 2));
      a = to8(readSample(row, rowStart, px * 2 + 1));
    } else {
      r = to8(readSample(row, rowStart, px * 4));
      g = to8(readSample(row, rowStart, px * 4 + 1));
      bl = to8(readSample(row, rowStart, px * 4 + 2));
      a = to8(readSample(row, rowStart, px * 4 + 3));
    }
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = bl;
    if (channels === 4) pixels[o + 3] = a;
  };

  if (interlace === 0 && bitDepth === 8 && (colorType === 2 || colorType === 6) && !trns) {
    const rowBytes = width * samples;
    if (raw.length !== (rowBytes + 1) * height) throw new Error("not a png: IDAT size mismatch");
    return { width, height, channels, pixels: unfilter(raw, 0, width, height, bpp, rowBytes) };
  }

  const passes = interlace === 1 ? ADAM7 : [[0, 0, 1, 1] as [number, number, number, number]];
  let offset = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rowBytes = Math.ceil((pw * bitsPerPixel) / 8);
    const need = (rowBytes + 1) * ph;
    if (offset + need > raw.length) throw new Error("not a png: IDAT size mismatch");
    const rows = unfilter(raw, offset, pw, ph, bpp, rowBytes);
    offset += need;
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) put(x0 + px * dx, y0 + py * dy, rows, py * rowBytes, px);
    }
  }
  if (offset !== raw.length) throw new Error("not a png: IDAT size mismatch");
  return { width, height, channels, pixels };
}

const NEAR_WHITE = 250;

function isWhitePixel(r: number, g: number, b: number): boolean {
  return r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE;
}

export function measureWhiteEdgeDepth(decoded: DecodedPng): number {
  const { width, height, channels, pixels } = decoded;
  let depth = 0;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = y * width * channels + x * channels;
      if (!isWhitePixel(pixels[off], pixels[off + 1], pixels[off + 2])) break outer;
    }
    depth++;
  }
  return depth;
}

export function countPureBlackPixels(decoded: DecodedPng): number {
  let n = 0;
  for (let off = 0; off < decoded.pixels.length; off += decoded.channels) {
    if (decoded.pixels[off] === 0 && decoded.pixels[off + 1] === 0 && decoded.pixels[off + 2] === 0) n++;
  }
  return n;
}

export function hasTransparency(decoded: DecodedPng): boolean {
  if (decoded.channels !== 4) return false;
  for (let off = 3; off < decoded.pixels.length; off += 4) {
    if (decoded.pixels[off] < NEAR_WHITE) return true;
  }
  return false;
}
