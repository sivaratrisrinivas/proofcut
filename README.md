# ProofPilot (proofcut prototype)

https://proofcut.vercel.app

File in, measured verdict out, one decision action.
Pick a file, run preflight, press Approve and send or Send fix note.

## Quickstart

```sh
bun install
bun test
bun run dev
bun run build
```

## How it works

src/preflight.ts is the pure function: file plus ordered size plus product
spec in, pass plus fails plus measurements out. src/draft.ts draws the
checklist, preview overlays, and message. src/wording.ts, src/queue.ts,
and src/audit.ts are thin adapters around it. The page calls /api/preflight
and decides locally, with no account and no queue.

## Corpus

L1 is 60 flat files for geometry, including 72dpi low-resolution cases.
L2 is 42 art files across die cut, clear, holographic, roll label, and tape.
Text height, cut line, and white ink stay sidecar because pixels do not carry that signal yet.
The preview draws the cut line as a dashed magenta overlay.

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

## Evals

The judge checks that wording numbers match code measurements.
Dev has 16 cases. Test has 14 cases. Both scored 100 percent.
Limits, kept: small n, so the true rate could sit lower.
One annotator wrote the labels and the fail cases.
The fail cases are synthetic near-misses, not wild failures.
All 36 natural code outputs passed, which is why mates were built.

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

Weakest input: orders per month (monthly proof volume).
Confirm it with the company before quoting anything with confidence.

## Guards

Accuracy 90 percent or better, hold rate under 40 percent, preflight p95 under
30 seconds, measurements within 2 percent, zero banned words, 50dpi
adversarial never passes, every auto-send and decision in the audit log.

## What is faked

Static JSON stands in for Guru. Order and Reply calls are mocked, and RIP
runs in shadow mode. One user, no queue.
