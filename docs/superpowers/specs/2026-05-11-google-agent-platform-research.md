# Google Agent Platform Research — for DirePhish ADK Migration

**Author:** Research agent (drafted by Claude)
**Date:** 2026-05-11
**Branch:** feature/google-challenge
**Status:** Research, not yet implemented
**Companion docs:** 2026-05-05-adk-migration-research.md, 2026-05-05-crucible-adk-hooks-plan.md

---

## 0. How to read this document

This is the second-pass research doc before we commit to the real ADK cutover. The first pass ([`2026-05-05-adk-migration-research.md`](./2026-05-05-adk-migration-research.md)) drew the architecture from a 1-week reading of the docs. Two weeks later we now have ADK 1.33 in the wild, a working W1 smoke (fake env, fake adversary, fake judge), and a clearer picture of what's idiomatic vs. what's "we read the spec sheet."

This document answers 12 questions. Each section ends with a **DirePhish takeaway** call-out. The final section (§12) lists the things in the original migration spec that should change.

The single biggest insight from this pass: **the W1 scaffolding under `backend/adk/` is structurally non-idiomatic.** Our `Orchestrator` is a hand-rolled async class with a `_PressureLike`/`_ActorLike`/`_JudgeLike` Protocol. ADK already has primitives for every one of those roles (`BaseAgent`, `LlmAgent`, `SequentialAgent`, `ParallelAgent`, callbacks, `Runner`, `Session`). If we ship our current shape with a thin ADK wrapper, judges will read it as "added ADK as a logo, kept the old loop." §9 and §12 are where this gets concrete.

---

## 1. Naming clarity (2026 reality)

Google's agent platform has been deeply rebranded since the 2025 Cloud Next announcement. As of Cloud Next 2026 (April 2026), the canonical surface area is:

