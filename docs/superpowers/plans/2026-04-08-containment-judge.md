# Containment Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace keyword-based containment classification with an LLM-as-a-judge that evaluates whether containment actually succeeded based on round-level action digests.

**Architecture:** New `containment_judge.py` module with digest builder + LLM judge + keyword fallback. `aggregate_batch()` gains optional `llm` param; when present, uses judge per iteration. Both MC engine call sites wrapped with `asyncio.to_thread()` to avoid blocking the event loop.

**Tech Stack:** Python, OpenAI-compatible LLM client (`LLMClient.chat_json()`), existing `CostTracker`

---

## File Structure

| File | Role |
|------|------|
| `backend/app/services/containment_judge.py` | **New** — `build_round_digest()`, `classify_iteration_llm()`, `classify_iteration_keyword()` |
| `backend/app/services/monte_carlo_aggregator.py` | Modified — add `judge_metadata` field, accept optional `llm`/`cost_tracker`, swap classifier |
| `backend/app/services/monte_carlo_engine.py` | Modified — wrap `aggregate_batch()` with `to_thread`, pass judge LLM |
| `backend/app/config.py` | Modified — add `LLM_JUDGE_MODEL` |
| `backend/tests/test_containment_judge.py` | **New** — unit tests for digest builder, LLM judge, keyword fallback |
| `backend/tests/test_pipeline_harness.py` | Modified — existing aggregation tests still pass |

---

### Task 1: Add `LLM_JUDGE_MODEL` config

**Files:**
- Modify: `backend/app/config.py:34`

- [ ] **Step 1: Add the config line**

In `backend/app/config.py`, after line 34 (`LLM_PRO_MODEL = ...`), add:

```python
    LLM_JUDGE_MODEL = os.environ.get('LLM_JUDGE_MODEL') or LLM_MODEL_NAME
```

- [ ] **Step 2: Verify config loads**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -c "from app.config import Config; print(Config.LLM_JUDGE_MODEL)"`

Expected: prints the current `LLM_MODEL_NAME` value (e.g., `gpt-4o-mini`)

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add LLM_JUDGE_MODEL config for containment judge"
```

---

### Task 2: Extract keyword classifier into `containment_judge.py`

**Files:**
- Create: `backend/app/services/containment_judge.py`
- Test: `backend/tests/test_containment_judge.py`

- [ ] **Step 1: Write the failing test for keyword fallback**

Create `backend/tests/test_containment_judge.py`:

```python
"""Tests for containment_judge module."""

import pytest
from dataclasses import dataclass


@dataclass
class FakeIterationResult:
    """Minimal IterationResult for testing."""
    iteration_id: str
    seed: int
    total_rounds: int
    total_actions: int
    actions: list
    summary: dict
    cost_usd: float
    variation_description: str
    completed_at: str
    output_dir: str


def _make_actions(texts_by_round: dict[int, list[str]]) -> list[dict]:
    """Build action list from {round: [text, ...]} mapping."""
    actions = []
    for rnd, texts in texts_by_round.items():
        for text in texts:
            actions.append({
                "round": rnd,
                "agent": "TestAgent",
                "role": "soc_analyst",
                "world": "slack",
                "action": text,
                "args": {},
                "result": {},
            })
    return actions


def _make_result(actions: list[dict], total_rounds: int = 10, summary: dict | None = None) -> FakeIterationResult:
    return FakeIterationResult(
        iteration_id="test_iter_001",
        seed=42,
        total_rounds=total_rounds,
        total_actions=len(actions),
        actions=actions,
        summary=summary or {},
        cost_usd=0.0,
        variation_description="",
        completed_at="",
        output_dir="",
    )


class TestKeywordClassifier:
    """Tests for classify_iteration_keyword (extracted from aggregator)."""

    def test_contained_early_when_keyword_in_first_half(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({2: ["Isolating compromised host from network"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "contained_early"
        assert c_round == 2

    def test_contained_late_when_keyword_in_second_half(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({8: ["Revoking all access tokens"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "contained_late"
        assert c_round == 8

    def test_escalated_when_escalation_but_no_containment(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({3: ["Data exfiltration to external server"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "escalated"
        assert c_round is None

    def test_not_contained_when_no_keywords(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({1: ["Checking email inbox"]})
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "not_contained"
        assert c_round is None

    def test_containment_wins_over_escalation(self):
        from app.services.containment_judge import classify_iteration_keyword
        actions = _make_actions({
            2: ["Blocking malicious IP"],
            5: ["Data exfiltration detected"],
        })
        result = _make_result(actions, total_rounds=10)
        label, c_round = classify_iteration_keyword(result)
        assert label == "contained_early"
        assert c_round == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.containment_judge'`

