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

<p align="center">
  <img src="./docs/architecture/pipeline-flow.png" alt="DirePhish Pipeline" width="700" />
</p>
<p align="center">
  <img src="./docs/architecture/system-architecture.png" alt="System Architecture" width="700" />
</p>

```
 YOU                                           DIREPHISH
  |
  |  company.com + context
  v
┌─────────────────────────────────────────────────────────────────┐
│ 1. RESEARCH                                                     │
│    Crawl website ─► Gemini grounded search (5 queries) ─► LLM   │
│    synthesis ─► structured dossier + knowledge graph            │
│                                                                 │
│    Output:  8-15 roles, 7-12 systems, 5-8 risks, 5+ events      │
│    Stores:  dossier.json (disk)                                 │
│             sim_episodes (Firestore, 28 vector-embedded chunks) │
│             graph_nodes + graph_edges (Firestore, ~30 entities) │
└──────────────────────────┬──────────────────────────────────────┘
                           │ dossier + graph
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 2. DOSSIER REVIEW                                               │
│    You review and edit the dossier before simulation begins.    │
│    Fix roles, add systems, adjust risks.                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ confirmed dossier
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 3. THREAT ANALYSIS (4 LLM calls)                                │
│    Analyze threat landscape ─► map vulnerabilities ─►           │
│    generate attack paths ─► frame scenarios with                │
│    uncertainty axes. Maps MITRE ATT&CK kill chains.             │
│                                                                 │
│    Output:  3-5 ranked scenarios with attack paths              │
│    Stores:  threat_analysis.json (disk)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ top 1-2 scenarios
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 4. CONFIG EXPANSION (5 LLM calls per scenario)                  │
│    Generates full simulation config from scenario + graph:      │
│    ├── Agent personas (grounded in org hierarchy from graph)    │
│    ├── Communication worlds (Slack channels, email threads)     │
│    ├── Timed injects (grounded in system dependencies)          │
│    ├── Business pressures (countdowns, deadlines)               │
│    └── Auto-injects: threat actor + adaptive depth              │
│                                                                 │
│    The threat actor gets attacker intelligence from the graph:  │
│    critical systems ranked by connectivity, lateral movement    │
│    paths, defender blind spots.                                 │
│                                                                 │
│    Output:  scenarios/<id>.json with 8-14 agents, 3-5 worlds,   │
│             8-15 injects, adaptive depth (3-30 rounds)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ simulation config(s)
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 5. SIMULATION (parallel worlds, async LLM calls)                │
│                                                                 │
│    Each round:                                                  │
│    ├── Attacker phase: threat actor reads defender channels,    │
│    │   acts in C2 (invisible to defenders)                      │
│    ├── Defender phase: all agents act in parallel across worlds │
│    ├── Memory: Firestore vector search for agent recall         │
│    ├── Graph: each agent gets org context (who they manage,     │
│    │   what systems they own, who they report to)               │
│    └── Arbiter: LLM evaluates — continue / halt / inject twist  │
│                                                                 │
│    Runs until arbiter halts (adaptive) or max rounds reached.   │
│    ~20-25s per round (12x faster than sequential).              │
│                                                                 │
│    Stores:  actions.jsonl, checkpoints/round_N.json (disk)      │
│             sim_episodes (Firestore, batch per round)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ completed simulation(s)
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 6. MONTE CARLO — run the sim N times with controlled variation  │
│                                                                 │
│    ┌──────────┬──────┬─────────┬───────────┬────────┐            │
│    │   Mode   │ Iter │ Workers │ Max rnds  │  Cost  │            │
│    ├──────────┼──────┼─────────┼───────────┼────────┤            │
│    │ Test     │   3  │    2    │ 10 (7 ag) │  ~$1   │            │
│    │ Quick    │  10  │    2    │ 30        │  ~$7   │            │
│    │ Standard │  50  │    3    │ 30        │  ~$35  │            │
│    │ Deep     │ 100+ │    3    │ 30        │  ~$70+ │            │
│    └──────────┴──────┴─────────┴───────────┴────────┘            │
│                                                                 │
│    4 variation axes per iteration (seeded, reproducible):       │
│    temperature jitter · persona perturbation ·                  │
│    inject timing shift · agent order shuffle                    │
│                                                                 │
│    Output:  outcome distribution, containment stats,            │
│             decision divergence, agent consistency scores       │
│    Stores:  mc_aggregates (Firestore)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ aggregate results
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 7. COUNTERFACTUAL — what if they decided differently?           │
│                                                                 │
│    LLM identifies 3-5 critical decision points from the sim.    │
│    Forks top 1-2 decisions from checkpoint, replays with        │
│    modifications (override agent, inject event, remove action). │
│    Compares: original outcome vs alternate timeline.            │
│                                                                 │
│    Stores:  branch configs + actions (disk), episodes           |
|    (Firestore)                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ all simulation data + MC stats + branches
                           v
┌─────────────────────────────────────────────────────────────────┐
│ 8. EXERCISE REPORT                                              │
│                                                                 │
│    ReACT agent with Firestore vector search tools generates     │
│    executive-grade report across 5 views:                       │
│    ├── Board View — KPIs, incident timeline, team metrics       │
│    ├── CISO View — threat assessment, top risks, org impact     │
│    ├── Security Team — role-specific performance breakdown      │
│    ├── Playbook — 6-part IR playbook (evidence → recovery)      │
│    └── Risk Score — FAIR methodology, confidence intervals      │
│                                                                 │
│    All in predictive language — this is a forecast, not a       │
│    post-mortem.                                                 │
└─────────────────────────────────────────────────────────────────┘

Data stores:
  Firestore:  sim_episodes · graph_nodes · graph_edges · mc_aggregates · risk_scores
  Disk:       dossier.json · threat_analysis.json · scenarios/*.json · actions.jsonl
```

