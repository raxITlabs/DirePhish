# Crucible ADK Hooks — Handoff Plan for `raxITlabs/crucible@feature/adk-hooks`

**Author:** Adesh Gairola (drafted by Claude in DirePhish)
**Date:** 2026-05-05
**Target repo:** `raxITlabs/crucible`
**Target branch:** `feature/adk-hooks`
**Consumer:** `raxitlabs/direphish` on `claude/review-adk-migration-research-057FX`
**Submission deadline (consumer-side):** 2026-06-05
**Status:** ✅ **SHIPPED** on `feature/adk-hooks` (verified at SHA `e914a9b`). 78 passed / 1 skipped / 0 failed. CI workflow included on the branch. Branch is **not** merged — sits parallel to `main` until post-challenge cleanup. DirePhish `backend/pyproject.toml` **tracks the `feature/adk-hooks` branch ref** during integration shake-out (mutable pin, picks up new commits on `pip install`). Switch to a frozen SHA pin once both teams are happy everything works (target: 2026-05-26, start of DirePhish W4).

The original handoff brief is preserved below for the historical record. **§10 — Delivered API + deviations** captures what actually shipped and the open schema question DirePhish must resolve before the legacy round-trip test can un-skip.

---

## 0. How to read this document

This is a brief for an agent that will execute crucible-side work. It assumes **no prior conversation context**. Sections are ordered so you can act top-to-bottom: mission → why → deliverables (with TDD slices) → constraints → coordination → verification.

The companion documents (read for context only — you do **not** need to implement anything in DirePhish):
- `docs/superpowers/specs/2026-05-05-adk-migration-research.md` — full DirePhish migration spec
- `/root/.claude/plans/ok-i-like-the-temporal-sundae.md` — TDD plan for DirePhish

---

## 1. Mission

Land a feature branch `feature/adk-hooks` on `raxITlabs/crucible` that exposes **three small public seams** the DirePhish ADK migration needs.

- Do **not** rewrite crucible.
- Do **not** change `CrucibleEnv.step()`'s legacy round-loop behavior.
- Add new public API alongside, and refactor existing internals only enough to share code between the legacy path and the new one.

Total scope: ~3 files added, ~1 file modified, ~7 test files added. One PR is fine; three commits (one per deliverable) preferred for review.

---

## 2. Why

DirePhish is migrating its custom ReACT loop to Google ADK for the **Google for Startups AI Agent Challenge** (deadline 2026-06-05). The new ADK Root Orchestrator drives each round phase **from outside crucible** (pressure tick → adversary → defender → judge) and emits to MCP servers and an SSE bus.

To do that cleanly, three internal crucible behaviors need to be promoted to public API. Vendoring or local-patching crucible was rejected — changes belong upstream so they can merge to crucible `main` post-challenge as a generic external-driver feature.

DirePhish's pip dep will be repointed to:

```
crucible-sim @ git+https://github.com/raxITlabs/crucible.git@<sha-of-feature/adk-hooks>
```

The SHA bumps weekly (W1, W2, W3 endings) and freezes 2026-05-26 (start of DirePhish W4).

---

## 3. Three deliverables

### 3.1 `crucible.pressure_engine.PressureEngine` — extract, don't rewrite

Today, pressure logic (countdowns, SLA breaches, scripted events) lives inside `CrucibleEnv` and only fires during `step()`. Extract it into a standalone class with a **pure** interface.

```python
# crucible/pressure_engine.py
from dataclasses import dataclass
from typing import List

@dataclass(frozen=True)
class PressureEvent:
    kind: str          # "countdown_breach" | "sla_breach" | "scripted"
    target: str        # who/what the event applies to
    payload: dict      # event-specific data
    round: int

class PressureEngine:
    def __init__(self, config: "PressureConfig", seed: int = 0): ...

    def tick(self, state: "WorldState", round_num: int) -> List[PressureEvent]:
        """Pure: same (state, round_num) → same events. No I/O, no side effects."""
```

