# 05: Wording + hardening + demo prep

**What to build:** A demo viewer sees concise, correctly-worded fix notes, a hardened 18-case gate, and a shippable public link with README and 3-minute script.

**Blocked by:** 03 draft UI (upload + report + overlays).

**Status:** ready-for-agent

- [ ] LLM layer uses two prompts only (explanation plus rebuild), rewords code numbers only, returns confidence and waits for approve, no fine-tune, no swarm
- [ ] Zero banned words (sorry, unfortunately, can't), tone concise and named with no apology
- [ ] 18-case gate passes: 90 percent accuracy or better, p95 under 30 seconds, hold under 40 percent, 50dpi adversarial never passes, measurements within 2 percent
- [ ] README states ROI formula plus assumptions, public link live, 3-minute script covers pain to overlays to before and after to sliders to production path
