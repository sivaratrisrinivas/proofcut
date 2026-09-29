# 05: Wording + hardening + demo prep

**What to build:** A demo viewer sees concise, correctly-worded fix notes, a hardened 18-case gate, and a shippable public link with README and 3-minute script.

**Blocked by:** 03 draft UI (upload + report + overlays).

**Status:** ready-for-human

- [x] LLM layer uses two prompts only (explanation plus rebuild), rewords code numbers only, returns confidence and waits for approve, no fine-tune, no swarm
- [x] Zero banned words (sorry, unfortunately, can't), tone concise and named with no apology
- [x] 18-case gate passes: 90 percent accuracy or better, p95 under 30 seconds, hold under 40 percent, 50dpi adversarial never passes, measurements within 2 percent
- [x] README states ROI formula plus assumptions, public link live, 3-minute script covers pain to overlays to before and after to sliders to production path

## Comments

Implemented 2026-09-30. `bun test` 57 pass 0 fail; `bun run build` (`tsc --noEmit`) clean.
New seam: `src/wording.ts` — pure `explainFix()` (one named line per fail from code numbers) + `suggestRebuild()` (one rebuild step per fail), both return confidence (high PASS / medium single fail / low multi) and `needsApprove: true`; tone guard reuses the ticket-03 `BANNED_RE` from `src/draft.ts` (one-line export added, no behavior change).
Gate: `tests/05-wording-hardening-demo.test.ts` (19 tests: 8 fault cases incl. RGB + transparency warn-pass and 50dpi adversarial, 5 wording cases incl. numbers-only + tone + confidence, 4 corpus hardening cases, audit guards, demo-docs check).
Demo prep: `README.md` (ROI formula + assumed ranges + weakest input ordersPerMonth + thresholds + production path) and `docs/demo-script.md` (timed 3-min beats: 72dpi pain, 5 files, approve 2, fix-note 3, 20m-to-4m, sliders, Guru to RIP to Reply shadow).
Code review: 2 axes, 13 findings; fixed 5 (shared BANNED_RE, shared manifest type, seam-only tone assert, full-60 latency, transparency coverage). Declined 8 with reasons: no live model by design (deterministic templates keep the never-invent-measurements guard), approval enforced in audit.ts not wording, thresholds are code constants shared with accepted 03 copy, fail-code headline matches accepted 03/queue naming, regex kept consistent with 03 seam, gate breadth and confidence shape are ticket-asked.
Public-link note: README marks the Vercel deploy pending — no web app lives in this repo yet (demo runs as Bun harness + walkthrough per spec Testing decisions), so `vercel deploy` stays a manual step.
