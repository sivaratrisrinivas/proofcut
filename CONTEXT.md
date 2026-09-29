# CONTEXT.md

Single-context glossary for ProofPilot. Implementation-free: terms only.

## Terms

- **Proof**: the production-ready preview StickerMule sends within 4hr promise. Free, must match ordered size + product spec.
- **Preflight**: deterministic code measurement of an upload before any artist touch. Never LLM-measured.
- **PASS**: preflight verdict meaning clean — eligible for auto-draft + high-confidence auto-send with audit log.
- **SOFT-FAIL**: preflight verdict meaning flagged — needs artist review (3-5m) with annotated preview + fix list. Never auto-sends.
- **Proof-draft**: system-generated proof candidate from a PASS file. Original vs draft shown side-by-side.
- **Cut-line**: die-cut contour path (spot color `CutContour` / vector path). Required for die-cut. Shown as dashed magenta overlay.
- **Bleed / border**: extra art beyond cut-line so cutting never leaves white edge. Shown as bleed overlay. Threshold per product spec.
- **White-ink / underbase**: white layer required for clear / holographic so colors stay opaque. Missing = SOFT-FAIL.
- **Touches**: artist opens of a job. Before 3 → after 1 is the demo claim.
- **Hold rate**: % flagged SOFT-FAIL. Guard <40% (tune <5% for QC variant).
- **Touch time saved**: minutes saved per auto-drafted job vs manual 10-25m open.
