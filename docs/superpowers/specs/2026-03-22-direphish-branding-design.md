# DirePhish Branding Design Spec

## Decision Summary

| Decision | Choice |
|----------|--------|
| Product name | DirePhish |
| Attribution | DirePhish by raxIT Labs |
| Repo name | `raxITlabs/DirePhish` |
| Tagline | "Swarm-predict what goes wrong next" |
| Target audience | Developer / open-source community (primary), enterprise security teams (secondary) |
| Tone | Playful and memorable |
| MiroFish lineage | In the name itself — clear riff on MiroFish |
| raxIT relationship | Company behind the tool, not in the product name |

## Name: DirePhish

A play on "dire" (dire prediction, dire warning) + "phish" (security culture reference to phishing). Sounds like MiroFish but immediately signals threat/security context. The "ph" spelling winks at the #1 attack vector while the name is about something bigger — swarm intelligence predicting what goes wrong.

### Origin story (for README/docs)

> DirePhish is built on top of MiroFish, the open-source swarm intelligence engine.
> We took its multi-agent simulation core and pointed it at a single question:
> what's about to go wrong?

## Visual Identity Direction

### Color palette

Aligned with the existing OKLCH warm orange/teal theme:

- **Primary:** Deep orange/amber — the "dire warning" color, alarm energy
- **Accent:** Dark teal — the deep water where the phish swims, contrasts the warmth
- **Neutral:** Warm grays — keeps the light-mode-first aesthetic clean
- **Danger/alert states:** Red-orange — natural extension for threat severity indicators

### Logo concept

- Stylized fish silhouette with angular, geometric edges — not cute, not corporate
- A fish made of warning signs or signal waves
- The "ph" in DirePhish can be subtly emphasized in the wordmark (`Dire`**`Ph`**`ish`) to wink at the phishing double meaning
- Must be monospace-friendly — should look good as ASCII art in a terminal README

### Typography

- Monospace for the wordmark (fits dev audience and existing font preference)
- Clean sans-serif for docs/marketing copy

### Iconography style

- Geometric, angular line art — not rounded/friendly, not hyperrealistic
- Fish + signal/radar/wave motifs where appropriate

## README Structure

```markdown
# DirePhish
> Swarm-predict what goes wrong next

DirePhish spawns autonomous agents that act as your organization —
then simulates a threat scenario playing out across Slack and email
to see how it cascades.

## What happens when you point it at a company

DirePhish crawls the company website, searches for security incidents,
leadership changes, regulatory actions, tech stack details, and recent
news — then cross-references everything against uploaded documents and
user context. It builds a structured dossier covering:

- Org structure with named executives and security-relevant roles
- Technology systems — cloud, databases, SIEM, identity, CI/CD
- Compliance posture — certifications, frameworks, security tools
- Geopolitical exposure — sanctions, trade restrictions, regional
  conflicts, state-sponsored cyber threats, data sovereignty laws,
  and supply chain dependencies in sensitive regions
- Recent events — breaches, acquisitions, layoffs, regulatory shifts,
  sanctions, trade wars, and conflicts in their operating countries
- Industry-specific risks with affected systems and mitigations
- AI and emerging tech exposure — shadow AI, model security, new attack surface

You review the dossier. Edit anything that's wrong. Then DirePhish
uses it to generate threat scenarios, spin up agents that behave like
your real team, and simulate the incident across Slack and email.

## What you get

- A full incident timeline — who said what, when, and on which channel
- A breakdown of where response coordination failed
- Multiple scenarios compared side by side — which threat hurts most
- A report with concrete recommendations, written before anything broke

Think of it as a post-mortem for an incident that never happened.

Built on [MiroFish](https://github.com/666ghj/MiroFish).
Sharpened by [raxIT Labs](https://raxit.ai).

## How it works

1. **Research** — crawls websites, runs grounded searches, processes
   your documents, and synthesizes a structured company dossier
2. **Threat model** — generates scenarios from real-world signals,
   maps kill chains, scores probability and severity
3. **Simulate** — agents act out the incident across Slack and email,
   escalating, miscommunicating, reacting — just like your real team
4. **Report** — get the post-mortem, comparative analysis, and
   recommendations before anything real goes wrong
```

## Repo and GitHub Branding

### GitHub repo settings

- **Repo:** `raxITlabs/DirePhish`
- **Description:** "Swarm-predict what goes wrong next. Enterprise threat simulation powered by multi-agent intelligence."
- **Topics:** `swarm-intelligence`, `threat-simulation`, `incident-response`, `multi-agent`, `prediction-engine`, `mirofish`

### Links section in README

```markdown
## Links

- [raxIT Labs](https://raxit.ai) — the team behind DirePhish
- [MiroFish](https://github.com/666ghj/MiroFish) — the open-source engine we built on
- [Documentation](https://docs.raxit.ai/direphish) — guides and API reference
- [Community](https://discord.gg/raxit) — support and discussion
```

(Adjust URLs to whatever is live — these are placeholder patterns.)

### Codebase naming

- The **Crucible** engine name stays — it's the IR simulation pipeline, internal to DirePhish
- API routes stay as-is (`/api/crucible/*`, `/api/simulation/*`) — no need to rename internals
- Browser tab title: "DirePhish — by raxIT Labs"
- Header component: "DirePhish" wordmark with the angular fish icon

## Key Differentiators to Communicate

What makes DirePhish different from the original MiroFish:

1. **Google Gemini models** with grounded search — research is backed by real-time web intelligence, not static data
2. **Geopolitical risk layer** — doesn't just look at the company, looks at where they operate: sanctions, trade restrictions, regional conflicts, state-sponsored threats, supply chain dependencies
3. **Enterprise IR focus** — not general-purpose prediction, specifically simulates what can go wrong for an organization
4. **Slack and email simulation** — agents communicate on real enterprise channels, not abstract social platforms
5. **Editable dossier** — the user reviews and corrects the research before simulation runs, keeping the human in the loop
6. **Full observability** — OpenTelemetry tracing, Vercel WDK durable workflows, cost tracking
7. **Next.js frontend** — modern React 19 app replacing the original Vue.js interface

## Licensing

The original MiroFish is licensed under AGPL-3.0. DirePhish maintains this license. The LICENSE file stays as-is. Attribution to the original project is handled via the README origin story and the `mirofish` GitHub topic tag.

## Tone Clarification

"Playful and memorable" applies to the **name and copy** — the wordplay, the voice, the tagline. The **visual identity** leans serious/technical — angular, geometric, not cute. These work together: a name with personality backed by visuals that earn credibility.

## Codebase Rename Scope

References to "MiroFish" in internal code (config, services, scripts, pyproject.toml) are renamed to "DirePhish" where they are user-facing or appear in logs/output. Internal variable names and comments that reference the upstream project for context can stay.

## What This Spec Does NOT Cover

- Logo artwork / final design files (needs a designer)
- Favicon / og-image / social preview assets (deferred to design phase)
- Marketing website copy beyond README
- Detailed color token values (existing OKLCH theme applies)
- Social media / launch strategy
- File-level implementation checklist (covered in the implementation plan)
