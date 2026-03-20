# Graphiti Migration — Sub-spec B: Agent Memory + Rich Report Agent

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Add agent memory (Graphiti queries before each agent action) to the Crucible simulation runner, and build a rich report agent that queries the temporal knowledge graph for after-action analysis.

**Depends on:** Sub-spec A (Graphiti setup + episode pushing must be working)

---

## Goal

Make Crucible simulations intelligent. Agents remember what happened earlier via Graphiti queries. The report agent analyzes the full temporal graph — not just raw actions — to produce multi-section reports with evidence, temporal analysis, and scored agent evaluations.

---

## Part 1: Agent Memory During Simulation

### What Changes

`run_crucible_simulation.py` currently prompts each agent with the last few messages as context. After this change, before each agent action, the runner queries Graphiti for relevant context and injects it into the agent's prompt.

### How It Works

```
For each agent, each round:
  1. Build base prompt (persona, role, scenario, world instructions)
  2. Query Graphiti: "What has {agent_name} discussed? What decisions have been made?"
  3. Inject Graphiti results as "Memory Context" section in prompt
  4. LLM generates action (send_message, send_email, etc.)
  5. Action is pushed to Graphiti as a new episode (already done in Sub-spec A)
```

### Graphiti Query Strategy

Each agent gets a personalized query based on their role:
- `"What has {agent_name} discussed and what decisions have been made in the {world_name}?"`
- Results are temporal — Graphiti returns facts ordered by recency
- Include top 5-10 facts as "Memory Context" in the prompt

### Changes to `run_crucible_simulation.py`

**New function:** `get_agent_memory(graphiti, agent_name, world_name, round_num) -> str`
- Queries Graphiti with agent-specific context
- Returns formatted text for prompt injection
- Uses `reference_time` to get facts up to current simulation time (temporal boundary)

**Modified flow:** In the main simulation loop, before each agent's LLM call:
```python
memory_context = await get_agent_memory(graphiti, agent["name"], world["name"], round_num)
prompt = build_prompt(agent, world, recent_actions, memory_context)
response = await llm_call(prompt)
```

### Prompt Template Addition

```
## Memory Context
The following is what you remember from previous discussions and decisions:
{memory_context}

Use this context to inform your response. Reference specific decisions and
discussions when relevant. Don't repeat what others have already said.
```

---

## Part 2: Rich Report Agent

### What Changes

Replace `generate_after_action_report.py` (single LLM call → markdown) with a multi-step report agent that queries Graphiti for evidence.

### Report Generation Pipeline

```
1. Load simulation config + actions summary
2. Query Graphiti for key entities and relationships
3. Generate report sections one at a time:
   a. Executive Summary — overall narrative arc
   b. Timeline — key decisions with temporal context
   c. Communication Analysis — cross-world coordination patterns
   d. Tensions & Conflicts — where agents disagreed (from graph relationships)
   e. Agent Scorecards — per-agent evaluation with evidence
   f. Recommendations — process improvements
4. Compile into structured JSON for the frontend
```

### Graphiti Queries for Report

| Section | Query | What It Returns |
|---------|-------|----------------|
| Executive Summary | `"What were the major events and outcomes?"` | High-level narrative facts |
| Timeline | `"What key decisions were made in each round?"` | Temporal sequence of decisions |
| Communication | `"How did agents coordinate across Slack and Email?"` | Cross-world interaction patterns |
| Tensions | `"Where did agents disagree or conflict?"` | Contradictory facts, opposing positions |
| Agent Scores | `"What did {agent_name} contribute?"` (per agent) | Per-agent actions and impact |
| Recommendations | `"What went wrong or could be improved?"` | Gaps, delays, miscommunications |

### Report Output Format

Same JSON structure the frontend already consumes (`Report` type):
```json
{
  "simId": "...",
  "status": "complete",
  "companyName": "...",
  "scenarioName": "...",
  "completedAt": "...",
  "duration": "5 rounds",
  "executiveSummary": "Multi-paragraph summary with specific evidence...",
  "timeline": [
    {"round": 1, "timestamp": "...", "description": "...", "significance": "high", "agent": "Sarah Jenkins"}
  ],
  "communicationAnalysis": "Analysis with specific examples from the graph...",
  "tensions": "Specific disagreements with quotes and context...",
  "agentScores": [
    {
      "name": "Sarah Jenkins",
      "role": "CEO",
      "score": 7,
      "strengths": ["Decisive action on containment", "Clear communication to board"],
      "weaknesses": ["Micromanaged technical decisions", "Delayed legal notification"],
      "actionCount": 12,
      "worldBreakdown": {"IR War Room": 8, "Corporate Email": 4}
    }
  ],
  "recommendations": [
    "Establish clearer escalation paths between Security and Engineering",
    "Pre-draft regulatory notification templates for faster GDPR response"
  ]
}
```

### New Service: `crucible_report_agent.py`

```python
class CrucibleReportAgent:
    """Multi-step report agent that queries Graphiti for evidence."""

    def __init__(self, graphiti, llm_client, config, actions):
        self.graphiti = graphiti
        self.llm = llm_client
        self.config = config
        self.actions = actions

    async def generate(self) -> dict:
        """Generate a complete after-action report."""
        # Step 1: Query Graphiti for key facts
        key_facts = await self._query_key_facts()

        # Step 2: Generate each section
        summary = await self._generate_summary(key_facts)
        timeline = await self._generate_timeline(key_facts)
        communication = await self._generate_communication_analysis(key_facts)
        tensions = await self._generate_tensions(key_facts)
        scores = await self._generate_agent_scores()
        recommendations = await self._generate_recommendations(key_facts)

        return {
            "executiveSummary": summary,
            "timeline": timeline,
            "communicationAnalysis": communication,
            "tensions": tensions,
            "agentScores": scores,
            "recommendations": recommendations,
            ...
        }
```

---

## Files Changed

| File | Action |
|------|--------|
| `backend/scripts/run_crucible_simulation.py` | **Modify** — add Graphiti memory queries before each agent action |
| `backend/app/services/crucible_report_agent.py` | **Create** — multi-step report agent with Graphiti queries |
| `backend/app/api/crucible.py` | **Modify** — report endpoint uses new report agent instead of script |

## Files NOT Changed

- All frontend code — unchanged. Report JSON format stays the same.
- `graphiti_manager.py` — unchanged (created in Sub-spec A)
- Research pipeline — unchanged
- D3 visualization — unchanged

---

## Out of Scope

- Custom Graphiti ontology (entity/edge type definitions for Crucible domain)
- Post-simulation agent chat (interactive querying)
- Report streaming (showing sections as they generate)
- Comparative analysis across multiple simulation runs
