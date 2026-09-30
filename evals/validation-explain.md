# Validation: explain-faithfulness judge

Date: 2026-09-30. Judge model: session subagent model (Muse Spark family —
re-validate on any model change). Prompt: `evals/explain-faithfulness.md`.

## Splits (`evals/splits.json`)

Row-level explain units only. Train jobs (few-shot sources, excluded from
dev/test): l2-005, l2-024, l2-017. Dev: 16 cases (8 pass + 8 fail, paired by
job). Test: 14 cases (7 + 7). Line/variant units excluded (training pool).

## Results

| Set | TPR | TNR |
|-----|-----|-----|
| Dev (16) | 8/8 = 100% | 8/8 = 100% |
| Test (14, single run, no iteration after) | 7/7 = 100% | 7/7 = 100% |

No prompt iteration was needed: above the >90% target on the first clean dev
run. (One harness bug found mid-run — dev bundle keyed pass/fail together —
fixed before scoring; prompt untouched throughout.)

Disagreements: none on either set. Every fail-side critique identified the
planted defect (wrong numbers, invented/dropped fails, vague, banned tone).

## Limitations (read before trusting)

- n=30 total, classes 15/15 — far below the ~100-trace guidance.
  Clopper-Pearson 95% lower bound on 15/15 is **82%**: the honest claim is
  "TPR/TNR likely above ~80%", not "perfect".
- Single annotator who also authored the fail perturbations: this measures
  judge-vs-author agreement, not judge-vs-independent-truth. Fail side is
  synthetic by design (all 36 natural outputs passed).
- Steps 7–8 (Rogan-Gladen, bootstrap CI) skipped: no unlabeled production
  traces scored yet (no p_obs). Apply on first production batch.
- Re-validate after any prompt/model change or CI widening.
