"""
Flask blueprint for Crucible simulation API.
All endpoints under /api/crucible/*
"""
import json
import subprocess
import threading
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request

from ..services.crucible_manager import (
    list_presets,
    get_preset_config,
    launch_simulation,
    get_simulation_status,
    get_simulation_actions,
    stop_simulation,
)

crucible_bp = Blueprint("crucible", __name__)


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
    """Build graph data from simulation config (agents, org, pressures)."""
    status = get_simulation_status(sim_id)
    if not status:
        return jsonify({"error": f"Simulation '{sim_id}' not found"}), 404

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
    """Trigger after-action report generation via subprocess."""
    sim_dir = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id
    config_path = sim_dir / "config.json"
    actions_path = sim_dir / "actions.jsonl"
    report_path = sim_dir / "report.json"

    if not config_path.exists() or not actions_path.exists():
        return jsonify({"error": "Simulation data not found"}), 404

    if report_path.exists():
        return jsonify({"data": {"status": "complete"}}), 200

    script_path = Path(__file__).parent.parent.parent / "scripts" / "generate_after_action_report.py"

    def _run():
        subprocess.run(
            ["uv", "run", "python", str(script_path), str(config_path), str(actions_path), str(report_path)],
            cwd=str(Path(__file__).parent.parent.parent),
        )

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/simulations/<sim_id>/report", methods=["GET"])
def get_report(sim_id):
    """Get generated after-action report."""
    report_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id / "report.json"
    if not report_path.exists():
        return jsonify({"data": {"simId": sim_id, "status": "generating"}}), 200
    with open(report_path) as f:
        report = json.load(f)
    report["simId"] = sim_id
    report["status"] = "complete"
    return jsonify({"data": report})
