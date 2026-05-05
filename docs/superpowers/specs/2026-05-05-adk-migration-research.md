# ADK Migration Research — Google AI Agent Challenge

**Author:** Adesh Gairola
**Date:** 2026-05-05
**Branch:** `feature/google-challenge`
**Submission deadline:** 2026-06-05
**Status:** Research / design — not yet locked. Implementation plan to follow.

---

## 0. Why this document exists

DirePhish needs to ship a Google Agent Development Kit (ADK) version of itself by **June 5, 2026** to compete in the Google for Startups AI Agent Challenge. We are already qualified ($500 credits in hand). The remaining prize pool is $90K + Google ecosystem positioning. The goal is **win**, not qualify.

This is a research document. It captures:
- What the challenge actually wants (vs. what looks shiny)
- What ADK gives us that our current stack doesn't
- The architecture we're proposing (full ADK-native rewrite of the simulation core)
- The agent inventory, round lifecycle, reliability story, eval story
- The 5-week staged delivery plan
- The winning differentiators (the things judges remember)
- Open questions and risks

It is meant to be readable from any machine. Adesh will work on this from multiple locations.

---

## 1. Challenge brief — read literally

From the Google for Startups AI Agent Challenge announcement and Addy Osmani's official walkthrough video (https://youtu.be/2t-IWJTUHu0):

**Hard requirements**
- Must use Google ADK (Python or Java). LangGraph / CrewAI / proprietary frameworks alone do not qualify.
- Submission needs: hosted URL (working agent), code repo (GitHub), demo video (2–3 minutes, "show don't tell").
- Must demonstrate agent capabilities — not just LLM calls in a loop.

**Three tracks**
1. **Build New Agents** — net-new agentic apps.
2. **Optimize Existing Agents** ← *DirePhish track.* Tools that make agents better: evals, observability, cost, safety, tuning.
3. **Marketplace** — list on the Google Agent Marketplace.

**Things judges visibly care about (from the video)**
- A2A (agent-to-agent) communication — not just orchestration in one process.
- MCP (Model Context Protocol) — agents using external tool servers.
- Eval-driven development — show the loop, not just one pretty run.
- Multi-model — Claude is on the platform; using more than just Gemini is implicitly rewarded.
- Production-readiness — Vertex AI Agent Engine deployment, observability, guardrails.

**Subtext**
- "Show don't tell" means the demo video is load-bearing. A boring architecture diagram loses to a live multi-agent battle on screen.
- Track 2 entries that are just "we added evals to our chatbot" will lose to entries that show *measurable improvement* via a tool/agent system.

---

## 2. Where DirePhish stands today

### Current stack
- **Backend:** Flask, Python 3.12, packaged as `direphish-backend`
- **Simulation engine:** `crucible-sim` (our own pip package, forked from `camel-ai/oasis` in March 2026 — see `2026-03-20-crucible-design.md`)
  - Worlds: Slack, Email, SIEM, PagerDuty, EDR (in-process Python objects)
  - Pressure Engine: countdowns, SLAs, thresholds (YAML-configured)
  - Per-persona ChatAgent (CAMEL `ChatAgent` originally; now wrapped in our own loop)
  - AgentGraph for org structure
  - Jinja2 prompt templates per persona
- **AI calls:** Custom ReACT loop on top of an OpenAI SDK shim. Default model: `gemini-3-flash-lite-preview` (Gemini Flash Lite). Reports use `gemini-3-pro-preview`.
- **Embeddings:** `gemini-embedding-001` (768-dim). Stored in Firestore vectors.
- **Memory:** `graphiti-core` knowledge graph
- **Frontend:** Next.js. War-room and report views already exist.
- **Deploy:** Cloud Run

### What's wrong (for the challenge)
- Custom ReACT loop is invisible to ADK introspection / Vertex AI Agent Engine.
- All personas run in one process — no A2A story to tell.
- Worlds are in-process — no MCP story to tell.
- No eval framework — we run sims and inspect outputs by hand.
- No callbacks / observability hooks that map to ADK's framing.
- Cost tracking is ad-hoc and doesn't surface in the agent system.

