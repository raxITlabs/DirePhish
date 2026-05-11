# ADK Migration Revisions — Post-Platform-Research

**Author:** Adesh Gairola (with Claude)
**Date:** 2026-05-11
**Branch:** `feature/google-challenge`
**Status:** Addendum — supersedes specific decisions in the May 5 migration spec where listed below.

This is a **short addendum**, not a rewrite. The original [`2026-05-05-adk-migration-research.md`](./2026-05-05-adk-migration-research.md) stands as the design rationale. This file records what changed after the deep platform research in [`2026-05-11-google-agent-platform-research.md`](./2026-05-11-google-agent-platform-research.md).

Read the May 5 doc for the *why*. Read this doc for the *current truth*. Read the May 11 research for the *evidence*.

---

## 1. The four big divergences

### 1.1 No A2A in v1 — one Runner with sub-agents

**Old plan:** Three A2A services on localhost ports — DefenderTeam :8001, AdversaryTeam :8002, ContainmentJudge :8003 — each with their own AgentCard.

**New plan:** One root `BaseAgent` running a `SequentialAgent([PressureEngine, Adversary, DefenderTeam, Judge])` in a single Runner. DefenderTeam is a `ParallelAgent` over the 5 defender personas. Judge is exposed as an `AgentTool`. AgentCards are still authored and published as documentation. Judge can be promoted to a real A2A service in W4 if there's time.

**Why:** A2A v1.0 is production-ready (Linux Foundation, 150+ orgs), but it's overkill for our scope. We don't have framework heterogeneity. Our security boundary is enforceable in-process. The demo can honestly say "A2A-ready, here's the AgentCard" without paying the multi-process tax.

**Reference:** §9.4 and §12.1 of the 05-11 research doc.

### 1.2 Cloud Run, not Vertex AI Agent Engine

**Old plan:** Deploy the root orchestrator to Vertex AI Agent Engine (`agent_engines.create()`) as the "managed runtime headline buzzword."

**New plan:** Deploy to Cloud Run. Agent Engine is mentioned in the demo as "we'd use this in prod" but not actually used.

