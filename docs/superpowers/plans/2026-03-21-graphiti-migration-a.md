# Graphiti Migration (Sub-spec A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Zep Cloud SDK with self-hosted Graphiti + Kuzu embedded. Every simulation action becomes a temporal episode. Graph visualization uses real Graphiti data.

**Architecture:** `graphiti_manager.py` wraps all Graphiti operations with a cached instance per project. Each project gets its own Kuzu DB file at `data/graphiti/{project_id}/`. Research agent and simulation manager call graphiti_manager instead of zep_manager. D3 visualization reads nodes/edges via raw Cypher queries against Kuzu.

**Tech Stack:** graphiti-core 0.28.2, kuzu 0.11.3, Python 3.12, UV

**Spec:** `docs/superpowers/specs/2026-03-21-graphiti-migration-a-design.md`

---

## File Structure

### New Files
```
backend/app/services/graphiti_manager.py   # All Graphiti operations (replaces zep_manager.py)
backend/data/graphiti/                     # Kuzu DB files per project (auto-created)
```

### Modified Files
```
backend/app/services/research_agent.py     # Replace _push_to_zep with graphiti_manager calls
backend/app/services/crucible_manager.py   # Replace _push_new_actions_to_zep with graphiti_manager
backend/app/api/crucible.py                # Replace zep_manager imports with graphiti_manager
backend/app/config.py                      # Add GRAPHITI_DB_PATH, relax ZEP_API_KEY validation
backend/pyproject.toml                     # Add graphiti-core, kuzu dependencies
.env                                       # Add GRAPHITI_DB_PATH
.env.example                               # Add GRAPHITI_DB_PATH
```

### Deleted Files
```
backend/app/services/zep_manager.py        # Replaced by graphiti_manager.py
```

---

## Verified API (graphiti-core 0.28.2)

```python
# Init
from graphiti_core import Graphiti
from graphiti_core.driver.kuzu_driver import KuzuDriver
from graphiti_core.llm_client import OpenAIClient, LLMConfig
from graphiti_core.embedder import OpenAIEmbedder
from graphiti_core.embedder.openai import OpenAIEmbedderConfig
from graphiti_core.nodes import EpisodeType, EntityNode  # EntityNode has: uuid, name, group_id, summary, attributes
from graphiti_core.edges import EntityEdge  # has: name, fact, valid_at, expired_at, source_node_uuid (on parent)

# Construct
driver = KuzuDriver(db='/path/to/project.kuzu')
llm = OpenAIClient(LLMConfig(api_key="...", base_url="...", model="..."))
embedder = OpenAIEmbedder(OpenAIEmbedderConfig(api_key="...", base_url="..."))
g = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
await g.build_indices_and_constraints()

# Push episode
await g.add_episode(name="...", episode_body="...", source=EpisodeType.text,
                    source_description="...", reference_time=datetime.now(), group_id="project_id")

# Search (returns list[EntityEdge])
edges = await g.search(query="...", group_ids=["project_id"], num_results=10)
# Each edge has: .name, .fact, .valid_at, .source_node_uuid, .target_node_uuid

# Raw Cypher (for D3 — get ALL nodes/edges)
results = await driver.execute_query("MATCH (n:Entity) RETURN n")
# Returns: tuple[list[dict], None, None]
```

---

## Task 1: Install Dependencies + Config

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/config.py`
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Add graphiti-core and kuzu to pyproject.toml**

In `backend/pyproject.toml`, add to `dependencies`:
```toml
"graphiti-core>=0.28.0",
"kuzu>=0.11.0",
```

- [ ] **Step 2: Install**

```bash
cd backend && uv sync
```

- [ ] **Step 3: Add GRAPHITI_DB_PATH to config.py**

In `backend/app/config.py`, after the Cloudflare config section, add:
```python
# Graphiti (local knowledge graph)
GRAPHITI_DB_PATH = os.environ.get('GRAPHITI_DB_PATH', os.path.join(os.path.dirname(__file__), '../data/graphiti'))
```

- [ ] **Step 4: Relax ZEP_API_KEY validation**

In `backend/app/config.py`, change the `validate()` method to make ZEP_API_KEY a warning not an error:
```python
@classmethod
def validate(cls):
    """Validate required configuration"""
    errors = []
    if not cls.LLM_API_KEY:
        errors.append("LLM_API_KEY is not configured")
    # ZEP_API_KEY is optional (only needed for OASIS flow, not Crucible)
    return errors
