# Web redesign: desktop Loop-first, constraint relaxed per view

Grill-with-docs round 2 (2026-09-30) settled: the 560px centered-column skin
reads as a mobile app; redesign for desktop web. Loop is the design driver,
then propagate to New/Insights. Loop goes side-by-side (queue + job detail);
New/Insights go full-width sections.

## Considered Options

- Full three-view redesign in one pass — risks an inconsistent middle state
  across the 781-line single-file `app/page.tsx`.
- Side-by-side everywhere — wrong for the New wizard (linear steps) and
  Insights (already a dashboard).
- Keep one-action-per-screen everywhere — keeps the mobile feel the redesign
  exists to shed.

## Consequences

- Partially overrides the L2 standing constraint (one-job-at-a-time,
  one-action-per-screen, zero chrome): it now holds for Loop only
  (focus is the core virtue); Insights is explicitly density-relaxed.
  L2 tickets 03–05 keep their recorded wording as history.
- Prototype first: two Loop directions on `prototype/web-redesign` for the
  user to pick before any mainline change. No UI change lands without a pick.