**Why:** Agent Engine has a documented SSE double-encoding bug ([CopilotKit issue 2871](https://github.com/CopilotKit/CopilotKit/issues/2871)) that would break our live war-room view. Every 2026 production ADK example uses Cloud Run.

**Reference:** §7.1 and §12.1 of the 05-11 research doc.

### 1.3 ADK does not ship a refinement loop — we build it (~150 LOC)

**Old plan:** Implied auto-refinement was an ADK feature we'd configure.

**New plan:** Build the refinement loop ourselves on `LoopAgent` + `AgentEvaluator`. Roughly 150 lines. Lives at `scripts/refine_prompts.py`.

**Why:** ADK ships eval *primitives* (`.evalset.json`, `AgentEvaluator`, `adk eval` CLI, 8 built-in metrics) but no built-in optimization meta-loop. **This is actually good news** — building this loop *is* the Track 2 differentiator. Track 2 is about optimization; if we don't build the loop, we're a Track 1 entry with evals.

**Reference:** §6 (eval framework) and §12.2 (eval setup spec) of the 05-11 research doc.

### 1.4 Worlds confirmed as MCP servers, with one reduction

**Old plan:** 4 MCP servers — slack, email, siem, memory.

**New plan:** 3 MCP servers — slack, email, siem (all FastMCP, stdio in dev, Streamable HTTP in prod). Memory is **not** an MCP server in v1 — it's a regular ADK function tool that hits Firestore directly. We can promote to MCP later if it's useful.

**Why:** Memory access pattern is single-tenant and per-persona; MCP overhead isn't justified. Worlds need MCP because we want the per-persona `tool_filter` permission model and the demo signal.

**Reference:** §4 and §9.2 of the 05-11 research doc.

---

## 2. Updated decision log

These rows **override** the corresponding rows in the May 5 spec's §12 decision log.

| Decision | New value | Replaces May 5 value |
|---|---|---|
| Topology | One Runner, sub-agents, AgentCards as docs | 3 A2A services on localhost ports |
| Deployment target (v1) | Cloud Run | Vertex AI Agent Engine |
| MCP server count | 3 (slack, email, siem) | 4 (slack, email, siem, memory) |
| Refinement loop ownership | We build (~150 LOC on `LoopAgent`) | Implied as an ADK-provided feature |
| Round shape | `SequentialAgent([PressureEngine, Adversary, DefenderTeam, Judge])` in one Runner | Root → 3 A2A calls per round |
| Adversary location | `LlmAgent` (`model='claude-sonnet-4-5'` via `LLMRegistry.register(Claude)`) inside same Runner | A2A service on :8002 |
| Model strings | `gemini-2.5-pro`, `gemini-2.5-flash`, `claude-sonnet-4-5` | `gemini-3-pro-preview`, `claude-sonnet-4-6` (these don't exist in Vertex MG as of 2026-05-11; already corrected in `backend/adk/models.py`) |
| Multi-region Claude failover | Required: us-east5 primary, europe-west1 fallback (~10 LOC) | Not specified |

All other May 5 decisions stand.

---

## 3. W2 day-1 checklist — the five refactors

The W1 code that shipped (`backend/adk/*`) is structurally non-idiomatic. The smoke endpoint at `/api/adk/smoke` is fake-everything. Before we go wide on personas, these five refactors land:

1. **`backend/adk/agents/pressure_engine.py`** — promote from a plain class to a `BaseAgent` subclass with `_run_async_impl`. Keep `tick(round_num)` as a public sync method for backward compat. Add `arbitrary_types_allowed = True` to `model_config` (Pydantic footgun per §11.12 of the research doc).

2. **`backend/adk/orchestrator.py`** — refactor from a hand-rolled async coordinator to a `BaseAgent` that constructs and runs a `SequentialAgent([PressureEngine, Adversary, DefenderTeam, Judge])` internally. Round-driving becomes "construct sequential → `runner.run_async()`."

3. **`backend/adk/agents/personas/ir_lead.py`** — promote `IRLeadPersona` from a strategy callable to a factory function that returns a real `LlmAgent` with `model="gemini-2.5-pro"`, real instruction text, and the Slack MCP toolset. The hardcoded `_ir_lead_strategy` lambda in `adk_smoke.py:208-219` is deleted.

4. **`backend/mcp_servers/slack_world.py`** (new) — FastMCP server #1, wrapping `crucible.env.CrucibleEnv.apply_action` for the Slack world. Stdio in dev, Streamable HTTP wrapper for prod. Reference pattern: §4 of the research doc.

5. **`backend/adk/callbacks/track_cost.py`** (new) — `after_model_callback` that logs per-call token + dollar cost. First wired to IR Lead only. W3 adds the dashboard.

**Estimated scope:** W2 day 1–3. Days 4–5 of W2 are: remaining 4 defender personas + Email/SIEM MCP servers + Adversary (`claude-sonnet-4-5`).

**Pressure engine is the hard pin** — everything else parallelizes once it's a real `BaseAgent`.

---

## 4. Eval setup — concrete file layout (W2–W3)

```
backend/tests/evalsets/
├── ransomware_containment_v1.evalset.json    # ~25 cases
├── adversarial_failures_v1.evalset.json      # ~10 deliberately bad runs
├── test_config.json                          # 4 rubrics
└── README.md

backend/tests/evals/
├── test_ransomware.py        # pytest wrapping AgentEvaluator.evaluate
└── test_refinement_loop.py   # asserts the loop converges

scripts/
├── refine_prompts.py         # LoopAgent-based meta-loop (~150 LOC)
└── eval_report.py            # HTML report with before/after
```

Coverage target for `ransomware_containment_v1.evalset.json`:
- 6 personas × 3 round phases (early/mid/late) = 18 base cases
- 4 adversarial scenarios = 4 cases
- 3 happy-path golden runs = 3 cases
- **Total ~25 cases**

Eval rubrics (the 4 dimensions):
1. Containment progress (0–10)
2. Evidence quality (0–10)
3. Communications appropriateness (0–10)
4. Business impact (0–10)

Source data: scrape labels from historical Crucible runs in Firestore + synthetic fill for coverage gaps.

---

## 5. Revised cut order if we slip

Replaces §9 of the May 5 spec.

| Cut # | What goes | Cost |
|---|---|---|
| 1 | Auto-refinement loop becomes manual (one round of prompt tuning, not self-running) | Bumps us from "winning Track 2" to "credible Track 2" |
| 2 | Adversarial evalset cases | Lose ~10 of 25 cases. Still credible. |
| 3 | Judge as A2A in W4 | Stay sub-agent-only. Demo says "A2A-ready, here's the AgentCard." |
| 4 | Multi-region Claude failover | Single-region us-east5 only. Risk of demo-time quota hit. |
| 5 | Drop CEO + Legal personas | Last resort; weakens "real org" story. |

**Difference from May 5 cut order:** multi-model stays in (it's our differentiator). The refinement loop is the first thing that degrades because manual tuning is acceptable if the eval framework itself is robust.

---

## 6. New risk added

**Pydantic footgun on `BaseAgent` subclasses.** Custom `BaseAgent` subclasses in ADK have strict Pydantic field validation. Forgetting `arbitrary_types_allowed = True` in `model_config`, or declaring instance attributes outside the Pydantic schema, will produce confusing `ValidationError`s at construction time. Affects the pressure engine refactor specifically. Mitigation: see the W2 day-1 checklist; the fix is one line, but it has to be there.

**Reference:** §11.12 of the 05-11 research doc.

---

## 7. What did NOT change from the May 5 spec

- Track 2 (Optimize Existing Agents)
- Full ADK-native rewrite (not surgical wrap)
- 6 personas in v1 (CISO, IR Lead, SOC Analyst, ThreatActor, Legal, CEO)
- 3 worlds (Slack, Email, SIEM)
- Ransomware scenario only in v1
- ~15 rounds
- Local-first dev; cloud is week-5 work
- Cross-model: Claude on Adversary, Gemini on Defender, Gemini Pro on Judge
- Hybrid eval data (historical + synthetic)
- `feature/google-challenge` branch
- Crucible package not deleted, just deprecated
- Submission target: 2026-06-05
- Goal: win, not qualify

---

## 8. Next step

Start the W2 day-1 checklist in §3 above. Pressure engine first (it's the hard pin). The five refactors land as one PR or five small commits — preference is five small commits so the diff is reviewable.

The current `/api/adk/smoke` endpoint stays during the refactor — it's the safety net. Once `IRLeadPersona` is a real `LlmAgent`, the smoke endpoint stops being "all fake" and becomes "1 real persona, 1 real MCP world, fakes elsewhere" — which is the first time we'll see a real Gemini response in our logs prefixed with `[ADK]`.