```

- [ ] **Step 5: Add GRAPHITI_DB_PATH to .env and .env.example**

Add to both files:
```
# Graphiti (local knowledge graph — Kuzu embedded, no external DB needed)
GRAPHITI_DB_PATH=./data/graphiti
```

- [ ] **Step 6: Verify import works**

```bash
cd backend && uv run python -c "from graphiti_core import Graphiti; from graphiti_core.driver.kuzu_driver import KuzuDriver; print('OK')"
```

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/app/config.py .env .env.example
git commit -m "feat: add graphiti-core + kuzu dependencies and config"
```

---

## Task 2: Create graphiti_manager.py

The core new service. Replaces `zep_manager.py`.

**Files:**
- Create: `backend/app/services/graphiti_manager.py`

**Reference files to read first:**
- `backend/app/config.py` — Config.LLM_API_KEY, Config.LLM_BASE_URL, Config.LLM_MODEL_NAME, Config.GRAPHITI_DB_PATH
- `backend/app/services/zep_manager.py` — the service being replaced (understand the API contract)

- [ ] **Step 1: Create graphiti_manager.py**

```python
# backend/app/services/graphiti_manager.py
"""
Graphiti Manager — manages per-project Graphiti instances with Kuzu embedded DB.
Replaces zep_manager.py. Handles episode pushing, graph reading, and dossier sync.
"""
import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from ..config import Config
from ..utils.logger import get_logger

logger = get_logger("graphiti_manager")

# Module-level event loop for running async Graphiti calls from sync Flask
_loop = asyncio.new_event_loop()

# Cached Graphiti instances per project
_instances: dict[str, Any] = {}


def _run_async(coro):
    """Run an async coroutine in the module-level event loop."""
    return _loop.run_until_complete(coro)


def _get_graphiti(project_id: str):
    """Get or create a Graphiti instance for a project."""
    if project_id in _instances:
        return _instances[project_id]

    from graphiti_core import Graphiti
    from graphiti_core.driver.kuzu_driver import KuzuDriver
    from graphiti_core.llm_client import OpenAIClient, LLMConfig
    from graphiti_core.embedder import OpenAIEmbedder
    from graphiti_core.embedder.openai import OpenAIEmbedderConfig

    # Create project-specific Kuzu DB directory
    db_path = os.path.join(Config.GRAPHITI_DB_PATH, project_id)
    os.makedirs(db_path, exist_ok=True)

    driver = KuzuDriver(db=db_path)

    llm_client = OpenAIClient(LLMConfig(
        api_key=Config.LLM_API_KEY,
        base_url=Config.LLM_BASE_URL,
        model=Config.LLM_MODEL_NAME,
    ))

    embedder = OpenAIEmbedder(OpenAIEmbedderConfig(
        api_key=Config.LLM_API_KEY,
        base_url=Config.LLM_BASE_URL,
    ))

    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=llm_client,
        embedder=embedder,
    )

    # Build indices on first use
    _run_async(graphiti.build_indices_and_constraints())

    _instances[project_id] = graphiti
    logger.info(f"Created Graphiti instance for project {project_id} at {db_path}")
    return graphiti


def push_episode(project_id: str, name: str, body: str, source_desc: str,
                 ref_time: datetime | None = None, episode_type: str = "text") -> None:
    """Push a single episode to the project's knowledge graph."""
    from graphiti_core.nodes import EpisodeType

    graphiti = _get_graphiti(project_id)
    source = EpisodeType.text if episode_type == "text" else EpisodeType.message

    try:
        _run_async(graphiti.add_episode(
            name=name,
            episode_body=body,
            source=source,
            source_description=source_desc,
            reference_time=ref_time or datetime.utcnow(),
            group_id=project_id,
        ))
    except Exception as e:
        logger.warning(f"Failed to push episode '{name}' for {project_id}: {e}")


def push_dossier(project_id: str, dossier: dict) -> None:
    """Push a company dossier as structured episodes."""
    from graphiti_core.nodes import EpisodeType
    from graphiti_core.utils.bulk_utils import RawEpisode

    graphiti = _get_graphiti(project_id)
    now = datetime.utcnow()

    company = dossier.get("company", {})
    episodes = []

    # Company profile
    episodes.append(RawEpisode(
        name="company_profile",
        content=(
            f"Company: {company.get('name', 'Unknown')}. "
            f"Industry: {company.get('industry', '')}. "
            f"Size: {company.get('size', '')}. "
            f"Products: {', '.join(company.get('products', []))}. "
            f"Geography: {company.get('geography', '')}."
        ),
        source=EpisodeType.text,
        source_description="Company research dossier",
        reference_time=now,
    ))

    # Org roles
    for i, role in enumerate(dossier.get("org", {}).get("roles", [])):
        episodes.append(RawEpisode(
            name=f"org_role_{i}",
            content=f"{role['title']} works in {role['department']} department and reports to {role['reportsTo']}.",
            source=EpisodeType.text,
            source_description="Company org structure",
            reference_time=now,
        ))

    # Systems
    for i, sys in enumerate(dossier.get("systems", [])):
        episodes.append(RawEpisode(
            name=f"system_{i}",
            content=f"System: {sys['name']} ({sys['category']}, criticality: {sys['criticality']}).",
            source=EpisodeType.text,
            source_description="Company technology stack",
            reference_time=now,
        ))

    # Compliance
    compliance = dossier.get("compliance", [])
    if compliance:
        episodes.append(RawEpisode(
            name="compliance",
            content=f"Compliance requirements: {', '.join(compliance)}.",
            source=EpisodeType.text,
            source_description="Regulatory compliance",
            reference_time=now,
        ))

    # Risks
    for i, risk in enumerate(dossier.get("risks", [])):
        episodes.append(RawEpisode(
            name=f"risk_{i}",
            content=f"Risk: {risk['name']} (likelihood: {risk['likelihood']}, impact: {risk['impact']}).",
            source=EpisodeType.text,
            source_description="Risk assessment",
            reference_time=now,
        ))

    # Recent events
    for i, event in enumerate(dossier.get("recentEvents", [])):
        episodes.append(RawEpisode(
            name=f"event_{i}",
            content=f"Event ({event['date']}): {event['description']} [source: {event['source']}].",
            source=EpisodeType.text,
            source_description="Recent events",
            reference_time=now,
        ))

    # Bulk push
    try:
        _run_async(graphiti.add_episode_bulk(episodes, group_id=project_id))
        logger.info(f"Pushed {len(episodes)} dossier episodes for {project_id}")
    except Exception as e:
        logger.warning(f"Failed to push dossier for {project_id}: {e}")


def push_action(project_id: str, action: dict) -> None:
    """Push a simulation action as an episode."""
    agent = action.get("agent", "Unknown")
    role = action.get("role", "")
    world = action.get("world", "")
    action_type = action.get("action", "")
    round_num = action.get("round", 0)
    args = action.get("args", {})
    timestamp = action.get("timestamp", "")

    if action_type in ("send_message", "reply_in_thread"):
        content = args.get("content", "")[:500]
        body = f"{agent} ({role}) said in {world}: {content}"
    elif action_type in ("send_email", "reply_email"):
        subject = args.get("subject", "")
        email_body = args.get("body", "")[:300]
        to = args.get("to", "")
        body = f"{agent} ({role}) emailed {to} about '{subject}': {email_body}"
    else:
        body = f"{agent} ({role}) performed {action_type} in {world}."

    try:
        ref_time = datetime.fromisoformat(timestamp) if timestamp else datetime.utcnow()
    except (ValueError, TypeError):
        ref_time = datetime.utcnow()

    push_episode(
        project_id,
        name=f"{agent.replace(' ', '_')}_r{round_num}_{action_type}",
        body=body,
        source_desc=f"Round {round_num} — {world}",
        ref_time=ref_time,
        episode_type="message",
    )


def push_actions_bulk(project_id: str, actions: list[dict]) -> None:
    """Push multiple simulation actions as a batch."""
    from graphiti_core.nodes import EpisodeType
    from graphiti_core.utils.bulk_utils import RawEpisode

    graphiti = _get_graphiti(project_id)
    episodes = []

    for action in actions:
        agent = action.get("agent", "Unknown")
        role = action.get("role", "")
        world = action.get("world", "")
        action_type = action.get("action", "")
        round_num = action.get("round", 0)
        args = action.get("args", {})
        timestamp = action.get("timestamp", "")

        if action_type in ("send_message", "reply_in_thread"):
            content = args.get("content", "")[:500]
            body = f"{agent} ({role}) said in {world}: {content}"
        elif action_type in ("send_email", "reply_email"):
            subject = args.get("subject", "")
            email_body = args.get("body", "")[:300]
            to = args.get("to", "")
            body = f"{agent} ({role}) emailed {to} about '{subject}': {email_body}"
        else:
            body = f"{agent} ({role}) performed {action_type} in {world}."

        try:
            ref_time = datetime.fromisoformat(timestamp) if timestamp else datetime.utcnow()
        except (ValueError, TypeError):
            ref_time = datetime.utcnow()

        episodes.append(RawEpisode(
            name=f"{agent.replace(' ', '_')}_r{round_num}_{action_type}",
            content=body,
            source=EpisodeType.message,
            source_description=f"Round {round_num} — {world}",
            reference_time=ref_time,
        ))

    if episodes:
        try:
            _run_async(graphiti.add_episode_bulk(episodes, group_id=project_id))
            logger.info(f"Pushed {len(episodes)} action episodes for {project_id}")
        except Exception as e:
            logger.warning(f"Failed to push action batch for {project_id}: {e}")


def get_graph_data(project_id: str) -> dict:
    """Get all nodes and edges for D3 visualization via raw Cypher."""
    try:
        graphiti = _get_graphiti(project_id)
        driver = graphiti.graph_driver

        # Get all entity nodes
        node_results = _run_async(driver.execute_query(
            "MATCH (n:Entity) RETURN n.uuid AS uuid, n.name AS name, n.summary AS summary, n.group_id AS group_id"
        ))
        raw_nodes = node_results[0] if node_results and node_results[0] else []

        nodes = []
        for row in raw_nodes:
            node_name = row.get("name", "Unknown")
            nodes.append({
                "id": row.get("uuid", str(len(nodes))),
                "name": node_name,
                "type": _classify_node(node_name, row.get("summary", "")),
                "attributes": {"summary": row.get("summary", "")},
            })

        # Get all edges
        edge_results = _run_async(driver.execute_query(
            "MATCH (n:Entity)-[r:RELATES_TO]->(m:Entity) "
            "RETURN n.uuid AS source, m.uuid AS target, r.name AS name, r.fact AS fact"
        ))
        raw_edges = edge_results[0] if edge_results and edge_results[0] else []

        edges = []
        for row in raw_edges:
            edges.append({
                "source": row.get("source", ""),
                "target": row.get("target", ""),
                "label": row.get("name", ""),
                "type": row.get("name", "related"),
            })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        logger.warning(f"Failed to read graph for {project_id}: {e}")
        return {"nodes": [], "edges": []}


def sync_dossier(project_id: str, dossier: dict) -> None:
    """Re-push dossier after user edits. Graphiti reconciles entities."""
    push_dossier(project_id, dossier)


def _classify_node(name: str, summary: str) -> str:
    """Classify a node into D3 color-map types based on name and summary."""
    text = (name + " " + summary).lower()

    if any(k in text for k in ["ciso", "ceo", "cto", "cro", "analyst", "engineer",
                                "counsel", "officer", "director", "lead", "manager",
                                "head of", "chief"]):
        return "agent"
    if any(k in text for k in ["risk", "threat", "ransomware", "breach", "attack",
                                "vulnerability", "exploit"]):
        return "threat"
    if any(k in text for k in ["gdpr", "pci", "soc", "hipaa", "compliance",
                                "regulation", "apra", "privacy"]):
        return "compliance"
    if any(k in text for k in ["company", "corporation", "inc.", "ltd.", "bank",
                                "organization"]):
        return "org"

    return "system"
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.graphiti_manager import get_graph_data; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/graphiti_manager.py
git commit -m "feat(backend): add graphiti_manager — replaces zep_manager with Graphiti + Kuzu"
```