### What we keep
- Crucible's *pressure engine, world semantics, scenario library, AgentGraph*. These are the IP.
- Flask API layer (front of house).
- Next.js frontend (war room + report views).
- Firestore + graphiti.
- Existing demo scenarios (especially ransomware).

### What we replace
- CAMEL ChatAgent → ADK `LlmAgent`
- Custom ReACT loop → ADK `Runner` + agent tree
- In-process Worlds → MCP servers (stdio locally, HTTP/SSE if we go cloud)
- "Defender team" / "Adversary team" / "Judge" boundary → A2A services with their own AgentCards
- Direct OpenAI SDK shim + raw Anthropic API → **Vertex AI Model Garden as the single model plane** (Gemini natively, Claude via `anthropic[vertex]`, Llama/Mistral available as v2 swap-ins)
- Hand-rolled cost/observability → ADK callbacks (`before_model_callback`, `after_model_callback`, `before_tool_callback`)
- Hand-graded "did this run go well" → ADK `AgentEvaluator` + `.evalset.json` files

---

## 3. Architecture — full ADK-native rewrite

### 3.1 Topology (local-first)

```
┌──────────────────────────────────────────────────────────────────┐
│                         Next.js frontend                         │
│            (war-room view + report view, unchanged)              │
└──────────────────────────────────────────────────────────────────┘
                               │ SSE
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Flask API (unchanged)                      │
│            POST /sim/start  GET /sim/{id}/events                 │
└──────────────────────────────────────────────────────────────────┘
                               │ subprocess / asyncio
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              ADK Root Orchestrator   (LlmAgent)                  │
│                                                                  │
│  - Owns scenario state, round counter, pressure ticks            │
│  - Custom BaseAgent: PressureEngineAgent (deterministic)         │
│  - Delegates per round to A2A services                           │
└────────────┬──────────────────┬───────────────────┬──────────────┘
             │                  │                   │
             ▼                  ▼                   ▼
   ┌──────────────────┐ ┌────────────────────┐ ┌──────────────────┐
   │ DefenderTeam     │ │ AdversaryTeam      │ │ ContainmentJudge │
   │ A2A :8001        │ │ A2A :8002          │ │ A2A :8003        │
   │ Gemini 3 (Vertex)│ │ Claude (Vertex MG) │ │ Gemini 3 Pro     │
   │                  │ │                    │ │  (Vertex)        │
   │ - CISO           │ │ - ThreatActor      │ │ - rates round    │
   │ - IR Lead        │ │   (sole agent      │ │ - emits eval     │
   │ - SOC Analyst    │ │   for v1)          │ │   signal         │
   │ - Legal          │ │                    │ │                  │
   │ - CEO            │ │                    │ │                  │
   └────────┬─────────┘ └─────────┬──────────┘ └────────┬─────────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                ▼
                  ┌──────────────────────────┐
                  │      MCP Servers         │
                  │  - slack_world  (stdio)  │
                  │  - email_world  (stdio)  │
                  │  - siem_world   (stdio)  │
                  │  - memory       (stdio)  │
                  └──────────────────────────┘
```

### 3.2 Why this shape

