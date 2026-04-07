"""
Monte Carlo Engine — orchestrates batch simulation runs with concurrency control
and cost enforcement.

Launches N iterations of a simulation with controlled variations (temperature,
persona, timing, agent order), enforces a per-batch cost ceiling, and aggregates
results via monte_carlo_aggregator.
"""

import asyncio
import json
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from ..config import Config
from ..utils.cost_tracker import CostTracker, _get_model_pricing
from ..utils.logger import get_logger
from ..utils.console import MissionControl
from .crucible_manager import _simulations

logger = get_logger("monte_carlo_engine")

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"


# ---------------------------------------------------------------------------
# Mode definitions
# ---------------------------------------------------------------------------

class MonteCarloMode(str, Enum):
    TEST = "test"           # 3 iterations, sequential
    QUICK = "quick"         # 10 iterations, 2 workers
    STANDARD = "standard"   # 50 iterations, 3 workers
    DEEP = "deep"           # 100+ iterations, 3 workers


MODE_CONFIGS = {
    MonteCarloMode.TEST:     {"iterations": 3,   "max_workers": 2},
    MonteCarloMode.QUICK:    {"iterations": 10,  "max_workers": 2},
    MonteCarloMode.STANDARD: {"iterations": 50,  "max_workers": 3},
    MonteCarloMode.DEEP:     {"iterations": 100, "max_workers": 3},
}


# ---------------------------------------------------------------------------
# Batch dataclass
# ---------------------------------------------------------------------------

