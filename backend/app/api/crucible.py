"""
Flask blueprint for Crucible simulation API.
All endpoints under /api/crucible/*
"""
import json
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request

from ..services.crucible_manager import (
    list_presets,
    get_preset_config,
    list_all_simulations,
    launch_simulation,
    get_simulation_status,
    get_simulation_actions,
    stop_simulation,
)

crucible_bp = Blueprint("crucible", __name__)

SIMULATIONS_DIR = Path(__file__).parent.parent.parent / "uploads" / "simulations"


@crucible_bp.route("/simulations/<sim_id>/config", methods=["GET"])
def get_simulation_config(sim_id):
    """Return a simulation's config.json for reuse (e.g., Monte Carlo)."""
    config_path = SIMULATIONS_DIR / sim_id / "config.json"
    if not config_path.exists():
        return jsonify({"error": f"Config not found for simulation '{sim_id}'"}), 404
    with open(config_path) as f:
        config = json.load(f)
    return jsonify({"data": config})


@crucible_bp.route("/presets", methods=["GET"])
def presets():
    return jsonify({"data": list_presets()})


@crucible_bp.route("/presets/<preset_id>", methods=["GET"])
def preset_config(preset_id):
    config = get_preset_config(preset_id)
    if not config:
        return jsonify({"error": f"Preset '{preset_id}' not found"}), 404
    return jsonify({"data": config})


@crucible_bp.route("/configs/upload", methods=["POST"])
def upload_config():
    """Store a custom config temporarily and return a config ID."""
    data = request.get_json()
    if not data or "config" not in data:
        return jsonify({"error": "No config provided"}), 400
    config_id = f"custom_{uuid.uuid4().hex[:8]}"
    config_dir = Path(__file__).parent.parent.parent / "uploads" / "configs"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_path = config_dir / f"{config_id}.json"
    with open(config_path, "w") as f:
        f.write(data["config"])
    return jsonify({"data": {"configId": config_id}})


@crucible_bp.route("/simulations", methods=["GET"])
def list_simulations():
    """List all simulations with their current status."""
    sims = list_all_simulations()
    return jsonify({"data": sims})


@crucible_bp.route("/simulations", methods=["POST"])
def create_simulation():
    config = request.get_json()
    if not config:
        return jsonify({"error": "No config provided"}), 400
    sim_id = launch_simulation(config)
    return jsonify({"data": {"simId": sim_id}}), 201


@crucible_bp.route("/simulations/<sim_id>/status", methods=["GET"])
def simulation_status(sim_id):
    status = get_simulation_status(sim_id)
    if not status:
        return jsonify({"error": f"Simulation '{sim_id}' not found"}), 404
    return jsonify({"data": status})


@crucible_bp.route("/simulations/<sim_id>/actions", methods=["GET"])
def simulation_actions(sim_id):
    world = request.args.get("world")
    from_round = request.args.get("from_round", type=int)
    actions = get_simulation_actions(sim_id, world=world, from_round=from_round)
    return jsonify({"data": actions})


@crucible_bp.route("/simulations/<sim_id>/stop", methods=["POST"])
def simulation_stop(sim_id):
    status = stop_simulation(sim_id)
    return jsonify({"data": {"status": status}})


@crucible_bp.route("/simulations/<sim_id>/graph", methods=["GET"])
def simulation_graph(sim_id):
    """Build graph data — from Graphiti if project graph exists, else from config."""
    status = get_simulation_status(sim_id)
    if not status:
        return jsonify({"error": f"Simulation '{sim_id}' not found"}), 404

    # Firestore doesn't have a native graph view — skip to config-based fallback
    # (FirestoreMemory stores flat episodes, not nodes/edges)

    # Fallback: build static graph from config
    config_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id / "config.json"
    if not config_path.exists():
        return jsonify({"data": {"nodes": [], "edges": []}})

    with open(config_path) as f:
        config = json.load(f)

    nodes = []
    edges = []

    company = config.get("company_name", "Company")
    nodes.append({"id": "org_0", "name": company, "type": "org", "attributes": {}})

    for i, agent in enumerate(config.get("agent_profiles", [])):
        agent_id = f"agent_{i}"
        nodes.append({
            "id": agent_id,
            "name": agent.get("name", f"Agent {i}"),
            "type": "agent",
            "attributes": {"role": agent.get("role", ""), "persona": agent.get("persona", "")},
        })
        edges.append({"source": agent_id, "target": "org_0", "label": agent.get("role", "member"), "type": "works_at"})

    for i, pressure in enumerate(config.get("pressures", [])):
        p_id = f"pressure_{i}"
        p_type = "compliance" if "gdpr" in pressure.get("name", "").lower() else "threat"
        nodes.append({
            "id": p_id,
            "name": pressure.get("name", f"Pressure {i}"),
            "type": p_type,
            "attributes": {"pressure_type": pressure.get("type", ""), "severity_at_50pct": pressure.get("severity_at_50pct", "")},
        })
        for j, agent in enumerate(config.get("agent_profiles", [])):
            if agent.get("role") in pressure.get("affects_roles", []):
                edges.append({"source": f"pressure_{i}", "target": f"agent_{j}", "label": "affects", "type": "pressure"})

    return jsonify({"data": {"nodes": nodes, "edges": edges}})


