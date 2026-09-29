# 04: Queue + audit + metrics

**What to build:** An artist works flagged jobs from a filterable queue with timed approve and reject, a manager sees auto-pass, touches, minutes saved, hold rate, and ROI sliders with labeled assumptions.

**Blocked by:** 03 draft UI (upload + report + overlays).

**Status:** ready-for-agent

- [ ] Queue seeds demo jobs and filters by fail type (low-PPI, bleed, cut line, white ink, tiny text)
- [ ] Approve and reject log timer plus verdict plus actor to the audit log
- [ ] High-confidence clean pass auto-sends only with audit log, soft-fail never auto-sends, never auto-charge or reprint or scrap
- [ ] Dashboard shows percent auto-pass, touches per job, minutes saved, hold rate under 40 percent
- [ ] ROI sliders default 100k orders per month with weakest input highlighted and assumptions labeled