**A2A boundaries are not cosmetic.** They map onto a real security property of the simulation:
- Defender team must not be able to read Adversary's chain-of-thought.
- Judge must not be biased by either team's prompts.
- Threat libraries (Adversary's playbooks) need to be hot-swappable without redeploying Defender.

If everything ran in one process, these boundaries would be honor-system. With A2A they're physical.

**MCP for Worlds is a "killer demo" pattern.** The challenge brief explicitly highlights MCP for connecting external tools. Our Worlds *are* external tools (Slack, email, SIEM). Re-implementing them as MCP servers is the natural shape and the most photogenic.

**Cross-model A2A is the differentiator — and every model goes through Vertex AI.** Defender runs on Gemini (better structured/factual recall, native to Google ecosystem). Adversary runs on Claude — but **via Vertex AI Model Garden**, not direct Anthropic API and not LiteLlm. Judge stays on Gemini Pro for evaluative consistency. The point judges care about is "uses the whole Vertex platform": single billing surface, single IAM, single observability plane (Cloud Logging + Cloud Trace), $500 Google credits cover it. This is the kind of detail judges remember.

**Local-first dev with optional cloud at the end.** Three localhost ports (8001/8002/8003) for A2A. stdio MCP. The whole thing runs on a laptop, with Vertex AI as the only outbound dependency for model calls. Cloud deploy (Vertex AI Agent Engine for the orchestrator + Cloud Run for A2A/MCP) is week-5 work, not blocking.

### 3.3 Model plane — Vertex AI Model Garden, multi-vendor

Every model call in the system goes through **Vertex AI**. Google-built models use the native `google-genai` path; partner-built models (Anthropic, and optionally Llama / Mistral / AI21 in v2) use Vertex Model Garden's MaaS endpoints. We deliberately avoid LiteLlm and direct vendor APIs in v1.

**Why one provider plane:**
- Single auth surface (ADC + service account), single project, single billing line.
- $500 Google credits already in hand cover the entire bill, including Claude calls.
- Cloud Logging and Cloud Trace see every model call — including Claude — with no extra wiring. This becomes the observability story for the demo.
- ADK's `before_model_callback` / `after_model_callback` fire uniformly across vendors because every model is an `LlmAgent`-registered class. Cost and latency tracking is one code path.
- Eliminates an entire class of demo-day failure (rate limits on a separate Anthropic account, mismatched retry semantics between SDKs, key rotation drift).

**How it's wired in ADK:**

```python
# backend/adk/models.py — runs once at process start, for every A2A service
from google.adk.models.anthropic_llm import Claude
from google.adk.models.registry import LLMRegistry

LLMRegistry.register(Claude)  # makes "claude-*" strings resolvable on LlmAgent
```

```python
# Defender / Judge personas — Gemini via Vertex (default path)
from google.adk.agents import LlmAgent

ir_lead = LlmAgent(model="gemini-3-pro-preview", name="ir_lead", ...)

# Adversary persona — Claude via Vertex Model Garden
threat_actor = LlmAgent(model="claude-sonnet-4-6", name="threat_actor", ...)
```

Environment (set in every A2A service container):
```
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_PROJECT=direphish-google-challenge
GOOGLE_CLOUD_LOCATION=us-east5      # Claude on Vertex publishers live here
```

Dependency: `pip install "anthropic[vertex]"` in addition to ADK. No `anthropic` API key, no `ANTHROPIC_API_KEY` env var, no LiteLlm.

**Model assignments (v1):**

| Role | Model string | Source | Why |
|---|---|---|---|
| CISO, IR Lead, Judge | `gemini-3-pro-preview` | Vertex (Google native) | Reasoning depth |
| SOC Analyst, Legal, CEO | `gemini-3-flash-lite-preview` | Vertex (Google native) | Volume + cost |
| ThreatActor (Adversary) | `claude-sonnet-4-6` | Vertex Model Garden (Anthropic) | Adversarial reasoning + cross-vendor signal |
| PressureEngine | n/a (deterministic `BaseAgent`) | — | No LLM |

**v2 swap-in candidates (already Vertex-resident, no architecture change):**
- Llama 4 (Meta) for a second adversary persona ("Affiliate") — demonstrates 3-vendor A2A.
- Mistral Mixtral 8x7B for cheap red-team idea generation.
- AI21 Jamba for long-context post-incident analysis.

Because every persona is just a model string passed to `LlmAgent`, swapping a persona's vendor is a one-line change. This is itself a Track 2 talking point: "the eval loop selects not just prompts but the model that best wins each persona."

### 3.4 Why not Option 2 (surgical wrap)

We considered just wrapping the existing custom loop in an ADK `LlmAgent` and calling it a day. Rejected: that qualifies but doesn't win. Judges have seen 100 entries that are "we added ADK around our existing thing." The shape that wins is one where ADK *is* the architecture, not a layer on top.

---

## 4. Agent inventory (v1 scope)

**Personas:** 6
**Worlds:** 3 (Slack, Email, SIEM)
**Scenario:** Ransomware (already exists in Crucible)
**Rounds:** ~15
**A2A services:** 3

### 4.1 Defender team (A2A :8001, Gemini 3 Pro / Flash Lite mix)

| Persona | Model | Tools (MCP) | Role |
|---|---|---|---|
| CISO | Gemini 3 Pro | slack, email, memory | Strategic decisions, comms with CEO/Legal, escalation calls |
| IR Lead | Gemini 3 Pro | slack, siem, memory | Tactical incident command, coordinates SOC, owns containment plan |
| SOC Analyst | Gemini 3 Flash Lite | siem, slack, memory | Triage, evidence collection, IOC pivots |
| Legal | Gemini 3 Flash Lite | email, memory | Disclosure decisions, regulator notifications |
| CEO | Gemini 3 Flash Lite | slack, email, memory | Business pressure, customer-facing comms |

**Why this split on models:** strategic personas (CISO, IR Lead) get Pro for reasoning depth. Reactive personas (Analyst, Legal, CEO) get Flash Lite for speed and cost — they emit volume, not depth.

### 4.2 Adversary team (A2A :8002, Claude via Vertex AI Model Garden)

| Persona | Model | Tools (MCP) | Role |
|---|---|---|---|
| ThreatActor | `claude-sonnet-4-6` (Vertex MG, `us-east5`) | slack (limited), email (send only), siem (read only — simulating recon) | Plays the ransomware crew. Owns kill chain progression. |

Wired via `LLMRegistry.register(Claude)` from `google.adk.models.anthropic_llm` at service startup. No direct Anthropic API key — auth is the same ADC the Gemini personas use.

**v1:** single adversary persona. **v2:** add Affiliate, Negotiator, OPSEC.

### 4.3 Judge (A2A :8003, Gemini 3 Pro)

| Component | Role |
|---|---|
| ContainmentJudge `LlmAgent` | After each round, rates: containment progress, evidence quality, comms quality, business impact. Emits scalar + reasoning. |
| Evaluator harness | Replays rounds against `.evalset.json` for regression checks. |

The Judge is also the **eval signal source** — its scores are what the auto-refinement loop optimizes.

### 4.4 Pressure engine (deterministic, custom `BaseAgent`)

Not an LLM. A custom ADK `BaseAgent` that:
- Ticks countdowns (e.g., "ransom timer: 4h remaining")
- Fires SLA breaches into the world bus (e.g., "PagerDuty SLA breached → page CEO")
- Injects scripted external events (news leak, regulator inquiry)

Lives inside the Root Orchestrator process. Deterministic. Replayable.

### 4.5 Why not more personas in v1

We considered 8–10 personas (full Crucible roster). Rejected: more personas = more prompts to tune = more eval surface = more demo time wasted. v1 ships tight, v2 expands once eval loop is locked in.

---

## 5. Round lifecycle

A "round" is one tick of simulated time. The orchestrator drives:

```
1. PressureEngineAgent ticks
   - decrement countdowns
   - emit SLA breaches / scripted events to world bus
   - emit `pressure_state` to SSE feed

2. Root → AdversaryTeam (A2A call)
   - input: world state, prior actions, pressure state
   - output: adversary actions (e.g., "encrypt 3 more shares", "post on data leak site")
   - actions written to MCP world servers

3. Root → DefenderTeam (A2A call, ParallelAgent over 5 personas)
   - each persona reads its allowed worlds via MCP
   - each persona emits actions (slack post, email, siem query, escalation)
   - actions written to MCP world servers

4. Root → ContainmentJudge (A2A call)
   - input: full round transcript
   - output: scores + critique
   - emitted to SSE feed

5. Root → SSE bus
   - emits `round_complete` event with all of the above
   - frontend war-room renders live

6. Termination check
   - if containment score > threshold → end (success)
   - if round count > max → end (timeout)
   - if pressure event triggers terminal state → end
```

**Why ParallelAgent for Defenders:** all 5 personas operate concurrently in real life. Sequential simulation makes them feel like a single hivemind, which is unrealistic and produces a worse demo.

**Why sequential Adversary → Defender → Judge:** within a round, the adversary moves first (they have initiative in a real ransomware event). Defender reacts. Judge evaluates the exchange.

---

## 6. Reliability — callbacks, guardrails, retries

### 6.1 ADK callbacks we use

| Callback | Purpose | Where |
|---|---|---|
| `before_model_callback` | Inject scenario context, redact PII before sending to model | Every persona |
| `after_model_callback` | Cost tracking, latency metrics, append to SSE feed | Every persona |
| `before_tool_callback` | Permission check (can this persona use this tool?), rate limiting | Every MCP call |
| `after_tool_callback` | World state diff, audit log entry | Every MCP call |

### 6.2 Guardrails

- **Persona-tool permissions** enforced in `before_tool_callback`. SOC Analyst cannot send email. CEO cannot query SIEM. Encoded in a YAML matrix, checked on every tool call.
- **Output schema validation** via Pydantic on every `LlmAgent` output. Malformed outputs are retried (not crashed) up to 2x.
- **Cost cap per round** via `after_model_callback`. If a round exceeds N tokens, orchestrator terminates with `cost_breach` reason.
- **Loop detection** — if the same persona emits the same action 3x in a row, judge is asked to break the tie.

### 6.3 Failure modes

| Failure | Handling |
|---|---|
| MCP server crash | Orchestrator marks world as degraded, emits SSE warning, continues round (judge accounts for it) |
| A2A service unreachable | 3x retry with exponential backoff, then mark team as unresponsive (interesting demo failure mode) |
| Model API rate limit | Vertex AI quota retry (exponential backoff in the Anthropic Vertex SDK / google-genai); fallback to `gemini-3-flash-lite-preview` for adversary if Claude-on-Vertex quota is exhausted in `us-east5` (also retry in `europe-west1` where Claude is dual-published) |
| Eval data unavailable | Sim still runs, just doesn't write eval signal |

---

## 7. Eval framework — the heart of Track 2

This is what makes us a Track 2 entry rather than "we used ADK once." The eval loop is the product.

### 7.1 Eval data sources (hybrid)

1. **Historical Crucible runs.** ~100 prior simulations exist in Firestore. Scrape transcripts, label outcomes (good/bad containment), convert to `.evalset.json`.
2. **Synthetic generation.** For coverage gaps (e.g., scenarios we haven't run yet), use Gemini Pro to generate plausible round transcripts, then human-review.
3. **Adversarial evals.** Specifically constructed bad runs (analyst gives away creds, CEO panics on Slack) to test that Judge correctly flags them.

### 7.2 Eval dimensions

For each persona × each round:
- **Containment progress** (0–10) — did this action move toward containment?
- **Evidence quality** (0–10) — was the response grounded in world state?
- **Comms appropriateness** (0–10) — right channel, right audience, right urgency?
- **Business impact** (0–10) — did this action create or reduce business risk?

### 7.3 Auto-refinement loop (winning differentiator)

```
1. Run eval set against current persona prompts → get baseline scores
2. Identify lowest-scoring persona+dimension
3. Use a meta-LlmAgent to propose 3 prompt variants targeting that weakness
4. Run eval set against each variant
5. Promote the winner if Δ > threshold
6. Commit prompt change with eval delta in commit message
7. Repeat for next worst dimension
```

Demo-able output: "Containment time reduced from 47 minutes to 31 minutes after 8 eval-driven prompt refinements." This is a number a CISO buyer cares about. It is also the kind of measurable claim a challenge judge cannot ignore.

### 7.4 Eval CLI

- `adk eval` for the standard ADK harness
- `direphish eval --refine` for the auto-refinement loop
- Both write to `evals/results/<timestamp>/` with HTML reports

---

## 8. The demo (the thing judges actually watch)

2–3 minute video. "Show don't tell."

**Beats:**
1. (0:00–0:15) — "Ransomware just hit ACME Corp at 2:47am. Five-person IR team. ADK-orchestrated."
2. (0:15–1:00) — Live war-room view: SSE feed showing all 6 personas + adversary acting in parallel. Pressure timer counting down. Judge scores updating.
3. (1:00–1:30) — Pull back to architecture diagram (the one in §3.1). Highlight A2A boundaries (Claude on Adversary, Gemini on Defender). Highlight MCP servers as the worlds.
4. (1:30–2:00) — Show eval refinement loop running. "Watch as DirePhish improves its own IR Lead prompt." Before/after containment time.
5. (2:00–2:30) — Final report rendered. Containment achieved at round 12. Business impact: $X avoided. "DirePhish on ADK: agentic tabletop exercises that get better every run."

The video is written *into* the architecture, not onto it. Every decision in §3–§7 maps to a beat.

---

## 9. Migration phases (5 weeks, 2026-05-05 → 2026-06-05)

### Week 1 (2026-05-05 → 2026-05-11) — Foundation
- ADK skeleton in `backend/adk/` with Root Orchestrator + one persona (IR Lead, Gemini via Vertex) + one MCP world (Slack)
- Vertex AI model plane wired up: ADC configured, `GOOGLE_GENAI_USE_VERTEXAI=TRUE` env, `anthropic[vertex]` installed, `LLMRegistry.register(Claude)` called at service startup, smoke test that both `gemini-3-pro-preview` and `claude-sonnet-4-6` resolve via the same auth path
- SSE bus from orchestrator → existing Flask `/sim/{id}/events`
- Goal: a single-persona round runs end-to-end, war-room renders live, both Gemini and Claude callable through Vertex from the same process

### Week 2 (2026-05-12 → 2026-05-18) — Multi-persona, multi-world
- All 5 Defender personas as a `ParallelAgent` inside DefenderTeam A2A service (Gemini Pro / Flash Lite via Vertex)
- Adversary as A2A service on its own port, Claude-on-Vertex-Model-Garden backed
- Email + SIEM MCP servers
- Pressure engine as custom `BaseAgent`
- Goal: full ransomware scenario completes with all 6 personas + judge

### Week 3 (2026-05-19 → 2026-05-25) — Eval framework
- Scrape historical Crucible runs into `.evalset.json`
- ContainmentJudge becomes A2A service, wired into ADK eval harness
- `adk eval` produces HTML reports
- Synthetic eval data fills gaps
- Goal: eval baseline established for all 6 personas × 4 dimensions

### Week 4 (2026-05-26 → 2026-06-01) — Refinement loop + polish
- Auto-refinement loop running, committing prompt deltas
- Cost/latency callbacks wired to dashboard
- Guardrails (persona-tool matrix, output schema, cost cap) enforced
- Optional: Vertex AI Agent Engine deploy
- Goal: measurable improvement claim ready for demo

### Week 5 (2026-06-02 → 2026-06-05) — Submission
- Demo video shoot + edit
- Repo cleanup, README rewrite
- Hosted URL live
- Submission packet uploaded
- Goal: shipped before deadline

### What gets cut if we slip
| Cut order | Item | Why |
|---|---|---|
| 1 | Cloud deploy (stay local) | Local works fine for the demo, judges can clone |
| 2 | Auto-refinement loop | Reduces to "we have evals" rather than "we improve from evals" — drops win odds |
| 3 | Cross-model (Adversary on Gemini instead of Claude-on-Vertex) | Loses the multi-vendor-on-one-platform differentiator but stays shippable |
| 4 | Persona count (drop CEO + Legal) | Last resort — weakens the "real org" story |

---

## 10. Winning differentiators — the things judges remember

If we ship all of these, we have a real shot at winning Track 2:

1. **Cross-vendor A2A on a single Vertex AI plane.** Claude on Adversary, Gemini on Defender — but both resolved through Vertex AI Model Garden, same project, same IAM, same Cloud Trace. Visible in the demo, visible in the architecture diagram, visible in one billing line. ("Same platform, different brains.")
2. **MCP as Worlds, not as toys.** Slack/Email/SIEM MCP servers that are actual functional simulation worlds, not "hello world" demos.
3. **Eval-driven prompt refinement loop.** Show the loop. Show the commits. Show the containment time number drop.
4. **Pressure engine as custom BaseAgent.** Most ADK demos are LLM-only. Showing a deterministic agent in the same tree shows we understand the framework.
5. **Live war-room view via SSE.** The demo *is* the product. Not a slides deck.
6. **Concrete business metric.** "Containment time reduced from N to M minutes after Y refinements." Not "users love it."
7. **Graceful failure modes.** A2A retry, MCP degraded mode, cost cap. Production-ready signals.

---

## 11. Open questions and risks

### Questions that need answers before week 1 ends
- **Do we keep `crucible-sim` as a pip dep, or vendor what we need into `backend/adk/`?** Leaning vendor — cleaner blast radius, easier to delete if we pivot. Crucible package stays in repo for safe rollback.
- **Vertex AI Agent Engine vs Cloud Run for the orchestrator?** Agent Engine is the headline buzzword (`agent_engines.create()`) but Cloud Run is what we know. Decision deferred to week 4.
- **Do we expose graphiti via MCP, or call it directly from personas?** Leaning MCP for consistency. Costs us a week's worth of MCP server work though.
- **Realistic hours/week between now and June 5?** Plan above assumes 15–25 hrs/wk. If <15, cut order in §9 kicks in.

### Risks
- **Claude-on-Vertex regional quota.** Claude on Vertex is published in a small set of regions (`us-east5`, `europe-west1` at time of writing). A single-region quota cap could bottleneck the adversary during the demo. Mitigation: dual-region client config with failover; cache adversary actions for replay; `gemini-3-flash-lite-preview` cold fallback wired through the same `LlmAgent` so failover is a model-string swap, not an SDK swap.
- **Partner model availability drift on Vertex.** Anthropic deprecated Claude 3 Haiku on Vertex on 2026-02-23 (shutdown 2026-08-23); Mistral retired Codestral 25.01 and Mistral Large 24.11 on 2026-01-23. Mitigation: pin to `claude-sonnet-4-6` (current GA), monitor Vertex release notes, keep a v2 list of Vertex-resident swap-ins so a deprecation isn't a re-architecture.
- **MCP stdio overhead.** 4 stdio subprocesses per round may be slow. Mitigation: process pooling; switch to HTTP MCP if stdio bottlenecks.
- **Eval data quality.** Historical Crucible runs may not be cleanly labeled. Mitigation: human review pass; synthetic fills gaps.
- **Demo recording at the deadline.** Most likely failure mode is "code works, video is rushed." Mitigation: lock feature freeze at 2026-06-02, leave 3 days for recording.
- **Scope creep into v2 features.** v2 (more personas, more scenarios, marketplace listing) is tempting but kills the deadline. Hard line: v1 ships as designed.

### Things explicitly out of scope for v1
- More than 1 scenario (ransomware only)
- More than 6 personas
- PagerDuty / EDR worlds
- Marketplace listing (Track 3)
- Multi-tenant / org isolation
- Anything in the Vue frontend (already deleted, see commit `089dfe2`)

---

## 12. Decision log (locked in so far)

| Decision | Date | Rationale |
|---|---|---|
| Track 2 (Optimize) | 2026-05-04 | Existing product, eval-loop story is strongest |
| Full ADK-native rewrite (Option 3) over surgical wrap | 2026-05-04 | Surgical wrap qualifies but doesn't win |
| `feature/google-challenge` branch | 2026-05-04 | Don't disturb main demo |
| 6 personas, 3 worlds, ransomware, ~15 rounds, 3 A2A services | 2026-05-04 | Smallest scope that demos all the patterns |
| Local-first dev, cloud optional | 2026-05-04 | User pushback on 8-service deploy plan |
| Cross-model: Claude on Adversary, Gemini on Defender | 2026-05-04 | Differentiator + uses platform fully |
| Vertex AI Model Garden as the **only** model plane (Gemini natively, Claude via `anthropic[vertex]` + `LLMRegistry.register(Claude)`); no LiteLlm, no direct Anthropic API key | 2026-05-05 | Single auth + billing + observability surface; $500 Google credits cover Claude calls; uniform ADK callbacks for cost/latency across vendors; eliminates a class of demo-day failures |
| Hybrid eval data (historical + synthetic) | 2026-05-04 | Coverage gaps in historical data |
| Hard rule: no implementation until plan written and approved | 2026-05-04 | Brainstorming gate |
| Crucible package not deleted, just deprecated | 2026-05-04 | Safe rollback |

---

## 13. Next steps

1. User reads this doc end-to-end, comments inline.
2. Resolve the 4 open questions in §11.
3. Convert this research doc into an implementation plan (separate `*-plan.md` file) using the `superpowers:writing-plans` skill.
4. Begin Week 1 work on the `feature/google-challenge` branch.