**What the numbers mean:** In test mode, DirePhish runs 3 Monte Carlo
iterations with a capped config (7 agents, 3 worlds, max 10 rounds)
and 1 counterfactual fork — enough to validate the entire pipeline
end-to-end in ~3-5 minutes. In standard mode, 50 iterations with full
configs produce statistically meaningful outcome distributions: "73%
contained within 12 hours, 18% lateral movement succeeded, 9% full
regulatory escalation."

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

## Tech stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| [Next.js](https://nextjs.org/) | 16.2 | App router, server actions, API routes |
| [React](https://react.dev/) | 19.2 | UI rendering with server components |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Strict type safety across the entire frontend |
| [Tailwind CSS](https://tailwindcss.com/) | 4 | Utility-first styling |
| [shadcn/ui](https://ui.shadcn.com/) | 4.1 | Component library (Radix + Tailwind) |
| [Base UI](https://base-ui.com/) | 1.3 | Headless UI primitives |
| [D3.js](https://d3js.org/) | 7.9 | Force-directed knowledge graph visualization |
| [XYFlow](https://reactflow.dev/) | 12.10 | Pipeline canvas node graph |
| [dagre](https://github.com/dagrejs/dagre) | 0.8 | Directed graph layout algorithm (used with XYFlow) |
| [Motion](https://motion.dev/) | 12.38 | Animations and transitions |
| [Zod](https://zod.dev/) | 4.3 | Schema validation |
| [TanStack Form](https://tanstack.com/form) | 1.28 | Dossier editor form management |
| [react-markdown](https://github.com/remarkjs/react-markdown) | 10.1 | Report markdown rendering |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | 4.0 | GitHub-flavored markdown tables, task lists |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | 4.7 | Split-panel layouts (research, simulation, report views) |
| [Lucide](https://lucide.dev/) | 0.577 | Icon set |
| [Playwright](https://playwright.dev/) | 1.58 | End-to-end testing |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Runtime |
| [Flask](https://flask.palletsprojects.com/) | 3.0+ | REST API server |
| [Flask-CORS](https://flask-cors.readthedocs.io/) | 6.0+ | Cross-origin request handling |
| [Gunicorn](https://gunicorn.org/) | 23.0+ | Production WSGI server |
| [OpenAI SDK](https://github.com/openai/openai-python) | 1.0+ | Unified LLM client (OpenAI-compatible format, points to Gemini) |
| [google-genai](https://github.com/googleapis/python-genai) | 1.0+ | Gemini SDK for embeddings and grounded search |
| [Pydantic](https://docs.pydantic.dev/) | 2.0+ | Data validation and serialization |
| [PyMuPDF](https://pymupdf.readthedocs.io/) | 1.24+ | PDF document parsing |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | 1.0+ | Environment variable loading |

### AI / Models

| Technology | Purpose |
|------------|---------|
| [Google Gemini](https://ai.google.dev/) | LLM for research, threat analysis, config expansion, report generation |
| [Gemini Embedding API](https://ai.google.dev/gemini-api/docs/embeddings) | 768-dim vectors for Firestore vector search (`gemini-embedding-001`) |
| [Gemini Grounded Search](https://ai.google.dev/gemini-api/docs/grounding) | Web search during research phase |

### Simulation Engine

| Technology | Version | Purpose |
|------------|---------|---------|
| [Crucible](https://github.com/raxITlabs/crucible) | git | Enterprise incident response simulation engine |
| [CAMEL-AI](https://github.com/camel-ai/camel) | 0.2.78 | Multi-agent framework powering agent personas and interactions |
| [CAMEL-OASIS](https://github.com/camel-ai/oasis) | 0.2.5 | Social simulation platform (upstream agent runtime) |
| Monte Carlo Engine | — | Parallel iterations with 4 variation axes (temperature, persona, timing, order) |
| Counterfactual Engine | — | Fork simulations at decision points, replay alternate timelines |

### Data & Memory

| Technology | Version | Purpose |
|------------|---------|---------|
| [Google Cloud Firestore](https://cloud.google.com/firestore) | 2.16+ | Vector search over simulation episodes, knowledge graph persistence |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) | — | Web scraping via `/crawl` API during research |

### Orchestration & Observability

| Technology | Version | Purpose |
|------------|---------|---------|
| [Vercel WDK](https://vercel.com/docs/workflow-kit) | 4.2-beta | Durable 9-step pipeline workflows with streaming progress |
| [OpenTelemetry](https://opentelemetry.io/) | 1.40+ | Distributed tracing across LLM calls and pipeline stages |

### Dev Tooling

| Technology | Purpose |
|------------|---------|
| [uv](https://docs.astral.sh/uv/) | Python package manager and virtual environment |
| [pnpm](https://pnpm.io/) | Frontend package manager |
| [portless](https://github.com/nicepkg/portless) | Local HTTPS dev URLs (`direphish.localhost`, `api.direphish.localhost`) |
| [concurrently](https://github.com/open-cli-tools/concurrently) | Parallel backend + frontend dev server runner |
| [wait-on](https://github.com/jeffbski/wait-on) | Backend health check before frontend starts |
| [Hatchling](https://hatch.pypa.io/) | Python build backend |

## Monte Carlo simulation

Run the same threat scenario 50-100 times with controlled variation to get
probabilistic threat intelligence instead of a single narrative.

**Graduated test mode** — start small, scale up:

| Mode | Iterations | Workers | Max rounds | Agents | Cost est. |
|------|-----------|---------|------------|--------|-----------|
| Test | 3 | 2 | 10 | 7 | ~$1 |
| Quick | 10 | 2 | 30 | 8-14 | ~$7 |
| Standard | 50 | 3 | 30 | 8-14 | ~$35 |
| Deep | 100+ | 3 | 30 | 8-14 | ~$70+ |

Test mode runs 3 iterations with a capped config (7 agents, 3 worlds, max 10
rounds) for fast end-to-end validation in ~3-5 minutes. Must complete a test run before
unlocking standard/deep. Cost tracking at every level with hard spend limits.

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