- [ ] **Step 3: Create `containment_judge.py` with keyword classifier**

Create `backend/app/services/containment_judge.py`:

```python
"""
Containment judge for Monte Carlo iteration classification.

Replaces pure keyword matching with LLM-as-a-judge evaluation.
Falls back to keyword matching when no LLM is provided or on failure.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from ..utils.logger import get_logger

if TYPE_CHECKING:
    from ..utils.cost_tracker import CostTracker
    from ..utils.llm_client import LLMClient

logger = get_logger("containment_judge")

# ---------------------------------------------------------------------------
# Keyword patterns (fallback classifier)
# ---------------------------------------------------------------------------
CONTAINMENT_KEYWORDS = re.compile(
    r"\b(isolat|contain|block|quarantin|lockdown|shut\s*down|revok|suspend|kill)\w*\b",
    re.IGNORECASE,
)
ESCALATION_KEYWORDS = re.compile(
    r"\b(exfiltrat|ransom|encrypt|deploy\s*payload|lateral\s*mov|data\s*leak)\w*\b",
    re.IGNORECASE,
)

VALID_OUTCOMES = {"contained_early", "contained_late", "escalated", "not_contained"}


def _action_text(action: dict) -> str:
    """Extract searchable text from an action record."""
    parts: list[str] = []
    parts.append(action.get("action", ""))
    args = action.get("args", {})
    if isinstance(args, dict):
        for v in args.values():
            if isinstance(v, str):
                parts.append(v)
    result = action.get("result", {})
    if isinstance(result, dict):
        for v in result.values():
            if isinstance(v, str):
                parts.append(v)
    return " ".join(parts)


def classify_iteration_keyword(result) -> tuple[str, int | None]:
    """Classify iteration outcome using keyword matching (fallback)."""
    containment_round: int | None = None
    has_escalation = False
    midpoint = result.total_rounds / 2.0

    for action in result.actions:
        text = _action_text(action)
        rnd = action.get("round", 0)

        if ESCALATION_KEYWORDS.search(text):
            has_escalation = True

        if containment_round is None and CONTAINMENT_KEYWORDS.search(text):
            containment_round = rnd

    if has_escalation and containment_round is None:
        return "escalated", None
    if containment_round is not None:
        label = "contained_early" if containment_round <= midpoint else "contained_late"
        return label, containment_round
    return "not_contained", None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py -v`

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/containment_judge.py backend/tests/test_containment_judge.py
git commit -m "feat: extract keyword classifier into containment_judge module"
```

---

### Task 3: Build the round-level digest

**Files:**
- Modify: `backend/app/services/containment_judge.py`
- Test: `backend/tests/test_containment_judge.py`

- [ ] **Step 1: Write the failing test for digest builder**

Append to `backend/tests/test_containment_judge.py`:

```python
class TestRoundDigest:
    """Tests for build_round_digest."""

    def test_digest_includes_inject_events(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"type": "inject", "round": 1, "description": "Phishing email delivered to CFO"},
            {"round": 1, "agent": "SOC", "role": "soc_analyst", "world": "slack",
             "action": "send_message", "args": {"content": "Investigating alert"}, "result": {}},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "INJECT" in digest
        assert "Phishing email delivered to CFO" in digest

    def test_digest_includes_arbiter_decisions(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"type": "arbiter", "round": 2, "decision": "continue", "reason": "Active threat"},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "ARBITER" in digest
        assert "continue" in digest

    def test_digest_includes_do_nothing(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"round": 1, "agent": "CEO", "role": "ceo", "world": "slack",
             "action": "do_nothing", "args": {}, "result": {}},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "do_nothing" in digest

    def test_digest_includes_adaptive_depth_context(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"round": 1, "agent": "SOC", "role": "soc_analyst", "world": "slack",
             "action": "send_message", "args": {"content": "Alert"}, "result": {}},
        ]
        summary = {"adaptive_depth": {"enabled": True, "stopped_at_round": 7, "stop_reason": "contained"}}
        result = _make_result(actions, total_rounds=10, summary=summary)
        digest = build_round_digest(result)
        assert "stopped at round 7" in digest.lower() or "round 7" in digest
        assert "contained" in digest.lower()

    def test_digest_groups_by_round(self):
        from app.services.containment_judge import build_round_digest
        actions = [
            {"round": 1, "agent": "SOC", "role": "soc_analyst", "world": "slack",
             "action": "send_message", "args": {"content": "Alert triage"}, "result": {}},
            {"round": 2, "agent": "CISO", "role": "ciso", "world": "slack",
             "action": "send_message", "args": {"content": "Authorize isolation"}, "result": {}},
        ]
        result = _make_result(actions, total_rounds=5)
        digest = build_round_digest(result)
        assert "ROUND 1" in digest
        assert "ROUND 2" in digest
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py::TestRoundDigest -v`

Expected: FAIL — `ImportError: cannot import name 'build_round_digest'`

- [ ] **Step 3: Implement `build_round_digest`**

Add to `backend/app/services/containment_judge.py`, after the `classify_iteration_keyword` function:

```python
def build_round_digest(result) -> str:
    """Build a condensed round-level digest of an iteration's actions.

    Produces ~1-2K tokens summarizing what happened each round:
    injects, arbiter decisions, agent actions (who/where/what).
    """
    # Group actions by round
    rounds: dict[int, list[dict]] = {}
    for action in result.actions:
        rnd = action.get("round", 0)
        rounds.setdefault(rnd, []).append(action)

    total_rounds = result.total_rounds or max(rounds.keys(), default=0)
    lines: list[str] = []

    # Adaptive depth context
    ad = result.summary.get("adaptive_depth") if result.summary else None
    if ad and ad.get("enabled"):
        stop_round = ad.get("stopped_at_round")
        stop_reason = ad.get("stop_reason")
        if stop_round:
            lines.append(
                f"[ADAPTIVE DEPTH] Simulation stopped at round {stop_round}"
                f" (of {total_rounds}). Arbiter reason: {stop_reason or 'unknown'}"
            )
            lines.append("")

    for rnd_num in sorted(rounds.keys()):
        rnd_actions = rounds[rnd_num]
        lines.append(f"ROUND {rnd_num} (of {total_rounds}):")

        for act in rnd_actions:
            act_type = act.get("type", "")

            if act_type == "inject":
                desc = act.get("description", "unknown event")
                lines.append(f"  [INJECT] {desc}")
            elif act_type == "arbiter":
                decision = act.get("decision", "?")
                reason = act.get("reason", "")
                complication = act.get("complication")
                line = f"  [ARBITER] {decision}"
                if reason:
                    line += f" -- {reason[:120]}"
                if complication:
                    line += f" | Complication injected: {complication[:100]}"
                lines.append(line)
            else:
                agent = act.get("agent", "?")
                role = act.get("role", "")
                world = act.get("world", "?")
                action_name = act.get("action", "?")

                # Extract content summary
                content = ""
                args = act.get("args", {})
                if isinstance(args, dict):
                    content = args.get("content", "") or args.get("message", "") or ""
                if content:
                    content = f": {content[:100]}"

                role_str = f" ({role})" if role else ""
                lines.append(f"  {agent}{role_str} [{world}] {action_name}{content}")

        lines.append("")

    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py::TestRoundDigest -v`

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/containment_judge.py backend/tests/test_containment_judge.py
git commit -m "feat: add round-level digest builder for containment judge"
```