---

## Task 3: Migrate research_agent.py

Replace `_push_to_zep()` with `graphiti_manager.push_dossier()`.

**Files:**
- Modify: `backend/app/services/research_agent.py`

- [ ] **Step 1: Read research_agent.py and identify Zep code**

The Zep-specific code is in `_push_to_zep()` (around lines 264-330) and the `from zep_cloud` import. Replace:

1. Remove the entire `_push_to_zep()` function
2. Remove `from zep_cloud.client import Zep` and `from zep_cloud.types import EpisodeData` imports
3. In `_research_pipeline()`, replace the call `graph_id = _push_to_zep(project_id, dossier)` with:

```python
from . import graphiti_manager
graphiti_manager.push_dossier(project_id, dossier)
graph_id = project_id  # Graphiti uses project_id as the graph identifier
```

4. Update the `project_manager.update_project()` call to use `graph_id=project_id` instead of the old Zep graph_id.

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.research_agent import run_research; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/research_agent.py
git commit -m "feat(backend): migrate research_agent from Zep to graphiti_manager"
```

---

## Task 4: Migrate crucible_manager.py

Replace `_push_new_actions_to_zep()` with `graphiti_manager.push_actions_bulk()`.

**Files:**
- Modify: `backend/app/services/crucible_manager.py`

- [ ] **Step 1: Replace Zep action pushing**

1. Remove the entire `_push_new_actions_to_zep()` function (the one that imports `zep_cloud`)
2. In `get_simulation_status()`, replace the call to `_push_new_actions_to_zep(sim_id, graph_id, actions)` with:

```python
# Push new actions to Graphiti for graph growth
graph_id = state.get("graph_id")
if graph_id:
    already_pushed = _pushed_action_counts.get(sim_id, 0)
    new_actions = actions[already_pushed:]
    if new_actions:
        from . import graphiti_manager
        import threading
        # Push in background thread to avoid blocking status polling
        def _push():
            graphiti_manager.push_actions_bulk(graph_id, new_actions)
        threading.Thread(target=_push, daemon=True).start()
        _pushed_action_counts[sim_id] = len(actions)
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.crucible_manager import launch_simulation; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/crucible_manager.py
git commit -m "feat(backend): migrate crucible_manager from Zep to graphiti_manager"
```

---

## Task 5: Migrate Flask Endpoints + Delete zep_manager.py

**Files:**
- Modify: `backend/app/api/crucible.py`
- Delete: `backend/app/services/zep_manager.py`

- [ ] **Step 1: Replace zep_manager imports in crucible.py**

Find all references to `zep_manager` in `crucible.py` and replace with `graphiti_manager`:

1. In the project endpoints section, change:
```python
from ..services import zep_manager
```
to:
```python
from ..services import graphiti_manager
```

2. Replace `zep_manager.sync_dossier_to_zep(graph_id, dossier)` with `graphiti_manager.sync_dossier(project_id, dossier)`

3. Replace `zep_manager.get_graph_data(graph_id)` with `graphiti_manager.get_graph_data(project_id)`

4. In `simulation_graph()`, replace the Zep graph lookup:
```python
if graph_id:
    from ..services import zep_manager
    data = zep_manager.get_graph_data(graph_id)
