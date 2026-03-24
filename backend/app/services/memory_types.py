"""
Shared dataclass types for the memory abstraction layer.

These types were extracted from zep_tools.py so that both the Zep-based
memory backend and any future memory backends can import and return the
same result structures during the transition to a pluggable architecture.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


@dataclass
class SearchResult:
    """Search result"""
    facts: List[str]
    edges: List[Dict[str, Any]]
    nodes: List[Dict[str, Any]]
    query: str
    total_count: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "facts": self.facts,
            "edges": self.edges,
            "nodes": self.nodes,
            "query": self.query,
            "total_count": self.total_count
        }

    def to_text(self) -> str:
        """Convert to text format for LLM understanding"""
        text_parts = [f"Search query: {self.query}", f"Found {self.total_count} related items"]

        if self.facts:
            text_parts.append("\n### Related facts:")
            for i, fact in enumerate(self.facts, 1):
                text_parts.append(f"{i}. {fact}")

        return "\n".join(text_parts)


@dataclass
class NodeInfo:
    """Node information"""
    uuid: str
    name: str
    labels: List[str]
    summary: str
    attributes: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "uuid": self.uuid,
            "name": self.name,
            "labels": self.labels,
            "summary": self.summary,
            "attributes": self.attributes
        }

    def to_text(self) -> str:
        """Convert to text format"""
        entity_type = next((l for l in self.labels if l not in ["Entity", "Node"]), "Unknown type")
        return f"Entity: {self.name} (type: {entity_type})\nSummary: {self.summary}"


@dataclass
class EdgeInfo:
    """Edge information"""
    uuid: str
    name: str
    fact: str
    source_node_uuid: str
    target_node_uuid: str
    source_node_name: Optional[str] = None
    target_node_name: Optional[str] = None
    # Time information
    created_at: Optional[str] = None
    valid_at: Optional[str] = None
    invalid_at: Optional[str] = None
    expired_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "uuid": self.uuid,
            "name": self.name,
            "fact": self.fact,
            "source_node_uuid": self.source_node_uuid,
            "target_node_uuid": self.target_node_uuid,
            "source_node_name": self.source_node_name,
            "target_node_name": self.target_node_name,
            "created_at": self.created_at,
            "valid_at": self.valid_at,
            "invalid_at": self.invalid_at,
            "expired_at": self.expired_at
        }

    def to_text(self, include_temporal: bool = False) -> str:
        """Convert to text format"""
        source = self.source_node_name or self.source_node_uuid[:8]
        target = self.target_node_name or self.target_node_uuid[:8]
        base_text = f"Relation: {source} --[{self.name}]--> {target}\nFact: {self.fact}"

        if include_temporal:
            valid_at = self.valid_at or "Unknown"
            invalid_at = self.invalid_at or "Present"
            base_text += f"\nValidity: {valid_at} - {invalid_at}"
            if self.expired_at:
                base_text += f" (expired: {self.expired_at})"

        return base_text

    @property
    def is_expired(self) -> bool:
        """Whether expired"""
        return self.expired_at is not None

    @property
    def is_invalid(self) -> bool:
        """Whether invalidated"""
        return self.invalid_at is not None


@dataclass
class InsightForgeResult:
    """
    Deep Insight Retrieval Result (InsightForge)
    Contains retrieval results for multiple sub-queries, along with comprehensive analysis
    """
    query: str
    simulation_requirement: str
    sub_queries: List[str]

    # Results by dimension
    semantic_facts: List[str] = field(default_factory=list)  # Semantic search results
    entity_insights: List[Dict[str, Any]] = field(default_factory=list)  # Entity insights
    relationship_chains: List[str] = field(default_factory=list)  # Relationship chains

    # Statistics
    total_facts: int = 0
    total_entities: int = 0
    total_relationships: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "simulation_requirement": self.simulation_requirement,
            "sub_queries": self.sub_queries,
            "semantic_facts": self.semantic_facts,
            "entity_insights": self.entity_insights,
            "relationship_chains": self.relationship_chains,
            "total_facts": self.total_facts,
            "total_entities": self.total_entities,
            "total_relationships": self.total_relationships
        }

    def to_text(self) -> str:
        """Convert to detailed text format for LLM understanding"""
        text_parts = [
            f"## Deep Predictive Analysis",
            f"Analysis question: {self.query}",
            f"Prediction scenario: {self.simulation_requirement}",
            f"\n### Prediction Data Statistics",
            f"- Related prediction facts: {self.total_facts}",
            f"- Entities involved: {self.total_entities}",
            f"- Relationship chains: {self.total_relationships}"
        ]

        # Sub-queries
        if self.sub_queries:
            text_parts.append(f"\n### Analyzed Sub-queries")
            for i, sq in enumerate(self.sub_queries, 1):
                text_parts.append(f"{i}. {sq}")

        # Semantic search results
        if self.semantic_facts:
            text_parts.append(f"\n### [Key Facts] (please cite these in the report)")
            for i, fact in enumerate(self.semantic_facts, 1):
                text_parts.append(f'{i}. "{fact}"')

        # Entity insights
        if self.entity_insights:
            text_parts.append(f"\n### [Core Entities]")
            for entity in self.entity_insights:
                text_parts.append(f"- **{entity.get('name', 'Unknown')}** ({entity.get('type', 'Entity')})")
                if entity.get('summary'):
                    text_parts.append(f'  Summary: "{entity.get("summary")}"')
                if entity.get('related_facts'):
                    text_parts.append(f"  Related facts: {len(entity.get('related_facts', []))}")

        # Relationship chains
        if self.relationship_chains:
            text_parts.append(f"\n### [Relationship Chains]")
            for chain in self.relationship_chains:
                text_parts.append(f"- {chain}")

        return "\n".join(text_parts)


@dataclass
class PanoramaResult:
    """
    Broad Search Result (Panorama)
    Contains all related information, including expired content
    """
    query: str

    # All nodes
    all_nodes: List[NodeInfo] = field(default_factory=list)
    # All edges (including expired ones)
    all_edges: List[EdgeInfo] = field(default_factory=list)
    # Currently active facts
    active_facts: List[str] = field(default_factory=list)
    # Expired/invalidated facts (historical records)
    historical_facts: List[str] = field(default_factory=list)

    # Statistics
    total_nodes: int = 0
    total_edges: int = 0
    active_count: int = 0
    historical_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "all_nodes": [n.to_dict() for n in self.all_nodes],
            "all_edges": [e.to_dict() for e in self.all_edges],
            "active_facts": self.active_facts,
            "historical_facts": self.historical_facts,
            "total_nodes": self.total_nodes,
            "total_edges": self.total_edges,
            "active_count": self.active_count,
            "historical_count": self.historical_count
        }

    def to_text(self) -> str:
        """Convert to text format (full version, no truncation)"""
        text_parts = [
            f"## Broad Search Results (Future Panoramic View)",
            f"Query: {self.query}",
            f"\n### Statistics",
            f"- Total nodes: {self.total_nodes}",
            f"- Total edges: {self.total_edges}",
            f"- Active facts: {self.active_count}",
            f"- Historical/expired facts: {self.historical_count}"
        ]

        # Currently active facts (full output, no truncation)
        if self.active_facts:
            text_parts.append(f"\n### [Currently Active Facts] (simulation result verbatim)")
            for i, fact in enumerate(self.active_facts, 1):
                text_parts.append(f'{i}. "{fact}"')

        # Historical/expired facts (full output, no truncation)
        if self.historical_facts:
            text_parts.append(f"\n### [Historical/Expired Facts] (evolution process records)")
            for i, fact in enumerate(self.historical_facts, 1):
                text_parts.append(f'{i}. "{fact}"')

        # Key entities (full output, no truncation)
        if self.all_nodes:
            text_parts.append(f"\n### [Involved Entities]")
            for node in self.all_nodes:
                entity_type = next((l for l in node.labels if l not in ["Entity", "Node"]), "Entity")
                text_parts.append(f"- **{node.name}** ({entity_type})")

        return "\n".join(text_parts)


@dataclass
class AgentInterview:
    """Single agent interview result"""
    agent_name: str
    agent_role: str  # Role type (e.g., student, teacher, media, etc.)
    agent_bio: str  # Bio
    question: str  # Interview question
    response: str  # Interview response
    key_quotes: List[str] = field(default_factory=list)  # Key quotes

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_name": self.agent_name,
            "agent_role": self.agent_role,
            "agent_bio": self.agent_bio,
            "question": self.question,
            "response": self.response,
            "key_quotes": self.key_quotes
        }

    def to_text(self) -> str:
        text = f"**{self.agent_name}** ({self.agent_role})\n"
        # Display full agent_bio, no truncation
        text += f"_Bio: {self.agent_bio}_\n\n"
        text += f"**Q:** {self.question}\n\n"
        text += f"**A:** {self.response}\n"
        if self.key_quotes:
            text += "\n**Key quotes:**\n"
            for quote in self.key_quotes:
                # Clean various quotation marks
                clean_quote = quote.replace('\u201c', '').replace('\u201d', '').replace('"', '')
                clean_quote = clean_quote.replace('\u300c', '').replace('\u300d', '')
                clean_quote = clean_quote.strip()
                # Remove leading punctuation
                while clean_quote and clean_quote[0] in ',;:.!?\n\r\t ':
                    clean_quote = clean_quote[1:]
                # Filter out junk content containing question numbers (1-9)
                skip = False
                for d in '123456789':
                    if f'Question{d}' in clean_quote or f'Question {d}' in clean_quote:
                        skip = True
                        break
                if skip:
                    continue
                # Truncate overly long content (truncate at period, not hard truncation)
                if len(clean_quote) > 150:
                    dot_pos = clean_quote.find('.', 80)
                    if dot_pos > 0:
                        clean_quote = clean_quote[:dot_pos + 1]
                    else:
                        clean_quote = clean_quote[:147] + "..."
                if clean_quote and len(clean_quote) >= 10:
                    text += f'> "{clean_quote}"\n'
        return text


@dataclass
class InterviewResult:
    """
    Interview Result
    Contains interview responses from multiple simulated agents
    """
    interview_topic: str  # Interview topic
    interview_questions: List[str]  # Interview question list

    # Selected agents for interview
    selected_agents: List[Dict[str, Any]] = field(default_factory=list)
    # Interview responses from each agent
    interviews: List[AgentInterview] = field(default_factory=list)

    # Reasoning for agent selection
    selection_reasoning: str = ""
    # Integrated interview summary
    summary: str = ""

    # Statistics
    total_agents: int = 0
    interviewed_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "interview_topic": self.interview_topic,
            "interview_questions": self.interview_questions,
            "selected_agents": self.selected_agents,
            "interviews": [i.to_dict() for i in self.interviews],
            "selection_reasoning": self.selection_reasoning,
            "summary": self.summary,
            "total_agents": self.total_agents,
            "interviewed_count": self.interviewed_count
        }

    def to_text(self) -> str:
        """Convert to detailed text format for LLM understanding and report citation"""
        text_parts = [
            "## In-Depth Interview Report",
            f"**Interview topic:** {self.interview_topic}",
            f"**Interviewees:** {self.interviewed_count} / {self.total_agents} simulated agents",
            "\n### Selection Reasoning",
            self.selection_reasoning or "(auto-selected)",
            "\n---",
            "\n### Interview Transcripts",
        ]

        if self.interviews:
            for i, interview in enumerate(self.interviews, 1):
                text_parts.append(f"\n#### Interview #{i}: {interview.agent_name}")
                text_parts.append(interview.to_text())
                text_parts.append("\n---")
        else:
            text_parts.append("(no interview records)\n\n---")

        text_parts.append("\n### Interview Summary and Key Insights")
        text_parts.append(self.summary or "(no summary)")

        return "\n".join(text_parts)
