# Tech Stack

## Frontend

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

## Backend

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

## AI / Models

| Technology | Purpose |
|------------|---------|
| [Google Gemini](https://ai.google.dev/) | LLM for research, threat analysis, config expansion, report generation |
| [Gemini Embedding API](https://ai.google.dev/gemini-api/docs/embeddings) | 768-dim vectors for Firestore vector search (`gemini-embedding-001`) |
| [Gemini Grounded Search](https://ai.google.dev/gemini-api/docs/grounding) | Web search during research phase |

## Simulation Engine

| Technology | Version | Purpose |
|------------|---------|---------|
| [Crucible](https://github.com/raxITlabs/crucible) | git | Enterprise incident response simulation engine |
| [CAMEL-AI](https://github.com/camel-ai/camel) | 0.2.78 | Multi-agent framework powering agent personas and interactions |
| [CAMEL-OASIS](https://github.com/camel-ai/oasis) | 0.2.5 | Social simulation platform (upstream agent runtime) |
| Monte Carlo Engine | -- | Parallel iterations with 4 variation axes (temperature, persona, timing, order) |
| Counterfactual Engine | -- | Fork simulations at decision points, replay alternate timelines |

## Data & Memory

| Technology | Version | Purpose |
|------------|---------|---------|
| [Google Cloud Firestore](https://cloud.google.com/firestore) | 2.16+ | Vector search over simulation episodes, knowledge graph persistence |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) | -- | Web scraping via `/crawl` API during research |

## Orchestration & Observability

| Technology | Version | Purpose |
|------------|---------|---------|
| [Vercel WDK](https://vercel.com/docs/workflow-kit) | 4.2-beta | Durable 9-step pipeline workflows with streaming progress |
| [OpenTelemetry](https://opentelemetry.io/) | 1.40+ | Distributed tracing across LLM calls and pipeline stages |

## Dev Tooling

| Technology | Purpose |
|------------|---------|
| [uv](https://docs.astral.sh/uv/) | Python package manager and virtual environment |
| [pnpm](https://pnpm.io/) | Frontend package manager |
| [portless](https://github.com/nicepkg/portless) | Local HTTPS dev URLs (`direphish.localhost`, `api.direphish.localhost`) |
| [concurrently](https://github.com/open-cli-tools/concurrently) | Parallel backend + frontend dev server runner |
| [wait-on](https://github.com/jeffbski/wait-on) | Backend health check before frontend starts |
| [Hatchling](https://hatch.pypa.io/) | Python build backend |