```
with:
```python
if graph_id:
    from ..services import graphiti_manager
    data = graphiti_manager.get_graph_data(graph_id)
```

- [ ] **Step 2: Delete zep_manager.py**

```bash
rm backend/app/services/zep_manager.py
```

- [ ] **Step 3: Verify Flask app starts**

```bash
cd backend && uv run python -c "from app import create_app; app = create_app(); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/crucible.py
git rm backend/app/services/zep_manager.py
git commit -m "feat(backend): migrate Flask endpoints to graphiti_manager, delete zep_manager"
```

---

## Task 6: Add data/graphiti to .gitignore + Integration Test

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add data directory to .gitignore**

Add to `.gitignore`:
```
# Graphiti/Kuzu local graph databases
backend/data/
```

- [ ] **Step 2: Start servers**

```bash
./start.sh
```

- [ ] **Step 3: Test research flow**

Open http://localhost:3000, enter a company URL, start research.
Expected: Research completes, dossier shows, graph appears (may take a few seconds for Graphiti to process).

- [ ] **Step 4: Test simulation flow**

Confirm dossier → Generate Config → Launch Simulation.
Expected: Actions appear in Slack/Email tabs. Graph grows with new nodes on Refresh.

- [ ] **Step 5: Verify Kuzu DB files exist**

```bash
ls backend/data/graphiti/
```
Expected: Project directories with Kuzu DB files.

- [ ] **Step 6: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore
git commit -m "chore: add data/graphiti to gitignore"
```
