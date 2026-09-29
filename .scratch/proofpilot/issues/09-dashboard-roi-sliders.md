# 09: Metrics dashboard + ROI sliders

**What to build:** A manager sees percent auto-pass, touches per job, estimated minutes saved, and hold rate with its under-40-percent guard, plus ROI sliders defaulting to 100k orders per month with every assumption labeled and the weakest input highlighted.

**Blocked by:** 06 app shell + upload + panel.

**Status:** ready-for-human

- [x] Dashboard shows auto-pass, touches per job, minutes saved, hold rate under 40 percent
- [x] ROI sliders default to 100k orders per month with assumptions labeled
- [x] Weakest input (monthly proof volume) is highlighted, never presented as fact

## Comments

Implemented 2026-09-30. `bun test` 71 pass 0 fail; `bunx tsc --noEmit` clean; `next build` green; live `next start` verified: GET metrics (seed dashboard 2/7 pass, 32 min potential, hold 71.4% with over-guard badge plus risk-concentration note), GET page 200 with dashboard + ROI markers, queue bad-filter still 400.
New seam: `app/api/metrics/route.ts` (thin GET adapter: `computeMetrics` over seed jobs). UI: `app/page.tsx` dashboard section (four `MetricCard`s: auto-pass %, live touches per job climbing 0 toward 3→1 as reviews log, minutes saved, hold rate with under/over 40% guard badge) plus ROI section (7 sliders from `defaultRoiInputs()` with `roiAssumptions()` labels/ranges, weakest ordersPerMonth highlighted with confirm-with-company note, results via `computeRoi` labeled assumed with formula note).
Honest limits: seed-queue hold (71.4%) sits over the guard because the 7 demo seeds are risk-concentrated for review practice — the full-corpus harness hold (36.7%) stays under it; touches start at 0 until reviews are logged.
Code review: 2 axes; fixed `usd0` name, `MetricCard` extraction, trimmed unused route extras. Declined with reasons: seed hold over guard (04/08 seed design, corpus guard holds); capturePct 7th slider (seam from 04); slider bounds wider than assumed ranges (ranges labeled per slider, nothing passed off as fact); live-touches recompute (decided-count overlay; untouched seeds yield 0 identically through the seam).
