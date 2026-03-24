# backend/app/services/graph_context.py
"""
Graph Context — queries the Firestore knowledge graph (graph_nodes + graph_edges)
and formats context strings for LLM prompts.

Graph data is keyed by project_id stored in the `sim_id` field.
Pure data formatting — no LLM calls.
"""

from google.cloud import firestore

from ..utils.logger import get_logger

logger = get_logger("graph_context")


class GraphContext:
    """Queries knowledge graph from Firestore and formats context for LLM prompts.

    Graph data is lazy-loaded and cached for the lifetime of the instance.
    One instance per pipeline run — load once, format many times.
    """

    def __init__(self, project_id: str):
        self.project_id = project_id
        self._nodes: list[dict] | None = None
        self._edges: list[dict] | None = None
        self._db = firestore.Client()

    def _load(self):
        """Load graph_nodes + graph_edges from Firestore. Cached after first call."""
        if self._nodes is not None:
            return
        try:
            n_docs = self._db.collection("graph_nodes").where("sim_id", "==", self.project_id).get()
            e_docs = self._db.collection("graph_edges").where("sim_id", "==", self.project_id).get()
            self._nodes = [doc.to_dict() for doc in n_docs]
            self._edges = [doc.to_dict() for doc in e_docs]
            logger.info(f"Loaded graph for {self.project_id}: {len(self._nodes)} nodes, {len(self._edges)} edges")
        except Exception as e:
            logger.warning(f"Failed to load graph for {self.project_id}: {e}")
            self._nodes = []
            self._edges = []

    @property
    def nodes(self) -> list[dict]:
        self._load()
        return self._nodes

    @property
    def edges(self) -> list[dict]:
        self._load()
        return self._edges

    def _nodes_by_type(self, entity_type: str) -> list[dict]:
        return [n for n in self.nodes if n.get("entity_type") == entity_type]

    def _edges_from(self, source_name: str) -> list[dict]:
        return [e for e in self.edges if e.get("source") == source_name]

    def _edges_to(self, target_name: str) -> list[dict]:
        return [e for e in self.edges if e.get("target") == target_name]

    # ------------------------------------------------------------------
    # Formatting helpers
    # ------------------------------------------------------------------

    def _edge_targets(self, source: str, relation: str) -> list[str]:
        """Return target names for edges from source with given relation_type."""
        return [
            e.get("target", "?")
            for e in self._edges_from(source)
            if e.get("relation_type") == relation
        ]

    def _edge_sources(self, target: str, relation: str) -> list[str]:
        """Return source names for edges to target with given relation_type."""
        return [
            e.get("source", "?")
            for e in self._edges_to(target)
            if e.get("relation_type") == relation
        ]

    # ------------------------------------------------------------------
    # Public context methods
    # ------------------------------------------------------------------

    def org_hierarchy(self) -> str:
        """Build a formatted org chart from person nodes and relationship edges."""
        persons = self._nodes_by_type("person")
        if not persons:
            return ""

        lines = ["Organizational Structure:"]
        for p in persons:
            name = p.get("name", "Unknown")
            role = p.get("role", p.get("title", ""))
            parts: list[str] = []

            # reports_to — outgoing edges from this person
            reports_to = self._edge_targets(name, "reports_to")
            if reports_to:
                parts.append(f"reports to {', '.join(reports_to)}")

            # manages — outgoing edges from this person
            manages = self._edge_targets(name, "manages")
            if manages:
                parts.append(f"manages: {', '.join(manages)}")

            # member_of
            member_of = self._edge_targets(name, "member_of")
            if member_of:
                parts.append(f"member of: {', '.join(member_of)}")

            label = f"{name} ({role})" if role else name
            detail = f" \u2192 {'; '.join(parts)}" if parts else ""
            lines.append(f"- {label}{detail}")

        return "\n".join(lines)

    def system_dependencies(self) -> str:
        """Build system dependency map from system nodes and their edges."""
        systems = self._nodes_by_type("system")
        if not systems:
            return ""

        lines = ["System Architecture:"]
        for s in systems:
            name = s.get("name", "Unknown")
            criticality = s.get("criticality", "")
            category = s.get("category", s.get("system_type", ""))

            tags = ", ".join(t for t in [criticality, category] if t)
            label = f"{name} ({tags})" if tags else name

            details: list[str] = []

            depends_on = self._edge_targets(name, "depends_on")
            if depends_on:
                details.append(f"depends_on: {', '.join(depends_on)}")

            protected_by = self._edge_targets(name, "protected_by")
            if protected_by:
                details.append(f"protected_by: {', '.join(protected_by)}")

            managed_by = self._edge_sources(name, "manages")
            if managed_by:
                details.append(f"managed_by: {', '.join(managed_by)}")

            suffix = f" \u2014 {'; '.join(details)}" if details else ""
            lines.append(f"- {label}{suffix}")

        return "\n".join(lines)

    def threat_surface(self) -> str:
        """Map threats to systems they target."""
        threats = self._nodes_by_type("threat")
        if not threats:
            return ""

        lines = ["Threat Landscape:"]
        for t in threats:
            name = t.get("name", "Unknown")
            details: list[str] = []

            threatens = self._edge_targets(name, "threatens")
            if threatens:
                details.append(f"threatens: {', '.join(threatens)}")

            mitigated_by = self._edge_targets(name, "mitigated_by")
            if mitigated_by:
                details.append(f"mitigated_by: {', '.join(mitigated_by)}")

            detected_by = self._edge_targets(name, "detected_by")
            if detected_by:
                details.append(f"detected_by: {', '.join(detected_by)}")

            suffix = f" \u2192 {'; '.join(details)}" if details else ""
            lines.append(f"- {name}{suffix}")

        return "\n".join(lines)

    def agent_context(self, agent_name: str) -> str:
        """Context for a specific person. Returns empty string if not found."""
        # Check if agent exists in graph
        matching = [n for n in self.nodes if n.get("name") == agent_name and n.get("entity_type") == "person"]
        if not matching:
            return ""

        lines = ["Your organizational context:"]

        reports_to = self._edge_targets(agent_name, "reports_to")
        if reports_to:
            # Enrich with role info
            enriched = []
            for rt in reports_to:
                node = next((n for n in self.nodes if n.get("name") == rt), None)
                role = node.get("role", node.get("title", "")) if node else ""
                enriched.append(f"{rt} ({role})" if role else rt)
            lines.append(f"- You report to: {', '.join(enriched)}")

        manages = self._edge_targets(agent_name, "manages")
        if manages:
            lines.append(f"- You manage: {', '.join(manages)}")

        responsible_for = self._edge_targets(agent_name, "responsible_for")
        if responsible_for:
            lines.append(f"- You are responsible for: {', '.join(responsible_for)}")

        collaborates_with = self._edge_targets(agent_name, "collaborates_with")
        if collaborates_with:
            # Enrich with role and topic
            enriched = []
            for cw in collaborates_with:
                node = next((n for n in self.nodes if n.get("name") == cw), None)
                role = node.get("role", node.get("title", "")) if node else ""
                enriched.append(f"{cw} ({role})" if role else cw)
            # Check for collaboration topic in edge metadata
            collab_edges = [
                e for e in self._edges_from(agent_name)
                if e.get("relation_type") == "collaborates_with"
            ]
            for edge in collab_edges:
                topic = edge.get("topic", edge.get("context", ""))
                target = edge.get("target", "?")
                node = next((n for n in self.nodes if n.get("name") == target), None)
                role = node.get("role", node.get("title", "")) if node else ""
                label = f"{target} ({role})" if role else target
                detail = f" on {topic}" if topic else ""
                lines.append(f"- You collaborate with: {label}{detail}")
            # If we already added per-edge lines, don't add a generic one
            if not collab_edges:
                lines.append(f"- You collaborate with: {', '.join(enriched)}")

        member_of = self._edge_targets(agent_name, "member_of")
        if member_of:
            lines.append(f"- You belong to: {', '.join(member_of)}")

        return "\n".join(lines) if len(lines) > 1 else ""

    def attacker_context(self) -> str:
        """Intelligence for the adversarial agent."""
        systems = self._nodes_by_type("system")
        if not systems:
            return ""

        # Calculate centrality (total edges touching each system)
        centrality = self.system_criticality()

        # Sort by centrality descending
        ranked = sorted(centrality.items(), key=lambda x: x[1], reverse=True)

        lines = ["Target Intelligence:"]

        # Critical systems by connectivity
        if ranked:
            top = [f"{name} ({count} connections)" for name, count in ranked[:8]]
            lines.append(f"- Critical systems (by connectivity): {', '.join(top)}")

        # Lateral movement paths: follow depends_on chains
        paths = self._find_dependency_chains()
        if paths:
            for path in paths[:5]:
                lines.append(f"- Lateral movement path: {' \u2192 '.join(path)}")

        # High-value data targets: systems with "data" or "db" in name/category
        data_targets = [
            s.get("name", "?") for s in systems
            if any(
                kw in (s.get("name", "") + s.get("category", "") + s.get("system_type", "")).lower()
                for kw in ("data", "db", "database", "storage", "email", "customer")
            )
        ]
        if data_targets:
            lines.append(f"- High-value data targets: {', '.join(data_targets)}")

        # Defender blind spots: systems with no protected_by edge
        protected_systems = {
            e.get("source") for e in self.edges if e.get("relation_type") == "protected_by"
        }
        unprotected = [
            s.get("name", "?") for s in systems
            if s.get("name") not in protected_systems
        ]
        if unprotected:
            lines.append(f"- Defender blind spots: {', '.join(unprotected)}")

        return "\n".join(lines) if len(lines) > 1 else ""

    def full_context(self) -> str:
        """Combine org_hierarchy + system_dependencies + threat_surface for report generation."""
        sections = [
            self.org_hierarchy(),
            self.system_dependencies(),
            self.threat_surface(),
        ]
        # Filter empty sections and join with blank line separator
        return "\n\n".join(s for s in sections if s)

    def system_criticality(self) -> dict[str, int]:
        """Returns {system_name: edge_count} for each system node."""
        systems = self._nodes_by_type("system")
        result: dict[str, int] = {}
        for s in systems:
            name = s.get("name", "")
            if not name:
                continue
            incoming = len(self._edges_to(name))
            outgoing = len(self._edges_from(name))
            result[name] = incoming + outgoing
        return result

    def orphaned_by(self, agent_name: str) -> dict:
        """Returns what becomes unmanaged if this person is removed.

        Returns dict with:
            orphaned_systems: systems this person manages
            orphaned_reports: people who report to this person
            broken_chains: decision chains broken by removal
        """
        orphaned_systems = self._edge_targets(agent_name, "manages")
        # Also include responsible_for
        orphaned_systems += self._edge_targets(agent_name, "responsible_for")
        # Deduplicate
        orphaned_systems = list(dict.fromkeys(orphaned_systems))

        # People who report to this person (they have reports_to edge targeting agent_name)
        orphaned_reports = self._edge_sources(agent_name, "reports_to")

        # Broken chains: find chains where agent_name sits between a superior and subordinates
        broken_chains: list[str] = []
        superiors = self._edge_targets(agent_name, "reports_to")
        subordinates = self._edge_sources(agent_name, "reports_to")

        for sup in superiors:
            for sub in subordinates:
                broken_chains.append(f"{sup} \u2192 ({agent_name}) \u2192 {sub}")

        # Also check manages chains
        managed = self._edge_targets(agent_name, "manages")
        for sup in superiors:
            for m in managed:
                chain = f"{sup} \u2192 ({agent_name}) \u2192 {m}"
                if chain not in broken_chains:
                    broken_chains.append(chain)

        return {
            "orphaned_systems": orphaned_systems,
            "orphaned_reports": orphaned_reports,
            "broken_chains": broken_chains,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _find_dependency_chains(self, max_depth: int = 5) -> list[list[str]]:
        """Follow depends_on edges to find lateral movement paths.

        Returns chains of length >= 2, sorted longest first.
        """
        dep_edges: dict[str, list[str]] = {}
        for e in self.edges:
            if e.get("relation_type") == "depends_on":
                src = e.get("source", "")
                tgt = e.get("target", "")
                if src and tgt:
                    dep_edges.setdefault(src, []).append(tgt)

        if not dep_edges:
            return []

        chains: list[list[str]] = []

        def _walk(current: str, path: list[str], visited: set[str]):
            targets = dep_edges.get(current, [])
            if not targets or len(path) >= max_depth:
                if len(path) >= 2:
                    chains.append(list(path))
                return
            for t in targets:
                if t not in visited:
                    visited.add(t)
                    path.append(t)
                    _walk(t, path, visited)
                    path.pop()
                    visited.discard(t)
            # Also record current path if it's a valid chain
            if len(path) >= 2 and path not in chains:
                chains.append(list(path))

        for start in dep_edges:
            _walk(start, [start], {start})

        # Deduplicate and sort by length descending
        seen: set[str] = set()
        unique: list[list[str]] = []
        for chain in sorted(chains, key=len, reverse=True):
            key = " -> ".join(chain)
            if key not in seen:
                seen.add(key)
                unique.append(chain)

        return unique
