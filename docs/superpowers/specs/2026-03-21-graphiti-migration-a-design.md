# Graphiti Migration — Sub-spec A: Replace Zep + Episode Pushing

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Replace Zep Cloud SDK with self-hosted Graphiti + Kuzu embedded. Migrate research pipeline, simulation episode pushing, and graph visualization. After this spec, everything that worked with Zep works again with Graphiti, plus every simulation action is pushed as a temporal episode.

**Depends on:** None (first migration step)
**Enables:** Sub-spec B (agent memory queries + rich report agent)

---

## Goal

Swap `zep_cloud` for `graphiti-core[kuzu]`. No more vendor ceiling (Zep's 1,000 episodes/month). Self-hosted, zero-infra (Kuzu is embedded like SQLite). Every simulation action becomes a temporal episode in the knowledge graph, so the D3 visualization shows the graph growing in real-time during simulation.

## What Changes

| Component | Before (Zep) | After (Graphiti) |
|-----------|-------------|-----------------|
| Package | `zep-cloud` | `graphiti-core[kuzu]` |
| Graph DB | Zep Cloud (remote) | Kuzu embedded (local file) |
| Episode push | `client.graph.add(graph_id=..., data=..., type="text")` | `await graphiti.add_episode(name=..., episode_body=..., source=EpisodeType.text, ...)` |
| Node read | `client.graph.node.get_by_graph_id(graph_id=...)` | Raw Cypher via `driver.execute_query("MATCH (n:Entity) RETURN n")` |
| Edge read | `client.graph.edge.get_by_graph_id(graph_id=...)` | Raw Cypher via `driver.execute_query("MATCH (n)-[r]->(m) RETURN n,r,m")` |
| Graph create | `client.graph.create(graph_id=...)` | Implicit (Kuzu DB file per project, created on first `add_episode`) |
| Config | `ZEP_API_KEY` in .env | `GRAPHITI_DB_PATH` in .env (optional, defaults to `./data/graphiti`) |

### Key API Details

**Graphiti constructor** requires explicit LLM client and embedder:
```python
from graphiti_core import Graphiti
from graphiti_core.llm_client import OpenAIClient, LLMConfig
from graphiti_core.embedder import OpenAIEmbedder, EmbedderConfig
from graphiti_core.driver.kuzu_driver import KuzuDriver

kuzu_driver = KuzuDriver(db='/path/to/project.kuzu')
llm_client = OpenAIClient(LLMConfig(api_key=Config.LLM_API_KEY, base_url=Config.LLM_BASE_URL, model=Config.LLM_MODEL_NAME))
embedder = OpenAIEmbedder(EmbedderConfig(api_key=Config.LLM_API_KEY, base_url=Config.LLM_BASE_URL))
graphiti = Graphiti(graph_driver=kuzu_driver, llm_client=llm_client, embedder=embedder)
await graphiti.build_indices_and_constraints()
```

**Episode push** uses `source=` parameter (not `episode_type=`):
```python
await graphiti.add_episode(
    name="agent_round1_message",
    episode_body="Sarah Jenkins said: We need containment now.",
    source=EpisodeType.text,          # EpisodeType.message for conversation format
    source_description="Round 1 — IR War Room",
    reference_time=datetime.now(),
    group_id=project_id,              # logical partition within the DB
)
```

**D3 node/edge retrieval** uses raw Cypher queries against the Kuzu driver (not `graphiti.search()` which is for semantic retrieval):
```python
# Get all nodes
nodes = await driver.execute_query("MATCH (n:Entity) RETURN n")
# Get all edges
edges = await driver.execute_query("MATCH (n:Entity)-[r:RELATES_TO]->(m:Entity) RETURN n,r,m")
```

**Group IDs:** Each project sets `group_id=project_id` on all episodes. This allows logical isolation even though each project has its own Kuzu DB (belt and suspenders). The `get_graph_data()` function can use `group_id` to filter if needed.

## Architecture

```
Research Agent / Simulation Runner
    ↓ pushes episodes
Graphiti Core (Python, async)
    ↓ stores/queries
Kuzu Embedded DB (local file at data/graphiti/<project_id>.kuzu)
    ↓ read by
GraphitiManager service → Flask endpoints → Next.js frontend (D3)
```

Each project gets its own Kuzu database file. No shared state between projects.

---

## New Service: `graphiti_manager.py`

Replaces `zep_manager.py`. Single service for all Graphiti operations.

**Responsibilities:**
- Initialize Graphiti instance per project (lazy, cached)
- Push episodes (research dossier, simulation actions)
- Read nodes/edges for D3 visualization
- Sync dossier edits
- Close/cleanup instances

**Key design decisions:**

1. **One Kuzu DB per project** — each project gets `data/graphiti/{project_id}.kuzu/`. Isolation between projects. Easy cleanup (delete folder).

2. **Async wrapper for Flask** — Graphiti is async-first. Flask is sync. The manager uses `asyncio.run()` or maintains an event loop for async calls. Follow the same pattern the existing `graph_builder.py` uses.

3. **LLM client + embedder** — Graphiti needs both an LLM (for entity extraction) and an embedder (for vector search). Both use the same Gemini Flash Lite via OpenAI-compatible endpoint. Construct `OpenAIClient(LLMConfig(...))` and `OpenAIEmbedder(EmbedderConfig(...))` from `Config` values. If Gemini doesn't support embeddings, fall back to a local embedder or disable vector search.

4. **Cached instances** — `_graphiti_instances: dict[str, Graphiti]` caches initialized instances. Created on first access per project. Each instance holds its own KuzuDriver with an async event loop.

5. **Async execution** — All Graphiti calls are async. The manager uses a module-level event loop (`asyncio.new_event_loop()`) and runs coroutines with `loop.run_until_complete()`. This is the simplest Flask-compatible pattern. The loop is reused across calls to preserve Kuzu connection state.

6. **Episode pushing cost** — `add_episode()` triggers LLM entity extraction, which is slower than Zep's plain HTTP POST. For simulation action pushing, batch actions using `add_episode_bulk()` at the end of each round rather than one-by-one during status polling. This prevents blocking the status endpoint.

### API

```python
# Initialize/get Graphiti for a project
get_graphiti(project_id: str) -> Graphiti

# Push a single episode
push_episode(project_id: str, name: str, body: str, source: str, reference_time: datetime) -> None

# Push research dossier as structured episodes
push_dossier(project_id: str, dossier: dict) -> None

# Push a simulation action as an episode
push_action(project_id: str, action: dict) -> None

# Get nodes for D3 visualization
get_graph_nodes(project_id: str, query: str = "") -> list[dict]

# Get edges for D3 visualization
get_graph_edges(project_id: str, query: str = "") -> list[dict]

# Get full graph data for D3 (nodes + edges)
get_graph_data(project_id: str) -> dict  # {"nodes": [...], "edges": [...]}

# Sync dossier edits
sync_dossier(project_id: str, dossier: dict) -> None
```

---

## Changes to `research_agent.py`

Replace `_push_to_zep()` with calls to `graphiti_manager`:

**Before:**
```python
from zep_cloud.client import Zep
client = Zep(api_key=Config.ZEP_API_KEY)
client.graph.create(graph_id=graph_id, ...)
client.graph.add(graph_id=graph_id, data=text, type="text")
```

**After:**
```python
from . import graphiti_manager
graphiti_manager.push_dossier(project_id, dossier)
```

The `push_dossier()` method creates structured episodes from the dossier — one per org role, one per system, one per risk, one per compliance framework, one per event. Each episode includes `reference_time` for temporal tracking.

Remove all `zep_cloud` imports from `research_agent.py`.

---

## Changes to `crucible_manager.py`

Replace the `_push_new_actions_to_zep()` function with `graphiti_manager.push_action()`:

**Before:**
```python
from zep_cloud.client import Zep
client = Zep(api_key=Config.ZEP_API_KEY)
client.graph.add(graph_id=graph_id, data=text, type="text")
```

**After:**
```python
from . import graphiti_manager
graphiti_manager.push_action(project_id, action)
```

Each simulation action (Slack message, email) becomes a Graphiti episode with:
- `name`: `"{agent}_{round}_{action_type}"`
- `episode_body`: the full action content (message text, email body)
- `episode_type`: `EpisodeType.message`
- `reference_time`: the action's timestamp (for temporal ordering)
- `source_description`: `"Round {round} — {world}"`

The `project_id` is derived from the `sim_id` (which starts with `proj_` for research-launched sims).

---

## Changes to Flask Endpoints (`crucible.py`)

### Project graph endpoint
`GET /api/crucible/projects/<id>/graph` — replace `zep_manager.get_graph_data()` with `graphiti_manager.get_graph_data(project_id)`.

### Simulation graph endpoint
`GET /api/crucible/simulations/<id>/graph` — replace Zep graph lookup with `graphiti_manager.get_graph_data(project_id)` when project exists.

### Dossier update endpoint
`PUT /api/crucible/projects/<id>/dossier` — replace `zep_manager.sync_dossier_to_zep()` with `graphiti_manager.sync_dossier(project_id, dossier)`.

---

## Changes to `config.py`

Keep `ZEP_API_KEY` (still used by original MiroFish OASIS flow). Add:
```python
GRAPHITI_DB_PATH = os.environ.get('GRAPHITI_DB_PATH', os.path.join(os.path.dirname(__file__), '../data/graphiti'))
```

Update `Config.validate()` to make `ZEP_API_KEY` optional (warning, not error):
```python
if not cls.ZEP_API_KEY:
    errors.append("ZEP_API_KEY is not configured")  # change to warning
```

**graph_id handling:** The existing code stores `graph_id` on the project record and checks `status.get("graph_id")` in `crucible_manager.py`. With Graphiti, set `graph_id = project_id` as a sentinel value. The graphiti_manager uses `project_id` to locate the Kuzu DB file. No change needed to the project data model — `graph_id` is just always equal to `project_id`.

---

## Changes to `backend/pyproject.toml`

Add dependency (check PyPI for latest version supporting KuzuDriver):
```toml
"graphiti-core[kuzu]>=0.17.0",
```

Remove (from Crucible code only — original MiroFish still uses it):
Nothing — `zep-cloud` stays as a dependency for the OASIS flow.

---

## D3 Visualization Data Format

`get_graph_data()` returns the same `{"nodes": [...], "edges": [...]}` format the frontend already expects:

```json
{
  "nodes": [
    {"id": "uuid", "name": "Sarah Jenkins", "type": "agent", "attributes": {"role": "CEO", "summary": "..."}}
  ],
  "edges": [
    {"source": "uuid1", "target": "uuid2", "label": "REPORTS_TO", "type": "reports_to"}
  ]
}
```

The `_classify_node()` logic moves from `zep_manager.py` to `graphiti_manager.py`. Note: Graphiti's `EntityNode` has `name`, `summary`, and `attributes` but no `labels` list like Zep. Classification uses node `name` and `summary` text matching instead of label matching. Same target types (agent, org, threat, compliance, system).

---

## Files Changed

| File | Action |
|------|--------|
| `backend/app/services/graphiti_manager.py` | **Create** — new service |
| `backend/app/services/research_agent.py` | **Modify** — replace `_push_to_zep` with graphiti_manager calls |
| `backend/app/services/crucible_manager.py` | **Modify** — replace `_push_new_actions_to_zep` with graphiti_manager calls |
| `backend/app/services/zep_manager.py` | **Delete** — replaced by graphiti_manager |
| `backend/app/api/crucible.py` | **Modify** — swap zep_manager imports to graphiti_manager |
| `backend/app/config.py` | **Modify** — add GRAPHITI_DB_PATH |
| `backend/pyproject.toml` | **Modify** — add graphiti-core[kuzu] |
| `.env` | **Modify** — add GRAPHITI_DB_PATH (optional) |
| `.env.example` | **Modify** — add GRAPHITI_DB_PATH |

## Files NOT Changed

- All frontend code (types, components, pages, server actions) — unchanged. The API contract stays the same.
- `run_crucible_simulation.py` — unchanged in this sub-spec (agent memory queries come in Sub-spec B)
- `generate_after_action_report.py` — unchanged (rich report agent comes in Sub-spec B)
- Original MiroFish services (graph_builder, zep_tools, etc.) — untouched

---

## Testing

1. Install: `cd backend && uv pip install graphiti-core[kuzu]`
2. Start: `./start.sh`
3. Enter CommBank URL → Start Research → verify dossier generates
4. Confirm dossier → verify graph shows nodes in D3 (from Graphiti, not Zep)
5. Generate config → Launch simulation → verify actions appear in Slack/Email tabs
6. Verify graph GROWS during simulation (new nodes/edges appear on Refresh)
7. Verify `data/graphiti/proj_*/` directories contain Kuzu DB files

---

## Out of Scope (Sub-spec B)

- Agent memory queries during simulation (querying Graphiti before each agent action)
- Rich report agent with Graphiti-backed retrieval
- Temporal queries ("what did agents know at round 3 vs round 5")
- Custom ontology/entity types for Crucible domain