@crucible_bp.route("/simulations/<sim_id>/report", methods=["POST"])
def generate_report(sim_id):
    """Trigger after-action report generation using the report agent."""
    sim_dir = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id
    config_path = sim_dir / "config.json"
    actions_path = sim_dir / "actions.jsonl"
    report_path = sim_dir / "report.json"

    if not config_path.exists() or not actions_path.exists():
        return jsonify({"error": "Simulation data not found"}), 404

    if report_path.exists():
        return jsonify({"data": {"status": "complete"}}), 200

    from ..services.crucible_report_agent import run_report_generation
    run_report_generation(sim_id)
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/simulations/<sim_id>/report", methods=["GET"])
def get_report(sim_id):
    """Get generated after-action report."""
    report_json_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id / "report.json"
    if not report_json_path.exists():
        return jsonify({"data": {"simId": sim_id, "status": "generating"}}), 200
    with open(report_json_path) as f:
        report = json.load(f)
    report["simId"] = sim_id
    report["status"] = "complete"
    return jsonify({"data": report})


@crucible_bp.route("/simulations/<sim_id>/costs", methods=["GET"])
def get_simulation_costs(sim_id):
    """Get cost tracking data for a simulation."""
    from ..utils.cost_tracker import CostTracker
    costs = CostTracker.load(sim_id)
    if not costs:
        return jsonify({"data": {"sim_id": sim_id, "total_cost_usd": 0, "phases": {}, "entries": []}}), 200
    return jsonify({"data": costs})


# --- Project endpoints (generative pipeline) ---

from ..services import project_manager
from ..services.research_agent import run_research
from ..services.config_generator import run_config_generation
from ..services.firestore_memory import FirestoreMemory


@crucible_bp.route("/projects", methods=["POST"])
def create_project():
    """Create project, save uploaded files, start research."""
    company_url = request.form.get("company_url")
    if not company_url:
        return jsonify({"error": "company_url is required"}), 400

    user_context = request.form.get("user_context", "")

    # Collect files first, then create project with filenames, then save files, then start research
    files = request.files.getlist("files")
    uploaded_files = [f.filename for f in files if f.filename]

    project = project_manager.create_project(company_url, user_context, uploaded_files)
    project_dir = project_manager.get_project_dir(project["project_id"])

    for f in files:
        if f.filename:
            f.save(str(project_dir / "files" / f.filename))

    # Start research AFTER files are saved and project metadata is complete
    run_research(project["project_id"])

    return jsonify({"data": {"projectId": project["project_id"]}}), 201