---

### Task 4: Implement the LLM judge

**Files:**
- Modify: `backend/app/services/containment_judge.py`
- Test: `backend/tests/test_containment_judge.py`

- [ ] **Step 1: Write failing tests for LLM judge**

Append to `backend/tests/test_containment_judge.py`:

```python
from unittest.mock import MagicMock


class TestLLMJudge:
    """Tests for classify_iteration_llm."""

    def _make_llm(self, response: dict) -> MagicMock:
        """Create a mock LLMClient returning the given JSON response."""
        llm = MagicMock()
        llm.chat_json.return_value = response
        llm.model = "test-model"
        llm.last_usage = {"input_tokens": 100, "output_tokens": 50, "cached_tokens": 0}
        return llm

    def test_returns_llm_classification(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({1: ["Monitoring dashboards"], 3: ["Blocking IP"]})
        result = _make_result(actions, total_rounds=10)
        llm = self._make_llm({
            "outcome": "contained_early",
            "containment_round": 3,
            "confidence": 0.85,
            "reasoning": "Defenders blocked the attacker IP in round 3.",
        })
        label, c_round, meta = classify_iteration_llm(result, llm)
        assert label == "contained_early"
        assert c_round == 3
        assert meta["confidence"] == 0.85
        assert meta["reasoning"] == "Defenders blocked the attacker IP in round 3."
        assert meta.get("fallback") is not True

    def test_fallback_on_invalid_outcome(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({2: ["Isolating host"]})
        result = _make_result(actions, total_rounds=10)
        llm = self._make_llm({
            "outcome": "partially_contained",  # invalid
            "containment_round": 2,
            "confidence": 0.5,
            "reasoning": "Partial containment.",
        })
        label, c_round, meta = classify_iteration_llm(result, llm)
        # Should fall back to keyword: "Isolating" matches containment
        assert label == "contained_early"
        assert meta["fallback"] is True

    def test_fallback_on_llm_exception(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({5: ["Checking logs"]})
        result = _make_result(actions, total_rounds=10)
        llm = MagicMock()
        llm.chat_json.side_effect = Exception("API timeout")
        llm.model = "test-model"
        label, c_round, meta = classify_iteration_llm(result, llm)
        # Should fall back to keyword: no keywords -> not_contained
        assert label == "not_contained"
        assert meta["fallback"] is True

    def test_cost_tracking(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({1: ["Blocking attacker"]})
        result = _make_result(actions, total_rounds=10)
        llm = self._make_llm({
            "outcome": "contained_early",
            "containment_round": 1,
            "confidence": 0.9,
            "reasoning": "Blocked.",
        })
        cost_tracker = MagicMock()
        classify_iteration_llm(result, llm, cost_tracker)
        cost_tracker.track_llm.assert_called_once()
        call_args = cost_tracker.track_llm.call_args
        assert call_args[0][0] == "mc_judge"  # phase
        assert call_args[0][1] == "test-model"  # model

    def test_prompt_includes_arbiter_stop_reason(self):
        from app.services.containment_judge import classify_iteration_llm
        actions = _make_actions({1: ["Alert received"]})
        summary = {"adaptive_depth": {"enabled": True, "stopped_at_round": 5, "stop_reason": "contained"}}
        result = _make_result(actions, total_rounds=10, summary=summary)
        llm = self._make_llm({
            "outcome": "contained_early",
            "containment_round": 5,
            "confidence": 0.9,
            "reasoning": "Contained at round 5.",
        })
        classify_iteration_llm(result, llm)
        # Check the prompt sent to the LLM includes arbiter context
        prompt_text = llm.chat_json.call_args[0][0][0]["content"]
        assert "contained" in prompt_text.lower()
        assert "round 5" in prompt_text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py::TestLLMJudge -v`

