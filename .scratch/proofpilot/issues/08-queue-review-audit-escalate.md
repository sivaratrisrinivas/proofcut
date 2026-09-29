# 08: Queue + timed review + audit + escalate link

**What to build:** An artist works flagged jobs from a queue filterable by fail type (low-PPI, bleed, cut line, white ink, tiny text), approves or rejects with timer plus verdict plus actor logged, auto-sends only high-confidence passes with an audit entry, and finds an "escalate to support" link on every soft-fail.

**Blocked by:** 06 app shell + upload + panel.

**Status:** ready-for-agent

- [ ] Queue seeds demo jobs and filters by all five fail types, riskiest first
- [ ] Approve and reject log timer plus verdict plus actor; soft-fail never auto-sends
- [ ] Soft-fail view carries an "escalate to support" link
- [ ] Never auto-charge, auto-reprint, or auto-scrap
