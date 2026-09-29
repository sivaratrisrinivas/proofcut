# Handoff: Ive-style review-flow redesign → prototype

Date: 2026-09-30. Branch: `prototype/ive-review-flow`. Live prod (old UI): https://proofcut.vercel.app

## Shared understanding (grill-with-docs, confirmed by user)

- **Spine:** the artist's review loop — *clear today's flagged queue, one job at a time.*
- **3 steps:** Up next → Decide → Done, looping. System presents the riskiest unreviewed job; artist never picks from a list.
- **One action per screen, absolute:** verdict routes you. PASS → Approve screen. SOFT-FAIL → Fix screen. Navigation/selection never count as actions; escalate-to-support is a link, not an action.
- **Demoted:** exactly two exits — New (upload mini-flow) and Insights (read-only dashboard/ROI/audit). No tour; Step 1 is the onboarding. Demo video is the user's, out of scope.
- **Look:** restraint — system type, near-black on white, magenta cut-line accent only, whitespace, proof as the only image.

## Prototype question

Does one-action-per-screen survive contact with a real flagged job? Wired (not static): real `/api/queue`, `/api/review`, `/api/demo-image` seams, throwaway shell.

## Variants (one route `/flow`, `?v=` + floating switcher)

- **v1 Wizard:** Up next → Decide → Done with minimal step chrome (Step N of 3).
- **v2 Stageless:** same state machine, zero chrome — no step numbers, screens replace each other.
- **v3 Auto-advance:** no Done screen; approve/send slides the next job in with inline confirmation. Tests whether Done earns its step.

## What feedback is needed

Drive each variant against a real SOFT-FAIL (e.g. ppi-1, bleed-1) and a PASS (clean-1): which variant keeps the decision effortless, and does Done earn its step (v1/v2) or should it die (v3)? Answer folds into the real rebuild; this branch stays a primary source out of main.