Expected: FAIL — `ImportError: cannot import name 'classify_iteration_llm'`

- [ ] **Step 3: Implement `classify_iteration_llm`**

Add to `backend/app/services/containment_judge.py`:

```python
_JUDGE_PROMPT_TEMPLATE = """You are a cybersecurity incident response evaluator. Analyze this simulation transcript and classify the OUTCOME of the defenders' response.

SIMULATION:
- Rounds: {total_rounds}, Actions: {total_actions}
- Agents: {agents_list}
{adaptive_depth_context}

TRANSCRIPT:
{digest}

CLASSIFICATION TASK:
Determine whether the defenders ACTUALLY CONTAINED the threat, not just whether they ATTEMPTED containment. A containment attempt that the attacker subsequently bypasses is NOT successful containment.

Consider:
1. Did defenders successfully neutralize the attacker's access or persistence?
2. Did the attacker continue to operate AFTER defender containment actions?
3. Did attacker activity cease or become ineffective after a specific round?
4. Were there escalation events (exfiltration, ransomware, lateral movement) that were NOT stopped?

Classify as EXACTLY ONE of:
- "contained_early": Effective containment in first half (round <= {midpoint}). Attacker genuinely stopped.
- "contained_late": Effective containment in second half (round > {midpoint}). Attacker eventually stopped.
- "escalated": Attacker achieved significant objectives despite defender actions.
- "not_contained": No clear containment. Ambiguous outcome or attacker maintained presence.

Return ONLY valid JSON:
{{"outcome": "...", "containment_round": <int or null>, "confidence": <0.0-1.0>, "reasoning": "2-3 sentences"}}"""


def classify_iteration_llm(
    result,
    llm: LLMClient,
    cost_tracker: CostTracker | None = None,
) -> tuple[str, int | None, dict]:
    """Classify iteration outcome using LLM-as-a-judge.

    Returns (label, containment_round, metadata).
    Falls back to keyword classification on any failure.
    """
    meta: dict = {"fallback": False, "judge_model": getattr(llm, "model", "unknown")}

    try:
        digest = build_round_digest(result)

        # Extract agent list
        agents_seen: dict[str, str] = {}
        for act in result.actions:
            agent = act.get("agent", "")
            role = act.get("role", "")
            if agent and agent not in agents_seen:
                agents_seen[agent] = role
        agents_list = ", ".join(
            f"{a} ({r})" if r else a for a, r in agents_seen.items()
        ) or "unknown"

        # Adaptive depth context
        ad = result.summary.get("adaptive_depth") if result.summary else None
        adaptive_ctx = ""
        if ad and ad.get("enabled"):
            stop_round = ad.get("stopped_at_round")
            stop_reason = ad.get("stop_reason")
            if stop_round:
                adaptive_ctx = (
                    f"- Adaptive depth: simulation stopped at round {stop_round}."
                    f" Arbiter reason: {stop_reason or 'unknown'}"
                )

        midpoint = result.total_rounds / 2.0
        prompt = _JUDGE_PROMPT_TEMPLATE.format(
            total_rounds=result.total_rounds,
            total_actions=result.total_actions,
            agents_list=agents_list,
            adaptive_depth_context=adaptive_ctx,
            digest=digest,
            midpoint=int(midpoint),
        )

        response = llm.chat_json(
            [{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=512,
        )

        # Track cost
        if cost_tracker and llm.last_usage:
            cost_tracker.track_llm(
                "mc_judge",
                llm.model,
                llm.last_usage["input_tokens"],
                llm.last_usage["output_tokens"],
                f"judge_{result.iteration_id}",
                cached_tokens=llm.last_usage.get("cached_tokens", 0),
            )

        # Validate response
        outcome = response.get("outcome", "")
        if outcome not in VALID_OUTCOMES:
            logger.warning(
                "Judge returned invalid outcome %r for %s, falling back to keyword",
                outcome, result.iteration_id,
            )
            label, c_round = classify_iteration_keyword(result)
            meta["fallback"] = True
            return label, c_round, meta

        c_round = response.get("containment_round")
        if c_round is not None:
            c_round = int(c_round)

        meta["confidence"] = response.get("confidence", 0.0)
        meta["reasoning"] = response.get("reasoning", "")
        return outcome, c_round, meta

    except Exception as e:
        logger.warning(
            "Judge failed for %s: %s — falling back to keyword",
            result.iteration_id, e,
        )
        label, c_round = classify_iteration_keyword(result)
        meta["fallback"] = True
        return label, c_round, meta
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py::TestLLMJudge -v`

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/containment_judge.py backend/tests/test_containment_judge.py
git commit -m "feat: add LLM-as-a-judge containment classifier with fallback"
```

---

### Task 5: Wire judge into `aggregate_batch()`

**Files:**
- Modify: `backend/app/services/monte_carlo_aggregator.py:84-99, 184-257`
- Test: `backend/tests/test_containment_judge.py`

- [ ] **Step 1: Write failing test for aggregator with LLM judge**

Append to `backend/tests/test_containment_judge.py`:

```python
class TestAggregatorIntegration:
    """Tests for aggregate_batch with optional LLM judge."""

    def test_aggregate_batch_without_llm_uses_keywords(self):
        """Backward compat: no llm param -> keyword classification."""
        from app.services.monte_carlo_aggregator import aggregate_batch
        actions = _make_actions({1: ["Isolating the compromised server"]})
        result = _make_result(actions, total_rounds=10)
        # Override iteration_id to be unique
        result.iteration_id = "compat_test_001"
        agg = aggregate_batch([result])
        assert agg.iteration_count == 1
        # Keyword would classify "Isolating" as contained_early
        assert agg.outcome_distribution["contained_early"] == 1

    def test_aggregate_batch_with_llm_uses_judge(self):
        """When llm is passed, judge is used instead of keywords."""
        from app.services.monte_carlo_aggregator import aggregate_batch
        actions = _make_actions({
            1: ["Isolating the compromised server"],  # keyword says contained
            3: ["Data exfiltration to external server"],  # but attacker escalated after
        })
        result = _make_result(actions, total_rounds=10)
        result.iteration_id = "judge_test_001"

        llm = MagicMock()
        llm.chat_json.return_value = {
            "outcome": "escalated",  # judge correctly sees escalation post-containment
            "containment_round": None,
            "confidence": 0.8,
            "reasoning": "Attacker exfiltrated data after containment attempt.",
        }
        llm.model = "test-model"
        llm.last_usage = {"input_tokens": 100, "output_tokens": 50, "cached_tokens": 0}

        agg = aggregate_batch([result], llm=llm)
        assert agg.outcome_distribution["escalated"] == 1
        assert agg.outcome_distribution["contained_early"] == 0

    def test_judge_metadata_stored_in_per_iteration_results(self):
        """judge_metadata field is populated when LLM is used."""
        from app.services.monte_carlo_aggregator import aggregate_batch
        actions = _make_actions({1: ["Blocking IP"]})
        result = _make_result(actions, total_rounds=10)
        result.iteration_id = "meta_test_001"

        llm = MagicMock()
        llm.chat_json.return_value = {
            "outcome": "contained_early",
            "containment_round": 1,
            "confidence": 0.95,
            "reasoning": "Blocked immediately.",
        }
        llm.model = "test-model"
        llm.last_usage = {"input_tokens": 100, "output_tokens": 50, "cached_tokens": 0}

        agg = aggregate_batch([result], llm=llm)
        per_iter = agg.per_iteration_results[0]
        assert per_iter.judge_metadata["confidence"] == 0.95
        assert per_iter.judge_metadata.get("fallback") is not True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py::TestAggregatorIntegration -v`

Expected: FAIL — `aggregate_batch() got an unexpected keyword argument 'llm'` and `PerIterationResult has no field judge_metadata`

- [ ] **Step 3: Add `judge_metadata` field to `PerIterationResult`**

In `backend/app/services/monte_carlo_aggregator.py`, after line 98 (`consistency_score: float`), add:

```python
    judge_metadata: dict = field(default_factory=dict)
