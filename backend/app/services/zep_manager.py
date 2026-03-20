# backend/app/services/zep_manager.py
"""
Zep Manager — read graph data for D3 visualization, sync dossier edits back to Zep.
"""
from ..config import Config
from ..utils.logger import get_logger

logger = get_logger("zep_manager")


def get_graph_data(graph_id: str) -> dict:
    """Read nodes and edges from a Zep graph for D3 visualization."""
    try:
        from zep_cloud.client import Zep
        client = Zep(api_key=Config.ZEP_API_KEY)

        # Fetch nodes
        nodes_response = client.graph.node.get_by_graph_id(graph_id=graph_id)
        nodes = []
        for node in (nodes_response or []):
            node_type = _classify_node(node)
            nodes.append({
                "id": node.uuid_ or str(len(nodes)),
                "name": node.name or "Unknown",
                "type": node_type,
                "attributes": node.attributes or {},
            })

        # Fetch edges
        edges_response = client.graph.edge.get_by_graph_id(graph_id=graph_id)
        edges = []
        for edge in (edges_response or []):
            edges.append({
                "source": edge.source_node_uuid or "",
                "target": edge.target_node_uuid or "",
                "label": edge.name or "",
                "type": (edge.attributes or {}).get("edge_type", "related"),
            })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        logger.warning(f"Failed to read Zep graph {graph_id}: {e}")
        return {"nodes": [], "edges": []}


def sync_dossier_to_zep(graph_id: str, dossier: dict) -> None:
    """Re-push the dossier to Zep after user edits.
    Simple approach: add new episodes with updated information.
    Zep's graph engine will reconcile entities."""
    from zep_cloud.client import Zep
    client = Zep(api_key=Config.ZEP_API_KEY)

    # Build text episodes from the updated dossier
    company = dossier.get("company", {})
    texts = [
        f"Updated company profile: {company.get('name', 'Unknown')}, "
        f"industry: {company.get('industry', '')}, size: {company.get('size', '')}, "
        f"products: {', '.join(company.get('products', []))}, "
        f"geography: {company.get('geography', '')}.",
    ]

    for role in dossier.get("org", {}).get("roles", []):
        texts.append(f"{role['title']} works in {role['department']} and reports to {role['reportsTo']}.")

    for sys in dossier.get("systems", []):
        texts.append(f"System: {sys['name']} ({sys['category']}, criticality: {sys['criticality']}).")

    texts.append(f"Compliance: {', '.join(dossier.get('compliance', []))}.")

    for risk in dossier.get("risks", []):
        texts.append(f"Risk: {risk['name']} (likelihood: {risk['likelihood']}, impact: {risk['impact']}).")

    for event in dossier.get("recentEvents", []):
        texts.append(f"Event ({event['date']}): {event['description']}.")

    for text in texts:
        try:
            client.graph.add(graph_id=graph_id, data=text, type="text")
        except Exception as e:
            logger.warning(f"Failed to sync episode to Zep: {e}")


def _classify_node(node) -> str:
    """Classify a Zep node into our D3 color-map types."""
    name = (node.name or "").lower()
    labels = [l.lower() for l in (node.labels or [])]

    # Try to classify by labels first
    for label in labels:
        if any(k in label for k in ["person", "role", "analyst", "officer", "director", "lead", "manager"]):
            return "agent"
        if any(k in label for k in ["department", "team", "system", "server", "database"]):
            return "system"
        if any(k in label for k in ["company", "org", "corporation"]):
            return "org"
        if any(k in label for k in ["risk", "threat", "attack", "breach", "ransomware"]):
            return "threat"
        if any(k in label for k in ["compliance", "regulation", "gdpr", "pci", "soc", "hipaa"]):
            return "compliance"

    # Fallback to name matching
    if any(k in name for k in ["ciso", "ceo", "cto", "analyst", "engineer", "counsel", "officer"]):
        return "agent"
    if any(k in name for k in ["risk", "threat", "ransomware", "breach"]):
        return "threat"
    if any(k in name for k in ["gdpr", "pci", "soc", "hipaa", "compliance"]):
        return "compliance"

    return "system"  # default
