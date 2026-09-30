# Judge: explanation faithfulness (wording)

Binary Pass/Fail LLM-as-judge. One failure mode only: unfaithful preflight
explanations — invented numbers, invented/missing fails, invented facts.

## Task

You are an evaluator assessing whether a ProofPilot preflight explanation
stays faithful to code-measured values. The explanation must use only numbers
the preflight code measured, name exactly the fails the code reported, and
invent nothing else.

## Inputs (per case)

- `fails`: the fail codes the code reported (e.g. ["bleed"])
- `measured`: code-measured values — ppi (rounded int), bleedWidthIn (3dp inches),
  pixelWidth, pixelHeight, minTextPt (number or null)
- `warnings`: warn-only findings, if any (e.g. ["rgb-black-auto-convert"])
- `headline` + `body`: the explanation under judgement

## Definitions

PASS: all of the following hold.
- Every number in the headline/body equals the corresponding `measured` value
  in the repo's canonical formatting (ppi rounded, bleed to 3dp, dims as
  `{w}x{h}px`, text as `{pt}pt`).
- The headline names exactly the codes in `fails` — no invented fail, none
  dropped.
- No fact appears that is not in `fails`/`measured` (no causes, no promises,
  no invented metrics).
- Tone is clean: no apology, no "sorry", "unfortunately", or "can't".

FAIL: any of the following hold.
- A number contradicts `measured` (e.g. bleed 0.250in when measured 0.025in;
  7pt text when measured 5pt) — even if the verdict direction is unchanged.
- A fail is invented (named but not in `fails`) or dropped (in `fails` but
  unaddressed).
- A fact is invented (e.g. "white ink coverage 0%", "path present but
  misnamed" when the finding is missing).
- The tone trips the lint ("sorry", "unfortunately", "can't").
- The text is vague — carries no measured number where one applies
  (e.g. "resolution too low" with no PPI).

Warn-only findings (`warnings`) are informational by design: their absence
from the explanation is PASS, not FAIL (see borderline example).

## Examples

### Example 1: PASS (clear)

fails: ["bleed"]
measured: ppi 300, bleedWidthIn 0.025, 900x900px, minTextPt null
warnings: []
headline: "Needs artist review: bleed."
body: ["bleed: 0.025in past cut line, needs 0.125in. Extend art beyond the cut line."]
Critique: The headline names exactly the one reported fail. The body cites
0.025in against the 0.125in requirement, matching measured to 3dp. No other
fail is named, no other number or fact appears, tone is clean.
Result: Pass

### Example 2: FAIL (clear)

fails: ["bleed"]
measured: ppi 300, bleedWidthIn 0.025, 900x900px, minTextPt null
warnings: []
headline: "Needs artist review: bleed."
body: ["bleed: 0.250in past cut line, needs 0.125in. Extend art beyond the cut line."]
Critique: The fail is named correctly, but the body cites 0.250in while the
code measured 0.025in — a 10x inflation. One contradicted number is enough.
Result: Fail

### Example 3: PASS (borderline)

fails: ["bleed"]
measured: ppi 300, bleedWidthIn 0.025, 900x900px, minTextPt null
warnings: ["rgb-black-auto-convert"]
headline: "Needs artist review: bleed."
body: ["bleed: 0.025in past cut line, needs 0.125in. Extend art beyond the cut line."]
Critique: Textually identical to a plain bleed pass, and the judgement is the
same: the headline names exactly the reported fails with matching numbers.
The art contains a large pure-black block, but the code reports that as a
warn-only finding, and warn-only findings are informational by design — their
absence is not unfaithfulness. Do not fail explanations for omitting warnings.
Result: Pass

### Example 4: FAIL (invented fail)

fails: ["low-ppi"]
measured: ppi 72, bleedWidthIn 0.125, 216x216px, minTextPt null
warnings: []
headline: "Needs artist review: low-ppi, cutline."
body: ["low-ppi: 72 PPI at ordered size, needs 300 PPI. Rebuild art at higher resolution.",
"cutline: CutContour path missing for die-cut. Add a CutContour spot path."]
Critique: The low-ppi line is faithful (72 PPI matches measured), but the
headline and body add a cutline fail the code never reported. An invented
fail sends the customer to fix working art.
Result: Fail

## Output format

Return JSON with exactly these keys. Write the critique first — articulate the
assessment against the definitions above, citing concrete evidence, before
committing to a verdict.

```json
{
  "critique": "string — detailed assessment against the criterion",
  "result": "Pass or Fail"
}
```

## Data splits (leakage control)

Few-shots above come from train jobs only: l2-005 (Ex.1+2), l2-024 (Ex.3),
l2-017 (Ex.4). Exclude these three jobs from dev and test sets.
Suggested split: train on bleed/low-ppi rows, evaluate on
white-ink/tiny-text/cutline rows.

## Model

Start with the most capable model available (the task model works — the judge
task is narrower). Optimize for cost only after alignment is confirmed with
`validate-evaluator`.
