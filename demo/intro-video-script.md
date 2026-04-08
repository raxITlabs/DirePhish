# DirePhish Demo — YouTube + GitHub README

**Format:** 3-5 min video
**Structure:** "The Post-Mortem for the Incident That Never Happened"
**Tone:** Personal story open, urgent middle, warm close
**Report:** `proj_9afb2bed` — Amazon.com, Inc. · AI-Driven Social Engineering
**All numbers below are from the actual report.**

---

## Beat 1 — COLD OPEN (0:00 - 0:30)

Screen: The Amazon report. Executive Summary view. Numbers appearing.

> "Across 3 simulations of an AI-driven social engineering attack on Amazon...
> zero percent containment. The attacker achieved objectives in every single run.
>
> The attack: a deepfake impersonation over Slack. A senior developer's voice cloned
> to trick a junior engineer. From there, code execution on a workstation. Persistence
> through Okta. Privilege escalation via AWS IAM. Data harvested from S3.
> Exfiltrated."

Screen: Show the kill chain — Slack → Workstation → Okta → AWS IAM → S3 → ExternalC2

> "Risk score: 47 out of 100. Poor. Annual exposure: $231,000.
> Team response: 68%. Detection was good. Containment was zero."

Beat of silence.

> "This isn't a post-mortem. This incident never happened."

---

## Beat 2 — THE PERSONAL STORY (0:30 - 1:15)

Cut away from the report. Dark screen or talking head.

> "When I was at AWS, I ran security simulation exercises. The idea was simple.
> Every team has a playbook. We wanted to see if it actually works. So we'd throw
> a fictitious scenario at the team and watch what happens.
>
> But everyone's time poor. Planning one exercise took weeks. Coordinating schedules,
> writing scenarios, getting the right people in the room. And those are busy people.
> You get maybe an hour of their time. By the time you run it, half of them already
> know what's coming.
>
> You'd walk out thinking 'that went well.' But you didn't actually know. You got
> a conversation, not data.
>
> So I started wondering — what if you could test the playbook without needing
> everyone in a room? What if you could run it a hundred times and actually see
> where the response breaks?"

---

## Beat 3 — THE REVEAL (1:15 - 2:30)

> "So I built it."

Screen: DirePhish homepage. "Predict what breaks next."

> "I typed in amazon.com. Told it to simulate an AI-driven deepfake attack
> on the engineering team. And hit go."

Screen: Type `amazon.com`. Add context. Click Analyze.

> "First it researches. Crawls the website, runs searches,
> pulls the org chart, maps the tech stack. For Amazon it found Andy Jassy,
> Amy Herzog as AWS CISO, Stephen Schmidt as CSO. Twelve systems. Slack,
> Okta, IAM, S3, CodePipeline. Compliance frameworks. Data flows."

Screen: Pipeline running. Research step completing. Knowledge graph populating
with Amazon's org structure.

> "It also found recent events. A firewall breach affecting 600 devices.
> A third-party vendor breach that exposed 2.8 million records. An AI bug
> bounty program for their Nova models. All public information. All relevant
> to what kind of attack is most likely."

Screen: Dossier editor — show the recent events, the risks, the systems list.

> "I didn't pick the scenario. DirePhish looked at all of this and ranked
> three attack paths by probability. An AI-driven social engineering attack
> came out at 45%. Supply chain poisoning at 35%. API fraud at 20%.
> It picked the most likely one and ran it."

Screen: Threat analysis — show the three ranked scenarios.

> "You can review everything. Fix what's wrong. Add a system it missed.
> But the scenario comes from the research, not from a template. Every company
> gets a different test because every company has different risks."

Screen: Dossier editor, editable fields. Then config generation.

> "Then it builds the agents. I used to work in this world. I know what Andy Jassy's
> team actually looks like under pressure. So when I read that his agent is 'deeply
> scarred by the 2024 third-party vendor breach' and 'expects immediate, actionable
> solutions' — that landed differently for me. Amy Herzog, the AWS CISO, 'communicates
> with technical precision and has little patience for bureaucratic delays.' They have
> stress levels. Decision biases. Tensions with each other. I was watching AI versions
> of people I used to work around."

Screen: Show the agent profiles if possible, or the config generation step.

> "And they're under real pressure. A GDPR 72-hour notification countdown.
> An IAM remediation sprint with a 24-hour deadline. Customer trust eroding."

Screen: Pipeline simulations step starting.

> "The simulation runs across Slack channels and email threads. In test mode
> that's a few minutes. A full run with fifty variations, about an hour."

Screen: Action feed visible. Messages flowing.

> "You can watch the whole thing play out. The defenders are in a war room channel
> trying to coordinate. The attacker is in a separate C2 channel, reading their
> moves and adapting."

Screen: Show the back-and-forth. Defender messages in one thread, attacker
logs visible separately.

> "When they detect something, the attacker pivots. When they miss something,
> it exploits the gap."

Screen: Threat actor log:
"Defensive response is aggressive. Pivot strategy: abandon current identity persistence..."

> "They don't follow scripts. They decide."

Pause. Let the action feed scroll for 3 seconds. No voiceover. Let the
viewer read the actual messages — the back and forth between attacker and
defenders. This is the moment that sells it.

