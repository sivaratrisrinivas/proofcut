# 04: Queue + audit + metrics

**What to build:** An artist works flagged jobs from a filterable queue with timed approve and reject, a manager sees auto-pass, touches, minutes saved, hold rate, and ROI sliders with labeled assumptions.

**Blocked by:** 03 draft UI (upload + report + overlays).

**Status:** ready-for-human

- [x] Queue seeds demo jobs and filters by fail type (low-PPI, bleed, cut line, white ink, tiny text)
- [x] Approve and reject log timer plus verdict plus actor to the audit log
- [x] High-confidence clean pass auto-sends only with audit log, soft-fail never auto-sends, never auto-charge or reprint or scrap
- [x] Dashboard shows percent auto-pass, touches per job, minutes saved, hold rate under 40 percent
- [x] ROI sliders default 100k orders per month with weakest input highlighted and assumptions labeled

## Comments

Implemented 2026-09-30. `bun test` 38 pass 0 fail; `bun run build` (`tsc --noEmit`) clean.
New seams (pure, thin-adapter pattern): `src/queue.ts` (`seedQueue`, `filterQueue` over low-ppi/bleed/cutline/white-ink/tiny-text with display-name normalization, `sortQueueByRisk` for riskiest-first); `src/audit.ts` (`recordReview` timer+verdict+actor, `shouldAutoSend` PASS+high only, `recordAutoSend` throws on SOFT-FAIL/low, `assertAllowedAction` forbids auto-charge/reprint/scrap); `src/metrics.ts` (`computeMetrics`: auto-pass %, touches/job 3→1, 16 min saved per pass, hold guard <40%); `src/roi.ts` (`defaultRoiInputs` 100k/mo, `computeRoi` labor+reprint with capture, `roiAssumptions` all labeled assumed, weakest = ordersPerMonth).
Tests: `tests/04-queue-audit-metrics.test.ts` (10 tests: five filters + corpus hold 36.7% <40%, timer/audit entries, auto-send guards, dashboard math, ROI formula).
Banned-word grep hits only the guard regex, zero user-facing strings.
