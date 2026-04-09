# LLM-as-a-Judge for Containment Classification

**Date:** 2026-04-08  
**Branch:** feat/risk-score  
**Status:** Draft

## Problem

The Monte Carlo containment classifier (`monte_carlo_aggregator.py:136-157`) uses regex keyword matching to classify iteration outcomes. It scans action text for words like "isolat", "contain", "block", "revok", "suspend", "kill" and treats the first match as the containment round.

This produces ~100% containment scores across all runs because defenders always **attempt** containment verbs in round 1 (e.g., "revoking all sessions", "isolating the Redis cluster"). The classifier cannot distinguish between an attempt and successful containment.

## Solution

Replace keyword matching with an LLM-as-a-judge call per iteration that evaluates whether containment **actually succeeded** based on a condensed round-level action digest.

### Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Arbiter signal | Pass as input context | Arbiter already judges containment during sim; use as informed starting point, not hard override |
| Dual containment signals | Leave team scoring untouched | Smallest blast radius; fix the core MC bug without touching the report pipeline |
| Digest strategy | Round-level summary | ~1-2K tokens/iteration; works at DEEP mode (100 iterations); cheapest |
| Integration approach | Sync judge + `asyncio.to_thread` | Simplest change; no async refactoring of aggregator; 50-100s delay is fine post-batch |

## Architecture

### New file: `backend/app/services/containment_judge.py`

Three functions:

#### `build_round_digest(result: IterationResult) -> str`

Condenses ~200 actions into ~1-2K tokens. Per round:

```
ROUND 3 (of 10):
  [INJECT] Phishing email opened by CFO, credential harvester active
  [ARBITER] continue -- "Active lateral movement detected"
  Agents: SOC Analyst (slack: triaged alert, email: notified IT),
          CISO (slack: authorized containment),
          IT Admin (do_nothing)
```

Includes:
- Inject descriptions (full text)
- Arbiter decisions with reason
- Agent actions summarized per-round (who, where, what -- 1 line each)
- `do_nothing` actions explicitly noted (signals passivity)
- Adaptive depth context when present: `"Simulation stopped at round 7. Arbiter reason: contained"`

#### `classify_iteration_llm(result, llm, cost_tracker=None) -> tuple[str, int|None, dict]`

Builds digest, constructs prompt, calls `llm.chat_json()` with temperature=0.1.

Returns `(label, containment_round, metadata)` where metadata contains:
- `confidence`: 0.0-1.0
- `reasoning`: 2-3 sentence explanation
- `judge_model`: model name used
- `fallback`: bool (true if keyword fallback was used)

**Prompt:**

```
You are a cybersecurity incident response evaluator. Analyze this simulation
transcript and classify the OUTCOME of the defenders' response.

SIMULATION:
- Rounds: {total_rounds}, Actions: {total_actions}
- Agents: {agents_with_roles}
{adaptive_depth_context}

TRANSCRIPT:
{round_digest}

CLASSIFICATION TASK:
Determine whether the defenders ACTUALLY CONTAINED the threat, not just
whether they ATTEMPTED containment. A containment attempt that the attacker
subsequently bypasses is NOT successful containment.

Consider:
1. Did defenders successfully neutralize the attacker's access/persistence?
2. Did the attacker continue to operate AFTER defender containment actions?
3. Did attacker activity cease or become ineffective after a specific round?
4. Were there escalation events (exfiltration, ransomware, lateral movement)
   that were NOT stopped?

Classify as EXACTLY ONE of:
- "contained_early": Effective containment in first half (round <= {midpoint}).
  Attacker genuinely stopped.
- "contained_late": Effective containment in second half (round > {midpoint}).
  Attacker eventually stopped but took longer.
- "escalated": Attacker achieved significant objectives despite defender actions.
  Situation worsened.
- "not_contained": No clear containment. Ambiguous outcome or attacker
  maintained presence.

Return ONLY valid JSON:
{"outcome": "...", "containment_round": <int or null>,
 "confidence": <0.0-1.0>, "reasoning": "2-3 sentences"}
```

**Failure handling:**
- LLM error, parse error, or invalid outcome category -> fall back to keyword classification
- Set `metadata["fallback"] = True`
- Log warning with iteration ID and error

