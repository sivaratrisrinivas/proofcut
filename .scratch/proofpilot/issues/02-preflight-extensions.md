# 02: Preflight extensions (clear + text + color)

**What to build:** The same preflight seam now calls clear and holo correctly, flagging missing white ink, tiny text, and color risk, so clear jobs stop slipping through as clean passes.

**Blocked by:** 01 corpus + preflight core (die-cut).

**Status:** ready-for-human

- [x] Missing white ink on clear and holo returns soft-fail
- [x] Text under 6pt via OCR returns soft-fail
- [x] RGB black and transparency return warn with auto-convert note, not fail
- [x] 5 PDFs with CutContour spot and 5 clear and holo white-ink edges verdict correctly
- [x] Existing die-cut verdicts stay green

## Comments

Implemented 2026-09-30. `bun test` 17 pass 0 fail; `bun run build` (`tsc --noEmit`) clean.
Seam: `preflight()` in `src/preflight.ts` extended (fails `white-ink`, `tiny-text`; warns `rgb-black-auto-convert`, `transparency-auto-convert`, warn-only so verdict stays PASS); `src/pdf.ts` (`hasCutContourSpot`, `hasWhiteInkSpot` string search); `preflightFile()` in `src/preflightFile.ts` dispatches .pdf (cutline/white-ink from PDF bytes, bleed/text/color/transparency + pixel dims from sidecar) vs .png (dims from bytes, rest from sidecar).
Corpus-ext: `corpus-ext/` 10 PDFs + sidecars + `manifest.json` via `scripts/generate-extensions-corpus.ts` (5 CutContour cut-001..005, 5 white-ink white-001..005; 4 PASS / 6 SOFT-FAIL edge mix; ext harness 100%).
OCR note: `minTextPt` arrives via sidecar (simulated OCR measurement, threshold <6pt fails soft); real OCR engine deferred, same sidecar-fault pattern as ticket 01.
Die-cut green: corpus harness still 60 files, accuracy 100%, hold 36.7%, p95 ~1ms; PPI within 2%.
No git repo in workspace, so no commit; review working tree instead.