@dataclass
class MonteCarloBatch:
    batch_id: str
    project_id: str
    mode: MonteCarloMode
    status: str  # pending | running | completed | failed | cost_exceeded | stopped | paused
    iterations_total: int
    iterations_completed: int = 0
    iterations_failed: int = 0
    cost_tracker: CostTracker = field(default=None)
    cost_limit_usd: float = 5.0
    results: list[dict] = field(default_factory=list)
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None
    _stop_requested: bool = field(default=False, repr=False)
    _pause_requested: bool = field(default=False, repr=False)
    _callback_token: str | None = field(default=None, repr=False)

    def to_dict(self) -> dict:
        """Serialize batch state for API responses."""
        return {
            "batch_id": self.batch_id,
            "project_id": self.project_id,
            "mode": self.mode.value,
            "status": self.status,
            "iterations_total": self.iterations_total,
            "iterations_completed": self.iterations_completed,
            "iterations_failed": self.iterations_failed,
            "cost_limit_usd": self.cost_limit_usd,
            "current_cost_usd": self.cost_tracker.total_cost() if self.cost_tracker else 0.0,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class MonteCarloEngine:
    """Class-level state for Monte Carlo batch orchestration."""

    _batches: dict[str, MonteCarloBatch] = {}

    @classmethod
    def launch_batch(
        cls,
        project_id: str,
        base_config: dict,
        mode: MonteCarloMode | str,
        cost_limit_usd: float = 5.0,
        variation_params: dict | None = None,
        custom_iterations: int | None = None,
        skip_gating: bool = False,
        callback_token: str | None = None,
    ) -> str:
        """Launch a Monte Carlo batch. Returns batch_id."""
        if isinstance(mode, str):
            mode = MonteCarloMode(mode)

        # Mode gating: standard/deep require a completed test batch
        # Pipeline runs bypass this since they always run the full sequence
        if not skip_gating and mode in (MonteCarloMode.STANDARD, MonteCarloMode.DEEP):
            test_results_path = (
                UPLOADS_DIR / "crucible_projects" / project_id
                / "monte_carlo" / "test_results.json"
            )
            if not test_results_path.exists():
                raise ValueError(
                    f"Mode '{mode.value}' requires a completed TEST batch first. "
                    f"Run a test batch and verify results before scaling up."
                )

        mode_cfg = MODE_CONFIGS[mode]
        iterations = custom_iterations or mode_cfg["iterations"]

        batch_id = f"mc_{uuid.uuid4().hex[:12]}"
        cost_tracker = CostTracker(sim_id=batch_id)

        batch = MonteCarloBatch(
            batch_id=batch_id,
            project_id=project_id,
            mode=mode,
            status="pending",
            iterations_total=iterations,
            cost_tracker=cost_tracker,
            cost_limit_usd=cost_limit_usd,
        )
        cls._batches[batch_id] = batch
        batch._callback_token = callback_token

        logger.info(
            "Launching Monte Carlo batch %s — mode=%s, iterations=%d, cost_limit=$%.2f",
            batch_id, mode.value, iterations, cost_limit_usd,
        )
        MissionControl.phase("MONTE CARLO", batch_id)
        MissionControl.mc_header(batch_id, mode.value, iterations, mode_cfg["max_workers"], cost_limit_usd)

        # Spawn background thread to run the async batch
        _cb_token = callback_token
        thread = threading.Thread(
            target=lambda: asyncio.run(
                _run_batch(batch, base_config, variation_params or {}, callback_token=_cb_token)
            ),
            daemon=True,
        )
        thread.start()

        return batch_id

    @classmethod
    def get_batch_status(cls, batch_id: str) -> dict | None:
        """Return batch status for API polling."""
        batch = cls._batches.get(batch_id)
        if not batch:
            return None
        return batch.to_dict()

    @classmethod
    def stop_batch(cls, batch_id: str) -> str:
        """Cancel a running batch."""
        batch = cls._batches.get(batch_id)
        if not batch:
            return "not_found"
        if batch.status not in ("pending", "running"):
            return batch.status
        batch._stop_requested = True
        batch.status = "stopped"
        batch.completed_at = datetime.now(timezone.utc).isoformat()
        logger.info("Batch %s stop requested", batch_id)
        return "stopped"

    @classmethod
    def pause_batch(cls, batch_id: str) -> str:
        """Pause a running batch. In-flight iterations finish, pending ones skip."""
        batch = cls._batches.get(batch_id)
        if not batch:
            return "not_found"
        if batch.status not in ("pending", "running"):
            return batch.status
        batch._pause_requested = True
        batch.status = "paused"
        # Don't set completed_at — batch is not done
        logger.info("Batch %s pause requested at %d/%d", batch_id, batch.iterations_completed, batch.iterations_total)
        return "paused"

    @classmethod
    def resume_batch(cls, batch_id: str) -> str:
        """Resume a paused batch from where it left off."""
        batch = cls._batches.get(batch_id)
        if not batch:
            return "not_found"
        if batch.status != "paused":
            return batch.status
        batch._pause_requested = False
        batch.status = "running"
        remaining = batch.iterations_total - batch.iterations_completed
        logger.info("Batch %s resuming — %d iterations remaining", batch_id, remaining)

        # Re-launch the batch for remaining iterations in a background thread
        # We need the original config — read it from the first iteration's directory
        mc_dir = UPLOADS_DIR / "crucible_projects" / batch.project_id / "monte_carlo" / batch.batch_id
        config_path = mc_dir / "base_config.json"
        if config_path.exists():
            import json as _json
            with open(config_path) as f:
                base_config = _json.load(f)
        else:
            logger.error("Cannot resume batch %s: base_config.json not found", batch_id)
            batch.status = "failed"
            batch.error = "Cannot resume: config not found"
            return "failed"

        # Get the callback token from the batch — it was stored when launched
        cb_token = getattr(batch, '_callback_token', None)

        thread = threading.Thread(
            target=lambda: asyncio.run(
                _run_batch_resume(batch, base_config, remaining, callback_token=cb_token)
            ),
            daemon=True,
        )
        thread.start()
        return "running"

    @classmethod
    def estimate_cost(
        cls,
        config: dict,
        mode: MonteCarloMode | str,
        custom_iterations: int | None = None,
    ) -> dict:
        """Calculate expected cost WITHOUT launching."""
        if isinstance(mode, str):
            mode = MonteCarloMode(mode)

        mode_cfg = MODE_CONFIGS[mode]
        iterations = custom_iterations or mode_cfg["iterations"]

        num_agents = len(config.get("agent_profiles", []))
        num_worlds = max(len(config.get("worlds", [])), 1)
        total_rounds = config.get("total_rounds", 10)
        per_sim_calls = num_agents * num_worlds * total_rounds

        avg_input_tokens = 800
        avg_output_tokens = 200

        input_price, output_price, _ = _get_model_pricing(Config.LLM_MODEL_NAME)

        per_sim_cost = (
            per_sim_calls * avg_input_tokens * input_price
            + per_sim_calls * avg_output_tokens * output_price
        ) / 1_000_000

        total_cost = per_sim_cost * iterations

        return {
            "mode": mode.value,
            "iterations": iterations,
            "max_workers": mode_cfg["max_workers"],
            "per_sim_calls": per_sim_calls,
            "per_sim_cost_usd": round(per_sim_cost, 6),
            "total_estimated_cost_usd": round(total_cost, 4),
            "model": Config.LLM_MODEL_NAME,
            "num_agents": num_agents,
            "num_worlds": num_worlds,
            "total_rounds": total_rounds,
        }

    @classmethod
    def list_batches(cls, project_id: str | None = None) -> list[dict]:
        """List all batches, optionally filtered by project."""
        batches = []
        for batch in cls._batches.values():
            if project_id and batch.project_id != project_id:
                continue
            batches.append(batch.to_dict())
        # Most recent first
        batches.sort(key=lambda b: b["started_at"] or "", reverse=True)
        return batches

    @classmethod
    def get_batch_results(cls, batch_id: str) -> list[dict] | None:
        """Return raw iteration results for a batch."""
        batch = cls._batches.get(batch_id)
        if not batch:
            return None
        return batch.results

    @classmethod
    def get_batch_costs(cls, batch_id: str) -> dict | None:
        """Return cost summary for a batch."""
        batch = cls._batches.get(batch_id)
        if not batch:
            return None
        return batch.cost_tracker.summary() if batch.cost_tracker else None


# ---------------------------------------------------------------------------
# Async batch runner
# ---------------------------------------------------------------------------

async def _run_batch(
    batch: MonteCarloBatch,
    base_config: dict,
    variation_params: dict,
    callback_token: str | None = None,
):
    """Run all iterations with semaphore-based concurrency."""
    batch.status = "running"
    batch.started_at = datetime.now(timezone.utc).isoformat()
    batch_start_time = time.time()
    batch._start_epoch = batch_start_time  # Used by iteration progress reporting

    mode_cfg = MODE_CONFIGS[batch.mode]
    semaphore = asyncio.Semaphore(mode_cfg["max_workers"])

    # Import the sim runner from scripts/
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from scripts.run_crucible_simulation import run_single_iteration

    # Shared dependencies — use AsyncOpenAI for parallel sim runner
    from openai import AsyncOpenAI
    import httpx

    shared_client = AsyncOpenAI(
        api_key=Config.LLM_API_KEY,
        base_url=Config.LLM_BASE_URL,
        timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=5.0),
        max_retries=2,
    )
    shared_model = Config.LLM_MODEL_NAME

    from .firestore_memory import FirestoreMemory

    shared_memory = FirestoreMemory(cost_tracker=batch.cost_tracker)

    from .monte_carlo_variations import VariationGenerator

    var_gen = VariationGenerator()

    # Create output directory
    mc_dir = (
        UPLOADS_DIR / "crucible_projects" / batch.project_id / "monte_carlo" / batch.batch_id
    )
    mc_dir.mkdir(parents=True, exist_ok=True)

    # Save config for potential resume
    config_path = mc_dir / "base_config.json"
    if not config_path.exists():
        with open(config_path, "w") as f:
            json.dump(base_config, f, indent=2)

    tasks = []
    for i in range(batch.iterations_total):
        task = asyncio.create_task(
            _run_iteration(
                batch=batch,
                iteration_index=i,
                base_config=base_config,
                semaphore=semaphore,
                shared_client=shared_client,
                shared_model=shared_model,
                shared_memory=shared_memory,
                var_gen=var_gen,
                variation_params=variation_params,
                output_dir=str(mc_dir),
                run_single_iteration=run_single_iteration,
            )
        )
        tasks.append(task)

    await asyncio.gather(*tasks, return_exceptions=True)

    if batch.status == "paused":
        # Don't aggregate, don't callback — wait for resume
        logger.info("Batch %s paused at %d/%d iterations", batch.batch_id, batch.iterations_completed, batch.iterations_total)
        return

    # Final status
    if batch.status == "stopped":
        pass  # Already set
    elif batch.status == "cost_exceeded":
        pass  # Already set
    elif batch.iterations_failed == batch.iterations_total:
        batch.status = "failed"
        batch.error = "All iterations failed"
    else:
        batch.status = "completed"

    batch.completed_at = datetime.now(timezone.utc).isoformat()

    # Aggregate results
    try:
        from dataclasses import asdict
        from pathlib import Path as _Path
        from .monte_carlo_aggregator import aggregate_batch, IterationResult

        valid_results = []

        # Disk-based recovery: if batch.results is empty (e.g. Flask reloader
        # cleared in-memory state), rebuild from iteration dirs on disk.
        if not batch.results:
            logger.info("batch.results empty — recovering from disk for %s", batch.batch_id)
            for iter_dir_candidate in sorted(mc_dir.iterdir()):
                if iter_dir_candidate.is_dir() and "_iter_" in iter_dir_candidate.name:
                    summary_path = iter_dir_candidate / "summary.json"
                    if summary_path.exists():
                        with open(summary_path) as f:
                            s = json.load(f)
                        batch.results.append({
                            "iteration_id": iter_dir_candidate.name,
                            "status": "completed",
                            "output_dir": str(iter_dir_candidate),
                            "seed": s.get("seed", 0),
                            "total_rounds": s.get("total_rounds", 0),
                            "total_actions": s.get("total_actions", 0),
                            "cost_usd": s.get("cost_usd", 0),
                            "variation_description": s.get("variation_description", ""),
                            "completed_at": s.get("completed_at", ""),
                        })
            logger.info("Recovered %d iteration(s) from disk", len(batch.results))

        for r in batch.results:
            if r.get("status") != "completed":
                continue
            try:
                # Load actions + summary from disk (sim runner writes files but
                # doesn't include them in the return dict)
                iter_dir = _Path(r.get("output_dir", ""))
                actions = []
                actions_path = iter_dir / "actions.jsonl"
                if actions_path.exists():
                    with open(actions_path) as f:
                        for line in f:
                            line = line.strip()
                            if line:
                                try:
                                    actions.append(json.loads(line))
                                except json.JSONDecodeError:
                                    continue
                summary = {}
                summary_path = iter_dir / "summary.json"
                if summary_path.exists():
                    with open(summary_path) as f:
                        summary = json.load(f)

                valid_results.append(IterationResult(
                    iteration_id=r["iteration_id"],
                    seed=r.get("seed", 0),
                    total_rounds=r.get("total_rounds", 0),
                    total_actions=r.get("total_actions", 0),
                    actions=actions,
                    summary=summary,
                    cost_usd=r.get("cost_usd", 0),
                    variation_description=r.get("variation_description", ""),
                    completed_at=r.get("completed_at", ""),
                    output_dir=r.get("output_dir", ""),
                ))
            except Exception as e:
                logger.warning("Failed to build IterationResult for %s: %s", r.get("iteration_id"), e)

        if valid_results:
            aggregation = aggregate_batch(valid_results)
            agg_path = mc_dir / "aggregation.json"
            agg_dict = asdict(aggregation)
            with open(agg_path, "w") as f:
                json.dump(agg_dict, f, indent=2, default=str)
            logger.info("Aggregation saved: %s", agg_path)

            # Data flywheel: store aggregate outcomes for future learning
            try:
                from .firestore_memory import FirestoreMemory
                flywheel = FirestoreMemory()
                crs = agg_dict.get("containment_round_stats") or {}
                flywheel.store_aggregate_outcome({
                    "batch_id": batch.batch_id,
                    "project_id": batch.project_id,
                    "mode": batch.mode.value,
                    "iterations": batch.iterations_completed,
                    "outcome_distribution": agg_dict.get("outcome_distribution", {}),
                    "containment_round_stats": {
                        "mean": crs.get("mean", 0),
                        "median": crs.get("median", 0),
                        "std": crs.get("std", 0),
                    } if crs else {},
                    "cost_summary": {"total_usd": batch.cost_tracker.total_cost()},
                })
                logger.info("Data flywheel: stored aggregate for batch %s", batch.batch_id)
            except Exception as e:
                logger.warning("Data flywheel store failed (non-fatal): %s", e)
        else:
            logger.warning("No valid iteration results to aggregate for batch %s", batch.batch_id)
    except Exception as e:
        logger.error("Aggregation failed for batch %s: %s", batch.batch_id, e)

    # Save cost summary
    try:
        batch.cost_tracker.save(base_dir=str(mc_dir))
    except Exception as e:
        logger.error("Cost save failed for batch %s: %s", batch.batch_id, e)

    # If test mode, save results for gating
    if batch.mode == MonteCarloMode.TEST and batch.status == "completed":
        test_results_dir = UPLOADS_DIR / "crucible_projects" / batch.project_id / "monte_carlo"
        test_results_dir.mkdir(parents=True, exist_ok=True)
        test_results_path = test_results_dir / "test_results.json"
        with open(test_results_path, "w") as f:
            json.dump({
                "batch_id": batch.batch_id,
                "completed_at": batch.completed_at,
                "iterations_completed": batch.iterations_completed,
                "iterations_failed": batch.iterations_failed,
                "total_cost_usd": batch.cost_tracker.total_cost(),
            }, f, indent=2)
        logger.info("Test results saved for gating: %s", test_results_path)

    logger.info(
        "Batch %s finished — status=%s, completed=%d, failed=%d, cost=$%.4f",
        batch.batch_id, batch.status,
        batch.iterations_completed, batch.iterations_failed,
        batch.cost_tracker.total_cost(),
    )

    if callback_token:
        from .workflow_callback import resume_workflow_hook
        resume_workflow_hook(callback_token, {
            "status": batch.status,
            "batch_id": batch.batch_id,
            "iterations_completed": batch.iterations_completed,
            "iterations_failed": batch.iterations_failed,
            "error": batch.error or "",
        })

    MissionControl.sim_complete(
        batch.batch_id,
        batch.iterations_completed,
        batch.cost_tracker.total_cost(),
        time.time() - batch_start_time,
    )