Screen: Hold on the threat actor logs.
"MISSION STATUS: SUCCESS. Data exfiltrated. Defenders are crippled."

Let that sit for 3 full seconds. No voiceover. Just the log on screen.

> "Then it runs the scenario again. Three times, ten times, fifty.
> Each time varying the pressure, the timing, who responds first."

Screen: Monte Carlo stress testing. Iterations ticking. Pause/skip controls
visible in the sidebar.

> "Zero percent containment. The attacker won every single run."

---

## Beat 4 — THE PAYOFF (2:30 - 3:40)

Screen: The report. Kill chain step 1. [Contained in 0/3] [100% divergence]

> "The exercises I ran at AWS took weeks to plan. And at the end, you got a conversation.
> This is the report I always wanted — every step of the kill chain, what the team did,
> where they failed, what it cost."

Screen: Stay on the kill chain step. Let the viewer see the response actions,
the CLI commands, the risk score of 8.

> "And something I couldn't do before."

Screen: What-If timelines. The two alternate paths.

> "If the team delays terminating that Slack session... containment drops to zero.
> Exposure: fifty thousand dollars. If detection is automated instead...
> containment jumps 85%."

Screen: Hold on the What-If comparison. -100% vs +85%. Let the numbers speak.

> "One decision. That's the difference."

Screen: Executive Summary. Risk score 47. The red 0% containment.

> "Risk score: 47. Poor. Annual exposure: $231,000. The attacker won every time.
> Not my opinion. Math."

Screen: Hold on the exec summary for 3 seconds. Don't rush to the next view.
This is the "blow their mind" moment from the transcript. Let it land.

---

## Beat 5 — THE INVITE (3:40 - 4:15)

Tone warms. Builder energy.

> "I built DirePhish because I spent weeks planning exercises that produced a PDF
> and a conversation. This gives you actual findings — evidence, a playbook, numbers
> you can put in front of leadership.
>
> If you want to know how your team actually performs under pressure — not what they
> say they'd do, what they actually do — point it at your company and see.
>
> It's open source. The code is right there."

Beat.

> "DirePhish. A post-mortem for the incident that never happened."

Screen: GitHub URL. raxIT Labs logo. End card.

---

## Why This Report Is Perfect for the Demo

1. **The team failed.** 0% containment. That's the whole point of the product. "Where does your response break?" Answer: everywhere.
2. **AI-driven social engineering.** Topical, scary, novel. Not a boring ransomware scenario.
3. **The threat actor logs are chilling.** "MISSION STATUS: SUCCESS. Defenders are crippled." That's not faked. The AI agent wrote that during the simulation.
4. **Real AWS services in the kill chain.** Slack → Okta → IAM → S3. Anyone in tech recognizes these.
5. **The What-If is dramatic.** Delay = $50,000 exposure. Automate = 85% improvement. Clear story.
6. **Your personal connection.** "I used to do this at AWS. Now I built the tool."

---

## Screen Recording Order

Record in this order (not script order):

1. **Report views** (you have them now):
   - Kill chain step: Initial Access (the deepfake, 0/3 contained, response actions)
   - Executive Summary (risk score 47, $231K ALE, 0% containment)
   - Security Team (incident timeline with threat actor logs, IOCs)
   - Crisis Comms (board, engineering, customer comms)
   - Scroll through each slowly for 3-5 seconds

2. **Pipeline running** — start a fresh run with amazon.com if needed, or use
   the existing recording. Show research, graph, simulation action feed, MC.

3. **Homepage** — the URL input, typing amazon.com, clicking Analyze

4. **Threat actor logs** — zoom in on the action feed showing the operator logs.
   This is the "wow" moment.

Then edit into script order in post.

---

## Key Lines to Protect

These lines carry the script. Don't cut them:

1. "This isn't a post-mortem. This incident never happened."
2. "So I built it."
3. "They don't follow scripts. They decide."
4. "MISSION STATUS: SUCCESS. Defenders are crippled." (actual AI output)
5. "Not my opinion. Math."
6. "A post-mortem for the incident that never happened."

---

## Production Notes

- Runtime target: 3:45 - 4:15
- Voiceover recommended (more room for screen recordings than talking head)
- Screen recordings from actual DirePhish runs, not mockups
- Music: tension-building for beats 1-3, resolve warm for beat 5
- Let the threat actor logs sit on screen. They sell themselves.
- The 0% containment number is the hook. Lead with it.

## Pipeline Timing Reference (for accuracy in voiceover)

| Mode | Total time | Iterations | Cost |
|------|-----------|-----------|------|
| Test | ~3-5 min | 3 | ~$1 |
| Quick | ~40 min | 10 | ~$7 |
| Standard | ~75 min | 50 | ~$35 |
| Deep | ~120+ min | 100+ | ~$70+ |

The 8-step pipeline: Research → Dossier Review → Threat Analysis → Config
Expansion → Simulations → Monte Carlo (stress testing) → Counterfactual
(what-if) → Exercise Report

The Amazon demo report (proj_9afb2bed) was run in test mode (3 iterations).
For the demo, saying "about an hour" is accurate for quick mode, "two or three
hours" for deep mode. Don't say "two minutes" — that's only the research step.
