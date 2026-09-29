# 03: Draft UI (upload + report + overlays)

**What to build:** An artist can upload with ordered size and product type, see a preflight panel, compare original vs draft with cut line and bleed overlays, tick the QC list, and copy a concise customer note.

**Blocked by:** 01 corpus + preflight core (die-cut), 02 preflight extensions (clear + text + color).

**Status:** ready-for-agent

- [ ] Upload accepts file plus ordered size plus product type in under a minute
- [ ] Preflight panel shows PPI, dims, bleed, cut line, color mode, white ink, tiny text, transparency with pass or soft-fail
- [ ] Side-by-side shows dashed magenta cut line overlay plus bleed overlay
- [ ] QC checklist ticks come from code measurements only
- [ ] Message pane copies a named, specific fix with numbers and no banned words
- [ ] 5-file demo (2 clean approve, 3 bad fix-note) runs end to end in under 30 seconds per file
