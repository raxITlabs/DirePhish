"""
Counterfactual Branching Engine — identifies critical decision points in
completed simulations and forks alternative-history branches from checkpoints.

Phase 4 of the Crucible simulation platform.
"""

import copy
import json
import os
import uuid
from pathlib import Path

from ..config import Config
from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger

logger = get_logger("counterfactual_engine")

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
SIMULATIONS_DIR = UPLOADS_DIR / "simulations"


class CounterfactualEngine:
    """Analyse completed simulations, fork from checkpoints, and compare branches."""

    # ------------------------------------------------------------------
    # Action summary helper
    # ------------------------------------------------------------------

    @staticmethod
    def _build_action_summary(actions: list[dict]) -> str:
        """Build a concise summary of actions grouped by round."""
        rounds: dict[int, list[str]] = {}
        for action in actions:
            r = action.get("round", 0)
            agent = action.get("agent", "unknown")
            act = action.get("action", "unknown")
            summary = json.dumps(action.get("args", {}), ensure_ascii=False)[:100]
            rounds.setdefault(r, []).append(f"  - {agent} [{act}]: {summary}")

        return "\n".join(
            f"Round {r}:\n" + "\n".join(entries)
            for r, entries in sorted(rounds.items())
        )

    # ------------------------------------------------------------------
    # Decision-point identification
    # ------------------------------------------------------------------

    @staticmethod
    def identify_decision_points(
        sim_id: str, actions: list[dict], config: dict
    ) -> list[dict]:
        """Use LLM to identify 3-5 critical decision points in a completed simulation.

        Returns list of:
        {
            "round": int,
            "agent": str,
            "action_taken": str,
            "alternative": str,
            "potential_impact": str,
            "criticality": "high" | "medium",
            "suggested_modification": {
                "type": "agent_override" | "inject_event" | "remove_action",
                "details": {...}
            }
        }
        """
        timeline = CounterfactualEngine._build_action_summary(actions)

        company = config.get("company_name", "Unknown Company")
        scenario = config.get("scenario_name", "")

        prompt = f"""You are a crisis-simulation analyst. A cyber-incident simulation for
"{company}" (scenario: {scenario}) has completed. Below is the action timeline:

{timeline}

Identify 3-5 CRITICAL decision points where a different choice could have
materially changed the outcome. For each, provide:
- round (int)
- agent (name of the agent who acted)
- action_taken (what they actually did)
- alternative (what they could have done instead)
- potential_impact (how the outcome might differ)
- criticality ("high" or "medium")
- suggested_modification: an object with "type" (one of "agent_override",
  "inject_event", "remove_action") and "details" (dict with specifics).

Return ONLY a JSON object: {{"decision_points": [...]}}"""

        llm = LLMClient()
        try:
            result = llm.chat_json(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=4096,
            )
            points = result.get("decision_points", [])
            logger.info(
                "Identified %d decision points for sim %s", len(points), sim_id
            )
            return points
        except Exception as e:
            logger.error("Failed to identify decision points for %s: %s", sim_id, e)
            raise

    # ------------------------------------------------------------------
    # Fork from checkpoint
    # ------------------------------------------------------------------

    @staticmethod
    def fork_from_checkpoint(
        original_sim_id: str,
        fork_round: int,
        modifications: dict,
        output_base_dir: str = "uploads/simulations",
    ) -> dict:
        """Load a checkpoint and prepare a forked simulation config.

        Loads checkpoint from {sim_dir}/checkpoints/round_{fork_round}.json,
        applies modifications (agent_override, inject_event, etc.), creates a
        new sim directory for the branch, and returns info needed to resume.

        Returns:
            {"branch_id": str, "config": dict, "output_dir": str, "fork_round": int}
        """
        sim_dir = SIMULATIONS_DIR / original_sim_id
        checkpoint_path = sim_dir / "checkpoints" / f"round_{fork_round}.json"

        if not checkpoint_path.exists():
            raise FileNotFoundError(
                f"Checkpoint not found: {checkpoint_path}"
            )

        with open(checkpoint_path) as f:
            checkpoint = json.load(f)

        # Deep copy config from checkpoint (or fall back to sim config)
        config = copy.deepcopy(checkpoint.get("config", {}))
        if not config:
            config_path = sim_dir / "config.json"
            if config_path.exists():
                with open(config_path) as f:
                    config = json.load(f)

        # Apply modifications
        mod_type = modifications.get("type")
        details = modifications.get("details", {})

        if mod_type == "agent_override":
            agent_name = details.get("agent_name")
            override_action = details.get("action")
            for agent in config.get("agent_profiles", []):
                if agent.get("name") == agent_name:
                    agent.setdefault("overrides", []).append(
                        {"round": fork_round, "action": override_action}
                    )
                    break

        elif mod_type == "inject_event":
            event = details.get("event", {})
            event["injected_at_round"] = fork_round
            config.setdefault("injected_events", []).append(event)

        elif mod_type == "remove_action":
            agent_name = details.get("agent_name")
            for agent in config.get("agent_profiles", []):
                if agent.get("name") == agent_name:
                    agent.setdefault("suppressed_rounds", []).append(fork_round)
                    break

        # Create branch directory
        branch_id = f"branch_{uuid.uuid4().hex[:8]}"
        branch_dir = sim_dir / branch_id
        branch_dir.mkdir(parents=True, exist_ok=True)

        # Persist branch config
        config["_branch_meta"] = {
            "original_sim_id": original_sim_id,
            "fork_round": fork_round,
            "modifications": modifications,
            "branch_id": branch_id,
        }
        branch_config_path = branch_dir / "config.json"
        with open(branch_config_path, "w") as f:
            json.dump(config, f, indent=2)

        # Copy checkpoint state into branch
        branch_checkpoint_dir = branch_dir / "checkpoints"
        branch_checkpoint_dir.mkdir(parents=True, exist_ok=True)
        with open(branch_checkpoint_dir / f"round_{fork_round}.json", "w") as f:
            json.dump(checkpoint, f, indent=2)

        logger.info(
            "Forked sim %s at round %d -> branch %s",
            original_sim_id,
            fork_round,
            branch_id,
        )

        # Mark config for resume so the simulation runner knows where to start
        config["_resume_from_round"] = fork_round

        return {
            "branch_id": branch_id,
            "config": config,
            "output_dir": str(branch_dir),
            "fork_round": fork_round,
            "checkpoint": checkpoint,
        }

    # ------------------------------------------------------------------
    # Launch a fork
    # ------------------------------------------------------------------

    @staticmethod
    def launch_fork(fork_info: dict, callback_token: str | None = None) -> str:
        """Launch a forked simulation. Returns the new sim_id."""
        from . import crucible_manager

        config = fork_info["config"]
        branch_id = fork_info["branch_id"]
        sim_id = f"{config.get('simulation_id', 'sim')}_{branch_id}"
        config["simulation_id"] = sim_id
        config["_resume_from_round"] = fork_info["fork_round"]
        config["_checkpoint_state"] = fork_info.get("checkpoint")
        return crucible_manager.launch_simulation(config, callback_token=callback_token)

    # ------------------------------------------------------------------
    # Compare branches
    # ------------------------------------------------------------------

    @staticmethod
    def compare_branches(original_sim_id: str, branch_ids: list[str]) -> dict:
        """Compare outcomes across original and forked branches.

        Returns:
            {
                "original": {"sim_id": str, "containment_round": int|None, "total_actions": int, ...},
                "branches": [{"branch_id": str, "fork_round": int, "containment_round": int|None, ...}],
                "divergence_summary": str   # LLM-generated comparison
            }
        """
        sim_dir = SIMULATIONS_DIR / original_sim_id

        def _load_summary(path: Path) -> dict:
            """Load actions.jsonl and extract summary stats."""
            actions_path = path / "actions.jsonl"
            if not actions_path.exists():
                return {"total_actions": 0, "containment_round": None}
            actions = []
            with open(actions_path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        actions.append(json.loads(line))
            containment_round = None
            for a in actions:
                if "contain" in a.get("action", "").lower():
                    containment_round = a.get("round")
                    break
            return {
                "total_actions": len(actions),
                "containment_round": containment_round,
                "last_round": actions[-1].get("round") if actions else 0,
            }

        original_summary = _load_summary(sim_dir)
        original_summary["sim_id"] = original_sim_id

        branch_summaries = []
        for bid in branch_ids:
            branch_dir = sim_dir / bid
            summary = _load_summary(branch_dir)
            summary["branch_id"] = bid
            # Read fork_round from branch config
            branch_config_path = branch_dir / "config.json"
            if branch_config_path.exists():
                with open(branch_config_path) as f:
                    bc = json.load(f)
                summary["fork_round"] = bc.get("_branch_meta", {}).get(
                    "fork_round"
                )
            branch_summaries.append(summary)

        # LLM-generated divergence summary
        divergence_summary = ""
        try:
            prompt = f"""Compare these simulation branch outcomes and write a concise
divergence summary (2-3 sentences):

Original: {json.dumps(original_summary)}
Branches: {json.dumps(branch_summaries)}

Focus on how the fork decisions changed containment speed and action count."""

            llm = LLMClient()
            divergence_summary = llm.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.4,
                max_tokens=512,
            )
        except Exception as e:
            logger.warning("LLM comparison failed: %s", e)
            divergence_summary = "Comparison unavailable."

        return {
            "original": original_summary,
            "branches": branch_summaries,
            "divergence_summary": divergence_summary,
        }

    # ------------------------------------------------------------------
    # Checkpoint listing
    # ------------------------------------------------------------------

    @staticmethod
    def list_checkpoints(sim_id: str) -> list[dict]:
        """List available checkpoints for a simulation.

        Returns:
            [{"round": N, "action_count": int, "file_size": int}]
        """
        checkpoints_dir = SIMULATIONS_DIR / sim_id / "checkpoints"
        if not checkpoints_dir.exists():
            return []

        results = []
        for cp_file in sorted(checkpoints_dir.glob("round_*.json")):
            try:
                round_num = int(cp_file.stem.replace("round_", ""))
            except ValueError:
                continue
            stat = cp_file.stat()
            # Peek into the checkpoint for action count
            action_count = 0
            try:
                with open(cp_file) as f:
                    data = json.load(f)
                action_count = len(data.get("actions", []))
            except Exception:
                pass
            results.append({
                "round": round_num,
                "action_count": action_count,
                "file_size": stat.st_size,
            })

        return results

    # ------------------------------------------------------------------
    # Branch listing
    # ------------------------------------------------------------------

    @staticmethod
    def list_branches(sim_id: str) -> list[dict]:
        """List all branches forked from a simulation.

        Returns:
            [{"branch_id": str, "fork_round": int, "modifications": dict}]
        """
        sim_dir = SIMULATIONS_DIR / sim_id
        if not sim_dir.exists():
            return []

        branches = []
        for entry in sorted(sim_dir.iterdir()):
            if entry.is_dir() and entry.name.startswith("branch_"):
                branch_config_path = entry / "config.json"
                meta = {}
                if branch_config_path.exists():
                    try:
                        with open(branch_config_path) as f:
                            bc = json.load(f)
                        meta = bc.get("_branch_meta", {})
                    except Exception:
                        pass
                branches.append({
                    "branch_id": entry.name,
                    "fork_round": meta.get("fork_round"),
                    "modifications": meta.get("modifications", {}),
                })

        return branches