```

- [ ] **Step 4: Modify `aggregate_batch()` signature and classification loop**

In `backend/app/services/monte_carlo_aggregator.py`:

Change the function signature at line 184 from:
```python
def aggregate_batch(results: list[IterationResult]) -> BatchAggregation:
```
to:
```python
def aggregate_batch(
    results: list[IterationResult],
    llm: LLMClient | None = None,
    cost_tracker: CostTracker | None = None,
) -> BatchAggregation:
```

Add the TYPE_CHECKING import at the top of the file (after line 14):
```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..utils.cost_tracker import CostTracker
    from ..utils.llm_client import LLMClient
```

Replace lines 214-218 (the classification loop body) from:
```python
    for r in results:
        label, c_round = classify_iteration(r)
        outcome_counts[label] += 1
        if c_round is not None:
            containment_rounds.append(c_round)
```
to:
```python
    for r in results:
        meta: dict = {}
        if llm is not None:
            from .containment_judge import classify_iteration_llm
            label, c_round, meta = classify_iteration_llm(r, llm, cost_tracker)
        else:
            label, c_round = classify_iteration(r)
        outcome_counts[label] += 1
        if c_round is not None:
            containment_rounds.append(c_round)
```

Then in the `PerIterationResult` construction at line 243-257, add `judge_metadata=meta` as the last field:

Change:
```python
                consistency_score=0.0,  # filled after agent consistency computed
            )
