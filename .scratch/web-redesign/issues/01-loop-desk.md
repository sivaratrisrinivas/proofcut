# 01: Loop desk layout (direction A)

**What to build:** The Loop view renders as a desktop review desk — queue rail
left (job, product, verdict pill, PPI), job detail right (measurements,
checklist, message, preview figure, one action row) — instead of the 560px
centered column. Same logic, same copy, same one-decision-at-a-time flow.

**Blocked by:** User pick of direction A (done 2026-09-30; see
`docs/adr/0002-web-redesign-loop-first.md`; prototype at `app/loop-a/`).

**Status:** ready-for-human

- [x] Loop upnext + decide render full-width desk grid; header tabs intact
- [x] Queue rail lists real queue jobs with verdict pills; selection drives detail
- [x] Detail keeps measurements, checklist, message, figure, action buttons
- [x] New/Insights untouched (still 560px shell); no src/ changes; suite green

## Comments

Implemented 2026-09-30 on `prototype/web-redesign`. `app/page.tsx`: `wideShell`
(1280px) for Loop only; queue rail (`aria-label="Review queue"`) lists real
`queue` jobs with verdict pills + PPI + up-next/decided markers, click =
`start(id)`; upnext/decide JSX moved verbatim into the detail column (same
copy, same buttons, same flow). `verdictPill` helper added. New/Insights byte
identical. `tsc` clean, `bun test` 107 pass, `bun run build` green.