`CrucibleEnv.step()` is refactored to **delegate** to `PressureEngine.tick()`. No behavior change for legacy callers. The point of extraction is so ADK can wrap `PressureEngine` in a `BaseAgent` without dragging in `CrucibleEnv`'s round loop.

**TDD slices (write tests first, watch them fail, then implement):**

- `tests/test_pressure_engine.py::TestPurity::test_same_inputs_produce_same_events`
- `tests/test_pressure_engine.py::TestCountdown::test_decrement_and_breach_at_zero`
- `tests/test_pressure_engine.py::TestSLA::test_breach_emitted_when_threshold_crossed`
- `tests/test_pressure_engine.py::TestScripted::test_event_fires_on_round_match`
- `tests/test_legacy_step_unchanged.py::TestRegression::test_step_output_equivalent_to_pre_refactor`
  (golden-master a single legacy `step()` run **before** refactor; assert equivalence after — this is the regression safety net)

### 3.2 `crucible.events.ActionEvent` — Pydantic schema, single source of truth

Today the action shape `{round, timestamp, simulation_id, agent, role, world, action, args, result}` is implicit — written ad-hoc to JSONL by DirePhish at `backend/scripts/run_crucible_simulation.py:343-353`. Promote it to a Pydantic model in crucible so both DirePhish's existing JSONL writer and the new MCP world servers emit the **identical** shape.

```python
# crucible/events.py
from pydantic import BaseModel
from typing import Any

class ActionEvent(BaseModel):
    round: int
    timestamp: str        # ISO-8601 UTC
    simulation_id: str
    agent: str            # persona name
    role: str             # "attacker" | "defender" | "arbiter" | "inject"
    world: str            # "slack" | "email" | "siem" | ...
    action: str           # tool name
    args: dict[str, Any]
    result: dict[str, Any] | None = None
```

Backward-compat constraint: DirePhish's JSONL writer must continue to round-trip every existing fixture file under `backend/tests/fixtures/proj_*/` byte-for-byte. The crucible-side test below pins this contract.

**TDD slices:**

- `tests/test_events_schema.py::TestRoundTrip::test_pydantic_to_jsonl_matches_legacy_byte_for_byte`
  (load a checked-in JSONL fixture, parse via `ActionEvent`, re-serialize, assert equality — DirePhish maintainers will provide the fixture under `tests/fixtures/legacy_actions.jsonl`)
- `tests/test_events_schema.py::TestStrict::test_unknown_field_rejected`
- `tests/test_events_schema.py::TestRole::test_role_enum_constrained`

### 3.3 External round driver hooks on `CrucibleEnv`

Add three public methods to `CrucibleEnv` that let an outside orchestrator drive a round in pieces.

```python
class CrucibleEnv:
    # existing: step(), reset(), etc. — UNCHANGED

    def tick_pressure(self, round_num: int) -> List[PressureEvent]:
        """Run pressure engine for one round. Stateless wrt other phases."""

    def apply_action(
        self,
        actor: str,
        world: str,
        action: str,
        args: dict,
    ) -> ActionEvent:
        """Apply one persona's action to one world. Returns the event with result."""

    def snapshot_world(self, world: str) -> dict:
        """Return the current observable state of a world for a persona to read."""
```

These are thin facades over existing internals. `step()` continues to work for legacy callers — internally it now calls these three methods in sequence.

**TDD slices:**

- `tests/test_env_external_driver.py::TestRoundTrip::test_tick_apply_snapshot_three_phase_cycle`
- `tests/test_env_external_driver.py::TestIsolation::test_apply_action_does_not_advance_round_counter`
- `tests/test_env_external_driver.py::TestSnapshot::test_snapshot_is_read_only`
- `tests/test_legacy_step_unchanged.py::TestRegression::test_step_uses_new_methods_internally_with_no_diff`
  (regression safety net: same golden-master as 3.1)

---

## 4. Hard constraints

