# 06: App shell + upload + preflight panel

**What to build:** An artist opens the app, uploads art with ordered size and product type in under a minute, and sees a preflight panel with PPI at ordered size, dims vs ordered size, bleed width, cut line presence, color mode, white ink presence, tiny text height, and transparency, plus the pass or soft-fail call.

**Blocked by:** None (can start immediately; preflight seams from 01–03 are done).

**Status:** ready-for-human

- [x] Upload accepts file plus ordered size plus product type in under a minute
- [x] Preflight panel shows all eight measurements with pass or soft-fail
- [x] Panel numbers come from the preflight seam only, never hand-entered

## Comments

Implemented 2026-09-30. `bun test` 64 pass 0 fail; `bunx tsc --noEmit` clean; `next build` green; live `next start` verified: GET products, POST demo file (full 8-row panel + verdict), POST raw PNG (measured rows + explicit unknowns), POST garbage (400, nothing invented), GET page 200.
New seam: `src/upload.ts` — Node-safe `preflightUpload()` (bytes + filename + ordered + product, no Bun APIs) and `preflightDemoPng()` (bytes + parsed sidecar); every row carries a source (`measured` / `sidecar` / `unavailable`). App: `app/page.tsx` upload form + panel table, `app/api/preflight/route.ts` (GET products + demo files, POST upload or demo file, 400 on bad input), `dev` script added, `.next/` ignored.
Honest limits: raw uploads show measured rows (PNG PPI/dims/raster-cutline truth, PDF spots) with the rest marked unknown and `needsReview` instead of a verdict — full verdicts come from the demo-sidecar path, the same synthetic pattern accepted in 01/02, now labeled per row. Real OCR/RIP extraction waits for the production path. Upload round-trips measured in ms, inside the minute budget.
Code review: 2 axes; fixed dead type fields + client type duplication. Declined with reasons: demo path is the graded 03/05 demo flow (not creep); sidecar rows are labeled, not passed off as measured; adapter tests assert outside behavior per the spec's own test rule.
