"""
Crucible simulation manager — loads presets, launches simulations, tracks state.
"""
import json
import os
import subprocess
import threading
import uuid
from pathlib import Path

import yaml

# Crucible builtins location (from installed package)
try:
    import crucible
    CRUCIBLE_BUILTINS = Path(crucible.__file__).parent / "builtins"
except ImportError:
    CRUCIBLE_BUILTINS = None

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
SIMULATIONS_DIR = UPLOADS_DIR / "simulations"
SCRIPTS_DIR = Path(__file__).parent.parent.parent / "scripts"

PRESET_METADATA = {
    "cybersecurity_ir": {
        "description": "Incident response simulation for a cybersecurity breach with GDPR compliance pressure, SLA timers, and multi-team coordination.",
    },
}


def list_presets() -> list[dict]:
    """List available Crucible presets from builtins directory."""
    if not CRUCIBLE_BUILTINS:
        return []
    presets_dir = CRUCIBLE_BUILTINS / "presets"
    if not presets_dir.exists():
        return []
    presets = []
    for yaml_file in sorted(presets_dir.glob("*.yaml")):
        preset_id = yaml_file.stem
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        enterprise = data.get("enterprise", {})
        meta = PRESET_METADATA.get(preset_id, {})
        presets.append({
            "id": preset_id,
            "name": enterprise.get("name", preset_id),
            "description": meta.get("description", ""),
            "industry": enterprise.get("industry", ""),
            "size": enterprise.get("size", "medium"),
            "worldTypes": [w.get("name", w.get("type", "")) for w in enterprise.get("worlds", [])],
            "pressureCount": len(enterprise.get("pressures", [])),
        })
    return presets


def get_preset_config(preset_id: str) -> dict | None:
    """Load a preset YAML and return it as a SimulationConfig-shaped dict.
    Also handles custom uploaded configs (IDs starting with 'custom_')."""
    if preset_id.startswith("custom_"):
        config_path = UPLOADS_DIR / "configs" / f"{preset_id}.json"
        if not config_path.exists():
            return None
        with open(config_path) as f:
            return json.load(f)

    if not CRUCIBLE_BUILTINS:
        return None
    yaml_path = CRUCIBLE_BUILTINS / "presets" / f"{preset_id}.yaml"
    if not yaml_path.exists():
        return None
    with open(yaml_path) as f:
        data = yaml.safe_load(f)
    enterprise = data.get("enterprise", {})
    org = enterprise.get("org", {})
    reporting_lines = org.get("reporting_lines", {})
    agent_profiles = []
    for role_name in reporting_lines:
        agent_profiles.append({
            "name": role_name.replace("_", " ").title(),
            "role": role_name,
            "persona": f"{role_name.replace('_', ' ').title()} at {enterprise.get('name', 'the company')}.",
        })
    for manager in set(reporting_lines.values()):
        if manager not in reporting_lines:
            agent_profiles.append({
                "name": manager.replace("_", " ").title(),
                "role": manager,
                "persona": f"{manager.replace('_', ' ').title()} at {enterprise.get('name', 'the company')}.",
            })

    return {
        "company_name": enterprise.get("name", ""),
        "scenario": "",
        "total_rounds": 5,
        "hours_per_round": 1.0,
        "agent_profiles": agent_profiles,
        "worlds": enterprise.get("worlds", []),
        "pressures": enterprise.get("pressures", []),
        "scheduled_events": [],
    }


_simulations: dict[str, dict] = {}
_processes: dict[str, subprocess.Popen] = {}
_pushed_action_counts: dict[str, int] = {}  # tracks how many actions have been pushed to Zep


