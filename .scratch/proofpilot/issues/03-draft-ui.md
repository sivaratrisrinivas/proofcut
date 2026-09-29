# 03: Draft UI (upload + report + overlays)

**What to build:** An artist can upload with ordered size and product type, see a preflight panel, compare original vs draft with cut line and bleed overlays, tick the QC list, and copy a concise customer note.

**Blocked by:** 01 corpus + preflight core (die-cut), 02 preflight extensions (clear + text + color).

**Status:** ready-for-human

- [x] Upload accepts file plus ordered size plus product type in under a minute
- [x] Preflight panel shows PPI, dims, bleed, cut line, color mode, white ink, tiny text, transparency with pass or soft-fail
- [x] Side-by-side shows dashed magenta cut line overlay plus bleed overlay
- [x] QC checklist ticks come from code measurements only
- [x] Message pane copies a named, specific fix with numbers and no banned words
- [x] 5-file demo (2 clean approve, 3 bad fix-note) runs end to end in under 30 seconds per file

## Comments

Implemented 2026-09-30. `bun test` 28 pass 0 fail; `bun run build` (`tsc --noEmit`) clean.
New seam: `src/draft.ts` — pure `overlaySpec()` (dashed magenta cutline + bleed width overlay), `buildChecklist()` (8 ticks from measurements/fails only, no LLM), `composeMessage()` (one named line per fail with code numbers; PASS approves with numbers; throws if a banned word appears).
Upload = existing `preflightFile()` adapter (file + ordered size + productId); panel rows read `measurements` directly.
Banned-word grep hits only the guard regex + test assertions, zero user-facing strings.
5-file demo: first 5 corpus files, 2 PASS / 3 SOFT-FAIL, whole harness ~200ms (limit 30s/file).
