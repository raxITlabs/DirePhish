# DirePhish Demo Walkthrough — Screen-by-Screen

**Report:** `proj_bfd4a3c1` — Amazon · 4/8/2026
**Scenario:** Supply Chain Attack (Third-Party Dependencies)
**Iterations:** 10 Monte Carlo runs
**Result:** 0% containment, 82% team response, Risk Score 51 (Moderate)

This script walks through the report screen by screen. Designed for a YouTube
walkthrough or conference demo where you're sharing your screen.

---

## Opening — The sidebar (what you see first)

> "So the report loads, and honestly the first five seconds tell you everything.
> Two numbers. Team Response: 82%. That's detection, communication, compliance —
> the team was doing their jobs. Then right below it: Threat Contained: 0%.
> Ten simulations. Zero containment. Every single run, the attacker got through.
>
> The 82% makes the 0% worse, not better. They weren't asleep. They saw it
> coming. They just couldn't stop it."

Point at the sidebar: Team Response bar at 82%, Threat Contained bar at 0%.

> "And below that is the kill chain. Six steps. Initial Access through GitHub
> Enterprise. Execution, same system. Persistence into AWS Cloud Infrastructure.
> Lateral Movement through Secrets Manager. Collection from Aurora. Then
> exfiltration out to an external C2. That's the whole story, left to right.
> We'll walk through each one."

---

## Kill chain overview (the top bar)

> "Every view in the report has this bar at the top — the kill chain laid out
> left to right. MITRE technique IDs, the system each step targets. I keep
> coming back to this because it grounds everything. You're not looking at
> abstract findings. You're looking at a specific attack path this particular
> team faced, and failed to contain."

---

## Step 1: Initial Access — GitHub Enterprise (T1195.002)

> "Step one. A compromised third-party library gets into Amazon's internal
> CI/CD pipeline. T1195.002, supply chain compromise.
>
> Contained in zero out of ten. The team caught it — detection happened at
> Round 1 — but catching it and containing it are different things. And what
> stands out here is the divergence: 1.36%. That's almost nothing. Across ten
> runs, the outcome at this step was basically identical every time. The team
> kept failing in exactly the same way."

Point at the response actions.

> "The playbook tells you what to do. Isolate the compromised CI/CD pipeline,
> revoke access for the malicious dependency. It gives you the exact command:
> `gh api -X POST /repos/{owner}/{repo}/actions/permissions`. Assigned to
> the DevOps Lead, 15 minutes. Action 2: rotate GitHub Enterprise webhook
> secrets, invalidate the CI/CD integration tokens. `aws secretsmanager
> rotate-secret`. IAM Team, 30 minutes.
>
> That level of specificity matters. When you're doing this at 2am during a
> real incident, you don't want guidance. You want the command."

Point at Team Performance.

> "Team Performance on the right. Andy Jassy at 100%. Steve Schmidt at 99%.
> This is how consistently each agent performed across all 10 runs. High
> numbers here don't mean success — they mean predictability. They did the
> same things, reliably, and it wasn't enough."

Point at What-If.

> "This is the part I didn't have at AWS. Two alternate timelines. If the team
> delays isolating GitHub Enterprise, containment drops 100%, two more rounds
> of attacker activity, exposure jumps to $5 million. But if you automate
> the revocation with a GitHub webhook, containment goes up 45%, one fewer
> round, exposure drops $2 million below baseline. One decision point. That
> gap is what you're buying when you invest in automation."

---

## Step 2: Execution — GitHub Enterprise (T1204.002)

> "Same system, second step. The malicious code runs during an automated
> deployment. Still zero containment across all ten runs.
>
> The response actions shift here — and that's worth noticing. It's not just
> 'do step one again.' The threat has moved. Now you're halting GitHub Actions
> workflows, revoking build service credentials. The commands are different
> because stopping a build runner is a different operation than revoking a
> dependency. The playbook tracks that.
>
> Risk drops to 9.2 from 9.5. The What-If is brutal though: delay here and
> the build deploys to production Lambda functions. $5 million exposure. But
> automate detection through GitHub webhooks and containment jumps 85%.
> Exposure: zero. The automation window is still open at this step."

