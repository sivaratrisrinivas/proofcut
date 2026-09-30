# 02: Single user, single workflow

**What to build:** One login-free screen with one end-to-end workflow and
nothing more: pick a file (upload or demo) plus ordered size plus product,
run preflight, read the measured verdict, press the one decision action.
No login gate, no second user anywhere, no Loop queue, no New wizard steps,
no Insights/ROI/audit views.

**Blocked by:** User direction (2026-09-30): one user, one action, one
end-to-end workflow; recommendations accepted (upload to verdict to
Approve & send; fix-note/escalate as the failure branch; delete auth fully).

**Status:** ready-for-human

- [x] No session/login UI, no `demoAuth` module, no actor plumbing in the UI
- [x] Single screen: inputs plus Run preflight plus result plus one decision
      action per verdict (Approve & send on PASS; Send fix note + escalate
      on SOFT-FAIL); decision is local, no review POST
- [x] Dead UI-only routes removed (`queue`, `metrics`, `review`); preflight,
      demo-image, engine modules and their tests untouched
- [x] README matches the login-free workflow; suite green

## Comments

Implemented 2026-09-30. `app/page.tsx` is one screen: brand header, inputs
(file/demo/size/product) plus Run preflight, result (verdict, table, preview,
checklist, message) plus one decision action with local confirmation; no
session, nav, queue, wizard steps, Insights/ROI/audit. Deleted `src/demoAuth.ts`
and the queue/metrics/review routes (page was their only caller); engine
modules and tests untouched. Test 10 rewritten as a single-user contract test.
README updated. `tsc` clean, 106 pass, build green with two routes.