```
to:
```python
                consistency_score=0.0,  # filled after agent consistency computed
                judge_metadata=meta,
            )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_containment_judge.py::TestAggregatorIntegration -v`

Expected: All 3 tests PASS

- [ ] **Step 6: Run ALL existing tests to confirm no regressions**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_pipeline_harness.py -v`

Expected: All existing `TestMCAggregation` tests PASS (backward compat — no `llm` param = keyword fallback)

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/monte_carlo_aggregator.py backend/tests/test_containment_judge.py
git commit -m "feat: wire LLM judge into aggregate_batch with backward compat"
```

---

### Task 6: Wire judge LLM into MC engine + `asyncio.to_thread`

**Files:**
- Modify: `backend/app/services/monte_carlo_engine.py:479-481, 834-836`

- [ ] **Step 1: Update first `aggregate_batch()` call site (line 480)**

In `backend/app/services/monte_carlo_engine.py`, replace line 480:

```python
            aggregation = aggregate_batch(valid_results)
```

with:

```python
            from ..utils.llm_client import LLMClient
            judge_llm = LLMClient(model=Config.LLM_JUDGE_MODEL)
            aggregation = await asyncio.to_thread(
                aggregate_batch, valid_results, judge_llm, batch.cost_tracker
            )
```

Ensure `asyncio` is imported at the top of the file (check — it likely already is since the file uses `asyncio.Semaphore`).

Ensure `Config` is imported (check — it likely already is since the file references `Config.LLM_API_KEY` at line 343).

- [ ] **Step 2: Update second `aggregate_batch()` call site (line 835)**

In `backend/app/services/monte_carlo_engine.py`, replace line 835:

```python
            aggregation = aggregate_batch(valid_results)
