#!/usr/bin/env python3
"""Fresh held-out eval cases for ProofPilot preflight.

Written separately from the corpus generators in scripts/*.ts and from the
checks in src/. It uses Pillow (plus a small hand-written PNG writer for
16-bit and interlaced files) and computes every expected answer from how
the case was built, using the README thresholds. It never imports or runs
ProofPilot code.

Rules used for the expected answers (README "Thresholds"):
  low-ppi        min(px_w / in_w, px_h / in_h) < 200
  dims-mismatch  aspect ratio off by more than 2 percent
  bleed          art must reach 0.125in past the cut line on every edge.
                 A pure white paper margin on any edge eats into that bleed.
                 A white band that is part of the design does not, because a
                 small cut drift there still shows white.
  cutline        die-cut, clear, holographic need a CutContour spot color
  white-ink      clear, holographic need a white ink spot color
  tiny-text      smallest text under 6pt
  warnings       RGB black (any pixel with R, G, B all <= 8),
                 transparency (any pixel with alpha < 255)

Usage: python3 scripts/eval/generate_fresh.py   (writes evals/fresh/)
"""
import json
import random
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SEED = 20261003
OUT = Path(__file__).resolve().parents[2] / "evals" / "fresh"
PRODUCTS = {
    "die-cut": dict(cut=True, white=False),
    "clear": dict(cut=True, white=True),
    "holographic": dict(cut=True, white=True),
    "roll-label": dict(cut=False, white=False),
    "packaging-tape": dict(cut=False, white=False),
}
SIZES = [(2, 2), (3, 3), (3, 2), (2, 3), (4, 2), (1.5, 1.5), (2.5, 2)]
PPIS = [72, 120, 150, 199, 200, 240, 299, 300, 301, 360]
ENCODINGS = ["rgb8", "rgba8", "palette", "gray8", "rgb16", "rgb8-adam7"]
FAULTS = [
    "clean",
    "margin-top",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "margin-all",
    "white-design-top",
    "rgb-black",
    "near-black",
    "alpha-patch",
    "faint-alpha",
    "aspect-1pct",
    "aspect-3pct",
    "tiny-text",
    "text-6pt",
    "no-cutline",
    "no-white-ink",
]


# ---------- PNG writing ----------

def _chunk(t: bytes, d: bytes) -> bytes:
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)


def write_png_raw(path: Path, arr: np.ndarray, bit16: bool = False, adam7: bool = False) -> None:
    """Hand-written encoder for RGB/RGBA 8 or 16 bit, plain or Adam7, filter 0."""
    h, w, c = arr.shape
    ctype = 2 if c == 3 else 6
    data = arr.astype(np.uint16) * 257 if bit16 else arr.astype(np.uint8)

    def rows(sub: np.ndarray) -> bytes:
        out = bytearray()
        for row in sub:
            out.append(0)
            out += row.astype(">u2").tobytes() if bit16 else row.tobytes()
        return bytes(out)

    if adam7:
        raw = b""
        for x0, y0, dx, dy in [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]:
            sub = data[y0::dy, x0::dx]
            if sub.shape[0] and sub.shape[1]:
                raw += rows(sub)
    else:
        raw = rows(data)
    ihdr = struct.pack(">IIBBBBB", w, h, 16 if bit16 else 8, ctype, 0, 0, 1 if adam7 else 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b""))


def save_png(path: Path, rgba: np.ndarray, encoding: str) -> None:
    has_alpha = bool((rgba[:, :, 3] < 255).any())
    if encoding == "rgb16":
        write_png_raw(path, rgba if has_alpha else rgba[:, :, :3], bit16=True)
    elif encoding == "rgb8-adam7":
        write_png_raw(path, rgba if has_alpha else rgba[:, :, :3], adam7=True)
    elif encoding == "rgba8":
        Image.fromarray(rgba, "RGBA").save(path, optimize=True)
    elif encoding == "rgb8":
        assert not has_alpha, "rgb8 drops alpha"
        Image.fromarray(rgba[:, :, :3], "RGB").save(path, optimize=True)
        return
    elif encoding == "gray8":
        assert not has_alpha
        Image.fromarray(rgba[:, :, 0], "L").save(path, optimize=True)
    elif encoding == "palette":
        assert not has_alpha
        rgb = rgba[:, :, :3]
        flat = rgb.reshape(-1, 3)
        colors, idx = np.unique(flat, axis=0, return_inverse=True)
        assert len(colors) <= 256, "palette case needs 256 colors or fewer"
        im = Image.fromarray(idx.reshape(rgb.shape[:2]).astype(np.uint8), "P")
        im.putpalette(colors.astype(np.uint8).flatten().tolist())
        im.save(path, optimize=False)
    else:
        Image.fromarray(rgba[:, :, :3], "RGB").save(path, optimize=True)


