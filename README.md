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

### Google Cloud setup (for Monte Carlo + advanced features)

Monte Carlo simulation, Firestore vector memory, and stress testing require a
GCP project with Firestore enabled. One-time setup:

```bash
# 1. Install gcloud CLI (if not already installed)
brew install google-cloud-sdk

# 2. Authenticate
gcloud auth login
gcloud auth application-default login

# 3. Create or select a GCP project
gcloud projects create direphish-sim --name="DirePhish Simulation"
# OR use an existing project:
gcloud config set project YOUR_PROJECT_ID

# 4. Enable the Firestore API
gcloud services enable firestore.googleapis.com

# 5. Create Firestore database (must be Native mode, not Datastore)
gcloud firestore databases create --location=us-east1 --type=firestore-native

# 6. Create vector search indexes (takes 2-5 minutes)
cd backend && bash scripts/create_firestore_indexes.sh

# 7. Add to your .env
echo "GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID" >> ../.env
```

Check index status: `gcloud firestore indexes composite list` — all should
show `READY` before running simulations.

Optional tuning in `.env`:
```env
GEMINI_EMBEDDING_MODEL=gemini-embedding-001   # embedding model
GEMINI_EMBEDDING_DIMENSIONS=768                # vector dimensions
MONTE_CARLO_MAX_WORKERS=3                      # concurrent sim iterations
GEMINI_RPM_LIMIT=60                            # API rate limit (free: 30, paid: 1500)
```

### Run

```bash
npm run dev
```

- Frontend: https://direphish.localhost
- Backend API: https://api.direphish.localhost

> Requires [portless](https://github.com/nicepkg/portless) installed globally
> (`npm install -g portless`). One-time setup: `portless proxy start --https`.
> Without portless, the apps still work at `http://localhost:3000` and
> `http://localhost:5001`.

### Docker

Copy `.env.example` to `.env` and set your API keys before running either stack.

**Development** (hot reload):

```bash
docker compose up --build
```

**Production** (`next build` + `next start`, Flask via Gunicorn):

```bash
docker compose -f docker-compose.prod.yml up --build
```

Both stacks expose:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5001

**Portless URLs for Docker** — register the container ports with portless:

```bash
npm run docker:alias
```

Then access via https://direphish.localhost and https://api.direphish.localhost.

**Custom ports** — if 3000 or 5001 are already in use, set overrides in `.env`:

```env
HOST_PORT_FRONTEND=3010
HOST_PORT_BACKEND=5010
```

**Data persistence** — workflow run history is stored in a named Docker volume
(`workflow-data`). It survives `docker compose down` but is removed by
`docker compose down -v`. Backend uploads are bind-mounted to `./backend/uploads`.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Backend | Flask, Python 3.11+ |
| Models | Google Gemini with grounded search |
| Simulation | [Crucible](https://github.com/raxITlabs/crucible) (enterprise IR) + Monte Carlo engine |
| Memory | Google Cloud Firestore Vector Search (replaces local Graphiti/Kuzu) |
| Embeddings | Gemini Embedding API (768-dim vectors) |
| Orchestration | Vercel WDK (durable workflows) |
| Observability | OpenTelemetry |

## Monte Carlo simulation

Run the same threat scenario 50-100 times with controlled variation to get
probabilistic threat intelligence instead of a single narrative.

**Graduated test mode** — start small, scale up:

| Mode | Iterations | Workers | Cost estimate |
|------|-----------|---------|---------------|
| Test | 3 | 1 (sequential) | ~$0.30 |
| Quick | 10 | 2 | ~$1.00 |
| Standard | 50 | 3 | ~$5.00 |
| Deep | 100+ | 3 | ~$10.00+ |

Must complete a test run before unlocking standard/deep. Cost tracking at
every level with hard spend limits.

**What you get:**
- Outcome probability distribution (73% contained, 18% escalated, 9% breach)
- Mean time to containment with standard deviation
- Decision divergence analysis — which round and which agent's choice matters most
- Agent consistency scores — who behaves predictably vs erratically under pressure
- Cost extrapolation from test runs to estimate larger batches

**Advanced simulation features:**
- **Adversarial agent** — live threat actor LLM playing against defenders with asymmetric information
- **Adaptive depth** — simulations run until resolved (not a fixed timer), governed by an arbiter LLM
- **Counterfactual branching** — fork any sim from any round, change one decision, compare outcomes
- **Stress testing** — 11 automatic config mutations (remove agents, add insiders, kill comms, halve timers) with resilience scoring

## Links

- [raxIT Labs](https://raxit.ai) — the team behind DirePhish
- [Crucible](https://github.com/raxITlabs/crucible) — the enterprise simulation engine powering DirePhish
- [MiroFish](https://github.com/666ghj/MiroFish) — the open-source swarm intelligence engine we built on

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
