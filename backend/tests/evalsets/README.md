# DirePhish Evalsets

This directory holds ADK ``.evalset.json`` files plus the shared
``test_config.json`` for the eval framework.

## Files

- ``test_config.json`` — the 4 DirePhish rubrics (containment,
  evidence, communication, business_impact) plus ADK's built-in
  ``tool_trajectory_avg_score`` and ``response_match_score``.
- ``ransomware_containment_v1.evalset.json`` — round-level coverage
  for an active ransomware incident across the 5 defender personas
  + judge. v1 ships with 7 representative cases; v2 will expand to
  ~25 (per the May-11 revisions §4).

## Running

From ``backend/``:

```bash
# Quick run via pytest (uses tests/evals/test_ransomware.py)
uv run python -m pytest tests/evals/test_ransomware.py -v

# Full ADK eval CLI (requires Vertex env vars)
GOOGLE_GENAI_USE_VERTEXAI=TRUE \
GOOGLE_CLOUD_PROJECT=raxit-ai \
GOOGLE_CLOUD_LOCATION=us-east5 \
uv run adk eval . tests/evalsets/ransomware_containment_v1.evalset.json
```

## Refining prompts via the loop

``scripts/refine_prompts.py`` runs a ``LoopAgent``-based meta-loop:
it grades persona prompts against this evalset, proposes 3 variants
targeting the lowest-scoring rubric, and promotes the winner.

```bash
uv run python scripts/refine_prompts.py --persona ir_lead --rounds 3
```

Outputs ``evals/results/<timestamp>/`` with HTML reports and prompt
diffs.

## Authoring new eval cases

Each case is one invocation: ``user_content`` (the round prompt) →
``final_response`` (the expected behavior in natural language; the
ADK ``AgentEvaluator`` LLM-judges similarity, not exact-match).

For multi-turn cases (rare; most DirePhish rounds are single-turn),
add multiple entries to ``conversation``.