# ---------- art ----------

def art_color(rng: random.Random, gray: bool) -> tuple:
    if gray:
        v = rng.randint(40, 215)
        return (v, v, v)
    return tuple(rng.randint(30, 225) for _ in range(3))


def build_art(rng: random.Random, w: int, h: int, gray: bool) -> Image.Image:
    im = Image.new("RGBA", (w, h), art_color(rng, gray) + (255,))
    d = ImageDraw.Draw(im)
    for _ in range(rng.randint(2, 5)):
        r = rng.randint(max(4, min(w, h) // 12), max(6, min(w, h) // 4))
        cx, cy = rng.randint(r, max(r, w - r)), rng.randint(r, max(r, h - r))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=art_color(rng, gray) + (255,))
    return im


# ---------- PDF writing ----------

def pdf_bytes(spots: list, w_pt: float, h_pt: float, style: str, extra_text: str = "") -> bytes:
    """A small but well-formed PDF. style: 'plain' puts the Separation color
    spaces in normal objects; 'objstm' hides them in a compressed object
    stream (what Illustrator and InDesign write by default)."""
    func = "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>"
    cs_entries = " ".join(f"/CS{i} [/Separation {name} /DeviceCMYK {func}]" for i, name in enumerate(spots))
    content = b"q 0.2 0.4 0.8 rg 0 0 %d %d re f Q\n" % (int(w_pt), int(h_pt))
    if extra_text:
        content += f"BT /F1 9 Tf 10 10 Td ({extra_text}) Tj ET\n".encode()
    for i in range(len(spots)):
        content += f"q /CS{i} CS 1 SCN 2 w 9 9 {int(w_pt) - 18} {int(h_pt) - 18} re S Q\n".encode()
    stream = zlib.compress(content)
    objs = {}
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>"
    objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
    objs[3] = (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w_pt:g} {h_pt:g}] "
               f"/Resources << /ColorSpace 5 0 R /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>")
    objs[5] = f"<< {cs_entries} >>"
    out = bytearray(b"%PDF-1.6\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}

    def add(num: int, body: bytes) -> None:
        offsets[num] = len(out)
        out.extend(f"{num} 0 obj\n".encode() + body + b"\nendobj\n")

    add(4, f"<< /Length {len(stream)} /Filter /FlateDecode >>\nstream\n".encode() + stream + b"\nendstream")
    if style == "objstm":
        packed_nums = [1, 2, 3, 5]
        bodies = [objs[n].encode() for n in packed_nums]
        header, pos = [], 0
        for n, b in zip(packed_nums, bodies):
            header.append(f"{n} {pos}")
            pos += len(b) + 1
        head = (" ".join(header) + " ").encode()
        payload = head + b"".join(b + b"\n" for b in bodies)
        comp = zlib.compress(payload)
        add(6, f"<< /Type /ObjStm /N {len(packed_nums)} /First {len(head)} /Length {len(comp)} /Filter /FlateDecode >>\nstream\n".encode() + comp + b"\nendstream")
        # cross-reference stream
        entries = {0: (0, 0, 65535), 4: (1, offsets[4], 0), 6: (1, offsets[6], 0)}
        for i, n in enumerate(packed_nums):
            entries[n] = (2, 6, i)
        xref_num = 7
        entries[xref_num] = (1, len(out), 0)
        rows = b"".join(struct.pack(">BIH", *entries[i]) for i in range(xref_num + 1))
        comp_x = zlib.compress(rows)
        start = len(out)
        out.extend(f"{xref_num} 0 obj\n<< /Type /XRef /Size {xref_num + 1} /W [1 4 2] /Root 1 0 R /Length {len(comp_x)} /Filter /FlateDecode >>\nstream\n".encode() + comp_x + b"\nendstream\nendobj\n")
        out.extend(f"startxref\n{start}\n%%EOF\n".encode())
        return bytes(out)
    for n in (1, 2, 3, 5):
        add(n, objs[n].encode())
    xref = len(out)
    nums = sorted(offsets)
    out.extend(f"xref\n0 {max(nums) + 1}\n0000000000 65535 f \n".encode())
    for n in range(1, max(nums) + 1):
        out.extend(f"{offsets[n]:010d} 00000 n \n".encode() if n in offsets else b"0000000000 65535 f \n")
    out.extend(f"trailer\n<< /Size {max(nums) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(out)


# ---------- expected answers ----------

def expected(product: str, ppi_eff: float, aspect_err: float, bleed_in: float, cut: bool, white, text):
    spec = PRODUCTS[product]
    fails = []
    if ppi_eff < 200:
        fails.append("low-ppi")
    if bleed_in < 0.125 - 1e-9:
        fails.append("bleed")
    if spec["cut"] and not cut:
        fails.append("cutline")
    if spec["white"] and white is False:
        fails.append("white-ink")
    if text is not None and text < 6:
        fails.append("tiny-text")
    if aspect_err > 0.02:
        fails.append("dims-mismatch")
    return fails


def main() -> None:
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.iterdir():
        f.unlink()
    cases = []
    n = 0
    # PNG cases: every fault x 12 draws over product, size, PPI, encoding.
    for fault in FAULTS:
        for rep in range(12):
            n += 1
            product = rng.choice(list(PRODUCTS))
            if fault == "no-white-ink":
                product = rng.choice(["clear", "holographic"])
            if fault == "no-cutline":
                product = rng.choice(["die-cut", "clear", "holographic"])
            w_in, h_in = rng.choice(SIZES)
            ppi = rng.choice(PPIS)
            if fault in ("aspect-1pct", "aspect-3pct", "margin-top", "margin-bottom", "margin-left", "margin-right", "margin-all"):
                ppi = rng.choice([240, 300, 301, 360])
            enc = ENCODINGS[rep % len(ENCODINGS)]
            if fault in ("alpha-patch", "faint-alpha") and enc in ("gray8", "palette", "rgb8"):
                enc = "rgba8"
            px_w, px_h = round(w_in * ppi), round(h_in * ppi)
            aspect_err = 0.0
            if fault == "aspect-1pct":
                px_h = round(px_h * 1.01)
            if fault == "aspect-3pct":
                px_h = round(px_h * 1.03)
            aspect_err = abs((px_w / px_h) - (w_in / h_in)) / (w_in / h_in)
            gray = enc == "gray8"
            im = build_art(rng, px_w, px_h, gray)
            d = ImageDraw.Draw(im)
            margin_px = 0
            note = fault
            black = False
            alpha = False
            if fault.startswith("margin-"):
                margin_px = rng.randint(3, 40)
                col = (255, 255, 255, 255)
                side = fault.replace("margin-", "")
                if side in ("top", "all"):
                    d.rectangle([0, 0, px_w, margin_px - 1], fill=col)
                if side in ("bottom", "all"):
                    d.rectangle([0, px_h - margin_px, px_w, px_h], fill=col)
                if side in ("left", "all"):
                    d.rectangle([0, 0, margin_px - 1, px_h], fill=col)
                if side in ("right", "all"):
                    d.rectangle([px_w - margin_px, 0, px_w, px_h], fill=col)
                note = f"{fault} {margin_px}px"
            if fault == "white-design-top":
                band = rng.randint(int(0.2 * px_h), int(0.4 * px_h))
                d.rectangle([0, 0, px_w, band], fill=(255, 255, 255, 255))
                note = f"design with a white sky band {band}px at the top, art runs to every edge"
            if fault in ("rgb-black", "near-black"):
                v = 0 if fault == "rgb-black" else rng.choice([2, 4, 6, 8])
                bw, bh = max(4, px_w // 6), max(4, px_h // 8)
                x0, y0 = rng.randint(px_w // 4, px_w // 2), rng.randint(px_h // 4, px_h // 2)
                d.rectangle([x0, y0, x0 + bw, y0 + bh], fill=(v, v, v, 255))
                black = True
                note = f"{fault} block at {v},{v},{v}"
            if fault in ("alpha-patch", "faint-alpha"):
                a = rng.choice([0, 64, 128, 200]) if fault == "alpha-patch" else rng.choice([251, 253, 254])
                arr = np.array(im)
                s = max(4, min(px_w, px_h) // 6)
                arr[px_h // 2 : px_h // 2 + s, px_w // 3 : px_w // 3 + s, 3] = a
                im = Image.fromarray(arr, "RGBA")
                alpha = True
                note = f"{fault} alpha {a}"
            text = None
            if fault == "tiny-text":
                text = rng.choice([4, 5, 5.5, 5.9])
            if fault == "text-6pt":
                text = rng.choice([6, 6.5, 8])
            spec = PRODUCTS[product]
            cut = spec["cut"] and fault != "no-cutline"
            white = (False if fault == "no-white-ink" else True) if spec["white"] else None
            ppi_eff = min(px_w / w_in, px_h / h_in)
            paper_margin = margin_px if fault.startswith("margin-") else 0
            bleed_in = max(0.0, 0.125 - paper_margin / ppi_eff)
            rgba = np.array(im.convert("RGBA"))
            if gray:
                rgba[:, :, 1] = rgba[:, :, 0]
                rgba[:, :, 2] = rgba[:, :, 0]
            name = f"f{n:03d}-{fault}.png"
            save_png(OUT / name, rgba, enc)
            sidecar = {"cutlinePresent": cut}
            if white is not None:
                sidecar["whiteInkPresent"] = white
            if text is not None:
                sidecar["minTextPt"] = text
            (OUT / f"{name}.sidecar.json").write_text(json.dumps(sidecar) + "\n")
            warns = []
            if black:
                warns.append("rgb-black-auto-convert")
            if alpha:
                warns.append("transparency-auto-convert")
            fails = expected(product, ppi_eff, aspect_err, bleed_in, cut, white, text)
            cases.append(dict(
                file=name, kind="png", fault=fault, encoding=enc, productId=product,
                orderedWidthIn=w_in, orderedHeightIn=h_in, pixelWidth=px_w, pixelHeight=px_h,
                note=note, expectedFails=fails, expectedWarnings=warns,
                expectedVerdict="PASS" if not fails else "SOFT-FAIL",
            ))
    # PDF cases: spot color naming and storage.
    cut_names = [("/CutContour", True), ("/Cutcontour", True), ("/CUTCONTOUR", True), ("/Cut#43ontour", True), (None, False)]
    white_names = [("/White", True), ("/WhiteInk", True), ("/White_Ink", True), ("/Spot#20White", True), ("/RDG_WHITE", True), (None, False)]
    for style in ("plain", "objstm"):
        for cname, chas in cut_names:
            n += 1
            product = "die-cut"
            spots = [cname] if cname else []
            extra = "Add your CutContour line here" if (not cname and style == "plain") else ""
            cases.append(dict(file=f"f{n:03d}-pdf-cut.pdf", kind="pdf", fault=f"cut-name {cname or 'none'}{' + text mention' if extra else ''}", encoding=style,
                              productId=product, spots=spots, extraText=extra, cut=chas, white=None))
        for wname, whas in white_names:
            n += 1
            product = rng.choice(["clear", "holographic"])
            spots = ["/CutContour"] + ([wname] if wname else [])
            extra = "White ink goes under the art" if (not wname and style == "plain") else ""
            cases.append(dict(file=f"f{n:03d}-pdf-white.pdf", kind="pdf", fault=f"white-name {wname or 'none'}{' + text mention' if extra else ''}", encoding=style,
                              productId=product, spots=spots, extraText=extra, cut=True, white=whas))
    for c in cases:
        if c["kind"] != "pdf":
            continue
        w_in, h_in = 3, 3
        (OUT / c["file"]).write_bytes(pdf_bytes(c.pop("spots"), w_in * 72, h_in * 72, c["encoding"], c.pop("extraText")))
        sidecar = {"bleedWidthIn": 0.125, "pixelWidth": 900, "pixelHeight": 900, "minTextPt": None, "colorMode": None, "hasTransparency": None}
        (OUT / f"{c['file']}.sidecar.json").write_text(json.dumps(sidecar) + "\n")
        cut, white = c.pop("cut"), c.pop("white")
        fails = expected(c["productId"], 300, 0.0, 0.125, cut, white, None)
        c.update(orderedWidthIn=w_in, orderedHeightIn=h_in, note=c["fault"], expectedFails=fails, expectedWarnings=[],
                 expectedVerdict="PASS" if not fails else "SOFT-FAIL")
    (OUT / "manifest.json").write_text(json.dumps(cases, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
