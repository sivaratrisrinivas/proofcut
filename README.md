# ProofPilot (proofcut prototype)

Preflight every upload in under 30 seconds and draft the proof so artists
handle only the exceptions. About 60 percent pass clean and auto-draft; the
rest are flagged with a marked preview, a short fix list, and a customer note
for a 3 to 5 minute artist review. Touches fall from 3 to 1. Only a
high-confidence PASS can auto-send, and it writes an audit log. The system
never charges, reprints, or scraps on its own.

## Quickstart

```sh
bun install
bun test
bun run build
bun scripts/generate-corpus.ts
```

## How it works

The tested seam is one pure function: file plus ordered size plus product spec
in, pass plus fails plus measurements out (`src/preflight.ts`, thin
`src/preflightFile.ts` adapter). On top sit thin adapters: drafter
(`src/draft.ts`), wording (`src/wording.ts`), queue and audit store
(`src/queue.ts`, `src/audit.ts`), metrics and ROI (`src/metrics.ts`,
`src/roi.ts`).

## Thresholds (frozen for the D2 harness)

| Check | Pass | Soft-fail |
| --- | --- | --- |
| Resolution at ordered size | 300 PPI or more | under 200 PPI (200 to 299 warns) |
| Bleed past cut line | 0.125in or more | under 0.125in |
| Cut line (die-cut, clear, holo) | CutContour spot or vector path | missing |
| White underbase (clear, holo) | present | missing |
| Smallest text | 6pt or more | under 6pt |
| RGB black / transparency | warn with auto-convert note | never a fail on its own |

Verdicts follow the glossary: PASS can auto-draft and, at high confidence,
auto-send with an audit log entry. SOFT-FAIL needs artist review with a marked
preview and never auto-sends. A 50dpi adversarial file never passes, and every
measurement stays within 2 percent of ground truth.

## Wording layer (two prompts only)

`src/wording.ts` holds the only two prompts: `explain` (one named line per
fail, rewording code-measured numbers) and `rebuild` (one rebuild step per
fail). Both return a confidence (high on PASS, medium on a single fail, low on
multiple) and always wait for approve (`needsApprove: true`). No fine-tune, no
swarm. Tone lint keeps banned words at zero, so notes stay concise and named.

## ROI formula plus assumptions

Monthly savings equal labor plus reprints, scaled by year-one capture:

```text
laborMonthly   = ordersPerMonth * (percentManual / 100) * minutesSavedPerOrder * dollarsPerMinute
reprintMonthly = ordersPerMonth * (reprintPct / 100) * costPerReprint
grossMonthly   = laborMonthly + reprintMonthly
capturedMonthly = grossMonthly * (capturePct / 100)
```

All inputs are assumed, never company facts:

| Input | Default | Assumed range |
| --- | --- | --- |
| Orders per month | 100,000 | 80k to 150k |
| Percent manual | 55% | 40 to 70% |
| Minutes saved per order | 11.5 | 8 to 15 min |
| Loaded dollars per minute | $0.60 | $0.45 to $0.75 |
| Reprint percent | 2% | 1 to 3% at $18 to $35 each |
| Year-one capture | 22.5% | 20 to 25% |

Weakest input, highlighted in the dashboard: orders per month (monthly proof
volume). Confirm it with the company before quoting anything with confidence.
At defaults the model lands near $280k to $1.1M labor plus $180k to $900k
reprints of addressable spend, with only 20 to 25 percent captured in year one.

## Demo

Five-file path, end to end in seconds: approve 2 clean, send 3 fix notes.
Before and after is 3 touches to 1, 20 minutes to 4. Timed 3-minute narration
lives in `docs/demo-script.md`: pain (72dpi 3in die-cut) to flagged queue to
dashed magenta cut-line plus bleed overlays to before/after to ROI sliders to
the production path.

## Production path

Guru (spec DB) to RIP to Reply runs in shadow mode behind the prototype: the
static JSON specs stand in for Guru, imposition and RIP and order and Reply
calls are mocked, and one demo login stands in for auth. Per ADR-0001 the
prototype loop is Bun plus TypeScript plus Next.js on Vercel; Vercel prod runs
Node, and a full Bun server with Go plus Postgres alignment waits for the
production track.

## Public link

Status: live at **https://proofcut.vercel.app** (production deploy on Vercel
per ADR-0001, zero-config Next.js). It serves the full demo: single demo login
(`Continue as demo-artist`, no password, per `src/demoAuth.ts`), the
script-driven 3-minute walkthrough (`#walkthrough` section plus
`docs/demo-script.md`, 7 beats totalling 180s per `src/demoWalkthrough.ts`),
and the upload to overlays to before-and-after to sliders to production-path
flow. To redeploy after changes, run `vercel --prod` from the repo root.
Local fallback: `bun run dev` (then open the printed localhost URL); `bun test`
still proves the preflight gate.

## Guards

Accuracy 90 percent or better, hold rate under 40 percent, preflight p95 under
30 seconds, measurements within 2 percent, zero banned words, 50dpi
adversarial never passes, every auto-send and decision in the audit log.