---

## Step 3: Persistence — AWS Cloud Infrastructure (T1547.001)

> "Step three is where the simulation found instability. The attacker injects
> a backdoor into a Lambda function running with high-privilege execution roles.
>
> Look at the detection round. Round 3. Steps one and two were caught at
> Round 1. The team took two extra rounds to notice this one. And the
> divergence jumps to 100%. In some runs the outcome here was completely
> different from others. That's the simulation telling you: this is where
> the response breaks down. This is where consistency falls apart.
>
> And you can see it in the team performance too. New name: Matt Garman at
> 88%. Andy and Steve were at 99-100%. Matt's still good, but that gap
> is meaningful under pressure. Not everyone performs the same. The simulation
> surfaces that in a way a tabletop never would.
>
> Response: isolate the Lambda function, set concurrency to zero, revert to
> the last known-good version from S3. Every command is there."

---

## Step 4: Lateral Movement — AWS Secrets Manager (T1078.004)

> "The attacker uses the compromised Lambda execution role to pull production
> API keys from Secrets Manager. Contained in zero out of ten. Detection at
> Round 4, 100% divergence again.
>
> The response is all IAM now. Revoke Lambda execution role sessions. Explicit
> deny on secretsmanager:GetSecretValue. Rotate every secret the compromised
> function touched. This is the part where the blast radius matters — how
> many secrets did that function have access to?
>
> The What-If here has something the earlier steps don't. If you automate
> the IAM policy enforcement, containment goes up 40%, but exposure still
> doesn't hit zero. It lands at $50,000. Some damage is already done before
> the automation triggers. That's an honest answer. Not everything is
> preventable by moving faster."

---

## Step 5: Collection — Amazon Aurora (T1005)

> "Now we're in the data layer. The attacker is scraping Aurora for proprietary
> AI model metadata. Detection at Round 5. Five rounds before anyone noticed
> the data access patterns.
>
> Look at the Team Performance panel here. Eight agents. Andy Jassy, Sarah
> Jenkins, David Zapolsky, Steve Schmidt — all 99 to 100%. But there's another
> name on the list: 'The AI-Agent Supply Chain Poisoning Operator,' at 99%.
> That's the threat actor. It's also an agent, and the report tracks its
> consistency alongside the defenders.
>
> I want to sit on that for a second. The attacker is rated alongside the
> defenders. And it's performing at 99%, matching Amazon's best people. That's
> not a scripted threat. That's an adversary that showed up.
>
> FAIR at this phase: $5 million per hour of delay. And if you delay the
> response by 60 minutes, you're looking at $50 million exposure. That number
> is the loss of proprietary AI model competitive advantage. This isn't
> just a breach in the traditional sense. It's a strategic loss.
>
> Two regulatory deadlines appear here. Legal notification at T+1 hour. SEC
> preliminary report at T+72 hours. The clock isn't just operational anymore."

---

## Step 6: Exfiltration — External C2 (T1041)

> "The final step. Proprietary IP leaves via DNS tunneling, specifically
> designed to bypass GuardDuty detection. Three systems affected. Detection
> at Round 6.
>
> Everything before this was setup. This is the loss event.
>
> Two new agents in the performance panel. SOC Analyst at 95%. Network Security
> Engineer at 92%. Lower than the executives. These are the people who would
> actually have to execute the containment at 2am, and the simulation says
> they're less consistent under pressure than the people in the war room
> making decisions. That's a real gap.
>
> Risk: 9.8 out of 10. FAIR: $850,000 per hour. Full exfiltration of AI model
> weights is the worst case at $50 million. But automate the DNS Firewall
> trigger — Route 53 DNS Firewall rules at the VPC Resolver — and exposure
> drops $12 million below baseline. Meaning automated detection at this step
> doesn't just contain the current incident. It prevents the next one."

---

## Executive summary

