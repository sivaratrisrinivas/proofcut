# 01: Corpus + preflight core (die-cut)

**What to build:** A developer can run the preflight seam over a synthetic corpus and get trusted pass, fails, measurements JSON for die-cut, without any private files.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] Bun project runs install, test, build with TS
- [x] Static JSON product specs stand in for Guru DB
- [x] 60-file synthetic corpus exists, each with ordered size, product, expected verdict
- [x] Preflight returns pass, fails, measurements for PPI at ordered size, dims vs ordered size, bleed width, cut line presence on die-cut
- [x] Thresholds hold: pass at 300 PPI or more, soft-fail under 200, warn 200 to 299, bleed 0.125in or more, CutContour spot or vector path required
- [x] `bun test` proves die-cut subset meets accuracy bar

## Comments

Implemented 2026-09-30. `bun install` + `bun test` (8 pass) + `bun run build` (`tsc --noEmit` clean).
Harness: accuracy 100% (>=90%), hold 36.7% (<40%), p95 ~2ms (<30s), PPI within 2%.
Seam: pure `preflight()` in `src/preflight.ts` + thin `preflightFile()` adapter (`src/preflightFile.ts`).
Cutline/bleed for PNG corpus come from `.sidecar.json` (synthetic fault injection); real PDF CutContour parsing lands in ticket 02.
No git repo in workspace, so no commit; review working tree instead.
