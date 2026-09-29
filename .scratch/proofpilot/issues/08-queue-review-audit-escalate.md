# 08: Queue + timed review + audit + escalate link

**What to build:** An artist works flagged jobs from a queue filterable by fail type (low-PPI, bleed, cut line, white ink, tiny text), approves or rejects with timer plus verdict plus actor logged, auto-sends only high-confidence passes with an audit entry, and finds an "escalate to support" link on every soft-fail.

**Blocked by:** 06 app shell + upload + panel.

**Status:** ready-for-human

- [x] Queue seeds demo jobs and filters by all five fail types, riskiest first
- [x] Approve and reject log timer plus verdict plus actor; soft-fail never auto-sends
- [x] Soft-fail view carries an "escalate to support" link
- [x] Never auto-charge, auto-reprint, or auto-scrap

## Comments

Implemented 2026-09-30. `bun test` 71 pass 0 fail; `bunx tsc --noEmit` clean; `next build` green; live `next start` verified: GET queue (7 jobs riskiest-first, each filter hits, bad filter 400), POST review approve/reject/auto-send entries, soft-fail auto-send 400, auto-charge 400, unknown job 404, GET page 200.
New seams: `src/queueSeed.ts` (pure `SEED_DEFS` + `buildSeedJobs` over the preflight seam; 5 corpus PNGs with real verdicts plus 2 synthetic clear seeds for white-ink/tiny-text, labeled as synthetic in the UI) and `src/review.ts` (pure `decide()` over `src/audit.ts` guards: allowlist approve/reject/auto-send, auto-send only high-confidence PASS, forbidden trio rejected). Routes: `app/api/queue` (GET, `?filter=` via `normalizeFilter`) and `app/api/review` (POST; rebuilds the seed queue server-side so the verdict guard cannot be spoofed by the client). UI: `app/page.tsx` artist-queue section with filter select, riskiest-first list, per-row escalate link on every soft-fail, timed review (timer starts on select), approve/reject/auto-send (passes only, `system` actor) buttons, and a client-side audit table.
Honest limits: audit log and decided state live in client state (lost on refresh) and `Job.status` never mutates server-side — a persistent store waits for the production Postgres path, and the spec's own test rule covers UI/store adapters with a demo walkthrough instead of unit tests.
Code review: 2 axes; fixed per-row escalate links, `system` actor for auto-send, `ReviewDecision` typing. Declined with reasons: server persistence (Postgres out of scope); `decide()` string-at-boundary (route receives untyped JSON); `escalateHref`/seed-type extractions (judgement-call level).
