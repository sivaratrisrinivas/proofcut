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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3] = rgb[0];
      raw[off + 1 + x * 3 + 1] = rgb[1];
      raw[off + 1 + x * 3 + 2] = rgb[2];
    }
  }
  const compressed = deflateSync(raw);

  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", Buffer.from(compressed)),
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
  let seenIhdr = false;
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
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported png: bitDepth=${bitDepth} colorType=${colorType} (only 8-bit RGB/RGBA)`);
      }
      if (data[12] !== 0) {
        throw new Error("unsupported png: interlaced (only non-interlaced)");
      }
      if (width <= 0 || height <= 0) throw new Error("not a png: bad IHDR dims");
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (!seenIhdr) throw new Error("not a png: missing IHDR");
  if (idat.length === 0) throw new Error("not a png: missing IDAT");
  const channels: 3 | 4 = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  let raw: Buffer;
  try {
    raw = Buffer.from(inflateSync(Buffer.concat(idat)));
  } catch {
    throw new Error("not a png: IDAT inflate failed");
  }
  if (raw.length !== (stride + 1) * height) {
    throw new Error("not a png: IDAT size mismatch");
  }
  const pixels = Buffer.alloc(stride * height);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    if (filter > 4) throw new Error(`not a png: bad filter ${filter} on row ${y}`);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const v = raw[cursor++];
      pixels[y * stride + x] =
        filter === 0 ? v
        : filter === 1 ? (v + left) & 255
        : filter === 2 ? (v + up) & 255
        : filter === 3 ? (v + ((left + up) >> 1)) & 255
        : (v + paethPredictor(left, up, upLeft)) & 255;
    }
  }
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