async def _run_iteration(
    batch: MonteCarloBatch,
    iteration_index: int,
    base_config: dict,
    semaphore: asyncio.Semaphore,
    shared_client,
    shared_model: str,
    shared_memory,
    var_gen,
    variation_params: dict,
    output_dir: str,
    run_single_iteration,
):
    """Run a single iteration within semaphore concurrency control."""
    async with semaphore:
        # Check stop/cost before starting
        if batch._stop_requested or batch._pause_requested:
            return
        if batch.cost_tracker.total_cost() >= batch.cost_limit_usd:
            batch.status = "cost_exceeded"
            batch.error = f"Cost limit ${batch.cost_limit_usd:.2f} exceeded"
            return

        iteration_id = f"{batch.batch_id}_iter_{iteration_index:04d}"
        iter_dir = Path(output_dir) / iteration_id
        iter_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Starting iteration %d/%d for batch %s", iteration_index + 1, batch.iterations_total, batch.batch_id)
        MissionControl.mc_iteration(iteration_index + 1, batch.iterations_total, "running")

        # Register iteration sim so frontend can poll its actions.
        # Use adaptive_depth.max_rounds when enabled so the round counter
        # doesn't show "20/14" when the arbiter extends the sim.
        ad = base_config.get("adaptive_depth", {})
        effective_total = ad.get("max_rounds", base_config.get("total_rounds", 5)) if ad.get("enabled") else base_config.get("total_rounds", 5)
        _simulations[iteration_id] = {
            "sim_id": iteration_id,
            "status": "running",
            "current_round": 0,
            "total_rounds": effective_total,
            "action_count": 0,
            "graph_id": batch.project_id,
            "output_dir": str(iter_dir),
            "variation_description": "",  # Will be set after variation generation
        }

        try:
            # Generate variation
            varied_config, variation_desc = var_gen.generate(
                iteration_index, base_config, variation_params or {}
            )

            # Update simulation entry with variation description
            if iteration_id in _simulations:
                _simulations[iteration_id]["variation_description"] = variation_desc

            # Extract temperature override if set
            temp_override = varied_config.pop("_temperature_override", None)

            # Run the simulation iteration
            result = await run_single_iteration(
                config=varied_config,
                output_dir=str(iter_dir),
                client=shared_client,
                model=shared_model,
                cost_tracker=batch.cost_tracker,
                memory=shared_memory,
                temperature_override=temp_override,
                iteration_id=iteration_id,
            )

            # Record result
            if isinstance(result, dict):
                result["iteration_index"] = iteration_index
                result["variation_description"] = variation_desc
                result["iteration_id"] = iteration_id
                result.setdefault("status", "completed")
                result.setdefault("output_dir", str(iter_dir))
                batch.results.append(result)
            else:
                batch.results.append({
                    "iteration_index": iteration_index,
                    "iteration_id": iteration_id,
                    "variation_description": variation_desc,
                    "status": "completed",
                    "raw_result": str(result),
                })

            # Enrich summary.json with variation data + cost (sim runner doesn't have this)
            import re as _re
            _seed_match = _re.search(r"seed=(\d+)", variation_desc)
            _seed_val = int(_seed_match.group(1)) if _seed_match else iteration_index
            summary_path = iter_dir / "summary.json"
            if summary_path.exists():
                try:
                    with open(summary_path) as f:
                        summary = json.load(f)
                    summary["variation_description"] = variation_desc
                    summary["seed"] = _seed_val
                    summary["cost_usd"] = result.get("cost_usd", 0) if isinstance(result, dict) else 0
                    summary["iteration_index"] = iteration_index
                    with open(summary_path, "w") as f:
                        json.dump(summary, f, indent=2, ensure_ascii=False, default=str)
                except Exception as e:
                    logger.warning("Failed to enrich summary.json for %s: %s", iteration_id, e)

            batch.iterations_completed += 1
            if iteration_id in _simulations:
                _simulations[iteration_id]["status"] = "completed"
            iter_cost = result.get("cost_usd", 0) if isinstance(result, dict) else 0
            MissionControl.mc_iteration(
                iteration_index + 1, batch.iterations_total, "completed",
                outcome=result.get("variation_description", "")[:30] if isinstance(result, dict) else "",
                cost=iter_cost,
            )
            elapsed = time.time() - getattr(batch, '_start_epoch', time.time())
            MissionControl.mc_progress(
                batch.iterations_completed, batch.iterations_total,
                batch.cost_tracker.total_cost(), batch.cost_limit_usd,
                elapsed,
            )

        except Exception as e:
            logger.error("Iteration %d failed for batch %s: %s", iteration_index, batch.batch_id, e)
            if iteration_id in _simulations:
                _simulations[iteration_id]["status"] = "failed"
            batch.iterations_failed += 1
            batch.results.append({
                "iteration_index": iteration_index,
                "iteration_id": iteration_id,
                "status": "failed",
                "error": str(e),
            })

        # Post-iteration cost check
        if batch.cost_tracker.total_cost() >= batch.cost_limit_usd:
            batch.status = "cost_exceeded"
            batch.error = f"Cost limit ${batch.cost_limit_usd:.2f} exceeded after iteration {iteration_index}"
            logger.warning("Batch %s cost exceeded: $%.4f >= $%.2f", batch.batch_id, batch.cost_tracker.total_cost(), batch.cost_limit_usd)


