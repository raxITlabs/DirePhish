# backend/app/services/firestore_memory.py
"""
Firestore Memory — unified memory layer replacing both Graphiti (simulation memory)
and Zep (report retrieval). Uses Google Cloud Firestore with vector search.

Write path (replaces Graphiti):
    add_episode, add_episodes_bulk, push_dossier

Read path — simulation (replaces Graphiti search):
    search, get_agent_memory

Read path — report (replaces ZepToolsService):
    quick_search, insight_forge, panorama_search, interview_agents,
    get_simulation_context, get_graph_statistics, get_entity_summary,
    get_entities_by_type
"""

import uuid as _uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from google.cloud import firestore
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

from ..config import Config
from ..utils.cost_tracker import CostTracker
from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger
from .embedding_client import GeminiEmbeddingClient
from .memory_types import (
    AgentInterview,
    InsightForgeResult,
    InterviewResult,
    NodeInfo,
    PanoramaResult,
    SearchResult,
)

logger = get_logger("firestore_memory")

# Firestore batch write limit
_FIRESTORE_BATCH_LIMIT = 500

# Singleton Firestore client — avoids creating a new connection per FirestoreMemory instance
_firestore_client = None


def _get_db():
    global _firestore_client
    if _firestore_client is None:
        _firestore_client = firestore.Client()
    return _firestore_client