```

with:

```python
            from ..utils.llm_client import LLMClient
            judge_llm = LLMClient(model=Config.LLM_JUDGE_MODEL)
            aggregation = await asyncio.to_thread(
                aggregate_batch, valid_results, judge_llm, batch.cost_tracker
            )
```

- [ ] **Step 3: Verify the file runs without syntax errors**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -c "from app.services.monte_carlo_engine import MonteCarloEngine; print('OK')"`

Expected: `OK`

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/ -x -v`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/monte_carlo_engine.py
git commit -m "feat: wire containment judge into MC engine with asyncio.to_thread"
```

---

### Task 7: Clean up old `classify_iteration` from aggregator

**Files:**
- Modify: `backend/app/services/monte_carlo_aggregator.py:19-29, 114-157`

- [ ] **Step 1: Check for other callers of `classify_iteration`**

Search for any imports of the old function outside the aggregator itself:

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish && grep -rn "classify_iteration" --include="*.py" backend/`

If any external callers exist, update them to import from `containment_judge` instead.

- [ ] **Step 2: Remove old function and keyword constants from aggregator**

In `backend/app/services/monte_carlo_aggregator.py`:

Remove these blocks:
- `CONTAINMENT_KEYWORDS` regex (lines 22-25)
- `ESCALATION_KEYWORDS` regex (lines 26-29)
- `_action_text()` function (lines 119-133)
- `classify_iteration()` function (lines 136-157)

Add imports from `containment_judge` near the top of the file (after the existing imports):

```python
from .containment_judge import (
    CONTAINMENT_KEYWORDS,
    _action_text,
    classify_iteration_keyword,
)
```

This provides `CONTAINMENT_KEYWORDS` (used for `first_alert` detection at line 232) and `_action_text` (used at line 227) from their new home. The `classify_iteration_keyword` import is used by the `llm is None` fallback path in `aggregate_batch`.

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/ -x -v`

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/monte_carlo_aggregator.py
git commit -m "refactor: remove old keyword classifier from aggregator, import from containment_judge"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/ -v`

Expected: All tests PASS

- [ ] **Step 2: Verify aggregation.json schema is additive**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -c "
from app.services.monte_carlo_aggregator import aggregate_batch, IterationResult, PerIterationResult
from dataclasses import asdict
import json

# Build a minimal result
r = IterationResult(
    iteration_id='e2e_test',
    seed=1,
    total_rounds=5,
    total_actions=2,
    actions=[
        {'round': 1, 'agent': 'SOC', 'role': 'soc_analyst', 'world': 'slack',
         'action': 'send_message', 'args': {'content': 'Alert triage'}, 'result': {}},
        {'round': 3, 'agent': 'SOC', 'role': 'soc_analyst', 'world': 'slack',
         'action': 'isolate_host', 'args': {'content': 'Isolating server'}, 'result': {}},
    ],
    summary={},
    cost_usd=0.0,
    variation_description='',
    completed_at='',
    output_dir='',
)

# Aggregate without LLM (backward compat)
agg = aggregate_batch([r])
d = asdict(agg)
print('outcome_distribution:', d['outcome_distribution'])
print('judge_metadata present:', 'judge_metadata' in json.dumps(d))
print('Serializable:', bool(json.dumps(d, default=str)))
print('OK')
"`

Expected: prints outcome distribution, `judge_metadata present: True`, `Serializable: True`, `OK`

- [ ] **Step 3: Verify with fixture data**

Run: `cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/DirePhish/backend && python -m pytest tests/test_pipeline_harness.py::TestMCAggregation -v`

Expected: All 5 fixture-based aggregation tests PASS
