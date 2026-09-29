# 07: Draft view with overlays + checklist + message copy

**What to build:** An artist compares original vs draft side by side with a dashed magenta cut line overlay and a bleed overlay, ticks the code-driven QC checklist, and copies a concise named customer note with measured numbers and zero banned words.

**Blocked by:** 06 app shell + upload + panel.

**Status:** ready-for-human

- [x] Side-by-side shows dashed magenta cut line overlay plus bleed overlay
- [x] QC checklist ticks come from code measurements only
- [x] Message pane copies a named, specific fix with numbers and no banned words

## Comments

Implemented 2026-09-30. `bun test` 64 pass 0 fail; `bunx tsc --noEmit` clean; `next build` green; live `next start` verified: GET products, POST demo PASS + SOFT-FAIL (full rows + verdict), POST raw PNG (partial rows, result null), GET demo-image 200 + traversal 400, GET page 200.
UI: `app/page.tsx` draft view derives everything client-side from `panel.result` via `src/draft.ts` (`overlaySpec` drives dashed-magenta cutline + bleed overlays over the original/demo image, `buildChecklist` renders the 8 ticks, `composeMessage` fills the message pane with copy button + fallback). Raw uploads (result null) show an honest placeholder instead of inventing overlays. New route `app/api/demo-image/route.ts` serves corpus PNGs with safe-name validation.
Honest limits: overlay geometry is schematic (inset cutline box + bleed band scaled from bleedWidthIn/ordered width), not true contour tracing — real die-line geometry waits for the production RIP path.
Code review: 2 axes; no banned words in new UI copy; deprecated execCommand kept only as clipboard fallback.
