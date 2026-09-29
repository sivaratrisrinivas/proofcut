# 02: L2 content generator (~25 files)

**What to build:** A developer can regenerate `corpus-l2-content/` from one script and get real shapes, logo-like vector art, 5pt vs 8pt text at known size, an RGB-black block, a transparency checker, and white-edge missing-bleed cases — each with manifest ground truth that the decoder (01) confirms.

**Blocked by:** 01 decoder seam (generator self-checks every file through it).

**Status:** ready-for-human

- [x] One generator script producing ~25 PNGs (+ sidecars only where the Q1 split requires: text height, cut-line) with manifest ground truth
- [x] Every content-measured fault self-verified through the 01 seam within 2% at generate time
- [x] L1 (`corpus/`, 60 files) untouched

## Comments

Implemented 2026-09-30. `scripts/generate-l2-content.ts` (`bun run generate:l2`) writes
25 PNGs to `corpus-l2-content/` + `manifest.json`: 4 full-bleed logo-art PASS, 3 missing-bleed
(30px/15px margins + bottom-only adversarial PASS-by-construction), 2 RGB-black blocks
(6000/30000 px, warn-only PASS), 2 transparency (80x80 checker + opaque RGBA control),
3 text-bar files (5pt fail / 8pt + 6pt pass), 2 cutline (false fail / true pass),
2 low-ppi, 3 roll-label (no-cutline PASS / bleed fail / low-ppi fail), 2 logo variants,
2 combos (black+bleed, transparency+bleed). 15 PASS / 10 SOFT-FAIL.
Bleed ground truth uses `max(0, 0.125 - edgePx/ppi)` — ticket 03 implements this same
formula from pixels. Sidecars carry ONLY `cutlinePresent` (+ `minTextPt` for text files).
Self-verify at generate time is exact (0 mismatches); `tests/l2-content.test.ts` locks
2% manifest agreement + sidecar key allowlist + L1-still-60 (manifest rows match PNGs
on disk by name). `src/png.ts` gained a tested `writePng` encoder (RGB/RGBA filter-0)
to support the script; `writeSolidPng` now delegates to it (byte-identical output).
No UI touched.

## Known limitations (stated plainly)

- Text is simulated bars at exact cap-heights (21px=5pt, 33px=8pt, 25px=6pt @300dpi),
  not rendered glyphs: no font stack exists in the repo, and Q1 keeps text height
  sidecar-declared. Bars give future OCR something measurable at a known size.
- `l2-007` (bottom-only white bar, PASS) pins the seam's top-row-scan limit from
  ticket 01: bottom-edge bleed is invisible to `measureWhiteEdgeDepth`. Recorded in
  the manifest `note`, not hidden.
- Manifest `expectedVerdict`/`expectedFails` mirror the L1 manifest shape; the
  generator's expectation rules duplicate preflight thresholds by necessity (same as
  the L1 generator) — ticket 03's wiring is the authority, gate (05) decides.
- Ext-PDF absorption into L2 is ticket 04's job; L2 holds the 25 PNGs only.
