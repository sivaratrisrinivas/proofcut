# 04: Five-product coverage + ext absorption

**What to build:** A developer can point at L2 and see all five products covered — clear and holographic failing without white-ink, roll-label and packaging-tape bleed rules enforced — with the 10 ext PDFs folded in as L2's product core and no third corpus directory.

**Blocked by:** 03 preflight wiring (verdicts can only be proven once the measuring preflight exists).

**Status:** ready-for-human

Constraint: UI untouched — verdicts may flip where rules now bite (that is the point), but no screen changes to accommodate them.

- [x] Clear/holo SOFT-FAIL without white-ink across L2 PDFs + PNGs
- [x] Roll-label/tape bleed rules enforced with L2 proof files
- [x] `corpus-ext/` absorbed into L2 (manifest + files), nothing stranded, L1 untouched

## Comments

Implemented 2026-09-30. L2 is now 42 rows (32 PNG + 10 PDF, 22 PASS / 20 SOFT-FAIL),
all five products with pass + fault proof. 7 new PNGs: clear no-ink fail (026),
clear control (027), holo no-ink fail (028), holo transparent + ink pass (029),
clear 4.5pt + no-ink combo (030), tape pass (031), tape bleed fail (032).
White ink is PNG-unmeasurable, so clear/holo sidecars carry `whiteInkPresent`
(Q1-necessary extension; `sources.whiteInk` already labeled it sidecar in 03).
Manifest rows carry `kind` + `expectedWarnings` (derived from 03's rules, proven by
the 03 sweep). Ext PDFs + sidecars copied byte-identical (sha256 verified),
`corpus-ext/` deleted; `generate-extensions-corpus.ts` now writes its 10 artifacts
into L2 (no manifest — owned by `generate-l2-content.ts`, which embeds its `plan()`;
existing 25 PNGs verified byte-identical after regen). Readers repointed:
`app/api/preflight/route.ts` PDFs from L2 (same bytes, same panels), ext harness
filters merged manifest to its 10 PDFs (still 100%). `tests/l2-coverage.test.ts`
pins five-product proof + white-ink pdf/png mix + tape/roll bleed + absorption.
No screen changes.
