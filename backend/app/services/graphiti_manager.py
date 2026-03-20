# backend/app/services/graphiti_manager.py
"""
Graphiti Manager — manages per-project Graphiti instances with Kuzu embedded DB.
Replaces zep_manager.py. Handles episode pushing, graph reading, and dossier sync.
"""
import asyncio
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import Config
from ..utils.logger import get_logger

logger = get_logger("graphiti_manager")

# Module-level event loop for running async Graphiti calls from sync Flask
_loop = asyncio.new_event_loop()
_lock = threading.Lock()

# Cached Graphiti instances per project
_instances: dict[str, Any] = {}


def _run_async(coro):
    """Run an async coroutine in the module-level event loop. Thread-safe."""
    with _lock:
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

    # Create project-specific Kuzu DB file path (Kuzu creates the file itself)
    os.makedirs(Config.GRAPHITI_DB_PATH, exist_ok=True)
    db_path = os.path.join(Config.GRAPHITI_DB_PATH, f"{project_id}.kuzu")

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
