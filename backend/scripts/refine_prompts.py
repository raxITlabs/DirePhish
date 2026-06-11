"""Programmatic prompt refinement loop — the Track 2 differentiator.

Per the May-11 platform research (§6 / §12), ADK ships eval primitives
(``.evalset.json``, ``AgentEvaluator``, 8 built-in metrics + LLM-as-
judge) but does NOT ship a built-in refinement loop. We build it on
top of ``LoopAgent`` + ``AgentEvaluator``.

Sketch (W3 work — this file is the scaffold, not the finished loop):

```
for iteration in 1..N:
    1. Score the current prompt against the evalset.
    2. Identify the lowest-scoring rubric for this persona.
    3. Ask a meta-LlmAgent to propose 3 prompt variants targeting
       that weakness.
    4. Score each variant.
    5. Keep the best (highest sum across rubrics, or improvement on
       the target rubric, depending on --strategy).
    6. Commit the new prompt to the persona file with the eval delta
       in the commit message.
```

CLI:

```bash
uv run python scripts/refine_prompts.py \\
    --persona ir_lead \\
    --rounds 3 \\
    --strategy target_lowest
```

Output: ``evals/results/<timestamp>/`` with per-iteration HTML
reports, prompt diffs, and a final summary.

Status: SCAFFOLD ONLY. The actual loop body is intentionally not
implemented yet — wiring it requires real Vertex auth + live token
budget approval. The CLI argument parsing and the orchestrating
scaffolding are in place so the loop body can be filled in W3.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("direphish.refine")


BACKEND_DIR = Path(__file__).resolve().parents[1]
EVALSET_PATH = BACKEND_DIR / "tests" / "evalsets" / "ransomware_containment_v1.evalset.json"
TEST_CONFIG_PATH = BACKEND_DIR / "tests" / "evalsets" / "test_config.json"
RESULTS_ROOT = BACKEND_DIR / "evals" / "results"


PERSONAS = {
    "ir_lead": "adk.agents.personas.ir_lead",
    "ciso": "adk.agents.personas.ciso",
    "soc_analyst": "adk.agents.personas.soc_analyst",
    "legal": "adk.agents.personas.legal",
    "ceo": "adk.agents.personas.ceo",
    "threat_actor": "adk.agents.personas.threat_actor",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the DirePhish prompt-refinement loop.",
    )
    parser.add_argument(
        "--persona",
        required=True,
        choices=list(PERSONAS),
        help="Which persona to refine.",
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=3,
        help="How many refinement iterations to run.",
    )
    parser.add_argument(
        "--strategy",
        default="target_lowest",
        choices=["target_lowest", "balanced"],
        help="Variant proposal strategy.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print plan + cost estimate, do not call Vertex.",
    )
    return parser.parse_args()


def load_test_config() -> dict[str, Any]:
    with TEST_CONFIG_PATH.open() as f:
        return json.load(f)


def load_evalset() -> dict[str, Any]:
    with EVALSET_PATH.open() as f:
        return json.load(f)


def estimate_cost(persona: str, rounds: int, evalset_size: int) -> float:
    """Rough cost estimate per refinement run.

    ~$0.02 per Gemini Pro eval case × evalset_size cases × (1 baseline
    + 3 variants) × rounds. Plus meta-LlmAgent calls (~$0.05/round).
    """
    per_case = 0.02
    cases_per_iter = evalset_size * (1 + 3)  # baseline + 3 variants
    meta_per_iter = 0.05
    return rounds * (cases_per_iter * per_case + meta_per_iter)


def pick_winner_by_target_rubric(
    candidates: list[tuple[str, dict[str, float]]], target: str,
) -> tuple[str, dict[str, float]]:
    """Pick the candidate with the highest score in the target rubric.

    Raises ValueError on empty input.
    """
    if not candidates:
        raise ValueError("candidates list is empty")
    return max(candidates, key=lambda c: c[1].get(target, 0.0))


def identify_weakest_rubric(scores: dict[str, float], exclude: tuple[str, ...] = ()) -> str:
    """Return the rubric name with the lowest score, ignoring `exclude` keys."""
    eligible = {k: v for k, v in scores.items() if k not in exclude}
    if not eligible:
        raise ValueError("no eligible rubrics")
    return min(eligible.items(), key=lambda kv: kv[1])[0]


def aggregate_rubric_score(rubric_scores: dict[str, float]) -> float:
    """Collapse the 4 judge rubrics (0–10) into a single 0–1 quality signal.

    The optimizer maximizes this. Pure function → unit-testable without Vertex.
    """
    rubrics = ("containment", "evidence", "communication", "business_impact")
    vals = [float(rubric_scores.get(r, 0.0) or 0.0) for r in rubrics]
    return (sum(vals) / len(vals)) / 10.0 if vals else 0.0


def _case_scenario(case: dict[str, Any]) -> str:
    """Extract the round-scenario user text from an evalset case."""
    try:
        return case["conversation"][0]["user_content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        return ""


def _case_uid(case: dict[str, Any], idx: int) -> str:
    return str(case.get("eval_id") or f"case_{idx}")


async def run_refinement_loop(persona: str, rounds: int, strategy: str) -> Path:
    """Execute the LoopAgent-based refinement loop.

    Algorithm (per --strategy=target_lowest):
      for i in 1..rounds:
        scores = score_persona_against_evalset(persona, current_instruction)
        weak = identify_weakest_rubric(scores)
        variants = propose_variants_via_meta_agent(persona, current_instruction, weak, scores[weak])
        scored = [(v, score_persona_against_evalset(persona, v)) for v in variants]
        winner_instr, winner_scores = pick_winner_by_target_rubric(scored, weak)
        if winner_scores[weak] > scores[weak]:
            current_instruction = winner_instr  # promote
            persist(iter=i, weak=weak, before=scores[weak], after=winner_scores[weak])

    Returns the run directory containing the optimized instruction + a
    before/after validation score.

    Implementation: ADK's ``SimplePromptOptimizer`` (Gemini Pro proposer)
    drives prompt variants; a custom ``ContainmentJudgeSampler`` scores each
    variant by running it (tool-less) over the ransomware evalset and grading
    the output with our own ``ContainmentJudge`` rubrics. No ``vertexai``/gcp
    extra and no deprecated SDK — pure ADK ``LlmAgent`` + ``google-genai``.

    Gated on RUN_LIVE_VERTEX=1 (needs Vertex Pro quota + ~$1-2/run); without it
    a dry-run plan is written so CI / no-cred environments stay hermetic. The
    pure-logic seams (aggregate_rubric_score, pick_winner_by_target_rubric,
    identify_weakest_rubric) are unit-tested separately.
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_dir = RESULTS_ROOT / f"{persona}_{timestamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    if os.environ.get("RUN_LIVE_VERTEX") != "1":
        logger.warning("RUN_LIVE_VERTEX not set; producing dry-run plan only.")
        plan_path = run_dir / "dry_run_plan.txt"
        plan_path.write_text(
            f"Persona: {persona}\nRounds: {rounds}\nStrategy: {strategy}\n"
            "Set RUN_LIVE_VERTEX=1 to execute against live Vertex.\n"
        )
        return run_dir

    # ---- Live mode: ADK SimplePromptOptimizer + judge-backed sampler --------
    from google.adk.optimization.sampler import Sampler
    from google.adk.optimization.data_types import UnstructuredSamplingResult
    from google.adk.optimization.simple_prompt_optimizer import (
        SimplePromptOptimizer,
        SimplePromptOptimizerConfig,
    )
    from google.adk.runners import InMemoryRunner
    from google.genai import types as gtypes

    from adk.agents.personas._factory import gemini_llm_agent
    from adk.agents.personas.containment_judge import (
        make_containment_judge,
        parse_judge_output,
    )
    from adk.models import GEMINI_MODELS, init_models

    init_models()

    evalset = load_evalset()
    cases = evalset["eval_cases"]
    pairs = [(_case_uid(c, i), _case_scenario(c)) for i, c in enumerate(cases)]
    pairs = [(u, t) for u, t in pairs if t]  # drop cases with no scenario text

    base_instruction = _persona_base_instruction(persona)
    initial_agent = gemini_llm_agent(
        name=f"opt_{persona}",
        description=f"Tool-less {persona} candidate for prompt optimization.",
        instruction=base_instruction,
        tools=[],
        model_key="flash",
    )
    judge = make_containment_judge()  # Gemini Pro, our 4 rubrics

    async def _run_text(agent, prompt: str) -> str:
        runner = InMemoryRunner(agent=agent, app_name="opt")
        session = await runner.session_service.create_session(
            app_name="opt", user_id="opt",
            state={"round_num": 0, "simulation_id": "opt"},
        )
        out: list[str] = []
        async for ev in runner.run_async(
            user_id="opt", session_id=session.id,
            new_message=gtypes.Content(role="user", parts=[gtypes.Part(text=prompt)]),
        ):
            if ev.content and ev.content.parts:
                out += [p.text for p in ev.content.parts if getattr(p, "text", None)]
        return "\n".join(out).strip()

    async def _score_candidate(candidate, scenario: str) -> float:
        defender_out = await _run_text(candidate, scenario)
        judge_prompt = (
            f"Round scenario:\n{scenario}\n\n"
            f"Defender response:\n{defender_out}\n\n"
            "Score this defender response on the 4 rubrics."
        )
        judged = await _run_text(judge, judge_prompt)
        return aggregate_rubric_score(parse_judge_output(judged))

    class ContainmentJudgeSampler(Sampler[UnstructuredSamplingResult]):
        """Scores candidate prompts via DirePhish's ContainmentJudge."""

        def __init__(self, items: list[tuple[str, str]]):
            self._text = dict(items)
            uids = [u for u, _ in items]
            cut = max(1, int(len(uids) * 0.8))
            self._train = uids[:cut]
            self._val = uids[cut:] or uids[:1]

        def get_train_example_ids(self) -> list[str]:
            return list(self._train)

        def get_validation_example_ids(self) -> list[str]:
            return list(self._val)

        async def sample_and_score(
            self, candidate, example_set=Sampler.VALIDATION_SET,
            batch=None, capture_full_eval_data=False,
        ) -> UnstructuredSamplingResult:
            ids = batch or (
                self._train if example_set == Sampler.TRAIN_SET else self._val
            )
            scores: dict[str, float] = {}
            for uid in ids:
                try:
                    scores[uid] = await _score_candidate(candidate, self._text[uid])
                except Exception as exc:  # noqa: BLE001 - one bad case shouldn't abort
                    logger.warning("score failed for %s: %s", uid, exc)
                    scores[uid] = 0.0
            return UnstructuredSamplingResult(scores=scores)

    sampler = ContainmentJudgeSampler(pairs)
    config = SimplePromptOptimizerConfig(
        optimizer_model=GEMINI_MODELS["pro"],
        model_configuration=gtypes.GenerateContentConfig(temperature=0.7),
        num_iterations=max(1, rounds),
        batch_size=min(5, len(pairs)),
    )
    result = await SimplePromptOptimizer(config).optimize(initial_agent, sampler)
    best = result.optimized_agents[0]

    (run_dir / "optimized_instruction.txt").write_text(best.optimized_agent.instruction)
    (run_dir / "summary.json").write_text(json.dumps({
        "persona": persona,
        "iterations": config.num_iterations,
        "batch_size": config.batch_size,
        "final_validation_score": best.overall_score,
        "evalset_cases": len(pairs),
        "optimizer_model": config.optimizer_model,
    }, indent=2))
    logger.info(
        "[refine] %s: final validation score=%.4f → %s",
        persona, best.overall_score or 0.0, run_dir / "optimized_instruction.txt",
    )
    return run_dir