@crucible_bp.route("/projects/<project_id>/status", methods=["GET"])
def project_status(project_id):
    """Poll project research/config-gen progress."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": f"Project '{project_id}' not found"}), 404
    return jsonify({"data": project})


@crucible_bp.route("/projects/<project_id>/dossier", methods=["GET"])
def get_dossier(project_id):
    """Get company dossier."""
    dossier = project_manager.get_dossier(project_id)
    if not dossier:
        return jsonify({"error": "Dossier not found"}), 404
    return jsonify({"data": dossier})


@crucible_bp.route("/projects/<project_id>/dossier", methods=["PUT"])
def update_dossier(project_id):
    """Update dossier and sync to Graphiti."""
    dossier = request.get_json()
    if not dossier:
        return jsonify({"error": "No dossier provided"}), 400

    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    project_manager.save_dossier(project_id, dossier)

    # Sync to Firestore memory
    try:
        FirestoreMemory().push_dossier(project_id, dossier)
    except Exception as e:
        return jsonify({"error": f"Firestore sync failed: {e}"}), 500

    return jsonify({"data": {"status": "updated"}})


@crucible_bp.route("/projects/<project_id>/graph", methods=["GET"])
def project_graph(project_id):
    """Get Graphiti graph data for D3 visualization."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    # Build graph from Firestore episodes — query all dossier episodes for this project
    try:
        from ..services.firestore_memory import FirestoreMemory
        memory = FirestoreMemory()

        # Query all dossier episodes from Firestore
        docs = (
            memory._episodes
            .where("sim_id", "==", project_id)
            .where("category", "==", "dossier")
            .get()
        )
        episodes = [doc.to_dict() for doc in docs]

        if not episodes:
            # Fallback: try to build from disk dossier
            dossier = project_manager.get_dossier(project_id)
            if not dossier:
                return jsonify({"data": {"nodes": [], "edges": []}})
            # Push dossier to Firestore for next time
            memory.push_dossier(project_id, dossier)
            docs = memory._episodes.where("sim_id", "==", project_id).where("category", "==", "dossier").get()
            episodes = [doc.to_dict() for doc in docs]

        nodes = []
        edges = []
        node_id = 0
        node_map = {}  # name -> node_id for linking

        for ep in episodes:
            action = ep.get("action_name", "")
            content = ep.get("action_summary", "")

            if action == "company_profile":
                # Parse company name from content
                name = content.split(".")[0].replace("Company: ", "")
                nid = f"n{node_id}"
                nodes.append({"id": nid, "name": name, "type": "organization", "summary": content[:200]})
                node_map["__company__"] = nid
                node_id += 1

            elif action.startswith("org_role_"):
                # Parse person name from content (format: "Name (Title) works in...")
                name = content.split(" works in")[0].split(" (")[0].strip()
                title = ""
                if "(" in content and ")" in content:
                    title = content.split("(")[1].split(")")[0]
                nid = f"n{node_id}"
                nodes.append({"id": nid, "name": name, "type": "person", "summary": title})
                node_map[name] = nid
                if "__company__" in node_map:
                    edges.append({"source": nid, "target": node_map["__company__"], "label": title or "works at", "type": "role"})
                node_id += 1

            elif action.startswith("system_"):
                # Parse system name (format: "System: Name (category, criticality: X)")
                name = content.replace("System: ", "").split(" (")[0].strip()
                nid = f"n{node_id}"
                nodes.append({"id": nid, "name": name, "type": "system", "summary": content[:200]})
                node_map[name] = nid
                if "__company__" in node_map:
                    edges.append({"source": node_map["__company__"], "target": nid, "label": "uses", "type": "system"})
                node_id += 1

            elif action.startswith("risk_"):
                # Parse risk name (format: "Risk: Name (likelihood: X, impact: Y)")
                name = content.replace("Risk: ", "").split(" (")[0].strip()
                nid = f"n{node_id}"
                nodes.append({"id": nid, "name": name, "type": "risk", "summary": content[:200]})
                node_map[name] = nid
                if "__company__" in node_map:
                    edges.append({"source": node_map["__company__"], "target": nid, "label": "faces", "type": "risk"})
                # Link to affected systems mentioned in content
                if "Affects:" in content:
                    affected = content.split("Affects:")[1].split(".")[0].strip()
                    for sys_name in [s.strip() for s in affected.split(",")]:
                        if sys_name in node_map:
                            edges.append({"source": nid, "target": node_map[sys_name], "label": "affects", "type": "risk"})
                node_id += 1

            elif action.startswith("event_"):
                nid = f"n{node_id}"
                # Shorter label from content
                label = content.split(":")[1].split(".")[0].strip()[:60] if ":" in content else content[:60]
                nodes.append({"id": nid, "name": label, "type": "event", "summary": content[:200]})
                if "__company__" in node_map:
                    edges.append({"source": node_map["__company__"], "target": nid, "label": "experienced", "type": "event"})
                node_id += 1

            elif action == "compliance":
                nid = f"n{node_id}"
                nodes.append({"id": nid, "name": "Compliance", "type": "compliance", "summary": content[:200]})
                if "__company__" in node_map:
                    edges.append({"source": node_map["__company__"], "target": nid, "label": "complies with", "type": "compliance"})
                node_id += 1

            elif action == "security_posture":
                nid = f"n{node_id}"
                nodes.append({"id": nid, "name": "Security Posture", "type": "security", "summary": content[:200]})
                if "__company__" in node_map:
                    edges.append({"source": node_map["__company__"], "target": nid, "label": "maintains", "type": "security"})
                node_id += 1

        return jsonify({"data": {"nodes": nodes, "edges": edges}})

    except Exception as e:
        logger.error(f"Graph build from Firestore failed: {e}")
        return jsonify({"data": {"nodes": [], "edges": []}})


