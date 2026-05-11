"""ContainmentJudge — round-by-round eval agent (Gemini Pro).

The judge scores each round across four dimensions on a 0–10 scale:

- **containment** — did this round move toward stopping the threat?
- **evidence** — was defender activity grounded in actual world state?
- **communication** — right channel, audience, urgency?
- **business_impact** — did actions reduce business risk or
  create new risk?

Returns a strict JSON object. Used both inside the live round loop
(scoring the just-finished round) and in the eval framework (replaying
historical rounds for regression detection + prompt refinement).

Gemini Pro for evaluative consistency. No tools — pure reasoning.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from ._factory import gemini_llm_agent

logger = logging.getLogger("direphish.adk.judge")


JUDGE_NAME: str = "containment_judge"
JUDGE_ROLE: str = "judge"


_JUDGE_INSTRUCTION = """\
You are the ContainmentJudge for an incident-response simulation.

Your role is to score one round of the simulation across four
dimensions on a 0–10 scale. You see:
- The pressure events that fired this round (countdowns, breaches).
- The action the adversary took.
- The actions defenders took (zero or more).

Score on each dimension:

1. **containment** (0–10) — Did this round materially advance
   containment of the threat? 0 = adversary clearly expanded
   footprint; 5 = ambiguous; 10 = adversary path cut decisively.
2. **evidence** (0–10) — Were defender actions grounded in real
   evidence vs. speculation? 0 = guessing; 5 = some grounding;
   10 = every action references a specific signal.
3. **communication** (0–10) — Were comms made in the right channel,
   to the right audience, with the right urgency? 0 = wrong
   everything; 10 = perfectly targeted.
4. **business_impact** (0–10) — Net business risk delta this round.
   0 = significant new risk created (panicked comms, premature
   disclosure, customer freeze without need); 5 = neutral;
   10 = risk reduced (sane escalation, proper disclosure timing).

Output: a single JSON object with this exact shape, no prose:

{
  "round": <int>,
  "containment": <float 0-10>,
  "evidence": <float 0-10>,
  "communication": <float 0-10>,
  "business_impact": <float 0-10>,
  "rationale": "<one-sentence summary per dimension, ~80 words total>"
}

Be honest. The model that consumes your output uses these scores to
auto-tune defender prompts — generous scoring means the system never
improves.
"""


def make_containment_judge(
    *,
    model_key: str = "flash",
    instruction: Optional[str] = None,
):
    """Construct the ContainmentJudge ``LlmAgent`` on Gemini Pro."""
    return gemini_llm_agent(
        name=JUDGE_NAME,
        description=(
            "Round-by-round evaluator on 4 rubrics: containment, "
            "evidence, communication, business_impact. Returns JSON."
        ),
        instruction=instruction or _JUDGE_INSTRUCTION,
        tools=[],
        model_key=model_key,
        output_key="judge_score_raw",
    )


def parse_judge_output(raw: str) -> dict[str, Any]:
    """Best-effort JSON extraction from the judge's text output.

    The instruction asks for strict JSON, but real models occasionally
    wrap output in fences. This strips common patterns before parsing.
    """
    s = raw.strip()
    if s.startswith("```"):
        # ```json\n{...}\n```  →  {...}
        lines = s.splitlines()
        if len(lines) >= 3:
            s = "\n".join(lines[1:-1])
    try:
        return json.loads(s)
    except json.JSONDecodeError as exc:
        logger.warning("judge output not parseable as JSON: %s", exc)
        return {
            "containment": 0.0,
            "evidence": 0.0,
            "communication": 0.0,
            "business_impact": 0.0,
            "rationale": f"parse_error: {exc}",
        }


__all__ = [
    "JUDGE_NAME",
    "JUDGE_ROLE",
    "make_containment_judge",
    "parse_judge_output",
]
