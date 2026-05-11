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

from ..utils.logger import get_logger

logger = get_logger("crucible_manager")

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


def list_all_simulations() -> list[dict]:
    """Return all simulations sorted by most recent first."""
    result = []
    for sim_id, state in _simulations.items():
        result.append({
            "sim_id": sim_id,
            "status": state.get("status", "unknown"),
            "current_round": state.get("current_round", 0),
            "total_rounds": state.get("total_rounds", 0),
            "action_count": state.get("action_count", 0),
        })
    # Most recent first (sim_id contains timestamps or sequential IDs)
    result.sort(key=lambda x: x["sim_id"], reverse=True)
    return result


def launch_simulation(config: dict, callback_token: str | None = None) -> str:
    """Save config and launch backend.adk.runner as subprocess."""
    sim_id = config.get("simulation_id") or f"crucible_{uuid.uuid4().hex[:8]}"
    config["simulation_id"] = sim_id

    sim_dir = SIMULATIONS_DIR / sim_id
    sim_dir.mkdir(parents=True, exist_ok=True)

    config_path = sim_dir / "config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    # Find the project's graph ID for live graph updates
    graph_id = None
    project_id = config.get("project_id")
    if not project_id and sim_id.startswith("proj_"):
        project_id = sim_id.replace("_sim", "")
    if project_id:
        try:
            from . import project_manager
            proj = project_manager.get_project(project_id)
            if proj:
                graph_id = proj.get("graph_id")
                logger.info(f"Simulation {sim_id} linked to project {project_id}, graph_id={graph_id}")
        except Exception:
            pass

    # Use adaptive_depth.max_rounds as the effective total when available,
    # since the arbiter can extend the sim beyond the initial total_rounds.
    ad = config.get("adaptive_depth", {})
    effective_total = ad.get("max_rounds", config.get("total_rounds", 5)) if ad.get("enabled") else config.get("total_rounds", 5)

    _simulations[sim_id] = {
        "sim_id": sim_id,
        "status": "starting",
        "current_round": 0,
        "total_rounds": effective_total,
        "action_count": 0,
        "graph_id": graph_id,
    }

    stdout_log = sim_dir / "stdout.log"
    stderr_log = sim_dir / "stderr.log"
    stdout_fh = open(stdout_log, "w")
    stderr_fh = open(stderr_log, "w")
    proc = subprocess.Popen(
        ["uv", "run", "python", "-m", "backend.adk.runner", "--config", str(config_path), "--output", str(sim_dir)],
        cwd=str(Path(__file__).parent.parent.parent),
        stdout=stdout_fh,
        stderr=stderr_fh,
    )
    _processes[sim_id] = proc
    _simulations[sim_id]["status"] = "running"

    def _monitor():
        proc.wait()
        stdout_fh.close()
        stderr_fh.close()
        if sim_id in _simulations:
            if proc.returncode == 0:
                _simulations[sim_id]["status"] = "completed"
                if callback_token:
                    from .workflow_callback import resume_workflow_hook
                    resume_workflow_hook(callback_token, {"status": "completed", "sim_id": sim_id})
            else:
                _simulations[sim_id]["status"] = "failed"
                error_msg = ""
                try:
                    stderr_text = stderr_log.read_text()[-2000:]
                    if stderr_text:
                        error_msg = stderr_text
                        logger.error(f"Simulation {sim_id} failed (exit {proc.returncode}):\n{stderr_text}")
                except Exception:
                    logger.error(f"Simulation {sim_id} failed (exit {proc.returncode})")
                if callback_token:
                    from .workflow_callback import resume_workflow_hook
                    resume_workflow_hook(callback_token, {"status": "failed", "sim_id": sim_id, "error": error_msg[:500]})

    threading.Thread(target=_monitor, daemon=True).start()
    return sim_id