def _persona_base_instruction(persona: str) -> str:
    """Read a persona's base instruction by constructing its factory agent.

    Falls back to a generic instruction if the factory can't be resolved.
    """
    import importlib

    mod = importlib.import_module(PERSONAS[persona])
    factory = getattr(mod, f"make_{persona}", None)
    if factory is None:
        return f"You are the {persona} defender in an incident-response simulation."
    try:
        agent = factory()
        return getattr(agent, "instruction", "") or ""
    except Exception:  # noqa: BLE001 - factory may need MCP; fall back to module const
        for attr in dir(mod):
            if attr.upper().endswith("_INSTRUCTION"):
                val = getattr(mod, attr)
                if isinstance(val, str) and val.strip():
                    return val
        return f"You are the {persona} defender in an incident-response simulation."


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(message)s",
    )

    args = parse_args()
    test_config = load_test_config()
    evalset = load_evalset()
    rubrics = list(test_config["criteria"])
    cases = evalset["eval_cases"]

    logger.info("Persona: %s (module: %s)", args.persona, PERSONAS[args.persona])
    logger.info("Refinement rounds: %d", args.rounds)
    logger.info("Strategy: %s", args.strategy)
    logger.info("Evalset: %d cases × %d rubrics", len(cases), len(rubrics))
    logger.info("Estimated cost: $%.2f", estimate_cost(args.persona, args.rounds, len(cases)))

    if args.dry_run:
        logger.info("Dry-run mode — exiting without Vertex calls.")
        return 0

    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") != "TRUE":
        logger.error(
            "Vertex env vars not set. Refusing to run live without "
            "GOOGLE_GENAI_USE_VERTEXAI=TRUE."
        )
        return 2

    import asyncio

    try:
        run_dir = asyncio.run(
            run_refinement_loop(args.persona, args.rounds, args.strategy)
        )
        logger.info("Refinement complete. Results: %s", run_dir)
        return 0
    except NotImplementedError as exc:
        logger.error("%s", exc)
        return 3


if __name__ == "__main__":
    sys.exit(main())
