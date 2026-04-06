# DirePhish Intro Video Script

**Format:** 3-5 min intro video
**Structure:** Approach B — "The Post-Mortem for the Incident That Never Happened"
**Tone:** Serious open, warm landing
**Character:** CISO as main character, pivot to open source builder invite
**CTA:** Try it on your company, then join the community

---

## Thesis

From the product demo principle: great demos focus on the user, not the product.
The product is just a prop the character uses to solve a problem. The connection
with the character draws the audience in and makes it possible to blow their minds.

---

## Beat 1 — THE COLD OPEN (0:00 - 0:25)

Screen shows a report. Numbers appearing. Voiceover reads them like findings
from an actual incident investigation.

> "Across 50 simulations of a ransomware attack on this company...
> 73% of the time, the IR team contained the breach within 12 hours.
> 18% of the time, lateral movement to the customer database succeeded.
> 9% resulted in full regulatory escalation.
> The single highest-impact decision: Round 3, whether the Incident Commander
> isolated the payment system or kept monitoring."

Then the turn:

> "This isn't a post-mortem. This incident never happened."

**Visuals:** Dark screen, report numbers fading in one by one. Minimal. Let the
data do the work. The turn line lands on a beat of silence.

---

## Beat 2 — THE PAIN (0:25 - 1:10)

Introduce the CISO. Tone is serious.

> "Every security leader has been asked the same question after a competitor
> gets breached: 'Could that happen to us?'
>
> And the honest answer is... you don't know. You have playbooks. You have tools.
> You've maybe done a tabletop exercise where everyone already knew the answers.
> But you've never actually tested how your team performs under real pressure.
> Not once.
>
> Traditional IR exercises are expensive, take weeks to plan, and everyone
> performs differently when they know it's fake. You get opinions, not data."

**Visuals:** Could be talking head, could be b-roll of security ops centers,
incident war rooms, empty conference rooms where tabletops happen. The point
is to make the gap feel real.

---

## Beat 3 — THE REVEAL (1:10 - 2:30)

Tone shifts slightly. Still serious but now there's momentum. Show the product
as the prop the character uses.

> "DirePhish changes that. You point it at a company's website."

Show: URL input on the homepage, research crawl running.

> "It crawls the site. Searches for your leadership team, tech stack, recent
> security incidents, compliance posture. It builds a dossier of your organization."

Show: knowledge graph populating with nodes. Execs, systems, risks, connections.

> "You review it. Edit anything that's wrong. Then it does something no other
> tool does."

Show: pipeline starting. Agents being generated.

> "It spawns AI agents that roleplay as your actual team. Your CTO thinks about
> systems. Your CFO worries about business continuity. Your Incident Commander
> makes calls under pressure. They don't follow scripts. They decide."

Show: live action feed. Messages flying in Slack channels. Threat actor moving.

> "And then it runs that scenario 50 times. Each time, it varies the pressure,
> the timing, the personalities. It's looking for the pattern: where does your
> response break?"

Show: Monte Carlo iterations ticking up. 10... 25... 50.

**Pacing note:** This is the longest beat. Keep visuals moving. Quick cuts between
the graph, the pipeline, the action feed. Don't linger on any single screen.

---

## Beat 4 — THE PAYOFF (2:30 - 3:30)

Come back to the report from the cold open. Now it means something.

> "That's where these numbers came from."

Show: Board View with the hero KPIs.

> "73% containment rate. That's your baseline. Not a guess, not an opinion.
> Data from 50 simulated incidents."

Quick cuts through the views:

> "Your board gets the executive summary. Your CISO gets decision divergence
> analysis, which choices mattered most, which team members were consistent
> under pressure. Your security team gets the kill chain, the IOCs, the
> remediation checklist. And your IR team gets a runnable playbook generated
> from what actually worked in the simulation."

Show: Risk Score tab.

> "And because it runs on FAIR methodology, you get a number your board actually
> understands. Expected annual loss: $2.1 million, plus or minus $400K.
> Run it again after remediation, show the delta."

**Visuals:** The report views should feel like quick, confident cuts. Board view,
CISO view, Security view, Playbook view, Risk Score. Each for 2-3 seconds. Enough
to see it's real, not enough to read every detail.

---

## Beat 5 — THE INVITE (3:30 - 4:15)

Tone warms. This is the builder speaking now, not the narrator.

> "We built DirePhish because this kind of tool shouldn't cost $50K a year
> and a sales call. It should be something any security team can run themselves.
>
> It's open source. GitHub, Docker, point it at your company and see what happens.
> See how your team would actually perform. And if you find something you want
> to make better... the code is right there.
>
> DirePhish. A post-mortem for the incident that never happened."

**Visuals:** End card with GitHub URL, raxIT Labs logo. Clean, simple.

---

## Audiences Served

This script speaks to multiple audiences through the same story:

| Audience | What hooks them | When they're hooked |
|----------|----------------|-------------------|
| Security professionals | The cold open numbers | Beat 1 (0:00) |
| Technical people broadly | "AI agents that roleplay as your team" | Beat 3 (1:30) |
| Non-technical (founders, execs) | "Could that happen to us?" | Beat 2 (0:25) |
| Open source community | "It's open source" | Beat 5 (3:30) |
| Red teamers / pen testers | "Run it before and after, show the delta" | Beat 4 (3:15) |

---

## Key Lines to Protect

These are the lines the script is built around. Don't cut them:

1. "This isn't a post-mortem. This incident never happened."
2. "You get opinions, not data."
3. "They don't follow scripts. They decide."
4. "Where does your response break?"
5. "A post-mortem for the incident that never happened."

---

## Production Notes

- Total runtime target: 3:45 - 4:15
- Voiceover or talking head, either works. Voiceover gives more room for screen recordings.
- Screen recordings should be from actual DirePhish runs, not mockups.
- Music: subtle, tension-building for beats 1-3, resolves warm for beat 5.
- No flashy transitions. Clean cuts. Let the product speak.
