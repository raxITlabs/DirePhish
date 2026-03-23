# backend/app/services/graphiti_manager.py
"""
Graphiti Manager — manages per-project Graphiti instances with Kuzu embedded DB.
Replaces zep_manager.py. Handles episode pushing, graph reading, and dossier sync.
"""
import asyncio
import os
import queue
import threading
import time as _time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import Config
from ..utils.logger import get_logger

logger = get_logger("graphiti_manager")

# Separate event loops for reads vs writes so graph reads don't block on pushes
_read_loop = asyncio.new_event_loop()
_read_lock = threading.Lock()

_write_loop = asyncio.new_event_loop()
_write_lock = threading.Lock()

# Cached Graphiti instances per project
_instances: dict[str, Any] = {}
_instances_lock = threading.Lock()


def _run_read(coro):
    """Run an async read operation. Does not block on writes."""
    with _read_lock:
        return _read_loop.run_until_complete(coro)


def _run_write(coro):
    """Run an async write operation. Serialized against other writes."""
    with _write_lock:
        return _write_loop.run_until_complete(coro)


def _get_graphiti(project_id: str):
    """Get or create a Graphiti instance for a project."""
    with _instances_lock:
        if project_id in _instances:
            return _instances[project_id]

    from graphiti_core import Graphiti
    from graphiti_core.driver.kuzu_driver import KuzuDriver
    from graphiti_core.llm_client.gemini_client import GeminiClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

    # Tracked embedder wrapper — counts tokens for cost tracking
    class TrackedGeminiEmbedder(GeminiEmbedder):
        """Wraps GeminiEmbedder to count embedding tokens."""
        total_tokens: int = 0
        total_calls: int = 0

        async def create(self, input_data):
            self.total_calls += 1
            if isinstance(input_data, str):
                self.total_tokens += len(input_data) // 4  # ~4 chars per token estimate
            result = await super().create(input_data)
            return result

        async def create_batch(self, input_data_list):
            self.total_calls += 1
            for item in input_data_list:
                if isinstance(item, str):
                    self.total_tokens += len(item) // 4
            result = await super().create_batch(input_data_list)
            return result

    # Create project-specific Kuzu DB file path (Kuzu creates the file itself)
    os.makedirs(Config.GRAPHITI_DB_PATH, exist_ok=True)
    db_path = os.path.join(Config.GRAPHITI_DB_PATH, f"{project_id}.kuzu")

    driver = KuzuDriver(db=db_path)
    # Workaround: Graphiti 0.28.2 accesses driver._database but KuzuDriver doesn't have it
    if not hasattr(driver, '_database'):
        driver._database = db_path

    llm_client = GeminiClient(
        config=LLMConfig(
            api_key=Config.LLM_API_KEY,
            model=Config.LLM_MODEL_NAME,
        )
    )

    embedder = TrackedGeminiEmbedder(
        config=GeminiEmbedderConfig(
            api_key=Config.LLM_API_KEY,
            embedding_model="gemini-embedding-2-preview",
        )
    )

    from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient

    class TrackedGeminiReranker(GeminiRerankerClient):
        """Wraps GeminiRerankerClient to count reranking LLM calls."""
        total_tokens: int = 0
        total_calls: int = 0

        async def rank(self, query: str, passages: list[str]) -> list[tuple[str, float]]:
            self.total_calls += 1
            # Each passage gets a scoring prompt (~50 tokens query + ~100 tokens passage)
            self.total_tokens += len(passages) * 150
            result = await super().rank(query, passages)
            return result

    cross_encoder = TrackedGeminiReranker(
        config=LLMConfig(
            api_key=Config.LLM_API_KEY,
            model=Config.LLM_MODEL_NAME,
        )
    )

    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
    )

    # Build indices on first use (write operation — mutates DB)
    _run_write(graphiti.build_indices_and_constraints())

    # Kuzu needs FTS extension + index manually (not done by graphiti-core 0.28.2)
    try:
        _run_write(driver.execute_query("INSTALL fts"))
        _run_write(driver.execute_query("LOAD EXTENSION fts"))
        _run_write(driver.execute_query(
            "CALL CREATE_FTS_INDEX('Entity', 'node_name_and_summary', ['name', 'summary'])"
        ))
        # Edge FTS index too
        try:
            _run_write(driver.execute_query(
                "CALL CREATE_FTS_INDEX('RelatesToNode_', 'edge_name_and_fact', ['name', 'fact'])"
            ))
        except Exception:
            pass  # Table may not exist yet on first run
        logger.info(f"Created FTS indices for {project_id}")
    except Exception as e:
        # Index may already exist or FTS not available
        if "already exists" not in str(e).lower():
            logger.warning(f"FTS index creation note for {project_id}: {e}")

    with _instances_lock:
        _instances[project_id] = graphiti
    logger.info(f"Created Graphiti instance for project {project_id} at {db_path}")
    return graphiti


