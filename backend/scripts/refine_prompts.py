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


async def run_refinement_loop(persona: str, rounds: int, strategy: str) -> Path:
    """Execute the loop. NOT YET IMPLEMENTED — sketch below.

    The actual implementation:

    1. Build a ``LoopAgent`` whose body is:
       - Score baseline → record per-rubric scores
       - Build a prompt-proposer ``LlmAgent`` (Gemini Pro) with an
         instruction like "You're refining DirePhish's {persona}
         persona prompt. The current weakness is {dimension} scoring
         {score}/10. Propose 3 variants of the instruction targeting
         this dimension while not regressing others."
       - Score each variant; keep the best by --strategy.
    2. Persist results to ``RESULTS_ROOT/<timestamp>/``.
    3. Optionally write the winning prompt back to the persona file.
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_dir = RESULTS_ROOT / f"{persona}_{timestamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    raise NotImplementedError(
        "refine_prompts loop body lands in W3. Scaffold + CLI ready; "
        "see docstring for the algorithm. "
        f"Run dir created at {run_dir}."
    )


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
