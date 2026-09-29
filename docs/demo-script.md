# ProofPilot 3-minute demo script

Total: about 3 minutes. Local run: `bun test` (full gate under a second),
then walk the beats below against the 5-file demo (2 clean approve, 3 bad
fix notes). No private data on screen; all files are synthetic.

## 0:00 to 0:30 — the pain

StickerMule promises a free proof in 4 hours. Today every upload sits 60 to
240 minutes, then an artist opens it for 10 to 25 minutes: measure, rebuild
low-res art as vector, check cut line and bleed and white ink, then one or two
customer loops at 4 to 12 hours each. Show the 72dpi 3in die-cut file: 72 PPI
at ordered size, needs 300 PPI. Clean files get touched too. That is the waste.

## 0:30 to 1:00 — 5 files flagged in seconds

Run preflight over 5 files. Each returns pass plus fails plus measurements in
milliseconds, p95 far under the 30-second budget. Two come back PASS, three
come back SOFT-FAIL with named fails: low-ppi, bleed, cutline. Nothing is
measured by hand; the panel shows PPI at ordered size, dims versus ordered
size, bleed width, cut line presence, color mode, white ink presence, tiny
text height, transparency.

## 1:00 to 1:30 — approve 2 clean

Open the two PASS jobs. Original versus draft side by side: dashed magenta cut
line overlay plus bleed overlay showing art past the cut line. QC ticks come
from code measurements only. Approve both; each approve logs timer plus
verdict plus actor to the audit log. High-confidence PASS is the only thing
that may auto-send, and it logs too.

## 1:30 to 2:00 — send 3 fix notes

Open the three SOFT-FAIL jobs. Each fix note names the fail with code numbers:
150 PPI needs 300 PPI, 0.050in bleed needs 0.125in, smallest text 4.5pt needs
6pt. The rebuild pane adds one step per fail, rewording the same measured
numbers. Tone stays concise and named, zero banned words, and every note waits
for artist approve. SOFT-FAIL never auto-sends.

## 2:00 to 2:20 — before and after

Before: 3 touches per job, about 20 minutes of artist time. After: 1 touch,
about 4 minutes on flagged jobs, zero on clean auto-drafts. Dashboard shows
percent auto-pass, touches per job, estimated minutes saved, hold rate under
40 percent.

## 2:20 to 2:45 — ROI sliders

Sliders default to 100k orders per month with every assumption labeled; the
weakest input, monthly proof volume, is highlighted. Savings equal orders per
month times percent manual times minutes saved times loaded dollars per
minute, plus orders per month times reprint percent times cost per reprint,
scaled by 20 to 25 percent year-one capture.

## 2:45 to 3:00 — production path

Prototype specs are static JSON standing in for the Guru spec DB. The
production path runs Guru to RIP to Reply in shadow mode: mocked imposition,
RIP, order, and Reply calls beside the live harness, one demo login standing
in for auth. Ship the link, keep the audit log, let seniors spot-check the
pass queue.