#### `classify_iteration_keyword(result) -> tuple[str, int|None]`

Extracted from current `classify_iteration()` logic. Serves as the fallback.

### Modified: `backend/app/services/monte_carlo_aggregator.py`

**`PerIterationResult` dataclass (line 84):** Add field:
```python
judge_metadata: dict = field(default_factory=dict)
```
This is additive -- all existing consumers use `.get()` or pass the whole dict, so no breakage.

**`aggregate_batch()` signature (line 184):** Accept optional LLM:
```python
def aggregate_batch(
    results: list[IterationResult],
    llm: LLMClient | None = None,
    cost_tracker: CostTracker | None = None,
) -> BatchAggregation:
```

**Classification loop (line 214-218):** Replace:
```python
# Before:
label, c_round = classify_iteration(r)

# After:
if llm is not None:
    label, c_round, meta = classify_iteration_llm(r, llm, cost_tracker)
else:
    label, c_round = classify_iteration_keyword(r)
    meta = {}
```

Store `meta` in `PerIterationResult.judge_metadata`.

The old `classify_iteration()` function in `aggregator.py` is removed. The keyword constants (`CONTAINMENT_KEYWORDS`, `ESCALATION_KEYWORDS`) and keyword-based logic move to `containment_judge.py` as `classify_iteration_keyword()`. The `ESCALATION_KEYWORDS` constant stays available since it's used by the keyword fallback path.

### Modified: `backend/app/services/monte_carlo_engine.py`

**Both `aggregate_batch()` call sites (lines 480 and 835):**

```python
from ..utils.llm_client import LLMClient

judge_llm = LLMClient(Config.LLM_API_KEY, Config.LLM_BASE_URL, Config.LLM_JUDGE_MODEL)
aggregation = await asyncio.to_thread(
    aggregate_batch, valid_results, llm=judge_llm, cost_tracker=batch.cost_tracker
)
```

The `asyncio.to_thread` wrapper prevents the sync LLM calls from blocking the event loop.

### Modified: `backend/app/config.py`

Add after `LLM_PRO_MODEL` (line 34):
```python
LLM_JUDGE_MODEL = os.environ.get('LLM_JUDGE_MODEL') or LLM_MODEL_NAME
```

## Cost estimate

Per-iteration: ~1.5K input tokens + ~150 output tokens.  
At Gemini Flash-Lite pricing ($0.25/$1.50 per 1M): ~$0.0006/iteration.

| Mode | Iterations | Judge cost | % of ~$12 batch |
|------|-----------|-----------|-----------------|
| TEST | 3 | $0.002 | negligible |
| QUICK | 10 | $0.006 | 0.05% |
| STANDARD | 50 | $0.03 | 0.25% |
| DEEP | 100 | $0.06 | 0.5% |

## Backward compatibility

- `aggregate_batch(results)` with no `llm` param uses keyword fallback -- zero behavior change
- Exercise report agent's on-the-fly aggregation does not pass LLM -- continues as before
- `aggregation.json` schema is additive only (`judge_metadata` field added to `per_iteration_results` entries)
- Three consumers of `aggregation.json` (`crucible.py:845`, `crucible.py:540`, `exercise_report_agent.py:1374`) are unaffected by additive fields

## Files changed

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `LLM_JUDGE_MODEL` |
| `backend/app/services/containment_judge.py` | **New** -- digest builder, LLM judge, keyword fallback |
| `backend/app/services/monte_carlo_aggregator.py` | Add `judge_metadata` to `PerIterationResult`; accept optional `llm`/`cost_tracker` in `aggregate_batch()` |
| `backend/app/services/monte_carlo_engine.py` | Wrap `aggregate_batch()` calls with `to_thread`; pass judge LLM |

## Verification

1. `cd backend && python -m pytest tests/ -x` -- existing tests pass
2. Run a TEST-mode MC batch; inspect `aggregation.json`:
   - `per_iteration_results[].judge_metadata` has `confidence`, `reasoning`
   - `outcome_distribution` is no longer ~100% `contained_early`
3. Verify backward compat: call `aggregate_batch(results)` without `llm` -- keyword behavior unchanged
4. Check `aggregation.json` loads cleanly in the risk score computation endpoint
