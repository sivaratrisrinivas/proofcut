# ProofPilot (proofcut prototype)

https://proofcut.vercel.app

## What

ProofPilot checks one print file before an artist touches it.
You pick a PNG or PDF, enter the ordered size, and pick the product.
The app measures the file and returns a verdict: PASS or SOFT-FAIL.
PASS means the file is clean, so you press Approve and send.
SOFT-FAIL lists each miss with its measured number, so you press Send fix
note or escalate to support. Your decision stays on your machine.

## Why

Every upload used to wait until an artist opened it, read it, and typed a
fix note. That took 10 to 25 minutes per file, and most files failed on a
simple measurable fault: low resolution, missing bleed, or no cut line.
Measuring those faults in code takes under a second, so the artist only
sees the exceptions. The app keeps one path on purpose. Login screens,
queues, and dashboards never measured anything, so they were cut.

## How it works

Run steps that copy paste:

```sh
bun install
bun test
bun run dev
bun run build
```

src/preflight.ts is the pure function at the center. File plus ordered size
plus product spec go in, and pass plus fails plus measurements come out.
For PNG files the app decodes the pixels and measures bleed width, RGB-black
blocks, and transparency straight from the image. Text height, cut line, and
white ink still come from a sidecar file because pixels do not carry that
signal yet. src/draft.ts turns the result into a checklist, preview overlays,
and a fix message. src/wording.ts, src/queue.ts, and src/audit.ts are thin
adapters around the same result. The page calls /api/preflight, shows the
table, and records your decision locally, with no account and no queue.

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
