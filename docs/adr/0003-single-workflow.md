# Single workflow supersedes Loop desk

User direction (2026-09-30): one user, one action, one end-to-end workflow,
nothing more — no logins, no second user. This supersedes ADR-0002's Loop
desk (queue rail + detail): the rail, the Loop/New/Insights views, the demo
login, and the queue/metrics/review routes are gone. One screen remains:
inputs plus Run preflight plus measured result plus one decision action
(Approve & send on PASS; Send fix note + escalate on SOFT-FAIL), decided
locally with no review POST and no actor.

## Considered Options

- Keep the desk as an alternative view — rejected: two ways to do one job
  reintroduces exactly the chrome the direction removes.
- Keep server-side review with a generic actor — rejected: a generic actor
  is still a user concept; the decision is a local confirmation.
- Delete the engine modules too (`queue`, `audit`, `review`, `metrics`,
  `roi`) — deferred: their tests pin verified behavior; they are unused
  by the UI but cost nothing at runtime. Revisit if they rot.

## Consequences

- ADR-0002 is superseded the day after it was written; its prototype branch
  served its purpose (direction A picked, then replaced wholesale).
- `src/demoAuth.ts` deleted; test 10 rewritten as a single-user contract test.