@crucible_bp.route("/projects/<project_id>/generate-config", methods=["POST"])
def generate_config(project_id):
    """Trigger config generation from dossier."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    run_config_generation(project_id)
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/config", methods=["GET"])
def get_project_config(project_id):
    """Get generated SimulationConfig."""
    config = project_manager.get_config(project_id)
    if not config:
        # Check if still generating
        project = project_manager.get_project(project_id)
        if project and project.get("status") == "generating_config":
            return jsonify({"data": None, "status": "generating"}), 202
        return jsonify({"error": "Config not found"}), 404
    return jsonify({"data": config})


@crucible_bp.route("/projects/<project_id>", methods=["PATCH"])
def patch_project(project_id):
    """Update project fields (e.g., link simId after launch)."""
    updates = request.get_json()
    if not updates:
        return jsonify({"error": "No updates provided"}), 400
    project = project_manager.update_project(project_id, **updates)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    return jsonify({"data": {"status": "updated"}})


# --- Predictive pipeline endpoints ---


@crucible_bp.route("/projects/<project_id>/analyze-threats", methods=["POST"])
def analyze_threats(project_id):
    """Trigger threat analysis for a project (re-triggerable after dossier edits)."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    from ..services.threat_analyzer import run_threat_analysis
    run_threat_analysis(project_id)
    return jsonify({"data": {"status": "analyzing"}}), 202


@crucible_bp.route("/projects/<project_id>/scenarios", methods=["GET"])
def get_scenarios(project_id):
    analysis = project_manager.get_threat_analysis(project_id)
    if not analysis:
        return jsonify({"error": "Threat analysis not found"}), 404
    return jsonify({"data": {
        "scenarios": analysis.get("scenarios", []),
        "uncertainty_axes": analysis.get("uncertainty_axes", {}),
        "attack_paths": analysis.get("attack_paths", []),
    }})


@crucible_bp.route("/projects/<project_id>/generate-configs", methods=["POST"])
def generate_configs(project_id):
    data = request.get_json()
    if not data or "scenario_ids" not in data:
        return jsonify({"error": "scenario_ids required"}), 400
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    from ..services.config_expander import run_config_expansion
    run_config_expansion(project_id, data["scenario_ids"])
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/configs", methods=["GET"])
def get_project_configs(project_id):
    configs = project_manager.get_all_scenarios(project_id)
    return jsonify({"data": configs})


@crucible_bp.route("/projects/<project_id>/launch", methods=["POST"])
def launch_project_simulations(project_id):
    configs = project_manager.get_all_scenarios(project_id)
    if not configs:
        return jsonify({"error": "No configs ready"}), 404
    sim_ids = []
    for config in configs:
        sim_id = launch_simulation(config)
        sim_ids.append(sim_id)
    project_manager.update_project(project_id, sim_ids=sim_ids)
    return jsonify({"data": {"sim_ids": sim_ids}}), 201


@crucible_bp.route("/projects/<project_id>/comparative-report", methods=["POST"])
def trigger_comparative_report(project_id):
    from ..services.comparative_report_agent import run_comparative_report
    run_comparative_report(project_id)
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/comparative-report", methods=["GET"])
def get_comparative_report(project_id):
    report_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / f"comparative_{project_id}" / "report.json"
    if not report_path.exists():
        return jsonify({"data": {"status": "generating"}}), 200
    with open(report_path) as f:
        report = json.load(f)
    return jsonify({"data": report})


# --- Exercise Report (unified) ---

@crucible_bp.route("/projects/<project_id>/exercise-report", methods=["POST"])
def trigger_exercise_report(project_id):
    from ..services.exercise_report_agent import run_exercise_report
    run_exercise_report(project_id)
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/exercise-report", methods=["GET"])
def get_exercise_report(project_id):
    report_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / f"exercise_{project_id}" / "report.json"
    if not report_path.exists():
        return jsonify({"data": {"status": "generating"}}), 200
    with open(report_path) as f:
        report = json.load(f)
    return jsonify({"data": report})


# ─── Monte Carlo Endpoints ───

from ..services.monte_carlo_engine import MonteCarloEngine, MonteCarloMode
from ..utils.logger import get_logger as _get_logger

_mc_logger = _get_logger("monte_carlo_api")


