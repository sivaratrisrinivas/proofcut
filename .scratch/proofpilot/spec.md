# ProofPilot MVP spec

Status: ready-for-agent

## Problem statement

StickerMule promises a free proof in 4 hours. Right now every upload sits 60 to 240 minutes, then an artist opens it for 10 to 25 minutes. They measure, rebuild low-res art as vector, check cut line and bleed and white ink. Then one or two customer loops at 4 to 12 hours each. That queue blocks ship time and conversion. It also pushes headcount up just to keep the promise. Clean files get touched too, which always struck me as waste.

## Solution

Preflight every upload in under 30 seconds and draft the proof so artists only handle the exceptions. I expect about 60 percent to pass clean and auto-draft. The other 40 percent get flagged with a marked preview, a short fix list, a customer note, and QC ticks. Artists review the flagged ones in 3 to 5 minutes. Touches fall from 3 to 1. Only a high-confidence pass can auto-send, and it writes an audit log. Everything else is a recommendation. The system never charges, reprints, or scraps on its own.

## User stories

1. As a customer, I want to upload my art with ordered size + product type in under a minute, so that I start the proof clock immediately.
2. As an artist, I want clean files to auto-draft a proof without opening them, so that I spend time only on exceptions.
3. As an artist, I want a preflight panel showing PPI at ordered size, dims vs ordered size, bleed width, cut line presence, color mode, white ink presence, tiny text height, transparency, so that I trust the pass or soft-fail call.
4. As an artist, I want side-by-side original vs draft with dashed magenta cut line overlay, so that I verify contour placement at a glance.
5. As an artist, I want a bleed overlay showing art beyond the cut line, so that I catch white-edge risk without measuring by hand.
6. As an artist, I want a QC checklist with ticks driven by code measurements, so that I approve the same way each time.
7. As an artist, I want a customer-message pane with copy button that names the specific fix with numbers from code, so that I send short guidance without rewriting.
8. As an artist, I want messages to avoid apologies and banned words, so that tone stays concise and named with no "sorry" or "unfortunately" or "can't".
9. As an artist, I want an artist queue seeded with demo jobs filterable by fail type (low-PPI, bleed, cut line, white ink, tiny text), so that I work the riskiest holds first.
10. As an artist, I want approve and reject actions to log timer + verdict + actor, so that time saved stays measurable.
11. As a shopper advocate, I want the LLM layer to reword only code-measured numbers plus a rebuild suggestion, so that explanations never invent measurements.
12. As a manager, I want a metrics dashboard showing percent auto-pass, touches per job, estimated minutes saved, hold rate, so that I can keep what works and cut what does not.
13. As a manager, I want ROI sliders (orders per month default 100k, percent manual, minutes saved, loaded dollars per minute, reprint percent and cost) with assumptions labeled and weakest input highlighted, so that I never pass ranges off as company facts.
14. As a demo viewer, I want a 3-minute path (72dpi 3in die-cut pain, then 5 files flagged in seconds, then approve 2 clean and send 3 fix notes, then before and after 20m to 4m, then ROI sliders, then production path Guru to RIP to Reply in shadow mode), so that the value lands without private data.
15. As a developer, I want a 60-file synthetic corpus each with meta (ordered size, product, expected verdict), including 5 PDFs with CutContour spot and 5 clear and holo white-ink edges, so that the D2 harness proves 90 percent or better without private files.
16. As a developer, I want deterministic extraction for all measurements plus product-spec lookup from static JSON, so that thresholds stay testable with Bun.
17. As a support agent, I want an "escalate to support" link on soft-fail, so that angry and WISMO and bulk B2B cases have a path.
18. As a demo user, I want single demo login, so that auth never blocks the prototype.

## Implementation decisions

