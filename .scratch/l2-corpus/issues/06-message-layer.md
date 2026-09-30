# 06: Message layer (15–20 notes)

**What to build:** A future wording judge has calibration data — 15–20 synthetic customer notes (first-time, revision, angry-WISMO tones) each paired to a real L2 SOFT-FAIL with its code-measured numbers, sitting in one JSONL file beside the corpus.

**Blocked by:** 04 product coverage (notes must be written against final SOFT-FAIL verdicts and numbers; runs parallel with 05).

**Status:** ready-for-human

- [x] `messages.jsonl` with 15–20 records: linked SOFT-FAIL job id + tone tag (`first-time` / `revision` / `angry-wismo`) + note text grounded in measured numbers
- [x] Zero banned words across all notes (tone lint holds)
- [x] No judge prompt, no scoring harness — explicitly out of scope

## Comments

Implemented 2026-09-30. `scripts/generate-l2-messages.ts`
(`bun run generate:l2-messages`) writes 18 records to
`corpus-l2-content/messages.jsonl` — 6 per tone across bleed, low-ppi, cutline,
tiny-text, and white-ink faults (13 PNG + 5 PDF jobs). Each note is a curated
tone×fault template filled with live `preflightFile` numbers in the repo's
canonical formatting (ppi rounded, bleed 3dp, dims, pt); `assertCleanTone`
enforced at generate time. `tests/l2-messages.test.ts` pins linkage to real
SOFT-FAIL rows, fresh-measurement agreement, number-in-text grounding, and the
repo `lintTone`. No judge, no scoring. Full suite 102 pass.
