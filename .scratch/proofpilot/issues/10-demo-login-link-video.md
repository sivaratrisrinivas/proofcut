# 10: Demo login + public link + video

**What to build:** A demo viewer reaches the live public link through a single demo login with no auth friction, and watches (or follows) the 3-minute path from pain to overlays to before-and-after to sliders to the production path, closing the D7 deliverables.

**Blocked by:** 07 draft view, 08 queue + review, 09 dashboard + ROI.

**Status:** ready-for-human

- [x] Single demo login stands in for auth
- [x] Public link live on the Vercel deploy target per ADR-0001 — live at https://proofcut.vercel.app (production, `vercel --prod`, zero-config Next.js); page + metrics + queue APIs verified with curl
- [x] 3-minute walkthrough covers pain to overlays to before-and-after to sliders to production path, recorded or script-driven
- [x] README public-link section updated (to deploy-ready with the exact deploy step; flips to live with the deploy)

## Comments

Implemented 2026-09-30. `bun test` 77 pass 0 fail; `bunx tsc --noEmit` clean; `bunx next build` green; live `next start` verified: GET page 200 (client shell + loading gate), GET metrics 200, client bundle carries login + walkthrough + before-after + production markers.
New seams: `src/demoAuth.ts` (fixed `DEMO_USER` + `DEMO_SESSION_KEY` + `createDemoSession`/`isDemoSession`, no password per ADR-0001) and `src/demoWalkthrough.ts` (`DEMO_STEPS`, 7 beats totalling 180s from pain to production per `docs/demo-script.md`). UI: `app/page.tsx` single-click demo login gate persisted to localStorage with sign-out, script-driven `#walkthrough` nav, section anchors (`#upload`, `#draft`, `#queue`, `#dashboard`, `#roi`), new `#before-after` (3 to 1, 20m to 4m) and `#production` (Guru to RIP to Reply shadow mode) sections. Tests: `tests/10-demo-login-walkthrough.test.ts` (6 cheap local asserts over the two pure seams).
Honest limits: no live Vercel URL is claimed — no Vercel CLI or credentials exist in this workspace, so the README public-link section reads deploy-ready with the exact manual `vercel deploy` step rather than a fake live link; walkthrough is script-driven (ticket allows recorded or script-driven), no video artifact; `#draft` overlays unlock after running a preflight, noted inline in the walkthrough header.
Code review: 2 axes; fixed duplicated walkthrough list (extracted `WalkthroughList`), dead-`#draft`-on-fresh-login note, and inverted touches wording. Declined with reasons: `createDemoSession`/`DEMO_ACTOR` indirection (tested seam + existing file naming); string session state (carries the actor for display); per-beat seconds/targets (encode the demo-script timing budget); new unit tests (implement-skill TDD at the pure seams, within the spec's cheap-local-asserts allowance).

Deployed 2026-09-30: `vercel --prod` green, live at https://proofcut.vercel.app. Verified with curl: GET page 200 (ProofPilot shell, no Vercel auth wall), GET metrics (seed dashboard), GET queue filter (bleed job with SOFT-FAIL verdict). Side fix: `package.json` `build` script changed from `bunx tsc --noEmit` to `next build` so Vercel produces real output; typecheck lives on as `bun run check`.