@crucible_bp.route("/monte-carlo/estimate", methods=["POST"])
def monte_carlo_estimate():
    """Estimate cost for a Monte Carlo batch."""
    data = request.get_json()
    if not data or "config" not in data:
        return jsonify({"error": "config is required"}), 400

    mode = data.get("mode", "test")
    try:
        MonteCarloMode(mode)
    except ValueError:
        return jsonify({"error": f"Invalid mode '{mode}'. Must be one of: test, quick, standard, deep"}), 400

    custom_iterations = data.get("custom_iterations")
    try:
        estimate = MonteCarloEngine.estimate_cost(
            config=data["config"],
            mode=mode,
            custom_iterations=custom_iterations,
        )
    except Exception as e:
        _mc_logger.error("Cost estimation failed: %s", e)
        return jsonify({"error": f"Estimation failed: {e}"}), 500

    return jsonify({"data": estimate})


@crucible_bp.route("/monte-carlo/launch", methods=["POST"])
def monte_carlo_launch():
    """Launch a Monte Carlo batch."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    project_id = data.get("project_id")
    config = data.get("config")
    mode = data.get("mode", "test")

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    if not config:
        return jsonify({"error": "config is required"}), 400

    try:
        MonteCarloMode(mode)
    except ValueError:
        return jsonify({"error": f"Invalid mode '{mode}'. Must be one of: test, quick, standard, deep"}), 400

    cost_limit_usd = data.get("cost_limit_usd", 5.0)
    variation_params = data.get("variation_params")
    custom_iterations = data.get("custom_iterations")

    try:
        batch_id = MonteCarloEngine.launch_batch(
            project_id=project_id,
            base_config=config,
            mode=mode,
            cost_limit_usd=cost_limit_usd,
            variation_params=variation_params,
            custom_iterations=custom_iterations,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        _mc_logger.error("Launch failed: %s", e)
        return jsonify({"error": f"Launch failed: {e}"}), 500

    return jsonify({"data": {"batchId": batch_id}}), 201


@crucible_bp.route("/monte-carlo/<batch_id>/status", methods=["GET"])
def monte_carlo_status(batch_id):
    """Get batch progress."""
    status = MonteCarloEngine.get_batch_status(batch_id)
    if not status:
        return jsonify({"error": f"Batch '{batch_id}' not found"}), 404
    return jsonify({"data": status})


@crucible_bp.route("/monte-carlo/<batch_id>/results", methods=["GET"])
def monte_carlo_results(batch_id):
    """Get aggregate results."""
    results = MonteCarloEngine.get_batch_results(batch_id)
    if results is None:
        return jsonify({"error": f"Batch '{batch_id}' not found"}), 404

    # Also try to load aggregation from disk
    batch_status = MonteCarloEngine.get_batch_status(batch_id)
    aggregation = None
    if batch_status:
        agg_path = (
            Path(__file__).parent.parent.parent / "uploads" / "crucible_projects"
            / batch_status["project_id"] / "monte_carlo" / batch_id / "aggregation.json"
        )
        if agg_path.exists():
            with open(agg_path) as f:
                aggregation = json.load(f)

    return jsonify({"data": {
        "batch_id": batch_id,
        "iteration_results": results,
        "aggregation": aggregation,
    }})


@crucible_bp.route("/monte-carlo/<batch_id>/costs", methods=["GET"])
def monte_carlo_costs(batch_id):
    """Get per-iteration cost breakdown."""
    costs = MonteCarloEngine.get_batch_costs(batch_id)
    if not costs:
        return jsonify({"data": {"batch_id": batch_id, "total_cost_usd": 0, "phases": {}, "entries": []}}), 200
    return jsonify({"data": costs})


@crucible_bp.route("/monte-carlo/<batch_id>/stop", methods=["POST"])
def monte_carlo_stop(batch_id):
    """Stop running batch."""
    result = MonteCarloEngine.stop_batch(batch_id)
    if result == "not_found":
        return jsonify({"error": f"Batch '{batch_id}' not found"}), 404
    return jsonify({"data": {"status": result}})


# ─── Counterfactual Branching Endpoints ───

from ..services.counterfactual_engine import CounterfactualEngine

_cf_logger = _get_logger("counterfactual_api")


@crucible_bp.route("/simulations/<sim_id>/decision-points", methods=["POST"])
def simulation_decision_points(sim_id):
    """Identify critical decision points in a completed simulation."""
    sim_dir = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id
    config_path = sim_dir / "config.json"
    actions_path = sim_dir / "actions.jsonl"

    if not config_path.exists() or not actions_path.exists():
        return jsonify({"error": f"Simulation '{sim_id}' data not found"}), 404

    with open(config_path) as f:
        config = json.load(f)

    actions = []
    with open(actions_path) as f:
        for line in f:
            line = line.strip()
            if line:
                actions.append(json.loads(line))

    try:
        points = CounterfactualEngine.identify_decision_points(sim_id, actions, config)
    except Exception as e:
        _cf_logger.error("Decision point identification failed: %s", e)
        return jsonify({"error": f"Analysis failed: {e}"}), 500

    return jsonify({"data": {"decision_points": points}})


@crucible_bp.route("/simulations/<sim_id>/checkpoints", methods=["GET"])
def simulation_checkpoints(sim_id):
    """List available round checkpoints."""
    checkpoints = CounterfactualEngine.list_checkpoints(sim_id)
    return jsonify({"data": {"checkpoints": checkpoints}})


@crucible_bp.route("/simulations/<sim_id>/fork", methods=["POST"])
def simulation_fork(sim_id):
    """Fork a simulation from a checkpoint with modifications."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    fork_round = data.get("fork_round")
    modifications = data.get("modifications")

    if fork_round is None or modifications is None:
        return jsonify({"error": "fork_round and modifications are required"}), 400

    try:
        result = CounterfactualEngine.fork_from_checkpoint(
            original_sim_id=sim_id,
            fork_round=fork_round,
            modifications=modifications,
        )
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        _cf_logger.error("Fork failed: %s", e)
        return jsonify({"error": f"Fork failed: {e}"}), 500

    # Launch the forked simulation
    try:
        fork_sim_id = CounterfactualEngine.launch_fork(result)
        result["sim_id"] = fork_sim_id
    except Exception as e:
        _cf_logger.warning("Fork created but launch failed: %s", e)
        result["sim_id"] = None
        result["launch_error"] = str(e)

    return jsonify({"data": result}), 201