# ---------------------------------------------------------------------------
# Action queue + batch worker (Step 2)
# ---------------------------------------------------------------------------
_action_queue: queue.Queue[tuple[str, list[dict]]] = queue.Queue()
_push_status: dict[str, dict] = {}  # {project_id: {"pushing": bool, "version": int}}
_push_status_lock = threading.Lock()
_worker_started = False
_worker_lock = threading.Lock()

BATCH_MIN_SIZE = 5
BATCH_MAX_WAIT_SECS = 45


def _push_worker():
    """Background worker that drains the action queue and pushes in batches."""
    buffers: dict[str, list[dict]] = defaultdict(list)
    first_buffered: dict[str, float] = {}

    while True:
        # Drain everything currently in the queue
        while True:
            try:
                project_id, actions = _action_queue.get_nowait()
                buffers[project_id].extend(actions)
                if project_id not in first_buffered:
                    first_buffered[project_id] = _time.monotonic()
            except queue.Empty:
                break

        # Check each project buffer for push readiness
        to_push: list[tuple[str, list[dict]]] = []
        now = _time.monotonic()
        for project_id in list(buffers.keys()):
            buf = buffers[project_id]
            if not buf:
                continue
            age = now - first_buffered.get(project_id, now)
            if len(buf) >= BATCH_MIN_SIZE or age >= BATCH_MAX_WAIT_SECS:
                to_push.append((project_id, list(buf)))
                buffers[project_id] = []
                first_buffered.pop(project_id, None)

        # Push ready batches
        for project_id, actions in to_push:
            with _push_status_lock:
                _push_status.setdefault(project_id, {"pushing": False, "version": 0})
                _push_status[project_id]["pushing"] = True
            try:
                push_actions_bulk(project_id, actions)
            finally:
                with _push_status_lock:
                    _push_status[project_id]["pushing"] = False
                    _push_status[project_id]["version"] += 1

        _time.sleep(2)


def _ensure_worker():
    """Start the push worker thread lazily on first use."""
    global _worker_started
    if _worker_started:
        return
    with _worker_lock:
        if _worker_started:
            return
        t = threading.Thread(target=_push_worker, daemon=True)
        t.start()
        _worker_started = True
        logger.info("Started action push worker thread")


def enqueue_actions(project_id: str, actions: list[dict]) -> None:
    """Queue actions for batched push to Graphiti. Non-blocking."""
    _ensure_worker()
    _action_queue.put((project_id, actions))
    with _push_status_lock:
        _push_status.setdefault(project_id, {"pushing": False, "version": 0})
        _push_status[project_id]["pushing"] = True


def get_push_status(project_id: str) -> dict:
    """Return current push status for a project."""
    with _push_status_lock:
        return dict(_push_status.get(project_id, {"pushing": False, "version": 0}))


# ---------------------------------------------------------------------------
# Episode push functions
# ---------------------------------------------------------------------------

def push_episode(project_id: str, name: str, body: str, source_desc: str,
                 ref_time: datetime | None = None, episode_type: str = "text") -> None:
    """Push a single episode to the project's knowledge graph."""
    from graphiti_core.nodes import EpisodeType

    graphiti = _get_graphiti(project_id)
    source = EpisodeType.text if episode_type == "text" else EpisodeType.message

    try:
        _run_write(graphiti.add_episode(
            name=name,
            episode_body=body,
            source=source,
            source_description=source_desc,
            reference_time=ref_time or datetime.now(timezone.utc),
            group_id=project_id,
        ))
    except Exception as e:
        logger.warning(f"Failed to push episode '{name}' for {project_id}: {e}")