- **No breaking changes to public API.** `step()`, `reset()`, `PlatformConfig`, `PressureConfig`, `load_platform_config`, `AgentInfo`, `ManualAction` all keep their current signatures and behavior.
- **No new dependencies** beyond `pydantic` (almost certainly already a transitive dep — verify before adding to `pyproject.toml`).
- **Tests-first, always.** Write the test, watch it fail, write the code, watch it pass. No exceptions for "trivial" code.
- **CI must run on the feature branch.** If `raxITlabs/crucible` doesn't have a pytest workflow, add `.github/workflows/test.yml` as part of this branch. Block merges from `feature/adk-hooks` onward.
- **Branch name:** `feature/adk-hooks` exactly. Do **not** name it after Google, ADK, or the challenge — this needs to merge to crucible `main` cleanly post-challenge as a generic external-driver feature.
- **Sync APIs only.** No `async def` on the new methods. DirePhish handles its own async boundary.

---

## 5. Out of scope (explicitly do NOT do)

- Don't add ADK, Vertex AI, or Anthropic dependencies to crucible. Crucible stays framework-agnostic.
- Don't add MCP server code in crucible. MCP servers live in DirePhish (they consume crucible's API).
- Don't touch `firestore_memory.py` or anything Firestore-related — that's a DirePhish concern.
- Don't refactor scenario loading, `AgentGraph`, or the scenario YAML/JSON schema.
- Don't change Jinja2 / prompt template loading.
- Don't change `step()` / `reset()` semantics. The whole point is they remain identical for legacy callers.

---

## 6. Coordination protocol with DirePhish

1. Open `feature/adk-hooks` on `raxITlabs/crucible`. Notify Adesh (the DirePhish maintainer) that the branch exists.
2. After each deliverable lands, post the commit SHA in a GitHub comment on a tracking issue (or via Slack). DirePhish bumps `backend/pyproject.toml` to that SHA and runs its CI.
3. If the SHA bump breaks a DirePhish test, the DirePhish maintainer files an issue on crucible referencing the failing test name. Do not roll back unprompted.
4. **SHA freeze:** 2026-05-26 (start of DirePhish W4). After that, only critical bug fixes. No new features.
5. **Post-challenge** (after 2026-06-05): rebase `feature/adk-hooks` on crucible `main`, open a PR for permanent merge.

---

## 7. Verification

Run **before** announcing each deliverable as done:

```bash
# In raxITlabs/crucible @ feature/adk-hooks
pytest -q                                         # all green, including new slices
python -c "from crucible.pressure_engine import PressureEngine; print('ok')"
python -c "from crucible.events import ActionEvent; print('ok')"
python -c "from crucible.env import CrucibleEnv; \
  assert hasattr(CrucibleEnv, 'tick_pressure'); \
  assert hasattr(CrucibleEnv, 'apply_action'); \
  assert hasattr(CrucibleEnv, 'snapshot_world'); \
  print('ok')"
```

Then notify DirePhish to bump the SHA. The DirePhish-side smoke test:

```bash
# In raxitlabs/direphish, after pyproject.toml SHA bump
cd backend
pip install -e .                                  # picks up the new SHA
pytest tests/ -q                                  # legacy tests still pass
pytest tests/adk -q                               # new ADK tests can import the new seams
```

If any line in either block fails, the deliverable is **not** done — investigate and fix before moving on.

---

## 8. Open questions to resolve with the DirePhish maintainer

Resolve these on the tracking issue before writing code:

- **Pydantic v1 or v2?** Crucible's current pinned version. Determines `BaseModel` import path and validator syntax.
- **Where does `WorldState` live?** Type-annotated above as `"WorldState"` (forward ref) — confirm the existing class location so `PressureEngine.tick()` can be properly typed.
- **Legacy fixture for the round-trip test.** DirePhish to provide a representative `legacy_actions.jsonl` (10–20 lines covering all four `role` values and at least three `world` values) and check it into crucible `tests/fixtures/`.
- **Random seed plumbing.** Today's pressure logic — does it use `random.Random` somewhere global? If so, the `seed` parameter on `PressureEngine.__init__` needs to thread through. If not, add a local `random.Random(seed)` in `PressureEngine` and have `CrucibleEnv` pass its own seed in.