> "This is what leadership sees.
>
> Risk Score: 51 out of 100. Moderate. Not catastrophic on paper, but look at
> what's underneath it. Containment Effectiveness: 0%. Escalation Resistance:
> 0%. Annual Exposure: $232,600. And then: Decision Consistency: 95%. The team
> made the same decisions every time. They just made the wrong ones. That 95%
> is almost more damning than if the number were low.
>
> Three root causes. Over-reliance on implicit trust in third-party
> dependencies. Excessive privilege for cloud compute functions. Inadequate
> detection of covert exfiltration channels.
>
> Three things. Not twenty. I used to write incident reports at AWS that had
> fifteen action items, and you know what happened to items six through fifteen.
> This forces you to three.
>
> Priority actions: Zero Trust architecture for cloud compute. Automated
> supply chain security framework. Behavioral analytics for exfiltration
> detection. Each one has an owner and a deadline."

---

## Security team view

> "This is for the people who have to fix it Monday morning.
>
> Four communication channels were active during the simulation. The incident
> war room in Slack, 24 actions. Executive strategy sync, 36 actions. Regulatory
> and legal disclosure via email, 48 actions. And the C2 channel — the attacker's
> own command and control — 12 actions. The attacker was quieter than the
> defenders. Worth thinking about.
>
> The incident timeline is where you see the simulation play out round by
> round. Rounds 1 through 3, normal incident response. Then at Round 4, the
> threat actor writes: 'The situation is volatile. They are air-gapping the
> Health AI VPC. My primary persistence is compromised. I am shifting to the
> Slack-to-Secrets Manager vector.'
>
> The defenders cut off one path, so it pivots. Round 6: 'The environment is
> burning, they are in full lockdown. My primary access vectors are compromised.'
>
> Round 7: 'The sidecar in the K8s cluster is my new anchor point. While they
> are busy fighting the DDoS, I am initiating OIDC token theft from the internal
> IdP.'
>
> The attacker manufactured a distraction. While the defenders were drowning
> in the DDoS, the real objective continued.
>
> Round 12: 'The honeypot is running perfectly. The defenders are busy
> remediating their own databases into oblivion while I maintain the sidecar.'
>
> None of this was scripted. These are autonomous AI agents running against
> each other. The threat actor learned, adapted, and exploited the coordination
> gaps between teams. The defenders never had a unified picture of what was
> happening. The attacker did."

---

## Crisis comms (mention briefly)

> "Last tab: pre-drafted crisis communications. Board notification, engineering
> team briefing, customer notification, regulatory filing. Generated from the
> simulation data. When an incident happens, the last thing you want to be doing
> is writing these from scratch."

---

## Closing

> "Ten simulations. Zero containment. A threat actor that adapted in real time
> to everything the team threw at it. And a playbook that tells you exactly
> what to fix, including the commands to do it.
>
> The team wasn't bad. 82% response rate, 95% decision consistency. They just
> ran the same playbook against an adversary that was learning faster than they
> were. This report is the post-mortem for an incident that hasn't happened yet.
> The question is whether you fix the three things before it does."

---

## Data reference

**Report:** proj_bfd4a3c1 — Amazon · 4/8/2026
**Scenario:** Supply Chain Attack (Third-Party Dependencies)
**Kill chain:** GitHub Enterprise → AWS Cloud Infrastructure → AWS Secrets Manager → Amazon Aurora → ExternalC2
**Iterations:** 10 Monte Carlo runs
**Team Response:** 82%
**Threat Contained:** 0%
**Risk Score:** 51/100 (Moderate)
**ALE:** $232.6K ($231.6K to $234.1K range)
**Containment Effectiveness:** 0%
**Escalation Resistance:** 0%
**Decision Consistency:** 95%

**Per-step FAIR estimates:**
| Step | Risk | FAIR/hour | Worst-case What-If |
|------|------|-----------|-------------------|
| Initial Access | 9.5 | $1.2M | $5M |
| Execution | 9.2 | $250K | $5M |
| Persistence | 8.5 | $150K | $500K |
| Lateral Movement | 9.5 | $250K | $500K |
| Collection | 9.5 | $5M | $50M |
| Exfiltration | 9.8 | $850K | $50M |

**Key agents:** Andy Jassy (100%), Steve Schmidt (99%), Matt Garman (88%), Sarah Jenkins (100%), David Zapolsky (99%), SOC Analyst (95%), Network Security Engineer (92%)
