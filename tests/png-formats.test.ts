import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { decodePng, readPngDims } from "../src/png";

// Fixtures written by Pillow 12 (plus two hand-built Adam7 files), with the
// RGBA that Pillow decodes for each one. Real uploads come in all of these
// formats, so the decoder has to agree with a reference decoder on each.
// gray16 holds gray8 * 257, so its expected 8-bit output is gray8 (Pillow
// clips 16-bit gray when it converts to RGBA, so its own output is not used).
const DIR = join(import.meta.dir, "fixtures", "png");
const expected = (await Bun.file(join(DIR, "expected.json")).json()) as Record<
  string,
  { w: number; h: number; rgba: number[] }
>;

function toRgba(d: ReturnType<typeof decodePng>): number[] {
  if (d.channels === 4) return Array.from(d.pixels);
  const out: number[] = [];
  for (let i = 0; i < d.pixels.length; i += 3) out.push(d.pixels[i], d.pixels[i + 1], d.pixels[i + 2], 255);
  return out;
}

describe("png decoder matches a reference decoder on every color type", () => {
  for (const name of Object.keys(expected)) {
    test(name, async () => {
      const bytes = Buffer.from(await Bun.file(join(DIR, `${name}.png`)).arrayBuffer());
      const d = decodePng(bytes);
      expect(d.width).toBe(expected[name].w);
      expect(d.height).toBe(expected[name].h);
      expect(readPngDims(bytes)).toEqual({ width: d.width, height: d.height });
      expect(toRgba(d)).toEqual(expected[name].rgba);
    });
  }

  test("covers gray, gray+alpha, palette, tRNS, 1/4/8/16 bit and interlaced", () => {
    for (const n of ["gray1", "gray8", "gray16", "graya8", "palette4", "palette-trns", "rgb8-adam7", "rgba8-adam7"]) {
      expect(Object.keys(expected)).toContain(n);
    }
  });
});
