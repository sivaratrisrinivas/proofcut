# 05: L2 harness gate

**What to build:** A developer can run one command and see two report lines — L1 re-proven frozen at its 90% bar, L2 gating at 90% on content-measured numbers — with hold rate, p95 latency, and the 2% measurement guard reported per layer.

**Blocked by:** 04 product coverage (gate needs final verdicts).

**Status:** ready-for-human

Constraint: UI untouched — harness output is console/CI only; the Insights dashboard keeps showing what it shows today.

- [x] L1 suite passes unchanged at its existing bar (regression, same files)
- [x] L2 suite gates at 90%+ with per-layer hold rate, p95, and measurement-accuracy lines
- [x] One command runs both layers and reports them separately

## Comments

Implemented 2026-09-30. `tests/l2-harness.test.ts` gates all 42 L2 rows (32 PNG +
10 PDF): verdict + fails + warnings coverage ≥90%, p95 <30s, 2% measurement guard
(ppi both kinds; bleed + text/cutline/white-ink/color/transparency on PNG, bleed on
PDF). `bun run harness` runs L1 + L2 harnesses with one report line each, console/CI
only. Observed: `accuracy=100.0% hold=36.7% p95=209.0ms` /
`l2 accuracy=100.0% hold=47.6% p95=107.5ms meas<=0.00%` (worst per-row ppi/bleed
error, proving the 2% guard rather than just asserting it). L2 hold is reported,
not capped — the corpus is fault-dense by design. Full suite 99 pass. No UI touched.
