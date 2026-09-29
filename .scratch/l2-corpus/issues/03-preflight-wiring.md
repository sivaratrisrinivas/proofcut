# 03: Preflight content wiring

**What to build:** A developer can run preflight over L2 and get bleed width, RGB-black, and transparency measured from pixels — with text height and cut-line still sidecar-declared and labeled per row, exactly the Q1 split, and the UI showing the same screens as today.

**Blocked by:** 02 L2 generator (needs L2 files to prove content-measured numbers).

**Status:** ready-for-human

Constraint: UI untouched — displayed numbers may change only where content measurement replaces sidecar; copy, layout, and the one-action-per-screen loop stay exactly as they are.

- [x] Preflight measures bleed, RGB-black, transparency from decoded pixels where possible
- [x] Text height + cut-line remain sidecar-sourced with per-row source labels intact
- [x] L2 content-measured numbers land within 2% of manifest ground truth

## Comments

Implemented 2026-09-30. New pure `measurePngContent()` in `src/preflightContent.ts`
(dims + edge depth + black count/fraction + transparency from the 01 seam, no product
knowledge). `preflightFile()` PNG path decodes once and derives bleed as
`max(0, spec.bleedRequiredIn - edgePx/ppi)` — the ticket-02 formula, now spec-driven;
black pixels imply `colorMode: "RGB"` (warn-only); transparency measured.
Precedence rule (documented in code): sidecar-declared beats content-measured, text +
cut-line always sidecar per Q1 — this keeps the frozen L1 gate byte-identical (L1
sidecars declare bleed; L2 sidecars don't, so pixels rule there). Every run carries
an additive optional `sources` map on `PreflightResult` (bleed/color/transparency
sidecar|content, rest fixed); `preflight()` core, `upload.ts` panel rows, and all UI
copy/layout untouched. `tests/preflight-content.test.ts`: 3 unit + 25-file L2 sweep
(verdict/fails/2%/sources all agree) + L1-precedence spot. Full suite 93 pass.