async def _run_batch_resume(batch, base_config, remaining_count, callback_token=None):
    """Resume a paused batch, running only remaining iterations."""
    resume_start_time = time.time()
    mode_cfg = MODE_CONFIGS[batch.mode]
    semaphore = asyncio.Semaphore(mode_cfg["max_workers"])

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from scripts.run_crucible_simulation import run_single_iteration
    from openai import AsyncOpenAI
    import httpx

    shared_client = AsyncOpenAI(
        api_key=Config.LLM_API_KEY,
        base_url=Config.LLM_BASE_URL,
        timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=5.0),
        max_retries=2,
    )
    shared_model = Config.LLM_MODEL_NAME

    from .firestore_memory import FirestoreMemory
    shared_memory = FirestoreMemory(cost_tracker=batch.cost_tracker)

    from .monte_carlo_variations import VariationGenerator
    var_gen = VariationGenerator()

    mc_dir = UPLOADS_DIR / "crucible_projects" / batch.project_id / "monte_carlo" / batch.batch_id

    start_index = batch.iterations_completed
    tasks = []
    for i in range(start_index, start_index + remaining_count):
        task = asyncio.create_task(
            _run_iteration(
                batch=batch,
                iteration_index=i,
                base_config=base_config,
                semaphore=semaphore,
                shared_client=shared_client,
                shared_model=shared_model,
                shared_memory=shared_memory,
                var_gen=var_gen,
                variation_params={},
                output_dir=str(mc_dir),
                run_single_iteration=run_single_iteration,
            )
        )
        tasks.append(task)

    await asyncio.gather(*tasks, return_exceptions=True)

    if batch.status == "paused":
        # Paused again during resume
        logger.info("Batch %s re-paused at %d/%d iterations", batch.batch_id, batch.iterations_completed, batch.iterations_total)
        return

    # Final status
    if batch.status == "stopped":
        pass  # Already set
    elif batch.status == "cost_exceeded":
        pass  # Already set
    elif batch.iterations_failed == batch.iterations_total:
        batch.status = "failed"
        batch.error = "All iterations failed"
    else:
        batch.status = "completed"

    batch.completed_at = datetime.now(timezone.utc).isoformat()

    # Aggregate results
    try:
        from dataclasses import asdict
        from pathlib import Path as _Path
        from .monte_carlo_aggregator import aggregate_batch, IterationResult

        valid_results = []

        # Disk-based recovery
        if not batch.results:
            logger.info("batch.results empty — recovering from disk for %s", batch.batch_id)
            for iter_dir_candidate in sorted(mc_dir.iterdir()):
                if iter_dir_candidate.is_dir() and "_iter_" in iter_dir_candidate.name:
                    summary_path = iter_dir_candidate / "summary.json"
                    if summary_path.exists():
                        with open(summary_path) as f:
                            s = json.load(f)
                        batch.results.append({
                            "iteration_id": iter_dir_candidate.name,
                            "status": "completed",
                            "output_dir": str(iter_dir_candidate),
                            "seed": s.get("seed", 0),
                            "total_rounds": s.get("total_rounds", 0),
                            "total_actions": s.get("total_actions", 0),
                            "cost_usd": s.get("cost_usd", 0),
                            "variation_description": s.get("variation_description", ""),
                            "completed_at": s.get("completed_at", ""),
                        })
            logger.info("Recovered %d iteration(s) from disk", len(batch.results))

        for r in batch.results:
            if r.get("status") != "completed":
                continue
            try:
                iter_dir = _Path(r.get("output_dir", ""))
                actions = []
                actions_path = iter_dir / "actions.jsonl"
                if actions_path.exists():
                    with open(actions_path) as f:
                        for line in f:
                            line = line.strip()
                            if line:
                                try:
                                    actions.append(json.loads(line))
                                except json.JSONDecodeError:
                                    continue
                summary = {}
                summary_path = iter_dir / "summary.json"
                if summary_path.exists():
                    with open(summary_path) as f:
                        summary = json.load(f)

                valid_results.append(IterationResult(
                    iteration_id=r["iteration_id"],
                    seed=r.get("seed", 0),
                    total_rounds=r.get("total_rounds", 0),
                    total_actions=r.get("total_actions", 0),
                    actions=actions,
                    summary=summary,
                    cost_usd=r.get("cost_usd", 0),
                    variation_description=r.get("variation_description", ""),
                    completed_at=r.get("completed_at", ""),
                    output_dir=r.get("output_dir", ""),
                ))
            except Exception as e:
                logger.warning("Failed to build IterationResult for %s: %s", r.get("iteration_id"), e)

        if valid_results:
            aggregation = aggregate_batch(valid_results)
            agg_path = mc_dir / "aggregation.json"
            agg_dict = asdict(aggregation)
            with open(agg_path, "w") as f:
                json.dump(agg_dict, f, indent=2, default=str)
            logger.info("Aggregation saved: %s", agg_path)

            # Data flywheel
            try:
                from .firestore_memory import FirestoreMemory
                flywheel = FirestoreMemory()
                crs = agg_dict.get("containment_round_stats") or {}
                flywheel.store_aggregate_outcome({
                    "batch_id": batch.batch_id,
                    "project_id": batch.project_id,
                    "mode": batch.mode.value,
                    "iterations": batch.iterations_completed,
                    "outcome_distribution": agg_dict.get("outcome_distribution", {}),
                    "containment_round_stats": {
                        "mean": crs.get("mean", 0),
                        "median": crs.get("median", 0),
                        "std": crs.get("std", 0),
                    } if crs else {},
                    "cost_summary": {"total_usd": batch.cost_tracker.total_cost()},
                })
                logger.info("Data flywheel: stored aggregate for batch %s", batch.batch_id)
            except Exception as e:
                logger.warning("Data flywheel store failed (non-fatal): %s", e)
        else:
            logger.warning("No valid iteration results to aggregate for batch %s", batch.batch_id)
    except Exception as e:
        logger.error("Aggregation failed for batch %s: %s", batch.batch_id, e)

    # Save cost summary
    try:
        batch.cost_tracker.save(base_dir=str(mc_dir))
    except Exception as e:
        logger.error("Cost save failed for batch %s: %s", batch.batch_id, e)

    # If test mode, save results for gating
    if batch.mode == MonteCarloMode.TEST and batch.status == "completed":
        test_results_dir = UPLOADS_DIR / "crucible_projects" / batch.project_id / "monte_carlo"
        test_results_dir.mkdir(parents=True, exist_ok=True)
        test_results_path = test_results_dir / "test_results.json"
        with open(test_results_path, "w") as f:
            json.dump({
                "batch_id": batch.batch_id,
                "completed_at": batch.completed_at,
                "iterations_completed": batch.iterations_completed,
                "iterations_failed": batch.iterations_failed,
                "total_cost_usd": batch.cost_tracker.total_cost(),
            }, f, indent=2)
        logger.info("Test results saved for gating: %s", test_results_path)

    logger.info(
        "Batch %s finished (resumed) — status=%s, completed=%d, failed=%d, cost=$%.4f",
        batch.batch_id, batch.status,
        batch.iterations_completed, batch.iterations_failed,
        batch.cost_tracker.total_cost(),
    )

    if callback_token:
        from .workflow_callback import resume_workflow_hook
        resume_workflow_hook(callback_token, {
            "status": batch.status,
            "batch_id": batch.batch_id,
            "iterations_completed": batch.iterations_completed,
            "iterations_failed": batch.iterations_failed,
            "error": batch.error or "",
        })

    MissionControl.sim_complete(
        batch.batch_id,
        batch.iterations_completed,
        batch.cost_tracker.total_cost(),
        time.time() - resume_start_time,
    )