def get_simulation_status(sim_id: str) -> dict | None:
    """Get current simulation status including action count from actions.jsonl."""
    state = _simulations.get(sim_id)
    if not state:
        return None

    sim_dir = Path(state["output_dir"]) if state.get("output_dir") else SIMULATIONS_DIR / sim_id
    actions_path = sim_dir / "actions.jsonl"
    actions = _read_actions(actions_path)
    if actions:
        state["action_count"] = len(actions)
        state["current_round"] = max(a.get("round", 0) for a in actions)

        # Firestore writes happen in the sim runner itself now — no separate push needed.
        # Report a static push status so the frontend sees graph data as always ready.
        graph_id = state.get("graph_id")
        if graph_id:
            state["graph_push"] = {"pushing": False, "version": state["action_count"]}

    state["pressures"] = []
    state["recent_actions"] = actions[-10:] if actions else []
    return state



def get_simulation_actions(sim_id: str, world: str | None = None, from_round: int | None = None) -> list[dict]:
    """Read actions from actions.jsonl with optional filters."""
    state = _simulations.get(sim_id, {})
    sim_dir = Path(state["output_dir"]) if state.get("output_dir") else SIMULATIONS_DIR / sim_id
    actions_path = sim_dir / "actions.jsonl"
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


def _rehydrate_simulations():
    """Rebuild _simulations from disk for completed/failed sims that survived a restart."""
    if not SIMULATIONS_DIR.exists():
        return
    for sim_dir in SIMULATIONS_DIR.iterdir():
        if not sim_dir.is_dir():
            continue
        sim_id = sim_dir.name
        if sim_id in _simulations:
            continue
        config_path = sim_dir / "config.json"
        if not config_path.exists():
            continue
        try:
            with open(config_path) as f:
                config = json.load(f)
            actions_path = sim_dir / "actions.jsonl"
            actions = _read_actions(actions_path)
            ad = config.get("adaptive_depth", {})
            total_rounds = ad.get("max_rounds", config.get("total_rounds", 5)) if ad.get("enabled") else config.get("total_rounds", 5)
            current_round = max((a.get("round", 0) for a in actions), default=0) if actions else 0
            status = "completed" if actions else "unknown"

            graph_id = None
            project_id = config.get("project_id")
            if not project_id and sim_id.startswith("proj_"):
                project_id = sim_id.replace("_sim", "")
            if project_id:
                try:
                    from . import project_manager
                    proj = project_manager.get_project(project_id)
                    if proj:
                        graph_id = proj.get("graph_id")
                except Exception:
                    pass

            _simulations[sim_id] = {
                "sim_id": sim_id,
                "status": status,
                "current_round": current_round,
                "total_rounds": total_rounds,
                "action_count": len(actions) if actions else 0,
                "graph_id": graph_id,
            }
        except Exception as e:
            logger.warning(f"Failed to rehydrate simulation {sim_id}: {e}")

    # Also scan MC iteration directories (stored separately from main sims)
    projects_dir = SIMULATIONS_DIR.parent / "crucible_projects"
    if projects_dir.exists():
        for project_dir in projects_dir.iterdir():
            mc_dir = project_dir / "monte_carlo"
            if not mc_dir.is_dir():
                continue
            for batch_dir in mc_dir.iterdir():
                if not batch_dir.is_dir():
                    continue
                for iter_dir in batch_dir.iterdir():
                    if not iter_dir.is_dir() or iter_dir.name.endswith(".json"):
                        continue
                    sim_id = iter_dir.name
                    if sim_id in _simulations:
                        continue
                    actions_path = iter_dir / "actions.jsonl"
                    if not actions_path.exists():
                        continue
                    try:
                        actions = _read_actions(actions_path)
                        current_round = max((a.get("round", 0) for a in actions), default=0) if actions else 0
                        _simulations[sim_id] = {
                            "sim_id": sim_id,
                            "status": "completed",
                            "current_round": current_round,
                            "total_rounds": current_round,
                            "action_count": len(actions) if actions else 0,
                            "graph_id": project_dir.name,
                            "output_dir": str(iter_dir),
                        }
                    except Exception:
                        pass

    if _simulations:
        logger.info(f"Rehydrated {len(_simulations)} simulation(s) from disk")


_rehydrate_simulations()