def push_dossier(project_id: str, dossier: dict) -> None:
    """Push a company dossier as structured episodes."""
    from graphiti_core.nodes import EpisodeType
    from graphiti_core.utils.bulk_utils import RawEpisode

    graphiti = _get_graphiti(project_id)
    now = datetime.now(timezone.utc)

    company = dossier.get("company", {})
    episodes = []

    # Company profile
    company_parts = [
        f"Company: {company.get('name', 'Unknown')}",
        f"Industry: {company.get('industry', '')}",
        f"Size: {company.get('size', '')}",
        f"Products: {', '.join(company.get('products', []))}",
        f"Geography: {company.get('geography', '')}",
    ]
    if company.get("employeeCount"):
        company_parts.append(f"Employee count: {company['employeeCount']}")
    if company.get("foundedYear"):
        company_parts.append(f"Founded: {company['foundedYear']}")
    if company.get("revenue"):
        company_parts.append(f"Revenue: {company['revenue']}")
    if company.get("description"):
        company_parts.append(company["description"])
    episodes.append(RawEpisode(
        name="company_profile",
        content=". ".join(company_parts) + ".",
        source=EpisodeType.text,
        source_description="Company research dossier",
        reference_time=now,
    ))

    # Org roles
    for i, role in enumerate(dossier.get("org", {}).get("roles", [])):
        title = role.get("title", "Unknown")
        name_str = role.get("name", "")
        department = role.get("department", "")
        reports_to = role.get("reportsTo", "")
        reports_to_name = role.get("reportsToName", "")

        # Build "Sarah Chen (CISO)" or just "CISO"
        role_label = f"{name_str} ({title})" if name_str else title
        reports_label = f"{reports_to_name} ({reports_to})" if reports_to_name else reports_to

        role_text = f"{role_label} works in {department} department and reports to {reports_label}."
        if role.get("responsibilities"):
            role_text += f" Responsible for {role['responsibilities']}."

        episodes.append(RawEpisode(
            name=f"org_role_{i}",
            content=role_text,
            source=EpisodeType.text,
            source_description="Company org structure",
            reference_time=now,
        ))

    # Systems
    for i, sys in enumerate(dossier.get("systems", [])):
        sys_text = f"System: {sys.get('name', 'Unknown')} ({sys.get('category', '')}, criticality: {sys.get('criticality', '')})."
        if sys.get("vendor"):
            sys_text += f" Vendor: {sys['vendor']}."
        if sys.get("description"):
            sys_text += f" {sys['description']}."
        episodes.append(RawEpisode(
            name=f"system_{i}",
            content=sys_text,
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

    # Security posture
    security = dossier.get("securityPosture", {})
    if security:
        parts = []
        if security.get("certifications"):
            parts.append(f"Certifications: {', '.join(security['certifications'])}")
        if security.get("securityTeamSize"):
            parts.append(f"Security team: {security['securityTeamSize']} people")
        if security.get("securityTools"):
            parts.append(f"Tools: {', '.join(security['securityTools'])}")
        if security.get("incidentResponsePlan") is not None:
            parts.append(f"IR plan: {'Yes' if security['incidentResponsePlan'] else 'No'}")
        if security.get("bugBountyProgram") is not None:
            parts.append(f"Bug bounty: {'Yes' if security['bugBountyProgram'] else 'No'}")
        if parts:
            episodes.append(RawEpisode(
                name="security_posture",
                content=". ".join(parts) + ".",
                source=EpisodeType.text,
                source_description="Security posture assessment",
                reference_time=now,
            ))

    # Risks
    for i, risk in enumerate(dossier.get("risks", [])):
        risk_text = f"Risk: {risk.get('name', 'Unknown')} (likelihood: {risk.get('likelihood', '')}, impact: {risk.get('impact', '')})."
        if risk.get("description"):
            risk_text += f" {risk['description']}."
        if risk.get("affectedSystems"):
            risk_text += f" Affects: {', '.join(risk['affectedSystems'])}."
        if risk.get("mitigations"):
            risk_text += f" Mitigations: {', '.join(risk['mitigations'])}."
        episodes.append(RawEpisode(
            name=f"risk_{i}",
            content=risk_text,
            source=EpisodeType.text,
            source_description="Risk assessment",
            reference_time=now,
        ))

    # Recent events
    for i, event in enumerate(dossier.get("recentEvents", [])):
        category = event.get("category", "")
        cat_tag = f" [{category}]" if category else ""
        event_text = f"Event ({event.get('date', 'unknown')}){cat_tag}: {event.get('description', '')}."
        if event.get("impact"):
            event_text += f" Impact: {event['impact']}."
        event_text += f" [source: {event.get('source', 'unknown')}]."
        episodes.append(RawEpisode(
            name=f"event_{i}",
            content=event_text,
            source=EpisodeType.text,
            source_description="Recent events",
            reference_time=now,
        ))

    # Bulk push
    try:
        _run_write(graphiti.add_episode_bulk(episodes, group_id=project_id))
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
        ref_time = datetime.fromisoformat(timestamp) if timestamp else datetime.now(timezone.utc)
    except (ValueError, TypeError):
        ref_time = datetime.now(timezone.utc)

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
            ref_time = datetime.fromisoformat(timestamp) if timestamp else datetime.now(timezone.utc)
        except (ValueError, TypeError):
            ref_time = datetime.now(timezone.utc)

        episodes.append(RawEpisode(
            name=f"{agent.replace(' ', '_')}_r{round_num}_{action_type}",
            content=body,
            source=EpisodeType.message,
            source_description=f"Round {round_num} — {world}",
            reference_time=ref_time,
        ))

    if episodes:
        try:
            _run_write(graphiti.add_episode_bulk(episodes, group_id=project_id))
            logger.info(f"Pushed {len(episodes)} action episodes for {project_id}")
        except Exception as e:
            logger.warning(f"Failed to push action batch for {project_id}: {e}")


# ---------------------------------------------------------------------------
# Graph reading (uses read loop — never blocks on writes)
# ---------------------------------------------------------------------------

def get_graph_data(project_id: str) -> dict:
    """Get all nodes and edges for D3 visualization via raw Cypher."""
    try:
        graphiti = _get_graphiti(project_id)
        driver = graphiti.driver

        # Get all entity nodes
        node_results = _run_read(driver.execute_query(
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

        # Get all edges (Kuzu models edges via RelatesToNode_ intermediary)
        edge_results = _run_read(driver.execute_query(
            "MATCH (n:Entity)-[:RELATES_TO]->(e:RelatesToNode_)-[:RELATES_TO]->(m:Entity) "
            "RETURN n.uuid AS source, m.uuid AS target, e.name AS name, e.fact AS fact"
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
        return "person"
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


def get_embedding_usage(project_id: str) -> dict:
    """Get actual embedding token usage from the tracked embedder.

    Returns actual token counts from the TrackedGeminiEmbedder wrapper if
    available, otherwise estimates from graph node count.
    """
    try:
        graphiti = _instances.get(project_id)
        if graphiti and hasattr(graphiti, 'embedder'):
            embedder = graphiti.embedder
            if hasattr(embedder, 'total_tokens') and embedder.total_tokens > 0:
                return {
                    "tokens": embedder.total_tokens,
                    "calls": embedder.total_calls,
                    "source": "tracked",
                }

        # Fallback: estimate from node count
        graph_data = get_graph_data(project_id)
        node_count = len(graph_data.get("nodes", []))
        return {
            "tokens": node_count * 300,
            "calls": node_count,
            "source": "estimated",
        }
    except Exception:
        return {"tokens": 0, "calls": 0, "source": "unavailable"}


def get_reranker_usage(project_id: str) -> dict:
    """Get reranker LLM usage from the tracked cross encoder."""
    try:
        graphiti = _instances.get(project_id)
        if graphiti and hasattr(graphiti, 'cross_encoder'):
            reranker = graphiti.cross_encoder
            if hasattr(reranker, 'total_tokens') and reranker.total_tokens > 0:
                return {
                    "tokens": reranker.total_tokens,
                    "calls": reranker.total_calls,
                    "source": "tracked",
                }
        return {"tokens": 0, "calls": 0, "source": "unavailable"}
    except Exception:
        return {"tokens": 0, "calls": 0, "source": "unavailable"}