---

## 9. Definition of done

The branch is done when **all** of these hold:

1. Three commits (or one PR with three logical commits) on `feature/adk-hooks`.
2. New files: `crucible/pressure_engine.py`, `crucible/events.py`, plus 7 test files listed in §3.
3. Modified file: `crucible/env.py` (added 3 public methods + `step()` refactored to use them).
4. CI workflow on `feature/adk-hooks` runs `pytest -q` and is green.
5. Verification commands in §7 all return `ok` / exit zero.
6. A DirePhish CI run pinned to the latest `feature/adk-hooks` SHA is green.
7. No diff in any pre-existing test's output (the regression safety nets `test_legacy_step_unchanged.py` confirm this).

---

## 10. Delivered API + deviations (post-ship addendum)

This section was added after `feature/adk-hooks` shipped. It supersedes §3 wherever the two conflict.

**Current pin (integration shake-out):** branch ref `feature/adk-hooks`. Mutable — `pip install -e .` pulls latest HEAD each time.

```
crucible-sim @ git+https://github.com/raxITlabs/crucible.git@feature/adk-hooks
```

**Verified at SHA:** `e914a9b` (the snapshot whose imports were introspected in §10.5). Newer commits land transparently on the next install.

**Freeze plan:** swap `@feature/adk-hooks` → `@<frozen-sha>` once integration is stable (target 2026-05-26, start of DirePhish W4). Hard-required before challenge submission so the demo build is reproducible.

### 10.1 Actual import surface

```python
from crucible import ActionEvent, PressureEvent, CrucibleEnv
# CrucibleEnv now has:
#   await env.tick_pressure(round_num)
#   await env.apply_action(actor, role, world, action, args, simulation_id, round_num)
#   env.snapshot_world(world)        # sync; returns dict[str, list[dict]]
```

### 10.2 Deviations from the original handoff (§3) — DirePhish must accommodate

| Spec'd in §3 | Shipped in `e914a9b` | DirePhish-side implication |
|---|---|---|
| `tick_pressure` / `apply_action` are sync | **Async** (`async def`) | OK — the ADK orchestrator is async-native (`runner.run_async`, `LlmAgent.generate_content_async`). No sync wrappers needed. The `BaseAgent` wrapping the pressure engine becomes `_run_async_impl`. |
| `PressureEngine.__init__(config, seed)` | `__init__(configs, hours_per_round)` — no `seed` | Pressure logic is deterministic (no RNG); `seed` was vestigial. No change needed in DirePhish. |
| `PressureEngine.tick(state, round_num)` returning events | `tick() -> None` (legacy, unchanged) **plus** `tick_events(round_num) -> list[PressureEvent]` (new). No `state` param. | DirePhish wraps `tick_events` in the ADK `BaseAgent`, not `tick`. |
| `PressureEvent.kind: Literal["countdown_breach","sla_breach","scripted"]` | Adds a fourth: `"severity_changed"` | Update DirePhish `permissions.yaml` consumers and any kind-switch in the orchestrator to handle `severity_changed`. |
| `apply_action(actor, world, action, args)` (4 args) | `apply_action(actor, role, world, action, args, simulation_id, round_num)` (7 args) | DirePhish orchestrator must thread `role`, `simulation_id`, and `round_num` through. The orchestrator already tracks all three — no new state. |
| `step()` semantic preserved | Preserved exactly. Refactor pinned by `tests/test_legacy_step_unchanged.py`. | No DirePhish change. |

### 10.3 Open schema question (blocks the legacy round-trip test)

The shipped `ActionEvent` has `extra="forbid"` and `role: Literal["attacker","defender","arbiter","inject"]`. DirePhish's existing JSONL fixtures (e.g. `backend/tests/fixtures/simulations/proj_32ba2039_scenario_0_sim/actions.jsonl`) **do not validate** under this schema for two reasons:

1. **Extra field `agent_type`.** Every action record has `"agent_type": "..."` alongside `agent`. `extra="forbid"` rejects it.
2. **Role values out of band.** Records use `"role": "threat_actor"`, `"role": "blue_team"`, etc. — not in the four-value `Literal`.
3. **Inject records have a different shape entirely** — `{type, round, description, kill_chain_step, timestamp, simulation_id}`. They are not `ActionEvent`s; they are environmental injects. The crucible-side `tests/fixtures/legacy_actions.jsonl` fixture should exclude them or the schema should fork.

**Resolution options** (pick one before un-skipping `TestLegacyJSONLRoundTrip`):

- **Option A — relax the crucible schema.** Drop `extra="forbid"` on `ActionEvent`, broaden the role `Literal` to a `str` or include `"threat_actor"` and the existing defender role names. Cleanest for backward compat. Loses some validation strictness.
- **Option B — fork the schema.** Add a separate `LegacyActionEvent` (permissive) for round-trip and keep `ActionEvent` strict for new MCP emitters. DirePhish writes `ActionEvent` going forward; reads either via a tagged-union loader.
- **Option C — transform on read.** Map `agent_type` → drop, `role: "threat_actor"` → `role: "attacker"`, etc., in a DirePhish loader. Crucible schema stays strict. Round-trip test in crucible uses a curated, already-mapped fixture (which is what §3.2 originally implied).

**Recommendation:** Option C. Crucible's contract is the future shape; legacy data gets normalized at the DirePhish boundary. The fixture handed to crucible should be a curated, post-mapping slice — not raw historical data.

**Decision (2026-05-05):** ✅ **Option C chosen.** DirePhish owns the normalize-on-read loader; crucible's `ActionEvent` schema stays strict. Implementation deferred until the rest of the W1 ADK build is underway — the un-skip of crucible's `TestLegacyJSONLRoundTrip` happens once DirePhish has produced the curated slice.

### 10.4 Action items for DirePhish (this repo)

- [x] Pin `backend/pyproject.toml` to track the `feature/adk-hooks` branch ref (mutable, integration shake-out).
- [x] Decide schema resolution — **Option C** chosen.
- [ ] Implement DirePhish-side normalizer (`agent_type` drop + `role` re-mapping) when reading historical JSONL into `ActionEvent`. Lives at the persistence boundary, not inside the ADK orchestrator.
- [ ] Produce `tests/fixtures/legacy_actions.jsonl` (curated post-mapping slice, ~10–20 lines covering all 4 roles × 3 worlds) and commit to **crucible** to un-skip `TestLegacyJSONLRoundTrip`.
- [ ] During W1 ADK build: thread `role`, `simulation_id`, `round_num` into orchestrator `apply_action` calls.
- [ ] During W1 ADK build: handle `kind="severity_changed"` `PressureEvent`s in the orchestrator's pressure-tick consumer.
- [ ] **Before W4 (2026-05-26):** swap branch-ref pin to a frozen SHA pin in `backend/pyproject.toml`. Reproducibility lock-in for the challenge submission.
- [ ] After 2026-06-05: open `feature/adk-hooks → main` PR on crucible.

### 10.5 Verification (post-ship, run from this repo)

```bash
cd /home/user/DirePhish/backend
pip install -e .                                  # picks up pinned SHA e914a9b
python -c "from crucible import ActionEvent, PressureEvent, CrucibleEnv; \
  assert hasattr(CrucibleEnv, 'tick_pressure'); \
  assert hasattr(CrucibleEnv, 'apply_action'); \
  assert hasattr(CrucibleEnv, 'snapshot_world'); \
  print('ok')"
pytest tests/ -q                                  # legacy DirePhish tests still pass
```

If either step fails, the pin is wrong or crucible lost a public symbol — investigate before starting W1 ADK work.