| Layer | What it is | URL of record |
|---|---|---|
| **Agent Development Kit (ADK)** | Open-source Python/Java/Go/TS SDK. Code-first. Defines `LlmAgent`, `BaseAgent`, `Runner`, callbacks, eval primitives. Latest: **v1.33.0 (2026-05-08)**. | [github.com/google/adk-python](https://github.com/google/adk-python), [adk.dev](https://adk.dev/) |
| **Gemini Enterprise Agent Platform** | Rebrand of Vertex AI announced at Cloud Next 2026. The managed-services umbrella: runtime, sessions, memory, eval, observability, marketplace. ADK is the build-time SDK *for* this platform. | [cloud.google.com/products/gemini-enterprise-agent-platform](https://cloud.google.com/products/gemini-enterprise-agent-platform) |
| **Vertex AI Agent Builder** | The pre-rebrand brand. Still used in docs. Equivalent to "Gemini Enterprise Agent Platform" for our purposes. | [cloud.google.com/products/agent-builder](https://cloud.google.com/products/agent-builder) |
| **Vertex AI Agent Engine** (a.k.a. Agent Runtime) | The **managed runtime** under Agent Builder. Where you deploy an ADK app for production. Billed by vCPU-hour ($0.0864) and GB-hour ($0.0090), 50 vCPU-hours + 100 GB-hours free monthly. | [docs.cloud.google.com/agent-builder/agent-engine/overview](https://docs.cloud.google.com/agent-builder/agent-engine/overview) |
| **Vertex AI Model Garden** | The **model catalog**: 200+ foundation models. Gemini natively, Claude (Anthropic) as first-class third-party, Llama/Mistral/Gemma open. Single auth, single billing, single observability. | [cloud.google.com/model-garden](https://cloud.google.com/model-garden) |
| **Agent Garden** | The **agent template library**. Curated samples + one-click deploy. Not where we go to *learn* ADK, but where startups list reference designs. | Linked from Agent Builder console. |
| **Cloud Marketplace / Gemini Enterprise app** | The **distribution surface** — Track 3 of the challenge. Where enterprises browse and provision third-party agents. | [cloud.google.com/marketplace](https://cloud.google.com/marketplace) |
| **Agent Marketplace** | Marketing-speak for "Cloud Marketplace + Gemini Enterprise apps." Not a separate product. | — |
| **Gemini Apps** | Consumer-facing Gemini products (gemini.google.com). Unrelated to the developer platform. Easy to confuse with the above. | [gemini.google.com](https://gemini.google.com) |

**The relationships (in one sentence):** ADK is the SDK you build with; Agent Engine is the managed runtime you deploy to; Model Garden is the model catalog all your agents call into; Agent Garden is the template library; Cloud Marketplace is the distribution channel; "Gemini Enterprise Agent Platform" is the umbrella brand for all of the managed pieces.

Sources: [Google Cloud — Agent Builder overview](https://docs.cloud.google.com/agent-builder/overview), [UI Bakery 2026 guide](https://uibakery.io/blog/vertex-ai-agent-builder), [TheNextWeb Cloud Next 2026 coverage](https://thenextweb.com/news/google-cloud-next-ai-agents-agentic-era).

**DirePhish takeaway:** We talk about all of these but only directly touch four of them: **ADK** (W1–W5), **Model Garden** (Gemini + Claude on the same auth), **Agent Engine** (deploy target for W4, or skip if we go pure Cloud Run), **Cloud Trace / Cloud Logging** (observability story). We do **not** need Agent Garden, Marketplace, or Gemini Apps for Track 2. Mentioning all five in the demo would be flexing; pick two and be specific.

---

## 2. ADK deep dive — when to use each agent type

ADK 1.33 ships five core agent types. The mistake every team makes is reaching for `LlmAgent` for everything ("AI everywhere") when the framework already has cheaper deterministic primitives.

### 2.1 LlmAgent — autonomous vs. workflow-as-prompt

**Idiomatic use:** A single persona that *decides what to do next* based on the conversation and available tools. The LLM owns the routing.

```python
from google.adk.agents import LlmAgent
from google.genai import types

ir_lead = LlmAgent(
    name="ir_lead",
    model="gemini-2.5-pro",
    description="Incident Response Lead — runs the war room.",
    instruction=(
        "You are Marcus Thorne, IR Lead. Coordinate SOC, Infra, Legal. "
        "Read SIEM, post to Slack, escalate to CISO when severity >= high."
    ),
    tools=[siem_mcp_tool, slack_mcp_tool],
    output_key="ir_lead_action",  # writes to session.state['ir_lead_action']
    generate_content_config=types.GenerateContentConfig(temperature=0.4),
)
```

**Wrong choice when:** the decision is deterministic (use `BaseAgent`), or the flow is fixed (use `SequentialAgent`). An LLM is the wrong tool for "tick a countdown by 1."

**State plumbing:** `output_key` auto-writes the final response to `session.state`. Downstream agents read it as `{ir_lead_action}` in their instruction string ([source](https://adk.dev/agents/multi-agents/)).

### 2.2 SequentialAgent — fixed-order pipeline

**Idiomatic use:** A pipeline where step N depends on step N-1's state. The codelab pattern is "writer → reviewer → refactorer" ([source](https://github.com/google/adk-python)):

```python
from google.adk.agents import SequentialAgent, LlmAgent

writer = LlmAgent(name="Writer",  model="gemini-2.5-flash", output_key="draft")
reviewer = LlmAgent(name="Reviewer", model="gemini-2.5-pro",
                    instruction="Review: {draft}", output_key="review")
refactorer = LlmAgent(name="Refactorer", model="gemini-2.5-pro",
                       instruction="Apply: {review} to: {draft}", output_key="final")

pipeline = SequentialAgent(name="CodePipeline",
                           sub_agents=[writer, reviewer, refactorer])
```

**Wrong choice when:** steps don't actually depend on each other (use `ParallelAgent`), or you need conditional branching mid-flow (use a custom `BaseAgent`).

### 2.3 ParallelAgent — concurrent fan-out

**Idiomatic use:** N independent sub-tasks that write to distinct state keys, joined by a downstream synthesizer. This is the "5 defenders react concurrently" pattern.

```python
from google.adk.agents import ParallelAgent

defender_fanout = ParallelAgent(
    name="DefenderTeamFanout",
    sub_agents=[ciso_agent, ir_lead_agent, soc_analyst_agent, legal_agent, ceo_agent],
)
# Each persona writes to state['ciso_action'], state['ir_lead_action'], etc.
# A downstream SequentialAgent step reads all five for the judge.
```

**Wrong choice when:** sub-agents share state mutations (race condition risk), or one's output is another's input (use `SequentialAgent`).

**Gotcha:** Parallel children share the same `Session` but should write to **distinct keys**. Two agents writing to `state["last_action"]` is a race — there's no lock.

### 2.4 LoopAgent — iterative refinement

**Idiomatic use:** Generate → critique → revise, until quality threshold or max iterations. Termination is via a sub-agent yielding `EventActions(escalate=True)` ([source](https://adk.dev/agents/workflow-agents/loop-agents/)):

```python
from google.adk.agents import LoopAgent, BaseAgent
from google.adk.events import Event, EventActions
from google.adk.agents.invocation_context import InvocationContext
from typing import AsyncGenerator

class CheckContainment(BaseAgent):
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        score = ctx.session.state.get("containment_score", 0.0)
        done = score >= 0.85
        yield Event(author=self.name, actions=EventActions(escalate=done))

containment_loop = LoopAgent(
    name="ContainmentLoop",
    max_iterations=15,
    sub_agents=[round_orchestrator, judge_agent, CheckContainment(name="Checker")],
)
```

**Wrong choice when:** you don't have a clear quality signal to terminate on. An infinite-loop-with-max-iterations is still budget-burning.

### 2.5 Custom BaseAgent — deterministic glue

**Idiomatic use:** Anything that's *not an LLM*. Countdowns, schedule triggers, external API polling, custom orchestration logic. The framework supports this as a first-class agent type — they show up in traces, get session state, and can yield events. **This is the right home for our Pressure Engine.**

The canonical signature ([source](https://adk.dev/agents/custom-agents/)):

```python
from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from typing import AsyncGenerator

class PressureEngineAgent(BaseAgent):
    """Deterministic countdown ticker. No LLM."""
    pressure_engine: object  # crucible.pressure.PressureEngine
    model_config = {"arbitrary_types_allowed": True}

    def __init__(self, name: str, configs, hours_per_round: float = 1.0):
        from crucible.pressure import PressureEngine
        super().__init__(name=name,
                         pressure_engine=PressureEngine(configs=list(configs),
                                                       hours_per_round=hours_per_round))

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        round_num = ctx.session.state.get("round_num", 1)
        events = self.pressure_engine.tick_events(round_num)
        ctx.session.state["pressure_events"] = [e.model_dump() for e in events]
        yield Event(
            author=self.name,
            content=None,
            actions=None,  # could add escalate=True on critical breach
        )
```

**Wrong choice when:** you actually need an LLM (use `LlmAgent`). Don't write a custom agent just to wrap "call OpenAI" — that's what `LlmAgent` is for.

### 2.6 Delegation patterns (the three ways agents call agents)

ADK gives you three mechanisms ([source](https://adk.dev/agents/multi-agents/)):

1. **`sub_agents=[...]` hierarchy** — parent-child. Used by workflow agents and `LlmAgent`-with-children. Lifecycle is managed by the parent.
2. **`transfer_to_agent` LLM-driven** — the parent's LLM emits a function call `transfer_to_agent(agent_name=...)` to route. Needs clear `description=` on each candidate.
3. **`AgentTool(...)` explicit tool wrap** — wrap a sub-agent in `AgentTool` and add it to `tools=[...]`. The LLM calls it like any other tool, gets the response back synchronously. Best when the parent should *use* the sub-agent as a service rather than *hand off* to it.

For our case: defenders are **siblings under a ParallelAgent** (no LLM routing needed — they all act every round). Judge is an `AgentTool` wrapped under the root because we want its score returned to the round driver, not handed off. Adversary is also `AgentTool` — same reason.

**DirePhish takeaway:** Our current `backend/adk/orchestrator.py` is a hand-rolled async class. It should be a **custom `BaseAgent` containing a `SequentialAgent` of [`PressureEngineAgent`, adversary `AgentTool`, defender `ParallelAgent`, judge `AgentTool`]**, all wrapped in a `LoopAgent` with a `CheckTermination` sub-agent. That topology gives us tracing, session state, and eval coverage for free.

---

## 3. A2A protocol — 2026 production status

### 3.1 Production readiness

**A2A v1.0 is production-ready as of early 2026.** Owned by the Linux Foundation, 150+ organization deployments, production at Microsoft, AWS, Salesforce, SAP, ServiceNow ([source](https://stellagent.ai/insights/a2a-protocol-google-agent-to-agent)). v1.0 added Signed Agent Cards, formal Protobuf as canonical schema, and explicit deprecation semantics.

Status signals to use in the demo:
- "Built on A2A v1.0, the Linux Foundation–stewarded standard."
- "AgentCards served at `/.well-known/agent.json`, the same pattern as `robots.txt`."
- "Signed Agent Cards so receiving agents verify the publisher."

### 3.2 When to prefer A2A over sub-agents

| Use sub-agents in one Runner when... | Use A2A when... |
|---|---|
| Agents share session state directly | Agents need security boundaries |
| Single process, single deploy unit | Independent deploy/scale per team |
| Tight coupling acceptable | Cross-framework (ADK ↔ LangGraph ↔ CrewAI) |
| Demo runs locally | Production needs per-team SLAs |
| Latency matters (no HTTP hop) | Long-running tasks need streaming status |

The honest engineering answer: **A2A is overkill for a single-process demo.** It pays off when (a) different teams own different agents, (b) you need framework heterogeneity, or (c) the security boundary is real.

For DirePhish, the security boundary **is** real in the fiction (Defender mustn't see Adversary's chain-of-thought), but it's enforceable inside one process by simply not exposing one agent's state to another. The A2A separation is a *demo story* more than a *technical necessity*. See §9 for the recommendation.

### 3.3 AgentCard format (v1.0)

Required fields ([source](https://a2a-protocol.org/latest/specification/)):

```json
{
  "name": "containment_judge",
  "description": "Scores IR rounds across containment, evidence, comms, business-impact.",
  "url": "https://judge-direphish-...run.app",
  "version": "1.0.0",
  "defaultInputModes":  ["text/plain", "application/json"],
  "defaultOutputModes": ["application/json"],
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "securitySchemes": {
    "googleServiceAccount": {
      "type": "openIdConnect",
      "openIdConnectUrl": "https://accounts.google.com/.well-known/openid-configuration"
    }
  },
  "skills": [
    {
      "id": "score_round",
      "name": "Score a simulation round",
      "description": "Rate (0–1) containment, evidence quality, comms, business impact.",
      "tags": ["incident-response", "eval"],
      "examples": ["Score this round transcript: ..."]
    }
  ],
  "provider": {
    "organization": "raxIT Labs",
    "url": "https://raxit.io"
  }
}
```

Served at `https://<agent-host>/.well-known/agent.json`. The Python A2A SDK gives you `A2ACardResolver` to fetch it, `A2AStarletteApplication` to host it.

### 3.4 Authentication patterns

A2A v1.0 supports the full OpenAPI SecurityScheme catalog: OAuth 2.0 (auth code, client credentials, device code), API keys (header/query), HTTP Basic/Bearer, OpenID Connect, mutual TLS.

For an all-GCP deployment, the idiomatic pattern is **Cloud Run service-to-service auth with OIDC ID tokens**:

```python
import google.auth.transport.requests
from google.oauth2 import id_token

auth_req = google.auth.transport.requests.Request()
target_audience = "https://judge-direphish-...run.app"
token = id_token.fetch_id_token(auth_req, target_audience)

headers = {"Authorization": f"Bearer {token}"}
# pass to A2AClient request
```

Each A2A service runs as its own GCP service account with `roles/run.invoker` granted only to its peers. No shared keys, no env-var bearer tokens.

### 3.5 Cross-runtime A2A

The single highest-leverage A2A demo pattern in 2026 is **multi-framework**: ADK orchestrator → LangGraph planner → CrewAI execution crew, all over A2A ([Google codelab](https://codelabs.developers.google.com/next26/scale-agents)). For DirePhish this is *not* a fit (we don't need LangGraph or CrewAI), but it's worth noting that A2A's reason-to-exist is heterogeneous frameworks, not separation of concerns within one ADK process.

### 3.6 Real-world deployment shapes

The [InstaVibe codelab](https://codelabs.developers.google.com/instavibe-adk-multi-agents/instructions) is the most representative 2026 production-style ADK + A2A + MCP example. It runs:

- One **orchestrator** ADK agent on Cloud Run.
- Three **specialist** ADK agents (planner, social-profiler, platform-interaction), each on its own Cloud Run service, each publishing an AgentCard.
- One **MCP server** wrapping the InstaVibe API, also on Cloud Run.
- All inter-service comms over A2A with SSE streaming.

Cloud Run is the deploy target because Agent Engine has **known SSE streaming bugs in 2026** (see §7).

**DirePhish takeaway:** A2A is real, but for our scope it's a *demo signal*, not a *technical requirement*. A defensible compromise: keep the v1 implementation as sub-agents under one Runner (lower complexity, no inter-service auth, no streaming-bug exposure), and **publish AgentCards anyway** for the Defender / Adversary / Judge endpoints. The cards advertise the boundary even if the implementation is monolithic. If we have time in W4, promote the Judge to a real A2A service since it's the cleanest extraction (stateless, score-only). §12 makes this recommendation concrete.

---

## 4. MCP integration — best practices

### 4.1 Stdio vs HTTP/SSE vs Streamable HTTP

| Transport | Latency | Best for | Avoid for |
|---|---|---|---|
| **stdio** | Lowest (no network) | Local dev, single-tenant, subprocess-per-server | Production, multi-tenant, scaling |
| **SSE** | Medium (HTTP one-shot req + push) | Browser-friendly remote tools | Server-initiated bidi (use HTTP/streamable) |
| **Streamable HTTP** | Medium (HTTP POST + GET) | Production multi-client servers (released MCP spec, March 2025) | Local dev (overkill) |

The 2026 best practice is **stdio in dev, Streamable HTTP in prod**. SSE is being phased out in favor of Streamable HTTP for new deployments ([source](https://modelcontextprotocol.io/)).

### 4.2 Building custom MCP servers — FastMCP is the standard

[FastMCP 3.0](https://github.com/jlowin/fastmcp) (released 2026-01-19) powers ~70% of all MCP servers across all languages. The 3-line server:

```python
# slack_world_mcp.py
from fastmcp import FastMCP
from crucible.env import CrucibleEnv  # vendored or pip-installed

mcp = FastMCP("slack-world")
_env = CrucibleEnv.load(...)

@mcp.tool()
async def post_message(channel: str, agent: str, content: str) -> dict:
    """Post a message to a Slack channel in the simulation."""
    ev = await _env.apply_action(
        actor=agent, role="defender", world="slack",
        action="post_message", args={"channel": channel, "content": content},
        simulation_id=_env.simulation_id,
        round_num=_env.round_num,
    )
    return ev.model_dump()

@mcp.tool()
async def read_channel(channel: str, limit: int = 20) -> list[dict]:
    """Read recent messages from a Slack channel."""
    snapshot = _env.snapshot_world("slack")
    return snapshot.get(channel, [])[-limit:]

if __name__ == "__main__":
    mcp.run()  # stdio by default; mcp.run(transport="streamable-http", port=8080) for prod
```

ADK consumes it via `McpToolset` ([source](https://google.github.io/adk-docs/tools-custom/mcp-tools/)):

```python
from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

ir_lead = LlmAgent(
    model="gemini-2.5-pro",
    name="ir_lead",
    instruction="...",
    tools=[
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="python", args=["-m", "mcp_servers.slack_world"],
                ),
                timeout=30,
            ),
            tool_filter=["post_message", "read_channel"],  # narrow surface
        ),
    ],
)
```

### 4.3 Security: per-agent tool permissions

The `tool_filter=[...]` arg on `McpToolset` is **the** mechanism for per-agent permissioning. SOC Analyst's `McpToolset` to the email server has `tool_filter=["read_email"]` (no send). CEO's SIEM toolset has `tool_filter=[]` (no access at all — drop the toolset entirely).

A stronger guardrail layer is `before_tool_callback`:

```python
PERMISSIONS = {  # persona slug -> world -> allowed actions
    "soc_analyst": {"slack": ["post_message"], "siem": ["query"]},
    "ceo":        {"slack": ["post_message"], "email": ["send"]},
}

async def before_tool_callback(tool, args, tool_context):
    persona = tool_context.state.get("persona_slug")
    world = tool.name.split(".")[0]  # if tool name is "slack.post_message"
    action = tool.name.split(".")[1]
    if action not in PERMISSIONS.get(persona, {}).get(world, []):
        return {"error": f"permission denied: {persona} cannot {action} on {world}"}
    return None
```

This belt-and-braces approach (filter at toolset level **and** at callback level) is the production pattern ([source](https://hatchworks.com/blog/gen-ai/google-adk-best-practices/)).

### 4.4 Performance: subprocess overhead

A stdio MCP server is a Python subprocess. 4 stdio MCP servers × N agents × M rounds = a lot of subprocess starts if not pooled. ADK 1.32+ keeps the subprocess alive per `McpToolset` instance and reuses it across calls. The cost is paid once at agent boot. If you instantiate `McpToolset` inside `_run_async_impl` (don't), you pay the subprocess cost every round.

For Streamable HTTP, the equivalent is a persistent HTTP connection pool. ADK handles this via httpx under the hood ([source](https://adk.dev/tools-custom/mcp-tools/)).

### 4.5 Recommended pattern for exposing your own systems

Three patterns for "expose Firestore / internal API as MCP":

1. **Wrap each table as a tool** — `read_simulation`, `write_action`, `query_actions_by_round`. Most ergonomic for the LLM. What we want.
2. **Generic CRUD with auth** — `firestore_read(collection, id)`, `firestore_query(collection, filters)`. More powerful but the LLM struggles with collection naming.
3. **Surface only what the agent needs per persona** — different MCP servers for different personas. Tightest security but high boilerplate.

For our memory layer (currently `firestore_memory.py`), pattern 1 is the sweet spot — wrap the 4–5 access patterns (vector search, fetch by round, recent actions, scenario state) as named tools and expose them via FastMCP. Saves us writing an HTTP layer.

**DirePhish takeaway:** Build the 3 worlds (Slack, Email, SIEM) as **FastMCP stdio servers** for v1, with `mcp.run(transport="streamable-http")` as a one-line swap if we go remote later. Memory layer optionally as a 4th MCP server — but only if W3 has slack; otherwise call Firestore directly. Per-persona permissions enforced via `tool_filter` + `before_tool_callback` (defense in depth).

---

## 5. Multi-model strategy via Vertex AI Model Garden

### 5.1 What's hosted (mid-2026)

Model Garden carries 200+ models. The ones relevant to us ([source](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models)):

| Family | Provider | Best for | Vertex string |
|---|---|---|---|
| Gemini 2.5 Pro | Google | Complex reasoning, judge | `gemini-2.5-pro` |
| Gemini 2.5 Flash | Google | Volume + speed | `gemini-2.5-flash` |
| Claude Sonnet 4.5 | Anthropic (3P, MaaS) | Adversarial reasoning | `claude-sonnet-4-5` |
| Claude Opus 4.1 | Anthropic | High-depth reasoning | `claude-opus-4-1` |
| Claude Haiku 4.5 | Anthropic | Cheap volume | `claude-haiku-4-5` |
| Llama 4 | Meta (open) | Second adversary, v2 | endpoint string |
| Mistral / Mixtral | Mistral (open/3P) | Cheap red-team gen | endpoint string |

**Regional caveat:** Claude on Vertex is published in `us-east5` and `europe-west1` (the two regions Anthropic ships partner models to). Gemini is broadly available. This is what gives our W1 quota-failover plan its bite (§6 of the original spec).

### 5.2 Native ADK Gemini vs LiteLlm wrapper vs `anthropic[vertex]`

There are three ways to talk to Claude from ADK:

| Approach | Path | Auth surface | Latency | DirePhish fit |
|---|---|---|---|---|
| **`anthropic[vertex]` + `LLMRegistry.register(Claude)`** | Vertex AI Model Garden (MaaS) | ADC only — same as Gemini | Direct, no proxy | **Use this.** |
| **LiteLlm wrapper** (`LiteLlm("anthropic/claude-...")`) | LiteLlm proxy → Anthropic direct API | LiteLlm service + Anthropic key | +1 hop, separate service | Adds infra; skip. |
| **Direct `anthropic` SDK** (no Vertex) | Anthropic direct API | Anthropic API key | Direct | Two billing surfaces; skip. |

The ADK Python docs explicitly support pattern 1 via `google.adk.models.anthropic_llm` ([source](https://github.com/google/adk-python)):

```python
# Once at process startup
from google.adk.models.anthropic_llm import Claude
from google.adk.models.registry import LLMRegistry
LLMRegistry.register(Claude)

# Then use the model string anywhere
from google.adk.agents import LlmAgent
adversary = LlmAgent(
    name="threat_actor",
    model="claude-sonnet-4-5",   # resolved via registry → anthropic[vertex] → Vertex MG
    instruction="You are an organized ransomware affiliate. Plan kill chain...",
)
```

The W1 `backend/adk/models.py` already does this correctly. **The model strings in `CLAUDE_MODELS` should be the @-suffixed Vertex publisher strings** (e.g. `"claude-sonnet-4-5@20250514"`) for reproducible pins. ADK 1.32+ accepts both bare names and pinned ones, but pinned is the production move.

### 5.3 Cost differential

For DirePhish-scale (60 rounds × 6 personas × ~6K tokens/turn = ~2M tokens/sim):

- **Gemini 2.5 Pro:** ~$1.25/1M input + $5.00/1M output. Sim cost: ~$10–$15.
- **Claude Sonnet 4.5 on Vertex:** ~$3/1M input + $15/1M output. Sim cost (adversary only, ~1/6 of traffic): ~$5–$8.

Sim cost on Vertex Claude is roughly equivalent to Anthropic direct (Vertex passes through Anthropic pricing for MaaS). The Vertex value is *not* cheaper Claude — it's **single auth, single billing, single observability**.

Our $500 GCP credit comfortably covers 30–50 full sims. We will not run out of budget.

### 5.4 How to mix Claude + Gemini in the same agent tree

This is the killer pattern judges remember. The mechanism is just "pass a different `model=` to each `LlmAgent`":

```python
from google.adk.models.anthropic_llm import Claude
from google.adk.models.registry import LLMRegistry
LLMRegistry.register(Claude)

from google.adk.agents import LlmAgent, ParallelAgent, SequentialAgent

# Defender team — all Gemini
ciso     = LlmAgent(name="ciso",     model="gemini-2.5-pro",   output_key="ciso_action", ...)
ir_lead  = LlmAgent(name="ir_lead",  model="gemini-2.5-pro",   output_key="ir_lead_action", ...)
soc      = LlmAgent(name="soc",      model="gemini-2.5-flash", output_key="soc_action", ...)
legal    = LlmAgent(name="legal",    model="gemini-2.5-flash", output_key="legal_action", ...)
ceo      = LlmAgent(name="ceo",      model="gemini-2.5-flash", output_key="ceo_action", ...)

defenders = ParallelAgent(name="DefenderTeam",
                          sub_agents=[ciso, ir_lead, soc, legal, ceo])

# Adversary — Claude
adversary = LlmAgent(name="threat_actor", model="claude-sonnet-4-5",
                     output_key="adversary_action", ...)

# Judge — Gemini Pro (consistency at the judging layer)
judge = LlmAgent(name="containment_judge", model="gemini-2.5-pro",
                 output_key="judge_score", ...)

# Round = pressure (deterministic) → adversary → defenders (parallel) → judge
round_agent = SequentialAgent(name="Round", sub_agents=[
    PressureEngineAgent(name="pressure", ...),
    adversary,
    defenders,
    judge,
])
```

**That's it.** No model abstraction layer, no provider switch statement, no LiteLlm proxy. The `LLMRegistry` resolves model strings to providers automatically. Same `LlmAgent` class for all of them. Same callbacks fire. Same Cloud Trace spans.

This is exactly the demo beat: open architecture diagram, show three boxes with three logos, show the code is one shape across all of them. That's the differentiator.

**DirePhish takeaway:** Our `backend/adk/models.py` is already structured correctly. Two small changes: (1) bump `CLAUDE_MODELS["sonnet"]` to the @-pinned publisher string for reproducibility; (2) the W1 personas in `backend/adk/agents/personas/` need to grow from "strategy callable" wrappers to real `LlmAgent` subclasses (or factory functions) — they're currently testable but non-idiomatic.

---

## 6. Eval framework — the Track 2 differentiator

### 6.1 `.evalset.json` format (concrete example)

ADK's eval format is a `EvalSet` with `EvalCases`, each containing a `conversation` of `Invocations`. The schema ([source](https://adk.dev/evaluate/)):

```json
{
  "eval_set_id": "ransomware_containment_v1",
  "name": "Ransomware Containment — full scenario",
  "description": "End-to-end IR rounds against the ransomware scenario.",
  "eval_cases": [
    {
      "eval_id": "round_03_soc_pivots_iocs",
      "conversation": [
        {
          "invocation_id": "rnd03-q1",
          "user_content": {
            "parts": [{"text": "Round 3: SIEM shows powershell.exe spawning from winword.exe on host PROD-WEB-04. SOC, what next?"}],
            "role": "user"
          },
          "final_response": {
            "parts": [{"text": "Isolate PROD-WEB-04 via EDR, pivot IOCs across SIEM for last 24h, page IR Lead with findings."}],
            "role": "model"
          },
          "intermediate_data": {
            "tool_uses": [
              {"name": "siem.query", "args": {"query": "process_name='powershell.exe' AND parent='winword.exe'", "hours": 24}},
              {"name": "edr.isolate_host", "args": {"hostname": "PROD-WEB-04"}},
              {"name": "slack.post_message", "args": {"channel": "incident-war-room", "content": "..."}}
            ],
            "intermediate_responses": []
          }
        }
      ],
      "session_input": {
        "app_name": "direphish",
        "user_id": "eval_user",
        "state": {"scenario": "ransomware", "round_num": 3, "persona_slug": "soc_analyst"}
      }
    }
  ]
}
```

### 6.2 Built-in metrics (ADK 1.33)

Six families ([source](https://adk.dev/evaluate/criteria/)):

| Criterion | Type | Score range | Use case |
|---|---|---|---|
| `tool_trajectory_avg_score` | Reference | 0.0–1.0 | Tool call sequence match (EXACT, IN_ORDER, ANY_ORDER). Regression testing. |
| `response_match_score` | Reference | 0.0–1.0 (ROUGE-1) | Word overlap with golden response. |
| `final_response_match_v2` | LLM-judge | 0.0–1.0 | Semantic equivalence to reference. |
| `rubric_based_final_response_quality_v1` | LLM-judge + rubric | 0.0–1.0 | Custom rubric (no reference needed). **This is our path.** |
| `rubric_based_tool_use_quality_v1` | LLM-judge + rubric | 0.0–1.0 | Did the agent use tools well? |
| `hallucinations_v1` | LLM-judge | 0.0–1.0 | Are claims grounded in context? |
| `safety_v1` | Vertex Eval SDK | 0.0–1.0 | Harmful content detection. |
| `multi_turn_*_v1` (4 variants) | LLM-judge | 0.0–1.0 | Multi-turn conversation quality. |

### 6.3 Custom LLM-as-judge — the DirePhish path

We need four custom dimensions: containment progress, evidence quality, comms appropriateness, business impact. The idiomatic ADK pattern is `rubric_based_final_response_quality_v1` with our rubrics in a `test_config.json`:

```json
{
  "criteria": {
    "rubric_based_final_response_quality_v1": {
      "threshold": 0.7,
      "judge_model_options": {
        "model": "gemini-2.5-pro",
        "num_samples": 3
      },
      "rubrics": [
        {
          "rubric_id": "containment_progress",
          "rubric_content": {"text_property": {
            "description": "Does this action measurably move toward containment of the incident? Containment-positive: isolate hosts, rotate creds, block IOCs, kill C2. Containment-negative: stall, debate, delegate without action."
          }}
        },
        {
          "rubric_id": "evidence_quality",
          "rubric_content": {"text_property": {
            "description": "Is the action grounded in observed world state (SIEM hits, Slack messages, prior IOCs)? Score 1.0 if every claim is traceable to evidence in the round; 0.0 if claims are speculative or fabricated."
          }}
        },
        {
          "rubric_id": "comms_appropriateness",
          "rubric_content": {"text_property": {
            "description": "Right channel, right audience, right urgency. CEO doesn't get raw IOCs; SOC doesn't get business-impact framing. Score 1.0 if comm fits persona + audience."
          }}
        },
        {
          "rubric_id": "business_impact",
          "rubric_content": {"text_property": {
            "description": "Does the action reduce or escalate business risk net? Positive: protects customers, preserves evidence, satisfies regulators. Negative: unnecessary outage, premature disclosure, regulatory exposure."
          }}
        }
      ]
    }
  }
}
```

The judge model samples 3x and majority-votes per rubric ([source](https://adk.dev/evaluate/criteria/)).

If we need even more control (e.g., scenarios where the rubric needs world-state context that doesn't fit in the prompt), the escape hatch is **a fully custom evaluator** subclassing ADK's evaluator base. Less polished, more work, but possible.

### 6.4 `adk eval` CLI in CI (GitHub Actions)

```yaml
# .github/workflows/eval-regression.yml
name: ADK eval regression
on:
  pull_request:
    paths: [backend/adk/**]

jobs:
  eval:
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # for GCP OIDC
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SA }}
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --all-extras
        working-directory: backend
      - run: |
          uv run adk eval \
            backend/adk \
            backend/tests/evalsets/ransomware_containment_v1.evalset.json \
            --config_file_path backend/tests/evalsets/test_config.json \
            --print_detailed_results
        working-directory: backend
        env:
          GOOGLE_GENAI_USE_VERTEXAI: "TRUE"
          GOOGLE_CLOUD_PROJECT: ${{ secrets.GCP_PROJECT }}
          GOOGLE_CLOUD_LOCATION: us-east5
```

This blocks the PR if any rubric drops below threshold. Same agent under `pytest`:

```python
# backend/tests/evals/test_ransomware_containment.py
import pytest
from google.adk.evaluation.agent_evaluator import AgentEvaluator

@pytest.mark.asyncio
async def test_ransomware_containment_eval():
    await AgentEvaluator.evaluate(
        agent_module="adk.root",
        eval_dataset_file_path_or_dir="tests/evalsets/ransomware_containment_v1.evalset.json",
        config_file_path="tests/evalsets/test_config.json",
        num_runs=3,
    )
```

`AgentEvaluator.evaluate()` raises on failure → pytest fails → CI fails → PR blocked ([source](https://github.com/google/adk-python/issues/1036)).

### 6.5 Auto-refinement loop — **ADK does NOT ship this**

This is a critical finding. ADK 1.33 provides eval **primitives** (run, score, aggregate, threshold) but **no built-in prompt-refinement orchestrator**. The original migration spec §7.3 ("auto-refinement loop running, committing prompt deltas") is *our code*, not ADK's.

Two paths:

1. **Roll our own meta-loop.** Use a `LoopAgent` with a `PromptOptimizerAgent` sub-agent that reads eval results, proposes 3 prompt variants, runs each via `AgentEvaluator`, keeps the winner. This is the AutoPDL / RLHF pattern ([survey](https://arxiv.org/abs/2502.11560)). It's also exactly what makes a Track 2 entry compelling.
2. **Use Evidently AI's open-source automated prompt optimization** ([source](https://www.evidentlyai.com/blog/automated-prompt-optimization)) as a library. Provides feedback-driven refinement (collect mistakes → LLM-rewrites prompt → re-evaluate). Less ADK-native but more battle-tested.

**Our recommendation:** roll our own, lean on ADK's `LoopAgent` + `AgentEvaluator` primitives. It's ~150 LOC and the story is "DirePhish wrote a self-improving evaluation loop on top of ADK's primitives" — which is *exactly* what Track 2 ("Optimize Existing Agents") rewards.

**DirePhish takeaway:** The eval framework is the heart of our submission. Build it third (after agents and worlds), but treat it as the demo's payoff. Specifically: ship the `.evalset.json` for ransomware containment (~20–30 cases), the `test_config.json` with our 4 rubrics, the GitHub Actions workflow that blocks PRs on regression, the `LoopAgent`-based auto-refinement orchestrator, and a CLI (`direphish eval --refine`) that emits an HTML report with before/after containment time. The demo shows the loop running live.

---

## 7. Deployment surfaces

### 7.1 Vertex AI Agent Engine

The `agent_engines.create()` flow ([source](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/deploy-an-agent)):

```python
import vertexai
from vertexai import agent_engines
from vertexai.agent_engines import AdkApp
from adk.root import root_agent  # our top-level BaseAgent

vertexai.init(
    project="direphish-google-challenge",
    location="us-east5",  # Claude-on-Vertex region
    staging_bucket="gs://direphish-agent-engine-staging",
)

app = AdkApp(agent=root_agent, enable_tracing=True)

remote_agent = agent_engines.create(
    agent=app,
    config={
        "requirements": [
            "google-adk>=1.32.0",
            "anthropic[vertex]>=0.98.0",
            "crucible-sim @ git+https://github.com/raxITlabs/crucible.git@<sha>",
            "fastmcp>=3.0.0",
            "pydantic>=2.0.0",
        ],
        "extra_packages": ["./adk", "./app/services"],  # vendored DirePhish code
        "display_name": "direphish-orchestrator",
        "description": "DirePhish ADK orchestrator for IR simulation.",
        "env_vars": {
            "GOOGLE_GENAI_USE_VERTEXAI": "TRUE",
            # GOOGLE_CLOUD_PROJECT and LOCATION are injected by the runtime.
        },
        "service_account": "direphish-orchestrator@direphish-google-challenge.iam.gserviceaccount.com",
        "min_instances": 0,
        "max_instances": 3,
        "container_concurrency": 4,
    },
)
print(remote_agent.resource_name)
```

**Pricing** ([source](https://www.finout.io/blog/top-16-vertex-services-in-2026)):
- vCPU: $0.0864/hour
- Memory: $0.0090/GB-hour
- Sessions / Memory Bank events: $0.25/1000
- Free tier: 50 vCPU-hours + 100 GB-hours per month (covers our full demo)

**Regions:** Agent Engine ≠ Claude regions. Engine is broadly available; we'd choose `us-east5` to co-locate with Claude MaaS (lowest cross-region latency to the adversary calls).

**Package size limits:** Not explicitly published, but `extra_packages` is uploaded to a GCS staging bucket then pulled in at container build. Our `backend/adk/` + `backend/app/` ought to fit comfortably under any reasonable limit. The `crucible-sim` git dep is fetched at install time; size depends on the SHA but ought to be fine.

**Python versions:** Agent Engine supports Python 3.10, 3.11, 3.12. Our `pyproject.toml` says `requires-python = ">=3.11"` — compatible.

**Async / threading:** Agent Engine runs FastAPI under the hood. Async is first-class. Threading is fine within reason (Python GIL applies). Don't spawn subprocesses inside the runtime — Agent Engine prefers HTTP-resident services. If we keep MCP servers as stdio subprocesses, they need to live in the same container (which works for a single-instance deploy).

**The streaming bug (critical):** Agent Engine has a documented SSE double-encoding bug in 2026 ([CopilotKit Issue 2871](https://github.com/CopilotKit/CopilotKit/issues/2871)). When `async_stream_query` yields SSE-formatted strings, they get JSON-encoded inside the SSE transport, producing "SSE inside JSON inside SSE." Real-time UIs break unless you proxy through Cloud Run.

This is the main reason most 2026 ADK production examples ([Mazlum Tosun's BigQuery agent](https://medium.com/google-cloud/end-to-end-ai-agent-on-gcp-adk-bigquery-mcp-agent-engine-and-cloud-run-4843fec27c13), [the streaming forum thread](https://discuss.google.dev/t/adk-agents-cloud-run-deployment-session-on-vertexai-agent-engine-issue/331376)) end up on Cloud Run instead of Agent Engine.

### 7.2 Cloud Run for A2A / MCP services

The 2026 pattern is:
- **FastAPI / Starlette** as the web layer (Agent Engine uses FastAPI; we match).
- **`adk api_server`** as a one-line option for development.
- **Long-lived SSE connections work** on Cloud Run (no Agent Engine encoding bug).
- **Cold starts** are sub-second for warm-pooled instances; 2–5s cold.
- **Session state externalized to Redis (Memorystore)** if we scale past one instance — otherwise instances see different state and SSE breaks.

```python
# Dockerfile.orchestrator
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen
COPY adk ./adk
COPY app ./app
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE
ENV PORT=8080
CMD ["uv", "run", "adk", "api_server", "adk.root", "--port=8080", "--host=0.0.0.0"]
```

Deploy: `gcloud run deploy direphish-orchestrator --source . --region us-east5`.

### 7.3 Local dev: `adk web`, `adk run`, `adk eval`

```bash
adk web adk.root                  # local browser playground with chat + traces
adk run adk.root                  # one-off query in terminal
adk api_server adk.root           # FastAPI server (same as Cloud Run runs)
adk eval adk.root tests/evalsets/ransomware.evalset.json --config_file_path tests/evalsets/test_config.json
adk deploy agent_engine adk.root --project=$P --trace_to_cloud   # one-shot Agent Engine
```

`adk web` is the killer dev UX. It gives you a chat UI, traces in a sidebar, eval running in-browser, and is where most of our W1–W3 dev happens.

### 7.4 Authentication

- **Local dev:** `gcloud auth application-default login` → ADC.
- **CI:** Workload Identity Federation (no long-lived keys).
- **Cloud Run:** runtime service account with `roles/aiplatform.user` + `roles/secretmanager.secretAccessor`.
- **Agent Engine:** `service_account` kwarg on `agent_engines.create()`. The runtime mints ADC for the agent.
- **A2A inter-service:** OIDC ID tokens with `target_audience` matching the callee's Cloud Run URL.

**Never `GOOGLE_APPLICATION_CREDENTIALS` in production.** ADK explicitly warns against setting it as an env var on Agent Engine ([source](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/deploy-an-agent)).

### 7.5 Architectural constraints

| Constraint | Agent Engine | Cloud Run |
|---|---|---|
| Long-lived SSE | **Broken** (double-encoding) | Works |
| Cold start | 2–5s | 2–5s |
| Async | Native | Native |
| Subprocesses (stdio MCP) | Same container only | Same container only |
| Session externalization | Built-in (Sessions API) | DIY (Redis/Memorystore) |
| Memory Bank | Built-in | DIY |
| Scaling | Auto (max_instances) | Auto |
| Pricing model | vCPU-hr + GB-hr + sessions | Request-second + memory |
| Free tier | 50 vCPU-hr + 100 GB-hr | 2M req + 360K GB-s |

**DirePhish takeaway:** Deploy the **orchestrator + worlds + judge on Cloud Run as one container** (or two: orchestrator+worlds in one, judge in another). Skip Agent Engine for v1. The streaming bug is a deal-breaker for our live war-room demo. Plan ahead for an "if we had a week more, we'd put the orchestrator on Agent Engine and the demo would use Sessions API" sentence — but Cloud Run ships.

---

## 8. Observability

### 8.1 OpenTelemetry: built-in, opt-in

ADK ≥ 1.17 ships built-in OTel instrumentation. **It is opt-in.** You activate it three ways ([source](https://adk.dev/integrations/cloud-trace/)):

1. **CLI:** `adk deploy agent_engine --trace_to_cloud ...` or `adk web --otel_to_cloud`.
2. **AdkApp:** `AdkApp(agent=root, enable_tracing=True)`.
3. **Programmatic:**

```python
from google.adk import telemetry
from google.adk.telemetry import google_cloud
hooks = google_cloud.get_gcp_exporters(enable_cloud_tracing=True)
telemetry.maybe_set_otel_providers(otel_hooks_to_setup=[hooks])
```

**Auto-traced spans:** `invoke_agent`, `generate_content`, `call_llm`, `execute_tool`. Each has the prompt, the response, latency, and model.

**Privacy controls:**

```bash
# .env or opentelemetry.env
OTEL_SERVICE_NAME='direphish-orchestrator'
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT='EVENT_ONLY'
ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS='false'   # avoid PII in span attrs
OTEL_SEMCONV_STABILITY_OPT_IN='gen_ai_latest_experimental'
```

Cloud Logging via `opentelemetry-exporter-gcp-logging`; Cloud Monitoring via `opentelemetry-exporter-gcp-monitoring`. Already pinned in our `pyproject.toml` (we have OTel HTTP exporter, not gRPC — fine).

### 8.2 Cost tracking — DIY in `after_model_callback`

This is the gap. **ADK does not surface cost.** It does surface token counts (via `LlmResponse.usage_metadata`). We compute cost ourselves:

```python
# adk/callbacks/cost.py
PRICING = {  # USD per 1M tokens (input, output)
    "gemini-2.5-pro":   (1.25, 5.00),
    "gemini-2.5-flash": (0.075, 0.30),
    "claude-sonnet-4-5": (3.00, 15.00),
}

async def track_cost(callback_context, llm_response):
    usage = getattr(llm_response, "usage_metadata", None)
    if not usage:
        return None
    model = callback_context.agent.model
    in_t, out_t = PRICING.get(model, (0.0, 0.0))
    cost = (usage.prompt_token_count * in_t + usage.candidates_token_count * out_t) / 1_000_000
    state = callback_context.state
    state["total_cost_usd"] = state.get("total_cost_usd", 0.0) + cost
    state.setdefault("cost_by_persona", {})
    state["cost_by_persona"][callback_context.agent.name] = (
        state["cost_by_persona"].get(callback_context.agent.name, 0.0) + cost
    )
    return None
```

Wired onto every `LlmAgent`:

```python
adversary = LlmAgent(
    ...,
    after_model_callback=track_cost,
)
```

Per-round cost surfaces to the SSE bus via the judge phase. Per-persona cost goes into the eval HTML report. Total cost into the final demo metric.

### 8.3 Cloud Trace integration

With `--trace_to_cloud` or `enable_tracing=True`, every `call_llm` span shows up in Cloud Trace with the full prompt and response (toggle-able). For the demo: a screenshot of Cloud Trace showing a defender turn → SIEM tool call → Slack post → judge score, all spans nested, is one of the most photogenic "this is real production agent infrastructure" beats available.

### 8.4 Surfacing per-round token cost to the dashboard

Two paths:

1. **Cheap:** `state["cost_by_persona"]` lives in session state. Read it in `after_agent_callback` at the round level, publish to the SSE bus, render in war-room.
2. **Right:** Emit a custom OpenTelemetry metric (`gen_ai.client.token.usage` with `model` + `persona` attrs) and let Cloud Monitoring dashboard it. Slower to wire, but the screenshot is "production grade."

For the demo, do (1). Mention (2) as the "what we'd do at scale" sentence.

**DirePhish takeaway:** Wire `track_cost` as a global `after_model_callback` on every `LlmAgent` in W2. Add `enable_tracing=True` to the `AdkApp`. Publish per-round cost to SSE. The demo line writes itself: "$X.YY spent, here's the per-persona breakdown."

---

## 9. Patterns DirePhish should adopt

This is the prescriptive section. For each open question in the original spec, here's the recommendation with the alternative we rejected and why.

### 9.1 6 personas — one `LlmAgent` each, wrapped in a `ParallelAgent`

**Recommendation:**

```python
defenders = ParallelAgent(
    name="DefenderTeam",
    sub_agents=[ciso, ir_lead, soc_analyst, legal, ceo],
)
adversary  # standalone LlmAgent
judge      # standalone LlmAgent
```

Each persona is a thin factory function returning a configured `LlmAgent` (model, instruction, tools, callbacks, output_key). Persona registry maps slug → factory.

**Rejected:** A coordinator `LlmAgent` that uses `transfer_to_agent` to route between defenders. Reason: defenders all act every round; no routing needed. Coordinator would be a wasted LLM call.

**Rejected:** Defenders as `AgentTool`-wrapped sub-agents under a parent LLM. Reason: implies the parent LLM decides *which* defender acts; we want all of them to act.

### 9.2 3 worlds — FastMCP stdio servers

**Recommendation:** Slack, Email, SIEM each as a separate FastMCP server, stdio in W2, swap to Streamable HTTP only if we hit perf issues. Each server wraps `crucible.env.CrucibleEnv.apply_action` / `snapshot_world`.

**Rejected:** Worlds as plain `FunctionTool`s on each persona. Reason: lower demo signal. "Our worlds are MCP servers" is one of the named challenge differentiators ([Addy Osmani video](https://youtu.be/2t-IWJTUHu0)); the codelab pattern ([InstaVibe](https://codelabs.developers.google.com/instavibe-adk-multi-agents/instructions)) reinforces this is the showcase shape. Also: MCP gives us per-persona `tool_filter` for permissions, which `FunctionTool` doesn't have natively.

**Rejected:** Worlds as remote HTTP services from day 1. Reason: adds Cloud Run deploy complexity for no W1 benefit. Stdio works, ship it, swap transport later.

### 9.3 Pressure engine — custom `BaseAgent`

**Recommendation:** Custom `BaseAgent` subclass wrapping `crucible.pressure.PressureEngine`. The `tick_events` call goes inside `_run_async_impl`, writes events to `session.state["pressure_events"]`, yields a no-content `Event`. Same shape sketched in §2.5.

**Rejected:** Pressure engine as a tool the IR Lead calls. Reason: pressure is not the IR Lead's choice; it ticks deterministically every round. Modeling it as a tool gives the LLM the option to *not* tick it, which is wrong.

**Rejected:** Pressure engine as a non-ADK background task. Reason: invisible to ADK tracing/eval/state. Lose the framework benefits.

This is **the biggest change from the current W1 code**, which uses a plain class (`backend/adk/agents/pressure_engine.py`) instead of a `BaseAgent`. The public `tick(round_num)` API stays, but the class needs to grow `_run_async_impl` and become a `BaseAgent` subclass for W2.

### 9.4 Containment Judge — `AgentTool` under root, NOT A2A in v1

**Recommendation:** Wrap the judge `LlmAgent` in `AgentTool`, call it from the round-driver sequential agent after defenders. The judge sees the round transcript via session state, returns scores, writes to `state["judge_score"]`. Eval harness consumes the same scores.

**Rejected:** Judge as A2A service on its own Cloud Run. Reason: in v1, the judge is the easiest extraction-to-A2A but adds inter-service auth complexity. Save A2A for v2 if we ship in W3.

**Soft accept (W4 stretch):** Promote the judge to A2A as a "production hardening" beat in the demo. Move the AgentCard into `/.well-known/agent.json` on a Cloud Run service. This is the cheapest A2A demo because the judge is stateless.

### 9.5 SSE event bus — keep Flask SSE for now

**Recommendation:** Keep the existing Flask `/api/adk/sse/<simulation_id>` endpoint + the in-process `SSEBus` from `backend/adk/sse.py`. Publish from `after_agent_callback` at each phase boundary (pressure, adversary, defenders, judge).

**Rejected:** Use ADK streaming (`Runner.run_async` + LiveRequestQueue / RunConfig). Reason: ADK streaming is Gemini Live API-flavored (bidi audio + tools). Overkill for a one-way SSE feed to a web UI.

**Rejected:** A2A SSE streaming for the war-room. Reason: would require all our agents to be A2A services, which we already rejected for v1.

This means the **SSE feed lives at the application layer**, not the ADK layer. ADK runs the simulation; Flask streams a serialized view to the browser. Clean separation, matches our existing Next.js consumer.

### 9.6 Hot-swappable threat libraries — instruction templates + `before_model_callback`

ADK doesn't have a "playbook" primitive. The pattern is:

1. Persona `LlmAgent.instruction` is a Jinja2-rendered template with placeholders for `{playbook}`.
2. The playbook is loaded from Firestore / YAML at simulation start, stored in `session.state["adversary_playbook"]`.
3. `before_model_callback` on the adversary injects the playbook into the prompt:

```python
async def inject_playbook(callback_context, llm_request):
    playbook = callback_context.state.get("adversary_playbook", "")
    if playbook and llm_request.config:
        sys = llm_request.config.system_instruction or ""
        llm_request.config.system_instruction = f"{sys}\n\n## Active playbook\n{playbook}"
    return None
```

Hot-swapping is "change a Firestore doc, re-start simulation." No agent code change. Demo-able: show two sims with different playbooks producing measurably different containment scores.

### 9.7 Cross-model split — one `LLMRegistry.register(Claude)` + per-agent `model=`

Already covered in §5.4. The pattern is one line of bootstrap, then `model=` per agent. No abstraction layer.

**DirePhish takeaway:** The biggest non-obvious recommendation here is **§9.4 — keep the judge as `AgentTool`, not A2A, for v1.** This is a step back from the original spec's "3 A2A services." Combined with §9.5 (no A2A SSE) and §9.2 (MCP for worlds), our shape is: *one ADK Runner, three MCP processes, monolithic deploy.* The demo can still say "A2A-ready, MCP-native, multi-model" — and it'll ship.

---

## 10. What probably wins this challenge

Cross-referencing the [Addy Osmani video transcript](https://youtu.be/2t-IWJTUHu0), the [Google for Startups blog](https://cloud.google.com/blog/topics/startups/startups-are-building-the-agentic-future-with-google-cloud), the [Agent Bake-Off lessons](https://developers.googleblog.com/build-better-ai-agents-5-developer-tips-from-the-agent-bake-off/), and the [ADK Hackathon rubric](https://googlecloudmultiagents.devpost.com/rules), the signals judges actually care about cluster cleanly.

### 10.1 Verified judging rubric (Google for Startups AI Agent Challenge 2026)

- **Technical Implementation: 30%** — code quality, multi-agent collaboration, ADK depth.
- **Business Case: 30%** — does this solve a real problem with measurable value?
- **Innovation & Creativity: 20%** — novelty, originality.
- **Demo & Presentation: 20%** — show, don't tell; 2–3 minutes; live demonstration.

For Track 2 ("Optimize Existing Agents") specifically, Addy's framing is: *"use our optimization tools to stress-test multi-step reasoning to achieve production-grade reliability."* The key Track 2 signals are eval, observability, cost tracking, safety, refinement.

### 10.2 Table stakes (you lose without these)

1. **ADK is the architecture, not a wrapper.** Judges will read commits. If `LlmAgent` first appears in a file called `adk_adapter.py` that wraps your old loop, you lose.
2. **A working hosted URL** that runs end-to-end in < 60s when they click "run."
3. **A 2–3 minute video** that is a *live demonstration*, not narrated slides. Addy literally says "show, don't tell" twice.
4. **Code repo on GitHub**, public, README that gets a stranger from zero to running locally in < 10 minutes.
5. **At least two of {A2A, MCP, multi-model, eval, observability}** visibly present.

### 10.3 Winning differentiators (the 10x signals)

Ranked by judges-will-remember-this:

1. **A measurable improvement claim.** Track 2 *is* about optimization. "Containment time from 47 min → 31 min after 8 eval-driven prompt refinements" is the kind of sentence that wins Track 2. Without a number, even great architecture is "we built a thing."
2. **A self-improving eval loop.** Not just "we have evals," but "the system uses its evals to improve itself." Addy's "stress-test multi-step reasoning" line points right at this. Very few entries will ship a real refinement loop.
3. **Cross-vendor models on one Vertex platform.** Claude as adversary, Gemini as defender, on **one auth, one billing, one trace stream**. This is the exact selling point Google's platform exists to provide; demoing it back to them is high-percentage.
4. **Custom `BaseAgent` for deterministic logic.** Most entries are "five LlmAgents in a row." Showing a non-LLM agent (our pressure engine) in the same tree signals "this person understands the framework."
5. **MCP servers that are *real systems*, not "hello world."** Slack/Email/SIEM worlds passing realistic data through an MCP boundary is the second strongest "this is production" signal after evals.
6. **Live war-room view.** Real-time SSE feed of agents acting in parallel is intrinsically more compelling than a chat log. The video literally shows other entries' demos — most are chat interfaces. A war-room UI stands out.
7. **Cost transparency.** "$X.YY per simulation, here's the per-persona breakdown." Track 2 judges care about production cost; showing you measure it is implicit "we know how to run this."
8. **Cloud Trace screenshot.** One screen of nested spans (agent → tool → MCP → model) signals "observability-native."
9. **Adversarial eval cases.** "Here's an analyst who gives away creds, and our judge correctly flags it." Differentiates from teams that only have happy-path evals.
10. **A README that doesn't suck.** Surprising how rare this is. Architecture diagram, getting-started, "what's interesting about this," concrete metric. Judges are humans browsing 100 repos.

### 10.4 Things that look impressive but don't move the needle

- Number of personas (10 isn't 2x better than 5; it's just 2x more prompts to tune).
- LangGraph / CrewAI integration (only relevant if your story needs framework heterogeneity; ours doesn't).
- Marketplace listing (Track 3, not Track 2).
- Deploy to all three of Cloud Run + Agent Engine + GKE (one is enough; multiple smells like infra-resume-padding).
- Custom UI framework (Next.js is fine; don't rewrite in Svelte for the demo).

**DirePhish takeaway:** Our spec already targets 6 of the 10 winning differentiators (cross-vendor, BaseAgent, MCP worlds, war-room, cost, adversarial evals). The two we're *underweighting* are **(1) the measurable improvement claim** (we say "we'll have one" but haven't proven we will) and **(2) the eval loop being self-improving** (the spec describes it but the implementation hasn't started). These two are what convert "good entry" to "winner." Prioritize them in W3–W4.

---

## 11. Pitfalls / gotchas / things teams get wrong

Aggregating from [DLabs blog](https://dlabs.ai/blog/google-adk-production-challenges-and-how-to-solve-them/), [Hatchworks best practices](https://hatchworks.com/blog/gen-ai/google-adk-best-practices/), [Bayls Notes TS guide](https://www.balysnotes.com/a-production-ready-guide-to-google-adk-with-typescript), [Mphomphego on AWS Bedrock](https://blog.mphomphego.co.za/blog/2026/03/05/Running-Google-ADK-Agents-on-AWS-Bedrock-via-LiteLLM.html), and a survey of [adk-python issues](https://github.com/google/adk-python/issues).

### 11.1 In-memory services break on restart
Default `SessionService` and `MemoryService` are in-memory. Production *must* use `DatabaseSessionService` (Postgres) or `VertexAiSessionService`. Symptom in a demo: kill the process, lose the simulation, look bad. **For us:** Firestore-backed session for production; in-memory acceptable for the smoke test.

### 11.2 Context window silently fills
At 1M+ tokens you hit `ContextWindowExceededError`. Tool outputs are the usual culprit — a SIEM query returning 10K events blows the context fast. **For us:** truncate tool outputs in `after_tool_callback`, summarize old rounds into a "memory" entry, and use ADK 1.22+'s event compaction (`compaction_interval=10`).

### 11.3 Tool with no parameters crashes
`_function_declaration_to_tool_param` fails on zero-arg tools as of ADK 1.32. **For us:** every MCP tool should take at least one arg (even just `dummy: str = ""`). Verify in W2 smoke.

### 11.4 Eval framework writes to read-only agent dir
On Kubernetes / read-only filesystems, eval result writes fail with `PermissionError`. **For us:** redirect `EVAL_OUTPUT_DIR` to a writable path in CI.

### 11.5 Agent Engine streaming double-encodes SSE
Already covered (§7.1). The workaround for production is "deploy on Cloud Run instead." **For us:** Cloud Run is our plan.

### 11.6 Pickling errors with MCP toolsets on Agent Engine
Passing `AdkApp` containing `McpToolset` directly to `agent_engines.create()` fails because MCP subprocesses can't be pickled ([source](https://medium.com/google-cloud/end-to-end-ai-agent-on-gcp-adk-bigquery-mcp-agent-engine-and-cloud-run-4843fec27c13)). **Workaround:** deploy as `ModuleAgent` (module path) instead of pickled instance.

### 11.7 Multi-user assumes a global root agent
ADK's default assumption is one root agent shared across users. For per-user isolation you build a custom factory per user, but you lose `adk web` debugging. **For us:** v1 is single-tenant (the simulation is one IR exercise). Punt to v2.

### 11.8 LiteLlm adds a hop in production
LiteLlm is a proxy. In prod it adds latency and another deploy. Don't reach for it unless you genuinely need provider abstraction beyond what Vertex Model Garden offers. **For us:** we don't need it.

### 11.9 Spans are empty in Langfuse / non-Cloud-Trace consumers
`openinference-instrumentation-google-adk` doesn't populate attributes that some non-Google OTel consumers expect. **For us:** target Cloud Trace specifically (we get the full set there); SigNoz/Langfuse later.

### 11.10 Pinning to a moving ref breaks reproducibility
Our `crucible-sim @ git+...@feature/adk-hooks` is mutable. SHA freeze planned for 2026-05-26. **For us:** scheduled — see crucible plan §10.2.

### 11.11 Skipping eval until "after the architecture is done"
The framework rewards eval-first. Teams that write evals last have prompts they're emotionally attached to and won't change. **For us:** start `.evalset.json` in W2 (in parallel with personas), not W3. Use the W1 smoke output as the seed.

### 11.12 Pydantic field shadowing on `BaseAgent` subclasses
ADK's `BaseAgent` is a Pydantic model. Sub-classes that declare fields must also set `model_config = {"arbitrary_types_allowed": True}` if any field type isn't a Pydantic primitive. Easy to miss; explodes at runtime. **For us:** mentioned in the §2.5 example; will bite our W2 pressure engine refactor if we forget.

**DirePhish takeaway:** Two of these directly apply to our W1 code: §11.6 (MCP + Agent Engine pickling — informs the Cloud Run decision) and §11.12 (Pydantic config on BaseAgent — needed for W2 pressure engine rewrite). The rest are good to know but already mitigated by our architecture choices.

---

## 12. Recommendations for DirePhish

### 12.1 Hard recommendations (pick one of each)

| Question | Pick | Rationale |
|---|---|---|
| **A2A for Defender/Adversary/Judge or sub-agents in one Runner?** | **Sub-agents under one Runner** for v1. Publish AgentCards anyway. Promote Judge to A2A in W4 if there's time. | A2A is overkill for our scope (we don't have framework heterogeneity, security boundary is enforceable in-process). AgentCards published as documentation. Demo can honestly say "A2A-ready, with the judge already extracted." |
| **Worlds as MCP servers or ADK tools?** | **MCP servers (FastMCP, stdio in dev, Streamable HTTP in prod).** | Higher demo signal, idiomatic ADK pattern, per-persona `tool_filter` permissions, matches the InstaVibe codelab template that judges are familiar with. |
| **Deploy to Agent Engine or Cloud Run?** | **Cloud Run.** | Agent Engine has documented SSE streaming bugs (§7.1). Our war-room demo *requires* live SSE. Cloud Run is what every 2026 production ADK example actually uses. Agent Engine is a "we'd use this in prod" sentence in the demo, not the actual deploy. |
| **Minimum credible eval setup for Track 2?** | One `.evalset.json` (~25 cases covering all 4 personas × ~6 round states), one `test_config.json` with our 4 rubrics, one GitHub Actions workflow blocking PRs, one `LoopAgent`-based refinement loop with measurable before/after. **The number is the deliverable.** | Track 2 *is* about optimization. Without a refinement loop and a measurable claim, we're a Track 1 entry that happens to have evals. |

### 12.2 Eval setup — concrete spec

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
├── refine_prompts.py         # LoopAgent-based meta-loop
└── eval_report.py            # HTML report with before/after
```

Coverage targets for the evalset:
- **6 personas × 3 round phases (early/mid/late)** = 18 base cases.
- **4 adversarial scenarios** (bad analyst, panicking CEO, lawyer who over-discloses, IR lead who freezes) = 4 cases.
- **3 happy-path golden runs** = 3 cases.

Total ~25 cases. ~3 days to write + curate from existing Crucible runs. Then ~2 days to wire `LoopAgent` refinement. This is W2–W3 work, not W4.

### 12.3 What in the original spec should change

Compared to [`2026-05-05-adk-migration-research.md`](./2026-05-05-adk-migration-research.md), these items should be updated:

| Original §  | Original claim | Change to |
|---|---|---|
| §3.1 (topology) | "DefenderTeam A2A :8001 / AdversaryTeam A2A :8002 / ContainmentJudge A2A :8003" | "DefenderTeam `ParallelAgent` + Adversary `LlmAgent` + Judge `AgentTool`, all sub-agents under one root `BaseAgent`. AgentCards published for documentation; Judge optionally promoted to A2A in W4." |
| §3.1 (topology) | "MCP Servers: slack_world stdio / email_world stdio / siem_world stdio / memory stdio" | "Slack/Email/SIEM as FastMCP servers (stdio in dev, Streamable HTTP in prod). Memory: not MCP in v1 — direct Firestore from a memory tool. Reduces MCP server count from 4 to 3." |
| §3.2 (model strings) | `"gemini-3-pro-preview"`, `"claude-sonnet-4-6"` | These don't exist in Vertex Model Garden as of 2026-05-11. Current pins: `gemini-2.5-pro`, `gemini-2.5-flash`, `claude-sonnet-4-5`. Already corrected in `backend/adk/models.py` — propagate to docs. |
| §3.4 ("not Option 2") | "qualifies but doesn't win" | Still correct. Strengthen: judges *will* read commits and detect a wrapped-old-loop pattern. Our W1 orchestrator is *currently* a wrapped old loop; W2 fixes this. |
| §4.4 (pressure engine) | "custom `BaseAgent`" | Correct, but the **W1 code is not yet a `BaseAgent`** — it's a plain class. W2 must promote it. Already a noted action item; flag it as a priority slice. |
| §5 (round lifecycle) | "Root → DefenderTeam (A2A call, ParallelAgent over 5 personas)" | "Round = `SequentialAgent([PressureEngine, Adversary, DefenderTeam, Judge])`. All in-process. No A2A calls in the hot loop." |
| §6.1 (callbacks) | Same callbacks described correctly | No change — still right. |
| §6.3 (failure modes) | "A2A service unreachable" handling | Drop — we don't have A2A services in v1. Replace with "agent retry logic" via `Runner.run_async` semantics. |
| §7.3 (refinement loop) | Described as if ADK provides it | **ADK provides primitives, not the loop.** We build the loop on top of `LoopAgent` + `AgentEvaluator`. Add ~150 LOC budget. |
| §9 Week 1 status | "Single-persona round runs end-to-end" | Partly done — smoke endpoint runs with **fakes**, not real `LlmAgent`s. Real `LlmAgent` cutover is the first W2 slice. |
| §9 Week 2 plan | "Adversary as A2A service on its own port" | Change to "Adversary as `LlmAgent` with `model='claude-sonnet-4-5'` inside the same Runner." A2A deferred. |
| §9 Week 5 | "Hosted URL live" — assumes Agent Engine | "Hosted URL on Cloud Run. Agent Engine considered but rejected for v1 due to SSE streaming bug." |
| §11 risks: "Claude-on-Vertex regional quota" | Still real | Add: dual-region failover code (us-east5 primary, europe-west1 fallback) is a 10-line addition; do it. |
| §11 risks: NEW | — | Add: "Pydantic field declarations on `BaseAgent` subclasses (§11.12 of new research). Easy footgun on W2 pressure engine refactor." |
| §12 decision log | "3 A2A services" | Update to "1 Runner with sub-agents; AgentCards published; A2A-extraction-ready." |

### 12.4 What to start tomorrow (W2 day 1)

1. **Refactor `backend/adk/agents/pressure_engine.py`** to a `BaseAgent` subclass with `_run_async_impl`. Keep `tick(round_num)` as a public sync method for backward compat. Add `arbitrary_types_allowed`.
2. **Refactor `backend/adk/orchestrator.py`** from a hand-rolled async class to a `BaseAgent` that constructs and runs a `SequentialAgent(PressureEngine, Adversary, DefenderTeam, Judge)` internally. Round-driving becomes "construct → `runner.run_async`."
3. **Promote `IRLeadPersona`** from a strategy callable to a factory returning a real `LlmAgent` with `model="gemini-2.5-pro"`, a real instruction, and a Slack MCP toolset.
4. **Write `backend/mcp_servers/slack_world.py`** as FastMCP server #1, wrapping `crucible.env.CrucibleEnv.apply_action`.
5. **Wire `track_cost`** as an `after_model_callback` on the IR Lead. First round logs token + dollar cost to console; W3 adds the dashboard.

That's W2 day 1–3. Days 4–5 are remaining defender personas + Email/SIEM MCP servers + Adversary (Claude). Pressure engine is *the* hard-pin; everything else parallelizes.

### 12.5 If we slip — revised cut order

| Cut | What goes | Cost |
|---|---|---|
| 1 | Auto-refinement loop becomes manual (one round of prompt tuning, not a self-running loop) | Bumps us from "winning Track 2" to "credible Track 2" |
| 2 | Adversarial evalset cases | Lose ~10 of the 25 cases. Still credible. |
| 3 | Judge as A2A in W4 | Stay sub-agent-only. Demo still says "A2A-ready, here's the AgentCard." |
| 4 | Multi-region Claude failover | Single-region us-east5 only. Risk of demo-time quota hit. |
| 5 | Drop CEO + Legal personas | Last resort; weakens "real org" story. |

Note this cut order has shifted from the original — **multi-model stays** (it's our differentiator), the refinement loop becomes the first thing that degrades because manual tuning is *acceptable* if the eval framework itself is robust.

---

## 13. References

Primary documentation:
- [ADK Python repo](https://github.com/google/adk-python) — 1.33.0, May 2026.
- [ADK docs](https://adk.dev/) — official docs, redirects from google.github.io/adk-docs.
- [ADK API reference](https://adk.dev/api-reference/python/)
- [Multi-agents in ADK](https://adk.dev/agents/multi-agents/)
- [Custom agents](https://adk.dev/agents/custom-agents/)
- [Loop agents](https://adk.dev/agents/workflow-agents/loop-agents/)
- [Callbacks reference](https://adk.dev/callbacks/types-of-callbacks/)
- [Quick guide to ADK callbacks](https://atamel.dev/posts/2025/11-03_quick_guide_adk_callbacks/) — Mete Atamel, very useful.
- [MCP tools in ADK](https://google.github.io/adk-docs/tools-custom/mcp-tools/)
- [Anthropic/Claude in ADK](https://adk.dev/agents/models/anthropic/)
- [Evaluation overview](https://adk.dev/evaluate/) / [criteria](https://adk.dev/evaluate/criteria/)
- [Cloud Trace integration](https://adk.dev/integrations/cloud-trace/)

Google Cloud:
- [Vertex AI Agent Builder overview](https://docs.cloud.google.com/agent-builder/overview)
- [Agent Engine overview](https://docs.cloud.google.com/agent-builder/agent-engine/overview)
- [Deploy an agent](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/runtime/deploy-an-agent)
- [Model Garden](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models)
- [Claude on Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude)
- [ADK OpenTelemetry instrumentation](https://docs.cloud.google.com/stackdriver/docs/instrumentation/ai-agent-adk)
- [Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing) / [Top 16 Vertex services 2026 pricing breakdown](https://www.finout.io/blog/top-16-vertex-services-in-2026)

A2A:
- [A2A protocol homepage](https://a2a-protocol.org/latest/)
- [A2A specification](https://a2a-protocol.org/latest/specification/)
- [a2a-samples repo](https://github.com/a2aproject/a2a-samples)
- [A2A deep-dive on streaming](https://medium.com/google-cloud/a2a-deep-dive-getting-real-time-updates-from-ai-agents-a28d60317332)

MCP:
- [MCP spec](https://modelcontextprotocol.io/)
- [FastMCP](https://github.com/jlowin/fastmcp) — 3.0, Jan 2026.

Challenge & winning patterns:
- [Google for Startups AI Agent Challenge announcement](https://cloud.google.com/blog/topics/startups/startups-are-building-the-agentic-future-with-google-cloud)
- [Addy Osmani walkthrough video](https://youtu.be/2t-IWJTUHu0) — official challenge brief.
- [Agent Bake-Off lessons](https://developers.googleblog.com/build-better-ai-agents-5-developer-tips-from-the-agent-bake-off/)
- [ADK Hackathon rubric (similar event)](https://googlecloudmultiagents.devpost.com/rules)

Production lessons:
- [7 ADK best practices](https://hatchworks.com/blog/gen-ai/google-adk-best-practices/) — Hatchworks.
- [4 ADK production challenges](https://dlabs.ai/blog/google-adk-production-challenges-and-how-to-solve-them/) — DLabs.
- [Production-ready ADK in TypeScript](https://www.balysnotes.com/a-production-ready-guide-to-google-adk-with-typescript) — Bayls Notes.
- [End-to-end ADK + BigQuery + MCP + Agent Engine + Cloud Run](https://medium.com/google-cloud/end-to-end-ai-agent-on-gcp-adk-bigquery-mcp-agent-engine-and-cloud-run-4843fec27c13) — Mazlum Tosun.
- [Agent Engine streaming forum thread](https://discuss.google.dev/t/adk-agents-cloud-run-deployment-session-on-vertexai-agent-engine-issue/331376)
- [CopilotKit SSE double-encoding issue](https://github.com/CopilotKit/CopilotKit/issues/2871)

Codelabs (representative architectures):
- [InstaVibe ADK multi-agent codelab](https://codelabs.developers.google.com/instavibe-adk-multi-agents/instructions) — the canonical ADK + A2A + MCP example.
- [A2A purchasing concierge codelab](https://codelabs.developers.google.com/intro-a2a-purchasing-concierge)
- [ADK evaluation codelab](https://codelabs.developers.google.com/adk-eval/instructions)
- [Scale agents with CrewAI/LangGraph/A2A/ADK](https://codelabs.developers.google.com/next26/scale-agents)