def launch_simulation(config: dict) -> str:
    """Save config and launch run_crucible_simulation.py as subprocess."""
    sim_id = config.get("simulation_id") or f"crucible_{uuid.uuid4().hex[:8]}"
    config["simulation_id"] = sim_id

    sim_dir = SIMULATIONS_DIR / sim_id
    sim_dir.mkdir(parents=True, exist_ok=True)

    config_path = sim_dir / "config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    # Try to find the project's Zep graph ID for live graph updates
    graph_id = None
    if sim_id.startswith("proj_"):
        project_id = sim_id.replace("_sim", "")
        try:
            from . import project_manager
            proj = project_manager.get_project(project_id)
            if proj:
                graph_id = proj.get("graph_id")
        except Exception:
            pass

    _simulations[sim_id] = {
        "sim_id": sim_id,
        "status": "starting",
        "current_round": 0,
        "total_rounds": config.get("total_rounds", 5),
        "action_count": 0,
        "graph_id": graph_id,
    }

    script_path = SCRIPTS_DIR / "run_crucible_simulation.py"
    proc = subprocess.Popen(
        ["uv", "run", "python", str(script_path), "--config", str(config_path), "--output", str(sim_dir)],
        cwd=str(Path(__file__).parent.parent.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    _processes[sim_id] = proc
    _simulations[sim_id]["status"] = "running"

    def _monitor():
        proc.wait()
        if sim_id in _simulations:
            _simulations[sim_id]["status"] = "completed" if proc.returncode == 0 else "failed"

    threading.Thread(target=_monitor, daemon=True).start()
    return sim_id


def get_simulation_status(sim_id: str) -> dict | None:
    """Get current simulation status including action count from actions.jsonl."""
    state = _simulations.get(sim_id)
    if not state:
        return None

    actions_path = SIMULATIONS_DIR / sim_id / "actions.jsonl"
    actions = _read_actions(actions_path)
    if actions:
        state["action_count"] = len(actions)
        state["current_round"] = max(a.get("round", 0) for a in actions)

        # Push new actions to Zep for graph growth (if graph exists)
        graph_id = state.get("graph_id")
        if graph_id:
            _push_new_actions_to_zep(sim_id, graph_id, actions)

    state["pressures"] = []
    state["recent_actions"] = actions[-10:] if actions else []
    return state


def _push_new_actions_to_zep(sim_id: str, graph_id: str, actions: list[dict]) -> None:
    """Push any new actions to Zep to grow the knowledge graph during simulation."""
    already_pushed = _pushed_action_counts.get(sim_id, 0)
    new_actions = actions[already_pushed:]
    if not new_actions:
        return

    try:
        from zep_cloud.client import Zep
        from ..config import Config
        client = Zep(api_key=Config.ZEP_API_KEY)

        for action in new_actions:
            agent = action.get("agent", "Unknown")
            role = action.get("role", "")
            world = action.get("world", "")
            action_type = action.get("action", "")
            args = action.get("args", {})

            # Build a text summary of the action for Zep
            if action_type in ("send_message", "reply_in_thread"):
                content = args.get("content", "")[:500]
                text = f"{agent} ({role}) said in {world}: {content}"
            elif action_type in ("send_email", "reply_email"):
                subject = args.get("subject", "")
                body = args.get("body", "")[:300]
                to = args.get("to", "")
                text = f"{agent} ({role}) emailed {to} about '{subject}': {body}"
            else:
                text = f"{agent} ({role}) performed {action_type} in {world}."

            try:
                client.graph.add(graph_id=graph_id, data=text, type="text")
            except Exception:
                pass  # Don't fail status polling if Zep push fails

        _pushed_action_counts[sim_id] = len(actions)
    except Exception:
        pass  # Zep integration is best-effort


def get_simulation_actions(sim_id: str, world: str | None = None, from_round: int | None = None) -> list[dict]:
    """Read actions from actions.jsonl with optional filters."""
    actions_path = SIMULATIONS_DIR / sim_id / "actions.jsonl"
    actions = _read_actions(actions_path)
    if world:
        actions = [a for a in actions if a.get("world") == world]
    if from_round is not None:
        actions = [a for a in actions if a.get("round", 0) >= from_round]
    return actions


def stop_simulation(sim_id: str) -> str:
    """Stop a running simulation."""
    proc = _processes.get(sim_id)
    if proc and proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=10)
    if sim_id in _simulations:
        _simulations[sim_id]["status"] = "stopped"
    return "stopped"


def _read_actions(path: Path) -> list[dict]:
    """Read actions.jsonl file."""
    if not path.exists():
        return []
    actions = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    actions.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return actions