class FirestoreMemory:
    """Unified memory layer backed by Google Cloud Firestore with vector search.

    Replaces both:
      - graphiti_manager (simulation episode writes + graph reads)
      - ZepToolsService  (report retrieval tools)
    """

    # ──────────────────────────────────────────────────────────────────────
    # Construction
    # ──────────────────────────────────────────────────────────────────────

    def __init__(self, cost_tracker: Optional[CostTracker] = None):
        self.db = _get_db()
        self.embedder = GeminiEmbeddingClient(cost_tracker=cost_tracker)
        self.cost_tracker = cost_tracker
        self._llm_client: Optional[LLMClient] = None
        logger.info("FirestoreMemory initialised (Firestore + Gemini embeddings)")

    @property
    def llm(self) -> LLMClient:
        """Lazy-initialised LLM client (used by insight_forge sub-query generation)."""
        if self._llm_client is None:
            self._llm_client = LLMClient()
        return self._llm_client

    # ──────────────────────────────────────────────────────────────────────
    # Collection helpers
    # ──────────────────────────────────────────────────────────────────────

    @property
    def _episodes(self) -> firestore.CollectionReference:
        return self.db.collection("sim_episodes")

    # ──────────────────────────────────────────────────────────────────────
    # Write methods (replaces Graphiti)
    # ──────────────────────────────────────────────────────────────────────

    def add_episode(
        self,
        sim_id: str,
        content: str,
        agent: str = "",
        world: str = "",
        round_num: int = 0,
        action: str = "",
        category: str = "action",
        batch_id: str = "",
        iteration_id: str = "",
    ) -> str:
        """Embed and write a single episode document.

        Args:
            sim_id: Simulation identifier.
            content: Text content (action summary, dossier chunk, etc.).
            agent: Agent name.
            world: World / channel name.
            round_num: Simulation round number.
            action: Action name (e.g. send_message).
            category: One of "action", "dossier", "research".
            batch_id: Optional batch identifier.
            iteration_id: Optional iteration identifier.

        Returns:
            The Firestore document ID.
        """
        embedding = self.embedder.embed_document(content)
        doc_id = str(_uuid.uuid4())
        self._episodes.document(doc_id).set({
            "sim_id": sim_id,
            "batch_id": batch_id,
            "iteration_id": iteration_id,
            "round": round_num,
            "agent_name": agent,
            "agent_role": "",
            "world": world,
            "action_name": action,
            "action_summary": content,
            "result": "",
            "category": category,
            "timestamp": datetime.now(timezone.utc),
            "embedding": Vector(embedding),
        })
        logger.debug(f"Wrote episode {doc_id} for sim={sim_id} agent={agent} cat={category}")
        return doc_id

    def add_episodes_bulk(self, sim_id: str, episodes: List[Dict[str, Any]]) -> int:
        """Batch-embed and batch-write multiple episodes.

        Each item in *episodes* should have at least a ``content`` key.
        Optional keys mirror :meth:`add_episode` parameters:
        ``agent``, ``world``, ``round``, ``action``, ``category``,
        ``batch_id``, ``iteration_id``, ``role``, ``result``.

        Args:
            sim_id: Simulation identifier.
            episodes: List of episode dicts.

        Returns:
            Number of documents written.
        """
        if not episodes:
            return 0

        # Batch embed all content strings at once
        texts = [ep.get("content", ep.get("action_summary", "")) for ep in episodes]
        embeddings = self.embedder.embed_batch(texts)

        now = datetime.now(timezone.utc)
        written = 0

        # Write in chunks of _FIRESTORE_BATCH_LIMIT
        for chunk_start in range(0, len(episodes), _FIRESTORE_BATCH_LIMIT):
            batch = self.db.batch()
            chunk_end = min(chunk_start + _FIRESTORE_BATCH_LIMIT, len(episodes))

            for idx in range(chunk_start, chunk_end):
                ep = episodes[idx]
                doc_ref = self._episodes.document(str(_uuid.uuid4()))
                batch.set(doc_ref, {
                    "sim_id": sim_id,
                    "batch_id": ep.get("batch_id", ""),
                    "iteration_id": ep.get("iteration_id", ""),
                    "round": ep.get("round", 0),
                    "agent_name": ep.get("agent", ep.get("agent_name", "")),
                    "agent_role": ep.get("role", ep.get("agent_role", "")),
                    "world": ep.get("world", ""),
                    "action_name": ep.get("action", ep.get("action_name", "")),
                    "action_summary": texts[idx],
                    "result": ep.get("result", ""),
                    "category": ep.get("category", "action"),
                    "timestamp": now,
                    "embedding": Vector(embeddings[idx]),
                })

            batch.commit()
            written += (chunk_end - chunk_start)

        logger.info(f"Bulk-wrote {written} episodes for sim={sim_id}")
        return written

    def push_dossier(self, project_id: str, dossier_dict: Dict[str, Any]) -> int:
        """Convert a company dossier into episodes and bulk-write them.

        Mirrors the structure from ``graphiti_manager.push_dossier`` —
        each dossier section becomes one or more episodes with
        ``category='dossier'``.

        Returns:
            Number of documents written.
        """
        episodes: List[Dict[str, Any]] = []
        company = dossier_dict.get("company", {})

        # --- Company profile ---
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
        episodes.append({
            "content": ". ".join(company_parts) + ".",
            "action": "company_profile",
            "category": "dossier",
        })

        # --- Org roles ---
        for i, role in enumerate(dossier_dict.get("org", {}).get("roles", [])):
            title = role.get("title", "Unknown")
            name_str = role.get("name", "")
            department = role.get("department", "")
            reports_to = role.get("reportsTo", "")
            reports_to_name = role.get("reportsToName", "")

            role_label = f"{name_str} ({title})" if name_str else title
            reports_label = f"{reports_to_name} ({reports_to})" if reports_to_name else reports_to

            role_text = f"{role_label} works in {department} department and reports to {reports_label}."
            if role.get("responsibilities"):
                role_text += f" Responsible for {role['responsibilities']}."

            episodes.append({
                "content": role_text,
                "action": f"org_role_{i}",
                "category": "dossier",
            })

        # --- Systems ---
        for i, sys_item in enumerate(dossier_dict.get("systems", [])):
            sys_text = (
                f"System: {sys_item.get('name', 'Unknown')} "
                f"({sys_item.get('category', '')}, criticality: {sys_item.get('criticality', '')})."
            )
            if sys_item.get("vendor"):
                sys_text += f" Vendor: {sys_item['vendor']}."
            if sys_item.get("description"):
                sys_text += f" {sys_item['description']}."
            episodes.append({
                "content": sys_text,
                "action": f"system_{i}",
                "category": "dossier",
            })

        # --- Compliance ---
        compliance = dossier_dict.get("compliance", [])
        if compliance:
            episodes.append({
                "content": f"Compliance requirements: {', '.join(compliance)}.",
                "action": "compliance",
                "category": "dossier",
            })

        # --- Security posture ---
        security = dossier_dict.get("securityPosture", {})
        if security:
            parts: List[str] = []
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
                episodes.append({
                    "content": ". ".join(parts) + ".",
                    "action": "security_posture",
                    "category": "dossier",
                })

        # --- Risks ---
        for i, risk in enumerate(dossier_dict.get("risks", [])):
            risk_text = (
                f"Risk: {risk.get('name', 'Unknown')} "
                f"(likelihood: {risk.get('likelihood', '')}, impact: {risk.get('impact', '')})."
            )
            if risk.get("description"):
                risk_text += f" {risk['description']}."
            if risk.get("affectedSystems"):
                risk_text += f" Affects: {', '.join(risk['affectedSystems'])}."
            if risk.get("mitigations"):
                risk_text += f" Mitigations: {', '.join(risk['mitigations'])}."
            episodes.append({
                "content": risk_text,
                "action": f"risk_{i}",
                "category": "dossier",
            })

        # --- Recent events ---
        for i, event in enumerate(dossier_dict.get("recentEvents", [])):
            category_tag = event.get("category", "")
            cat_str = f" [{category_tag}]" if category_tag else ""
            event_text = f"Event ({event.get('date', 'unknown')}){cat_str}: {event.get('description', '')}."
            if event.get("impact"):
                event_text += f" Impact: {event['impact']}."
            event_text += f" [source: {event.get('source', 'unknown')}]."
            episodes.append({
                "content": event_text,
                "action": f"event_{i}",
                "category": "dossier",
            })

        count = self.add_episodes_bulk(project_id, episodes)
        logger.info(f"Pushed {count} dossier episodes for project={project_id}")

        # Extract knowledge graph via Gemini structured output
        try:
            text_chunks = [ep["content"] for ep in episodes]
            self.extract_and_store_graph(project_id, text_chunks)
        except Exception as e:
            logger.warning(f"Graph extraction failed for {project_id} (non-fatal): {e}")

        return count

    # ──────────────────────────────────────────────────────────────────────
    # Knowledge Graph Extraction (replaces Graphiti LLM entity extraction)
    # ──────────────────────────────────────────────────────────────────────

    # JSON schema for Gemini structured output — entity + relationship extraction
    _GRAPH_SCHEMA = {
        "type": "json_schema",
        "json_schema": {
            "name": "graph_extraction",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "entities": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "entity_type": {
                                    "type": "string",
                                    "enum": ["person", "system", "threat", "compliance", "organization", "event"],
                                },
                                "summary": {"type": "string"},
                            },
                            "required": ["name", "entity_type", "summary"],
                            "additionalProperties": False,
                        },
                    },
                    "relationships": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "source": {"type": "string"},
                                "target": {"type": "string"},
                                "label": {"type": "string"},
                            },
                            "required": ["source", "target", "label"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["entities", "relationships"],
                "additionalProperties": False,
            },
        },
    }

    def extract_and_store_graph(self, sim_id: str, text_chunks: List[str]) -> Dict[str, int]:
        """Use Gemini structured output to extract entities + relationships from text.

        Calls the LLM with a JSON schema to classify entities (person, system, threat,
        compliance, organization, event) and extract relationships between them.
        Stores results in graph_nodes and graph_edges Firestore collections.

        Returns:
            {"nodes": N, "edges": M} count of extracted items.
        """
        from ..utils.llm_client import LLMClient
        import json as _json

        combined_text = "\n\n".join(text_chunks)
        # Truncate if very long (keep under ~8K tokens for efficiency)
        if len(combined_text) > 30000:
            combined_text = combined_text[:30000]

        llm = LLMClient()
        prompt = (
            "Extract ALL entities and ALL relationships from this company intelligence dossier.\n\n"
            "Entity types:\n"
            "- person: Named individuals (executives, employees, analysts, engineers, officers)\n"
            "- system: Technology systems, tools, platforms, databases, APIs, services\n"
            "- threat: Threats, risks, vulnerabilities, attack techniques, threat actor groups\n"
            "- compliance: Regulatory frameworks, certifications, legal standards\n"
            "- organization: Companies, departments, teams, committees, business units\n"
            "- event: Incidents, breaches, acquisitions, regulatory actions, product launches\n\n"
            "CRITICAL — Extract MANY relationships. A good extraction has 2-3x more relationships than entities.\n"
            "For EVERY person, extract:\n"
            "  - reports_to: who they report to\n"
            "  - manages/operates: which systems or teams they manage\n"
            "  - responsible_for: which compliance areas or security domains they own\n"
            "  - member_of: which organization/department they belong to\n"
            "For EVERY system, extract:\n"
            "  - depends_on: other systems it depends on\n"
            "  - managed_by: which person/team operates it\n"
            "  - protected_by: which security systems protect it\n"
            "For EVERY threat, extract:\n"
            "  - threatens: which systems it targets\n"
            "  - mitigated_by: which systems or controls mitigate it\n"
            "  - detected_by: which security tools detect it\n"
            "For EVERY event, extract:\n"
            "  - affected: which systems were affected\n"
            "  - involved: which people responded or were involved\n"
            "  - exploited: which threat/vulnerability was exploited\n"
            "For EVERY compliance framework, extract:\n"
            "  - applies_to: which systems or data it governs\n"
            "  - owned_by: which person is responsible\n\n"
            "Be thorough. Extract EVERY relationship you can infer from the text.\n\n"
            "DOSSIER:\n"
            f"{combined_text}"
        )

        try:
            response_text = llm.chat(
                messages=[
                    {"role": "system", "content": (
                        "You are an expert knowledge graph extraction system for cybersecurity threat simulation. "
                        "Extract ALL entities and ALL relationships. Be exhaustive — every person should connect to "
                        "systems they manage, threats they respond to, and people they report to. Every system should "
                        "connect to threats that target it and people who operate it. Aim for at least 2 relationships "
                        "per entity. Return valid JSON matching the schema."
                    )},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=8192,
                response_format=self._GRAPH_SCHEMA,
            )

            # Track cost
            if self.cost_tracker:
                # Approximate tokens
                input_tokens = int(len(combined_text) / 4)
                output_tokens = int(len(response_text) / 4)
                self.cost_tracker.track_llm(
                    "graph_extraction", llm.model,
                    input_tokens, output_tokens,
                    f"extract_graph_{sim_id}",
                )

            extraction = _json.loads(response_text)
            entities = extraction.get("entities", [])
            relationships = extraction.get("relationships", [])

            # Store nodes
            graph_nodes = self.db.collection("graph_nodes")
            batch = self.db.batch()
            node_count = 0
            for entity in entities:
                doc_ref = graph_nodes.document()
                batch.set(doc_ref, {
                    "sim_id": sim_id,
                    "name": entity["name"],
                    "entity_type": entity["entity_type"],
                    "summary": entity.get("summary", ""),
                })
                node_count += 1
                if node_count % 500 == 0:
                    batch.commit()
                    batch = self.db.batch()
            if node_count % 500 != 0:
                batch.commit()

            # Store edges
            graph_edges = self.db.collection("graph_edges")
            batch = self.db.batch()
            edge_count = 0
            for rel in relationships:
                doc_ref = graph_edges.document()
                batch.set(doc_ref, {
                    "sim_id": sim_id,
                    "source": rel["source"],
                    "target": rel["target"],
                    "label": rel["label"],
                })
                edge_count += 1
                if edge_count % 500 == 0:
                    batch.commit()
                    batch = self.db.batch()
            if edge_count % 500 != 0:
                batch.commit()

            logger.info(f"Extracted graph for {sim_id}: {node_count} nodes, {edge_count} edges")
            return {"nodes": node_count, "edges": edge_count}

        except Exception as e:
            logger.error(f"Graph extraction LLM call failed for {sim_id}: {e}")
            return {"nodes": 0, "edges": 0}

    # ──────────────────────────────────────────────────────────────────────
    # Read methods — simulation (replaces Graphiti search)
    # ──────────────────────────────────────────────────────────────────────

    def search(
        self,
        sim_id: str,
        query: str,
        limit: int = 8,
        category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Vector search over episodes for a simulation.

        Args:
            sim_id: Simulation identifier.
            query: Natural-language query string.
            limit: Maximum number of results.
            category: Optional filter on category field.

        Returns:
            List of episode dicts (without the embedding field).
        """
        query_vec = self.embedder.embed_query(query)

        base = self._episodes.where("sim_id", "==", sim_id)
        if category:
            base = base.where("category", "==", category)

        docs = base.find_nearest(
            vector_field="embedding",
            query_vector=Vector(query_vec),
            distance_measure=DistanceMeasure.COSINE,
            limit=limit,
        ).get()

        results = []
        for doc in docs:
            data = doc.to_dict()
            data.pop("embedding", None)
            data["id"] = doc.id
            results.append(data)

        logger.debug(f"search sim={sim_id} q={query[:40]}... -> {len(results)} hits")
        return results

    def get_agent_memory(self, sim_id: str, agent_name: str, world_name: str) -> str:
        """Build a formatted memory string for an agent in a specific world.

        Replaces the ``_get_agent_memory`` helper from
        ``run_crucible_simulation.py``.

        Returns:
            A human-readable string of remembered facts, or empty string.
        """
        query = f"What has {agent_name} discussed and what decisions have been made in {world_name}?"
        episodes = self.search(sim_id, query, limit=8)

        if not episodes:
            return ""

        facts = []
        for ep in episodes:
            summary = ep.get("action_summary", "")
            if summary:
                facts.append(f"- {summary}")

        if not facts:
            return ""

        return "From your memory of previous discussions:\n" + "\n".join(facts[:8])

    async def batch_search(
        self,
        sim_id: str,
        queries: list[str],
        limit: int = 8,
    ) -> list[list[dict]]:
        """Run N vector searches in parallel using Firestore AsyncClient.

        Embeds all queries in a single batch call, then fires all
        ``find_nearest`` queries concurrently via ``asyncio.gather``.

        Args:
            sim_id: Simulation identifier.
            queries: List of natural-language query strings.
            limit: Maximum results per query.

        Returns:
            List of result lists (one per query), each containing episode dicts.
        """
        import asyncio

        from google.cloud.firestore_v1 import AsyncClient as FirestoreAsyncClient

        if not queries:
            return []

        # Step 1: Batch embed all queries at once
        query_vecs = self.embedder.embed_batch(queries, task_type="RETRIEVAL_QUERY")

        # Step 2: Run all find_nearest concurrently via async Firestore client
        async_db = FirestoreAsyncClient()

        async def _single_search(vec: list[float]) -> list[dict]:
            try:
                col = async_db.collection("sim_episodes")
                base = col.where("sim_id", "==", sim_id)
                docs = await base.find_nearest(
                    vector_field="embedding",
                    query_vector=Vector(vec),
                    distance_measure=DistanceMeasure.COSINE,
                    limit=limit,
                ).get()
                results = []
                for doc in docs:
                    data = doc.to_dict()
                    data.pop("embedding", None)
                    data["id"] = doc.id
                    results.append(data)
                return results
            except Exception as e:
                logger.warning(f"batch_search single query failed: {e}")
                return []

        all_results = await asyncio.gather(*[_single_search(v) for v in query_vecs])
        logger.debug(f"batch_search sim={sim_id} {len(queries)} queries -> {sum(len(r) for r in all_results)} total hits")
        return list(all_results)

    # ──────────────────────────────────────────────────────────────────────
    # Report methods (replaces ZepToolsService)
    # ──────────────────────────────────────────────────────────────────────

    def quick_search(self, sim_id: str, query: str, limit: int = 10) -> SearchResult:
        """Quick, lightweight search. Returns a ``SearchResult``.

        Drop-in replacement for ``ZepToolsService.quick_search``.
        """
        logger.info(f"quick_search sim={sim_id} q={query[:50]}...")
        episodes = self.search(sim_id, query, limit=limit)

        facts = [ep.get("action_summary", "") for ep in episodes if ep.get("action_summary")]

        return SearchResult(
            facts=facts,
            edges=[],
            nodes=[],
            query=query,
            total_count=len(facts),
        )

    def insight_forge(
        self,
        sim_id: str,
        query: str,
        simulation_requirement: str,
        report_context: str = "",
        max_sub_queries: int = 5,
        llm: Optional[LLMClient] = None,
    ) -> InsightForgeResult:
        """Deep insight retrieval with automatic sub-query decomposition.

        Drop-in replacement for ``ZepToolsService.insight_forge``.

        1. Uses LLM to decompose the question into sub-queries.
        2. Performs vector search for each sub-query.
        3. Deduplicates and aggregates facts.
        4. Extracts entity insights from matching episodes.
        """
        logger.info(f"insight_forge sim={sim_id} q={query[:50]}...")

        result = InsightForgeResult(
            query=query,
            simulation_requirement=simulation_requirement,
            sub_queries=[],
        )

        # Step 1: Generate sub-queries via LLM
        llm_client = llm or self.llm
        sub_queries = self._generate_sub_queries(
            llm_client=llm_client,
            query=query,
            simulation_requirement=simulation_requirement,
            report_context=report_context,
            max_queries=max_sub_queries,
        )
        result.sub_queries = sub_queries
        logger.info(f"Generated {len(sub_queries)} sub-queries")

        # Step 2: Search for each sub-query + the original query
        all_facts: List[str] = []
        seen_facts: set[str] = set()
        all_episodes: List[Dict[str, Any]] = []

        for sq in sub_queries + [query]:
            episodes = self.search(sim_id, sq, limit=15)
            for ep in episodes:
                summary = ep.get("action_summary", "")
                if summary and summary not in seen_facts:
                    all_facts.append(summary)
                    seen_facts.add(summary)
                    all_episodes.append(ep)

        result.semantic_facts = all_facts
        result.total_facts = len(all_facts)

        # Step 3: Extract entity insights from episodes
        agent_counter: Counter = Counter()
        agent_episodes: Dict[str, List[str]] = {}
        for ep in all_episodes:
            agent = ep.get("agent_name", "")
            if agent:
                agent_counter[agent] += 1
                agent_episodes.setdefault(agent, []).append(ep.get("action_summary", ""))

        entity_insights = []
        for agent, count in agent_counter.most_common():
            related = agent_episodes.get(agent, [])
            entity_insights.append({
                "name": agent,
                "type": "Agent",
                "summary": f"Appeared in {count} relevant episodes",
                "related_facts": related,
            })

        result.entity_insights = entity_insights
        result.total_entities = len(entity_insights)

        # Step 4: Build relationship chains from co-occurring agents within same round
        chains: List[str] = []
        round_agents: Dict[int, set] = {}
        for ep in all_episodes:
            r = ep.get("round", 0)
            agent = ep.get("agent_name", "")
            if agent:
                round_agents.setdefault(r, set()).add(agent)

        seen_chains: set[str] = set()
        for r, agents in round_agents.items():
            agent_list = sorted(agents)
            for i, a in enumerate(agent_list):
                for b in agent_list[i + 1:]:
                    chain = f"{a} --[co-occurred in round {r}]--> {b}"
                    if chain not in seen_chains:
                        chains.append(chain)
                        seen_chains.add(chain)

        result.relationship_chains = chains
        result.total_relationships = len(chains)

        logger.info(
            f"insight_forge complete: {result.total_facts} facts, "
            f"{result.total_entities} entities, {result.total_relationships} chains"
        )
        return result

    def panorama_search(
        self,
        sim_id: str,
        query: str,
        include_expired: bool = True,
        limit: int = 50,
    ) -> PanoramaResult:
        """Broad search returning as many facts as possible.

        Drop-in replacement for ``ZepToolsService.panorama_search``.
        Since Firestore episodes don't have an expiry model, all facts
        are returned as ``active_facts``; ``historical_facts`` is always
        empty.
        """
        logger.info(f"panorama_search sim={sim_id} q={query[:50]}...")

        episodes = self.search(sim_id, query, limit=limit)

        active_facts = [
            ep.get("action_summary", "") for ep in episodes if ep.get("action_summary")
        ]

        # Build lightweight node list from distinct agents
        agent_set: set[str] = set()
        nodes: List[NodeInfo] = []
        for ep in episodes:
            agent = ep.get("agent_name", "")
            if agent and agent not in agent_set:
                agent_set.add(agent)
                nodes.append(NodeInfo(
                    uuid=ep.get("id", ""),
                    name=agent,
                    labels=["Agent"],
                    summary=ep.get("agent_role", ""),
                    attributes={},
                ))

        result = PanoramaResult(
            query=query,
            all_nodes=nodes,
            all_edges=[],
            active_facts=active_facts,
            historical_facts=[],
            total_nodes=len(nodes),
            total_edges=0,
            active_count=len(active_facts),
            historical_count=0,
        )

        logger.info(f"panorama_search complete: {result.active_count} active facts")
        return result

    def interview_agents(
        self,
        simulation_id: str,
        interview_requirement: str,
        simulation_requirement: str = "",
        max_agents: int = 5,
        custom_questions: Optional[List[str]] = None,
    ) -> InterviewResult:
        """Interview simulated agents by synthesising their episode memories.

        Unlike the Zep version which calls a live OASIS API, this
        implementation retrieves stored episodes per agent and uses the
        LLM to generate interview-style responses from the agent's
        perspective.

        Args:
            simulation_id: Simulation ID.
            interview_requirement: What the interview should explore.
            simulation_requirement: Background context for the simulation.
            max_agents: Maximum number of agents to interview.
            custom_questions: Optional explicit questions; auto-generated
                if not provided.

        Returns:
            InterviewResult with synthesised interviews.
        """
        logger.info(f"interview_agents sim={simulation_id} topic={interview_requirement[:50]}...")

        result = InterviewResult(
            interview_topic=interview_requirement,
            interview_questions=custom_questions or [],
        )

        # Discover agents by querying a broad set of episodes
        broad = self.search(simulation_id, interview_requirement, limit=100)
        agent_map: Dict[str, Dict[str, Any]] = {}
        for ep in broad:
            agent = ep.get("agent_name", "")
            if agent and agent not in agent_map:
                agent_map[agent] = {
                    "name": agent,
                    "role": ep.get("agent_role", "Agent"),
                    "world": ep.get("world", ""),
                }

        agents = list(agent_map.values())
        result.total_agents = len(agents)

        if not agents:
            logger.warning(f"No agents found for sim={simulation_id}")
            result.summary = "No agent episodes found for interviewing."
            return result

        # Select agents (take up to max_agents)
        selected = agents[:max_agents]
        result.selected_agents = selected
        result.selection_reasoning = (
            f"Selected top {len(selected)} agents from {len(agents)} "
            f"discovered agents based on relevance to the interview topic."
        )

        # Generate interview questions if not provided
        if not result.interview_questions:
            result.interview_questions = self._generate_interview_questions(
                interview_requirement=interview_requirement,
                simulation_requirement=simulation_requirement,
                agents=selected,
            )

        combined_prompt = "\n".join(
            f"{i + 1}. {q}" for i, q in enumerate(result.interview_questions)
        )

        # For each agent, gather their episodes and synthesise a response
        for agent_info in selected:
            agent_name = agent_info["name"]
            agent_role = agent_info["role"]

            # Get this agent's relevant episodes
            agent_episodes = self.search(
                simulation_id,
                f"{agent_name} {interview_requirement}",
                limit=20,
            )
            episode_context = "\n".join(
                f"- {ep.get('action_summary', '')}" for ep in agent_episodes if ep.get("action_summary")
            )

            # Synthesise interview response via LLM
            sys_prompt = (
                f"You are {agent_name}, a simulated agent with the role of {agent_role}. "
                f"Based on the following memories from the simulation, answer the interview "
                f"questions from your perspective. Be specific and draw on your actual experiences.\n\n"
                f"Your memories:\n{episode_context}"
            )
            user_prompt = f"Interview questions:\n{combined_prompt}"

            try:
                response = self.llm.chat(
                    messages=[
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.5,
                )
            except Exception as e:
                logger.warning(f"LLM interview failed for {agent_name}: {e}")
                response = "(Interview response generation failed)"

            result.interviews.append(AgentInterview(
                agent_name=agent_name,
                agent_role=agent_role,
                agent_bio=f"Simulated {agent_role} in the exercise",
                question=combined_prompt,
                response=response,
                key_quotes=[],
            ))

        result.interviewed_count = len(result.interviews)

        # Generate summary
        if result.interviews:
            interview_texts = "\n---\n".join(
                f"{iv.agent_name} ({iv.agent_role}): {iv.response[:500]}"
                for iv in result.interviews
            )
            try:
                result.summary = self.llm.chat(
                    messages=[
                        {
                            "role": "system",
                            "content": "Summarise the key insights from the following agent interviews concisely.",
                        },
                        {"role": "user", "content": interview_texts},
                    ],
                    temperature=0.3,
                )
            except Exception as e:
                logger.warning(f"Failed to generate interview summary: {e}")
                result.summary = "(Summary generation failed)"

        logger.info(f"interview_agents complete: {result.interviewed_count} agents interviewed")
        return result

    def get_simulation_context(
        self,
        sim_id: str,
        simulation_requirement: str,
        limit: int = 30,
    ) -> Dict[str, Any]:
        """Retrieve broad simulation context for report planning.

        Drop-in replacement for ``ZepToolsService.get_simulation_context``.
        """
        logger.info(f"get_simulation_context sim={sim_id}")

        search_result = self.quick_search(sim_id, simulation_requirement, limit=limit)
        stats = self.get_graph_statistics(sim_id)

        # Build entity list from episodes
        episodes = self.search(sim_id, simulation_requirement, limit=limit)
        entity_set: set[str] = set()
        entities: List[Dict[str, str]] = []
        for ep in episodes:
            agent = ep.get("agent_name", "")
            if agent and agent not in entity_set:
                entity_set.add(agent)
                entities.append({
                    "name": agent,
                    "type": ep.get("category", "action"),
                    "summary": ep.get("action_summary", "")[:200],
                })

        return {
            "simulation_requirement": simulation_requirement,
            "related_facts": search_result.facts,
            "graph_statistics": stats,
            "entities": entities[:limit],
            "total_entities": len(entities),
        }

    def get_graph_statistics(self, sim_id: str) -> Dict[str, Any]:
        """Approximate graph statistics from episode counts.

        Drop-in replacement for ``ZepToolsService.get_graph_statistics``.
        Since Firestore stores flat episodes, we derive counts from
        category and agent distributions.
        """
        logger.info(f"get_graph_statistics sim={sim_id}")

        # Query all episodes for this sim (metadata only — no vector search needed)
        docs = self._episodes.where("sim_id", "==", sim_id).select(
            ["category", "agent_name", "action_name"]
        ).get()

        category_counts: Counter = Counter()
        agent_set: set[str] = set()
        action_counts: Counter = Counter()

        for doc in docs:
            data = doc.to_dict()
            category_counts[data.get("category", "unknown")] += 1
            agent = data.get("agent_name", "")
            if agent:
                agent_set.add(agent)
            action = data.get("action_name", "")
            if action:
                action_counts[action] += 1

        total_episodes = sum(category_counts.values())

        return {
            "graph_id": sim_id,
            "total_nodes": len(agent_set),
            "total_edges": total_episodes,
            "entity_types": dict(category_counts),
            "relation_types": dict(action_counts.most_common(20)),
        }

    def get_entity_summary(self, sim_id: str, entity_name: str) -> Dict[str, Any]:
        """Search for episodes related to a named entity.

        Drop-in replacement for ``ZepToolsService.get_entity_summary``.
        """
        logger.info(f"get_entity_summary sim={sim_id} entity={entity_name}")

        episodes = self.search(sim_id, entity_name, limit=20)
        facts = [ep.get("action_summary", "") for ep in episodes if ep.get("action_summary")]

        # Check if the entity is an agent
        entity_info = None
        for ep in episodes:
            if ep.get("agent_name", "").lower() == entity_name.lower():
                entity_info = {
                    "uuid": ep.get("id", ""),
                    "name": ep.get("agent_name", ""),
                    "labels": ["Agent"],
                    "summary": ep.get("agent_role", ""),
                    "attributes": {},
                }
                break

        return {
            "entity_name": entity_name,
            "entity_info": entity_info,
            "related_facts": facts,
            "related_edges": [],
            "total_relations": len(facts),
        }

    def get_entities_by_type(self, sim_id: str, entity_type: str) -> List[Dict[str, Any]]:
        """Filter episodes by category and return distinct entities.

        Drop-in replacement for ``ZepToolsService.get_entities_by_type``.
        In the Firestore model, ``entity_type`` maps to the episode
        ``category`` field (action / dossier / research).
        """
        logger.info(f"get_entities_by_type sim={sim_id} type={entity_type}")

        docs = self._episodes.where("sim_id", "==", sim_id).where(
            "category", "==", entity_type
        ).select(["agent_name", "agent_role", "action_summary"]).get()

        seen: set[str] = set()
        entities: List[Dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict()
            name = data.get("agent_name", "")
            if not name or name in seen:
                continue
            seen.add(name)
            entities.append({
                "uuid": doc.id,
                "name": name,
                "labels": [entity_type],
                "summary": data.get("agent_role", ""),
                "attributes": {},
            })

        logger.info(f"Found {len(entities)} entities of type {entity_type}")
        return entities

    # ──────────────────────────────────────────────────────────────────────
    # Data flywheel — aggregate outcome storage
    # ──────────────────────────────────────────────────────────────────────

    def store_aggregate_outcome(self, aggregate: dict) -> str:
        """Store Monte Carlo batch aggregate outcome for the data flywheel.

        Collection: mc_aggregates
        Used to weight future scenario probabilities and improve predictions.
        """
        doc_ref = self.db.collection("mc_aggregates").document()
        doc_ref.set({
            "batch_id": aggregate.get("batch_id", ""),
            "project_id": aggregate.get("project_id", ""),
            "mode": aggregate.get("mode", ""),
            "iterations": aggregate.get("iterations", 0),
            "outcome_distribution": aggregate.get("outcome_distribution", {}),
            "containment_round_stats": aggregate.get("containment_round_stats", {}),
            "cost_summary": aggregate.get("cost_summary", {}),
            "created_at": firestore.SERVER_TIMESTAMP,
        })
        return doc_ref.id

    def get_project_aggregates(self, project_id: str, limit: int = 10) -> list[dict]:
        """Retrieve stored aggregate outcomes for a project."""
        docs = (
            self.db.collection("mc_aggregates")
            .where("project_id", "==", project_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .get()
        )
        return [doc.to_dict() for doc in docs]

    def get_containment_probability(self, project_id: str) -> float:
        """Calculate historical containment probability across all MC runs for a project.

        Returns weighted average of containment rates. Used for scenario probability adjustment.
        """
        aggregates = self.get_project_aggregates(project_id, limit=20)
        if not aggregates:
            return 0.5  # No data — neutral prior

        total_contained = 0
        total_iterations = 0
        for agg in aggregates:
            dist = agg.get("outcome_distribution", {})
            contained = dist.get("contained_early", 0) + dist.get("contained_late", 0)
            total = sum(dist.values()) if dist else 0
            total_contained += contained
            total_iterations += total

        return total_contained / total_iterations if total_iterations > 0 else 0.5

    # ──────────────────────────────────────────────────────────────────────
    # Private helpers
    # ──────────────────────────────────────────────────────────────────────

    def _generate_sub_queries(
        self,
        llm_client: LLMClient,
        query: str,
        simulation_requirement: str,
        report_context: str = "",
        max_queries: int = 5,
    ) -> List[str]:
        """Use the LLM to decompose a question into sub-queries."""
        system_prompt = (
            "You are a professional question analysis expert. Your task is to decompose "
            "a complex question into multiple sub-questions that can be independently "
            "observed in the simulated world.\n\n"
            "Requirements:\n"
            "1. Each sub-question should be specific enough to find related Agent behaviours or events\n"
            "2. Sub-questions should cover different dimensions (who, what, why, how, when, where)\n"
            "3. Sub-questions should be relevant to the simulation scenario\n"
            '4. Return in JSON format: {"sub_queries": ["sub-question 1", "sub-question 2", ...]}'
        )

        context_block = f"\nReport context: {report_context[:500]}" if report_context else ""
        user_prompt = (
            f"Simulation requirement background:\n{simulation_requirement}\n"
            f"{context_block}\n\n"
            f"Please decompose the following question into {max_queries} sub-questions:\n"
            f"{query}\n\n"
            f"Return the sub-question list in JSON format."
        )

        try:
            response = llm_client.chat_json(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
            )
            sub_queries = response.get("sub_queries", [])
            return [str(sq) for sq in sub_queries[:max_queries]]
        except Exception as e:
            logger.warning(f"Failed to generate sub-queries: {e}, using defaults")
            return [
                query,
                f"Key participants in {query}",
                f"Causes and impact of {query}",
                f"How {query} developed over time",
            ][:max_queries]

    def _generate_interview_questions(
        self,
        interview_requirement: str,
        simulation_requirement: str,
        agents: List[Dict[str, Any]],
    ) -> List[str]:
        """Use the LLM to generate interview questions."""
        agent_desc = ", ".join(
            f"{a.get('name', 'Unknown')} ({a.get('role', 'Agent')})" for a in agents
        )

        try:
            response = self.llm.chat_json(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Generate interview questions for simulated agents. "
                            'Return JSON: {"questions": ["q1", "q2", ...]}'
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Simulation: {simulation_requirement}\n"
                            f"Interview goal: {interview_requirement}\n"
                            f"Agents: {agent_desc}\n\n"
                            f"Generate 3-5 interview questions."
                        ),
                    },
                ],
                temperature=0.3,
            )
            return [str(q) for q in response.get("questions", [])]
        except Exception as e:
            logger.warning(f"Failed to generate interview questions: {e}")
            return [
                f"What was your experience during this simulation regarding {interview_requirement}?",
                "What key decisions did you make and why?",
                "What surprised you most during the exercise?",
            ]
