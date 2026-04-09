# DirePhish Demo — YouTube + GitHub README

**Format:** 3-5 min video
**Report:** `proj_bfd4a3c1` — Amazon · Supply Chain Attack
**All numbers from the actual report.**

**Voice note:** Read this like you're showing a friend your screen over a video
call. Not presenting. Not performing. Talking. If a sentence feels weird to say
out loud, it probably is.

---

## Beat 1 — COLD OPEN (0:00 - 0:30)

Screen: The report. Sidebar visible with the 82% and 0%.

> "OK so... this is a simulation we ran against Amazon. Supply chain attack.
> Ten runs.
>
> And, look at these two numbers. Team response, 82%. That's actually pretty
> good. Detection, comms, compliance — they were on it. But then... threat
> contained: zero. Zero percent. The attacker got through every single time.
>
> So the team did everything right and still lost. That's... yeah. That's
> the finding."

Screen: Kill chain visible at top. Six steps.

> "The attack went through GitHub Enterprise, into their cloud infrastructure,
> through Secrets Manager, into Aurora, and out. Six steps. And the team couldn't
> stop it at any of them."

Pause.

> "This isn't a post-mortem by the way. None of this actually happened."

---

## Beat 2 — THE PERSONAL STORY (0:30 - 1:15)

Cut away from the report.

> "So, some context. I used to be at AWS. And one of the things I did there was
> run security simulation exercises. Like, tabletop exercises, incident response
> drills, that kind of thing. And honestly it was probably the most fun work I've
> done.
>
> But... the problem is, everyone's busy. Right? Like, these are senior people.
> You're trying to get them all in a room, and planning one of these took weeks.
> Writing the scenario. Coordinating schedules. And by the time you actually run
> it, half the people have already seen the playbook. They know what's coming.
> So you just... you don't really know if the playbook works. You know if people
> can talk about the playbook.
>
> And I kept thinking, what if you could just... test it? Like, without needing
> everyone in a room. Run it a hundred times and see what actually happens."

---

## Beat 3 — THE REVEAL (1:15 - 2:30)

> "So I built it."

Screen: DirePhish homepage.

> "You type in a company. I put in amazon.com. Hit go."

Screen: Type amazon.com. Click Analyze.

> "And the first thing it does is research. Like, it's actually going out and
> finding stuff. The org chart, the tech stack, recent news. For Amazon it found
> Andy Jassy, Steve Schmidt, Matt Garman. GitHub Enterprise, Secrets Manager,
> Lambda, Aurora. Twelve systems total. Recent breaches. Compliance frameworks.
> All from public information."

Screen: Knowledge graph populating.

> "And this is important because, like, the scenario it picks comes from this.
> It ranked three possible attacks and picked supply chain poisoning as the
> most likely one. I didn't choose that. It figured it out from the research."

Screen: Dossier editor.

> "You can review all of this. Fix stuff. But the point is it's not a template.
> It's specific to this company."

Screen: Config generation.

> "Then it builds the agents. And this is the part that... OK so. Andy Jassy's
> agent is, quote, 'deeply scarred by the 2024 vendor breach' and 'expects
> immediate actionable solutions.' Steve Schmidt 'communicates with technical
> precision.' They have stress profiles. Biases. Tensions with each other.
> I was reading these thinking, yeah, that's... that's actually what it looks
> like."

Screen: Simulation starting.

> "The simulation runs across Slack and email. You can watch the whole thing.
> Defenders in one channel, attacker in another. And the attacker adapts.
> Like, round 4, it writes: 'They are air-gapping the Health AI VPC. My
> primary persistence is compromised. Shifting to Slack-to-Secrets Manager.'
> It's... pivoting. In real time."

Screen: Threat actor logs scrolling. Don't narrate. Let it scroll for 3 seconds.

> "They don't follow scripts. They decide."

Screen: Round 12 threat actor log:
"The honeypot is running perfectly. Defenders are busy remediating their own
databases into oblivion while I maintain the sidecar."

Hold for 3 seconds. Silence.

> "Ten runs. Zero containment."

---

## Beat 4 — THE PAYOFF (2:30 - 3:40)

Screen: Kill chain step 1. Evidence chips. Response actions.

> "So the exercises I used to run at AWS, they took weeks. And you'd get a
> conversation and maybe a PDF. This is what I always wanted.
>
> Look, every step of the kill chain. What happened. What the team did.
> Where it broke. And the exact commands to fix it. Like, literally,
> `aws secretsmanager rotate-secret`, assigned to the IAM team, 30 minutes.
> At 2am during a real incident you don't want a recommendation. You want
> the command."

Screen: What-If for step 1.

> "And this is new. What if the team was slow? Containment drops, exposure
> goes to $5 million. What if you automate it? Containment goes up 45%.
> One decision. That's the gap."

Screen: Step 5 — Collection.

> "At step 5 the attacker is scraping their AI model data. The What-If here
> is... $50 million. Like, that's not a breach anymore. That's losing your
> competitive advantage."

Screen: Executive Summary.

> "Risk score: 51. Moderate. And here's the thing that got me. Decision
> consistency: 95%. The team made the same decisions in almost every run.
> They were consistent. They were just... consistently wrong.
>
> Annual exposure: $232,000. Not my opinion. Math."

Hold for 3 seconds.

---

## Beat 5 — THE INVITE (3:40 - 4:15)

> "I built this because... I spent weeks doing what this does in an hour.
> And I got a conversation. This gives you actual numbers you can bring
> to leadership.
>
> If you want to know how your team actually handles pressure, not what
> they say they'd do, point it at your company and find out.
>
> It's open source. Code's right there."

Pause.

> "DirePhish. A post-mortem for the incident that never happened."

End card.

---

## Key Lines to Protect

1. "This isn't a post-mortem by the way. None of this actually happened."
2. "So I built it."
3. "They don't follow scripts. They decide."
4. "The honeypot is running perfectly. Defenders are busy remediating their own databases into oblivion." (actual AI output)
5. "Not my opinion. Math."
6. "A post-mortem for the incident that never happened."

---

## Production Notes

- Runtime target: 3:45 - 4:15
- Voiceover with screen recording, or talking head with screen behind
- Record screen first, write voiceover to match what's visible
- Music: subtle tension for beats 1-3, warm resolve for beat 5
- The threat actor logs sell themselves. Let them sit on screen.
- The 82%/0% contrast is the hook

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
| Key agents | Andy Jassy (100%), Steve Schmidt (99%), Matt Garman (88%), SOC Analyst (95%) |

## Pipeline Timing

| Mode | Time | Iterations | Cost |
|------|------|-----------|------|
| Test | ~3-5 min | 3 | ~$1 |
| Quick | ~40 min | 10 | ~$7 |
| Standard | ~75 min | 50 | ~$35 |
| Deep | ~120+ min | 100+ | ~$70+ |
