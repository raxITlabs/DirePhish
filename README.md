<p align="center">
  <img src="./static/image/direphish-logo.png" alt="DirePhish" width="200" />
</p>

<h1 align="center">DirePhish</h1>
<p align="center"><em>Clone your org as AI agents. Unleash a threat actor. Watch it cascade.</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
</p>

DirePhish builds a swarm of AI agents that think and act like your
organization -- your CISO, your SOC analysts, your PR team, your CEO.
Each agent has its own persona, memory, and decision-making logic,
grounded in real data scraped from your company. Then it drops a
threat actor into the mix and simulates how an incident proliferates
across Slack, email, and internal channels, round by round, until
containment or breach.

It doesn't guess what might happen. It runs the scenario dozens of
times with controlled variation -- different personalities under
pressure, different timing, different attacker moves -- and gives you
a probability distribution. "73% contained within 12 hours. 18%
lateral movement succeeded. 9% full regulatory escalation."

The output is an exercise report your board can read and your red team
can act on. A post-mortem for an incident that never happened.

<p align="center">
  <a href="demo/direphish.mp4">
    <img src="https://img.shields.io/badge/▶%20Watch%20Demo-67s-black?style=for-the-badge" alt="Watch Demo" />
  </a>
</p>
<p align="center"><sub>67 seconds. Amazon. Supply chain attack. 10 Monte Carlo runs. Zero containment.</sub></p>

- [Architecture & pipeline diagram](docs/ARCHITECTURE.md)
- [Full tech stack](docs/TECH_STACK.md)
- [GCP setup guide](docs/GCP_SETUP.md)

## Quick start

### Prerequisites

- Node.js >= 18
- Python 3.11-3.12
- [uv](https://docs.astral.sh/uv/) package manager
- A Google Cloud project with Firestore enabled -- [setup guide](docs/GCP_SETUP.md)

### Install

```bash
npm run setup:all
```

### Configure

```bash
cp .env.example .env
```

Required keys in `.env`:

- `LLM_API_KEY` -- Google Gemini API key
- `GOOGLE_CLOUD_PROJECT` -- your GCP project ID
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` -- for web crawling

### Create Firestore indexes

```bash
cd backend && bash scripts/create_firestore_indexes.sh
```

Wait for all indexes to show `READY` (`gcloud firestore indexes composite list`).

### Run

```bash
npm run dev
```

Open https://direphish.localhost (requires [portless](https://github.com/nicepkg/portless))
or http://localhost:3000 without it.

### First simulation

Enter a company URL, review the dossier, select **Test mode**, and launch.
The agents will research the company, generate threat scenarios, and run
a full incident simulation. Your first exercise report lands in about
25 minutes.

## Simulation modes

| Mode | What it does | Iterations | Time | Cost |
|------|-------------|-----------|------|------|
| Test | Validate the full pipeline end-to-end | 3 | ~25 min | ~$1 |
| Quick | Baseline for demos and quick reads | 10 | ~40 min | ~$7 |
| Standard | Client-ready statistical assessment | 50 | ~75 min | ~$35 |
| Deep | Maximum confidence, exhaustive analysis | 100+ | ~2 hr | ~$70+ |

Each iteration reruns the simulation with controlled variation --
temperature jitter, persona perturbation, inject timing shifts, agent
order shuffles -- so the outcome distribution reflects real uncertainty,
not a single lucky narrative. See [Monte Carlo details](docs/ARCHITECTURE.md#monte-carlo-simulation).

## What you get

A 5-view exercise report generated from simulation evidence:

- **Board View** -- KPIs, incident timeline, team performance metrics
- **CISO View** -- threat assessment, top risks, organizational impact
- **Security Team** -- role-by-role performance breakdown
- **Playbook** -- 6-part IR playbook from evidence through recovery
- **Risk Score** -- FAIR methodology with confidence intervals

Plus: outcome probability distributions, decision divergence analysis
(which agent's choice mattered most), and counterfactual branching
(fork any decision, replay the alternate timeline).

## How it works

DirePhish researches your target company, builds a dossier and knowledge
graph, generates threat scenarios mapped to MITRE ATT&CK, then expands
each scenario into a full simulation config -- agents with personas,
communication worlds, timed attack injects, and business pressures. A
live threat actor agent plays against your defenders with asymmetric
information. An arbiter LLM decides when to halt or inject twists.
After simulation, Monte Carlo reruns and counterfactual branching
produce the statistical foundation for the exercise report.

See [Architecture](docs/ARCHITECTURE.md) for the full pipeline diagram.

## Built on

DirePhish is built on [MiroFish](https://github.com/666ghj/MiroFish),
an open-source swarm intelligence engine that constructs parallel digital
worlds populated by thousands of AI agents with independent personalities,
memories, and behavioral logic. DirePhish takes that engine and points it
at cybersecurity -- replacing generic social simulation with incident
response, attack chains, and organizational crisis dynamics.

Simulation engine: [Crucible](https://github.com/raxITlabs/crucible).
Sharpened by [raxIT Labs](https://raxit.ai).

[Full tech stack ->](docs/TECH_STACK.md)

## Links

- [raxIT Labs](https://raxit.ai) -- the team behind DirePhish
- [Crucible](https://github.com/raxITlabs/crucible) -- the simulation engine powering DirePhish
- [MiroFish](https://github.com/666ghj/MiroFish) -- the swarm intelligence engine we built on

<p align="center">
  <a href="https://raxit.ai">Website</a> &middot;
  <a href="https://www.linkedin.com/company/raxit-ai">LinkedIn</a> &middot;
  <a href="https://bsky.app/profile/raxit.ai">Bluesky</a> &middot;
  <a href="https://x.com/raxit_ai">X</a>
</p>

## License

AGPL-3.0 -- see [LICENSE](LICENSE) for details.
