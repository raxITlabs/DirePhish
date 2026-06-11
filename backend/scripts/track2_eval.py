"""Track-2 headline: run a baseline vs. refined IR-Lead simulation and let the
runner emit the per-round containment JSON that scripts/eval_report.py renders.

Usage (two separate processes for clean MCP isolation):

    # baseline — stock _IR_LEAD_INSTRUCTION
    uv run python scripts/track2_eval.py baseline

    # refined — monkeypatch ir_lead with the optimizer's instruction
    uv run python scripts/track2_eval.py refined evals/results/ir_lead_<ts>/optimized_instruction.txt

Each run writes ``evals/results/track2_<mode>.json`` (via the runner's
_write_eval_result), shaped for ``eval_report.compute_business_metrics``.

Env: run with Vertex creds and NO repo .env so models resolve to the production
defaults (pro=gemini-3.1-pro-preview, flash=gemini-3.5-flash). Bound length with
TRACK2_ROUNDS (default 6).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logger = logging.getLogger("direphish.track2")

ROUNDS = int(os.environ.get("TRACK2_ROUNDS", "6"))


async def _run(sim_id: str) -> dict:
    from adk.runner import AdkSimulationRunner

    config = {
        "simulation_id": sim_id,
        "project_id": "track2",
        "total_rounds": ROUNDS,
        "hours_per_round": 1.0,
        "pressures": [],
    }
    output_dir = BACKEND_DIR / "evals" / "runs" / sim_id
    runner = AdkSimulationRunner(config=config, output_dir=output_dir)
    return await runner.run()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

    if len(sys.argv) < 2 or sys.argv[1] not in ("baseline", "refined"):
        print("usage: track2_eval.py <baseline|refined> [optimized_instruction.txt]", file=sys.stderr)
        return 2
    mode = sys.argv[1]

    # gemini-3.1-pro-preview has tight preview quota (429s under multi-round
    # load). Map the "pro" tier to flash so the whole eval runs on the GA
    # gemini-3.5-flash — avoids preview-quota flakiness, and keeps the judge
    # identical across baseline/refined so the containment delta stays fair.
    if os.environ.get("TRACK2_ALL_FLASH") == "1":
        import adk.models as models

        models.GEMINI_MODELS["pro"] = models.GEMINI_MODELS["flash"]
        logger.info(
            "[track2] TRACK2_ALL_FLASH: all tiers -> %s", models.GEMINI_MODELS["flash"]
        )

    # The defender team runs as a ParallelAgent (5 concurrent LlmAgents, each
    # multi-turn) — a burst that trips the project's per-minute Vertex quota
    # (429). Swap it for a SequentialAgent so defenders run one at a time. The
    # runner imports ParallelAgent from google.adk.agents at orchestrator-build
    # time, so patching the name here takes effect. Same comparison both runs.
    if os.environ.get("TRACK2_SERIAL_DEFENDERS") == "1":
        import google.adk.agents as adk_agents

        adk_agents.ParallelAgent = adk_agents.SequentialAgent
        logger.info("[track2] TRACK2_SERIAL_DEFENDERS: defenders run sequentially")

    # raxit-ai has a ~10 req/min project-wide Gemini quota. Space every Vertex
    # call >= TRACK2_THROTTLE seconds apart and retry with backoff on 429 so a
    # multi-agent sim survives the limit. Patches the async path ADK uses
    # (client.aio.models.generate_content -> AsyncModels.generate_content).
    # DSQ 429s are transient pool contention. ALWAYS retry with backoff (ADK's
    # built-in retry gives up too fast). Optionally also space calls >=
    # TRACK2_THROTTLE seconds apart, but spacing alone doesn't help — backoff
    # does. Patches the async path ADK uses (AsyncModels.generate_content).
    throttle = float(os.environ.get("TRACK2_THROTTLE", "0"))
    import asyncio
    import time

    import google.genai.models as _gm

    _orig_gc = _gm.AsyncModels.generate_content
    _gate = {"last": 0.0}
    _gate_lock = asyncio.Lock()

    async def _guarded_gc(self, *args, **kwargs):
        for attempt in range(6):
            if throttle > 0:
                async with _gate_lock:
                    delta = time.monotonic() - _gate["last"]
                    if delta < throttle:
                        await asyncio.sleep(throttle - delta)
                    _gate["last"] = time.monotonic()
            try:
                return await _orig_gc(self, *args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                if "RESOURCE_EXHAUSTED" in str(exc) and attempt < 5:
                    backoff = 10.0 * (attempt + 1)
                    logger.warning("[track2] 429 -> backoff %.0fs (try %d)", backoff, attempt + 1)
                    await asyncio.sleep(backoff)
                    continue
                raise

    _gm.AsyncModels.generate_content = _guarded_gc
    logger.info("[track2] 429-backoff guard installed (throttle=%.1fs)", throttle)

    if mode == "refined":
        if len(sys.argv) < 3:
            print("refined mode needs the optimized_instruction.txt path", file=sys.stderr)
            return 2
        optimized = Path(sys.argv[2]).read_text().strip()
        if not optimized:
            print("optimized instruction is empty", file=sys.stderr)
            return 2
        import adk.agents.personas.ir_lead as ir_lead

        ir_lead._IR_LEAD_INSTRUCTION = optimized
        logger.info("[track2] patched ir_lead instruction (%d chars)", len(optimized))

    sim_id = f"track2_{mode}"
    logger.info("[track2] %s: %d rounds (sim_id=%s)", mode, ROUNDS, sim_id)
    summary = asyncio.run(_run(sim_id))
    logger.info("[track2] %s complete: %s", mode, summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