- The tested seam is one pure function. It takes file plus ordered size plus product spec and returns pass, fails, measurements. Bun tests it. The drafter, the queue and audit store, and metrics sit on top as thin adapters.
- ADR-0001 holds for stack. Bun runs install, test, build, and file I/O in the worker. The app is TS plus Next.js App Router on Vercel. Vercel prod runs Node. A full Bun server and Go and Postgres alignment with the posting wait for a production path. Speed won here, and I think that was the right call for a week-long demo.
- Scope is sliced. Die-cut plus clear first because those prove cut line and white underbase. The rest (holographic, roll label, packaging tape) join by D6 eval.
- Faults are fixed. Clean 300dpi passes. 72dpi upscale fails soft. Missing bleed fails soft. Missing cut line fails soft. Text under 6pt fails soft. RGB black and transparency only warn.
- Thresholds are set for D2 and frozen until the harness clears 90 percent. Pass needs 300 PPI or more at ordered size. Under 200 fails soft. 200 to 299 warns. Bleed needs 0.125in past the cut line. Cut line needs CutContour spot or a vector path. Text under 6pt fails soft. Clear and holo need white ink or they fail soft. RGB black gets a warn with an auto-convert note.
- Verdicts follow the glossary. Pass can auto-draft and, when confidence is high, auto-send with a log. Soft-fail needs a 3 to 5 minute artist review with a marked preview. It never auto-sends.
- The drafter shows original next to draft, with dashed magenta cut line and a bleed overlay, QC ticks from measurements, and a message pane with copy.
- The LLM layer is two prompts and nothing more. One writes a short explanation with a name and no apology. One suggests how to rebuild the file. Both may use only numbers the code measured. They also return confidence and wait for approve. No fine-tune. No swarm.
- The queue filters by fail type. Approve and reject record time. Every auto-send and decision lands in the audit log.
- Metrics track percent auto-pass, touches per job, minutes saved, and hold rate. Hold rate must stay under 40 percent. A QC variant would tune toward 5 percent. Preflight p95 must stay under 30 seconds.
- Data is synthetic only. An image lib makes the faults. Each file carries ordered size, product, expected verdict. Static JSON stands in for the Guru spec DB. RIP and imposition and order and Reply calls are mocked. One demo login stands in for auth.
- Guards are hard. Measurements must stay within 2 percent. Banned words must stay at zero. A 50dpi adversarial file never passes. Seniors spot-check the pass queue to catch false passes.
- Demo content is 5 files. Two clean get approved. Three bad get fix notes. Before and after is 3 touches to 1, 20 minutes to 4. Then ROI sliders, then the production slide.

## Testing decisions

- A good test checks the outside behavior. It feeds a file and asserts pass or soft-fail plus measurements. It never asserts internals.
- Only the preflight seam gets unit tests. The UI and store adapters get a demo walkthrough instead.
- This repo starts greenfield, so there is no prior art. The new pattern is a Bun harness over the 60-file corpus plus meta. It asserts 90 percent accuracy or better, p95 under 30 seconds, hold rate under 40 percent, zero banned words, measurements within 2 percent. Threshold regressions get cheap local asserts only.
- The D6 gate is the 18-case list from the handoff. Clean pass, low-PPI flag, bleed flag, white-ink flag, tiny-text flag, RGB warn, adversarial 50dpi never passes, tone lint, hold rate, latency, audit log.

## Out of scope

Full auth. Real imposition or RIP. Perfect vector redraw. Multi-agent code. Auto-charge, auto-reprint, auto-scrap. Real Stripe, MES, or camera feeds. Real Guru or Reply calls. The full 120-ticket support track beyond the escalate link. Postgres or GCP deploy.

## Further notes

- Savings equal orders per month times percent manual times minutes saved times loaded dollars per minute, plus orders per month times reprint percent times cost per reprint. Inputs are assumed. 80k to 150k orders, 40 to 70 percent manual, 8 to 15 minutes, 0.45 to 0.75 dollars per minute, 1 to 3 percent reprints at 18 to 35 dollars. I claim only 20 to 25 percent capture in year one. That is 280k to 1.1M labor plus 180k to 900k reprints. Monthly proof volume is the weakest input. Confirm it with the company before quoting anything with confidence.
- Eval growth to about 100 tuples (product times fault times context) waits on the pasted 20. It does not block the spec. After that comes error discovery, then a judge prompt, then validation.
- D7 ships the 3-minute script, a README with the ROI formula and assumptions, a public link, and the video.