@crucible_bp.route("/simulations/<sim_id>/branches", methods=["GET"])
def simulation_branches(sim_id):
    """List branches and optionally compare outcomes."""
    branches = CounterfactualEngine.list_branches(sim_id)

    compare = request.args.get("compare", "false").lower() == "true"
    if compare and branches:
        branch_ids = [b["branch_id"] for b in branches]
        comparison = CounterfactualEngine.compare_branches(sim_id, branch_ids)
        return jsonify({"data": {"branches": branches, "comparison": comparison}})

    return jsonify({"data": {"branches": branches}})


# ─── Stress Testing Endpoints ───

from ..services.config_mutator import ConfigMutator

_stress_logger = _get_logger("stress_test_api")


@crucible_bp.route("/projects/<project_id>/stress-test", methods=["POST"])
def launch_stress_test(project_id):
    """Generate stress test matrix and launch as Monte Carlo batch."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    data = request.get_json() or {}
    config = data.get("config")

    # If no config provided, try loading the project's generated config
    if not config:
        config = project_manager.get_config(project_id)
    if not config:
        return jsonify({"error": "No config available — provide one or generate first"}), 400

    # Generate stress matrix
    try:
        matrix = ConfigMutator.generate_stress_matrix(config)
    except Exception as e:
        _stress_logger.error("Stress matrix generation failed: %s", e)
        return jsonify({"error": f"Matrix generation failed: {e}"}), 500

    cost_limit_usd = data.get("cost_limit_usd", 10.0)

    # Launch each mutation as a Monte Carlo iteration
    sim_ids = []
    labels = []
    for mutated_config, label in matrix:
        try:
            sim_id = launch_simulation(mutated_config)
            sim_ids.append(sim_id)
            labels.append(label)
        except Exception as e:
            _stress_logger.warning("Failed to launch mutation '%s': %s", label, e)

    # Track stress test metadata on the project
    project_manager.update_project(
        project_id,
        stress_test={
            "sim_ids": sim_ids,
            "labels": labels,
            "total_variants": len(matrix),
            "launched": len(sim_ids),
        },
    )

    _stress_logger.info(
        "Launched stress test for project %s: %d/%d variants",
        project_id,
        len(sim_ids),
        len(matrix),
    )

    return jsonify({"data": {
        "project_id": project_id,
        "total_variants": len(matrix),
        "launched": len(sim_ids),
        "sim_ids": sim_ids,
        "labels": labels,
    }}), 201
