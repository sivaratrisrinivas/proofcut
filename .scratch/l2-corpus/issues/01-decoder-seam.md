# 01: PNG decoder seam

**What to build:** A developer can decode any corpus PNG to raw pixels and read edge, black-pixel, and alpha facts from content, through a pure tested seam — no throwaway spike code in the path.

**Blocked by:** None (can start immediately; spike proven at 0.00% in `scripts/spike-l2-decode.ts`, keep that file as reference until this lands, then delete it).

**Status:** ready-for-human

- [x] Pure `decodePng` seam (inflate + all 5 unfilter filters, RGB/RGBA 8-bit) with unit tests over known-geometry PNGs
- [x] Edge-row scan, pure-black pixel count, and alpha-presence helpers on the seam, each within 2% of ground truth
- [x] Spike script removed once the seam proves the same numbers

## Comments

Implemented 2026-09-30. `tests/png-decode.test.ts` (7 tests): solid-RGB decode, ground-truth A edge=20px exact, B blacks=2400 exact, C transparency true/B false, all-5-filters round-trip + RGBA alpha round-trip, bad-signature/unsupported-type rejects.
Seam: `decodePng` + `measureWhiteEdgeDepth` + `countPureBlackPixels` + `hasTransparency` in `src/png.ts` (pure, no FS).
Spike parity: seam decodes `/tmp/opencode/spike-A/B/C.png` to identical numbers (20 / 2400 / true-false), `scripts/spike-l2-decode.ts` deleted.
`bun test` 84 pass / 0 fail, `bunx tsc --noEmit` clean. No UI touched by construction.
