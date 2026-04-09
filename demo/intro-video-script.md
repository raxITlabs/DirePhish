# DirePhish Demo — GitHub README Video

**Format:** 2-2:30 min. Character first, then reveal.
**Report:** `proj_bfd4a3c1` — Amazon · Supply Chain Attack · 10 Monte Carlo runs
**All quotes from the actual simulation. Nothing is made up.**

**Voice note:** Simon Willison's rule — "the best way to explain what that
means is to show you a demo." Don't describe. Point at the screen and react.
Start with a character moment, not a stat. The quote makes them lean in.
The number makes them stay.

---

## Beat 1 — WHAT THIS IS + THE MOMENT (0:00 - 0:25)

Screen: Report open. Sidebar visible.

> "DirePhish clones your org as AI agents — your CISO, your SOC team,
> your CEO — then drops a threat actor in and simulates how an incident
> plays out across Slack and email. We pointed it at Amazon. Supply
> chain attack. Ran it ten times. This is what came out."

Scroll to the threat actor's round 12 log.

> *"The honeypot is running perfectly. The defenders are busy
> 'remediating' their own databases into oblivion while I maintain
> the sidecar."*

Pause. Let them read it.

> "That's the attacker agent. Writing that on its own."

---

## Beat 2 — WHAT WE BUILT (0:25 - 0:50)

Screen: DirePhish homepage. Type amazon.com.

> "Here's how it works. You give it a company URL. It goes out and
> researches the org — leadership, tech stack, compliance posture,
> recent breaches. All public info. Then it builds a swarm of AI
> agents that act like the real team — Andy Jassy, Steve Schmidt,
> the CISO, director of IR — each with a persona, memory, and stress
> profile. Drops a threat actor in. And simulates the whole incident
> across Slack and email."

Screen: Simulation running briefly.

> "Then it runs it again. Ten times. Fifty times. With controlled
> variation. And gives you a statistical report."

---

## Beat 3 — THE NUMBERS (0:50 - 1:00)

Screen: Back to report. Sidebar. 82% and 0%.

> "Team response: 82%. Detection, comms, compliance — they were on it.
> Threat contained: zero. Ten runs. The attacker got through every time.
>
> They did everything right and still lost."

---

## Beat 4 — THE KILL CHAIN (1:00 - 1:25)

Screen: Kill chain bar, 6 steps. Click into step 1.

> "Six steps. GitHub Enterprise, into AWS infrastructure, through
> Secrets Manager, into Aurora, out through DNS tunneling."

Screen: What-If panel for step 1.

> "Every step has a what-if. What if the team was slow? Exposure
> jumps to $5 million. What if you automate detection? Containment
> goes up 45%. One decision. That's the gap."

Screen: Step 5 — Collection.

> "Step 5, the attacker is scraping AI model data. The what-if here
> is $50 million. That's not a breach anymore. That's losing your
> competitive advantage."

---

## Beat 5 — THE INVITE (1:25 - 1:40)

> "It's open source. Point it at your company and find out.
>
> DirePhish. A post-mortem for the incident that never happened."

End card.

---

## Key Lines to Protect

1. "The honeypot is running perfectly. Defenders are busy remediating their own databases into oblivion." (actual AI — opens the video)
2. "That's the attacker agent. Writing that on its own."
3. "They did everything right and still lost."
4. "One decision. That's the gap."
5. "None of this actually happened. It's a prediction."
6. "A post-mortem for the incident that never happened."

---

## Production Notes

- Runtime target: 1:30 - 1:45
- Screen recording with voiceover. No talking head needed.
- Record screen first, write voiceover to match
- Music: subtle tension for beats 1-4, warm resolve for beat 5
- Beat 1: Hook with the attacker quote, then immediately explain what
  this is. Don't make them wait.
- Beat 2: Show what you built — the process from URL to report.
- Beat 4: Kill chain + what-ifs are the payoff. The $50M number lands.
- The 82%/0% comes in Beat 3, after they already understand the concept
  and have seen the honeypot quote. Now the number has context.

## Report Data Reference

| Metric | Value |
|--------|-------|
| Report | proj_bfd4a3c1 |
| Company | Amazon |
| Scenario | Supply Chain Attack (Third-Party Dependencies) |
| Kill chain | GitHub Enterprise → AWS Infrastructure → Secrets Manager → Aurora → ExternalC2 |
| Iterations | 10 |
| Team Response | 82% |
| Containment | 0% |
| Risk Score | 51/100 (Moderate) |
| ALE | $232.6K |
| Decision Consistency | 95% |
| Agent Consistency | Andy Jassy (100%), Steve Schmidt (99%), David Zapolsky (99%), Sarah Jenkins (100%), Matt Garman (88%), Chris Betz (83%) |
| Total Cost (10 runs) | $6.32 |

## Pipeline Timing

| Mode | Time | Iterations | Cost |
|------|------|-----------|------|
| Test | ~25 min | 3 | ~$1 |
| Quick | ~40 min | 10 | ~$7 |
| Standard | ~75 min | 50 | ~$35 |
| Deep | ~120+ min | 100+ | ~$70+ |
