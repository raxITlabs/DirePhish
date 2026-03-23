<p align="center">
  <img src="./static/image/direphish-logo.png" alt="DirePhish" width="200" />
</p>

<h1 align="center">DirePhish</h1>
<p align="center"><em>Swarm-predict what goes wrong next</em></p>

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

## Quick start

### Prerequisites

- Node.js >= 18
- Python 3.11-3.12
- [uv](https://docs.astral.sh/uv/) package manager

### Install

```bash
npm run setup:all
```

### Configure

Copy `.env.example` to `.env` and set your API keys:

```bash
cp .env.example .env
```

Required:
- `LLM_API_KEY` — Google Gemini API key
- `LLM_MODEL_NAME` — model identifier (e.g., `gemini-2.5-flash`)

### Run

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5001

### Docker

Development (hot reload):

```bash
docker compose up
```

Production (`next build` + `next start`, Flask via Gunicorn):

```bash
docker compose -f docker-compose.prod.yml up --build
```

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Flask, Python 3.11+ |
| Models | Google Gemini with grounded search |
| Simulation | [Crucible](https://github.com/raxITlabs/crucible) (enterprise IR) + CAMEL-AI OASIS |
| Knowledge graph | Graphiti + Kuzu (local) |
| Orchestration | Vercel WDK (durable workflows) |
| Observability | OpenTelemetry |

## Links

- [raxIT Labs](https://raxit.ai) — the team behind DirePhish
- [Crucible](https://github.com/raxITlabs/crucible) — the enterprise simulation engine powering DirePhish
- [MiroFish](https://github.com/666ghj/MiroFish) — the open-source swarm intelligence engine we built on

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
