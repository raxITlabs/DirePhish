# Exercise Report Redesign — 4-View Report with Playbook Generation

## Goal

Replace the single-view exercise report with a 4-view report that serves different audiences from the same data. Wire in Monte Carlo aggregation, stress test results, and resilience scoring that are currently built but disconnected. Add a dedicated incident response playbook generator.

## Architecture

The report page (`/report/exercise/[projectId]`) shows a segmented control with 4 views:

```
Board | CISO | Security Team | Playbook
```

Default: Board. All views use the same underlying data but filter and frame it differently. The backend exercise report generator is enhanced to include MC aggregation and stress test results in its output JSON.

## Design System

- OKLCH warm palette (tuscan-sun, burnt-peach, verdigris, royal-azure)
- Light mode only
- JetBrains Mono monospace throughout
- shadcn/ui components where applicable
- Existing DirePhish design tokens

## Views

### View 1: Board (default)

**Audience:** CISO presenting to board of directors. 5-minute presentation.

**Sections:**
1. **Header** — company name, scenario title, simulation count, date
2. **Outcome distribution bar** — stacked horizontal (73% contained / 18% escalated / 9% catastrophic) with legend
3. **4 hero KPIs** — containment %, lateral movement %, regulatory escalation %, mean response time (σ)
4. **Two-column: Readiness gauge + Attack surface mini-graph**
   - SVG ring chart (0-100) with dimension breakdown bars (detection, containment, communication, compliance)
   - Mini knowledge graph showing persons, systems, threats with relationship edges
5. **Highest-impact decision callout** — amber card: the one decision that changed outcomes in 87% of simulations
6. **Stress test highlights** — 4 key mutations with pass/warn/fail badges
7. **3 priority actions** — ranked, color-coded severity, owner + timeline + investment

**Data sources:**
- `monte_carlo_aggregator.aggregate_batch()` → outcome_distribution, containment_round_stats
- `config_mutator.score_resilience()` → readiness score, dimension scores
- Counterfactual `decision_divergence_points[0]` → highest-impact decision
- Stress test results → top 4 mutations
- Exercise report `conclusions.actionItems` → top 3 actions

### View 2: CISO

**Audience:** CISO planning improvements. Deep analysis.

**Includes everything from Board View plus:**
1. **Decision divergence table** — all top 5 decisions ranked by outcome impact %, with round, agent, action, impact bar
2. **Team performance heatmap** — teams × dimensions color-coded (teal/amber/red)
3. **Agent consistency bars** — per-agent predictability score (0-100%) across MC runs
4. **Root cause analysis (5 Whys)** — nested tree for each root cause with MITRE reference
5. **Full stress test results** — all 11 mutations with pass/warn/fail
6. **5 priority actions** — each linked to the stress test or root cause that surfaced it
7. **Counterfactual comparison** — original vs alternate timeline outcome

**Data sources:**
- `monte_carlo_aggregator` → decision_divergence_points, agent_consistency
- Exercise report → team_performance.heatmapData, rootCauseAnalysis
- Stress test → all mutation results
- Counterfactual → branch comparison

### View 3: Security Team

**Audience:** Security team planning Monday morning work. Technical playbook.

**Sections:**
1. **MITRE ATT&CK kill chain** — horizontal flow of attack steps with technique IDs and target systems
2. **Two-column: Systems affected table + Attack surface graph**
   - Table: system name, role in attack, criticality badge
   - Graph: SVG with attack path highlighted (red dashed lines), affected systems with red rings
3. **Indicators of Compromise** — simulated IOCs: IAM roles, network IPs, API anomalies, S3 access patterns
4. **Incident timeline** — chronological with color-coded dots: inject (amber), attacker (red), defender (blue), arbiter (teal)
5. **Remediation checklist** — checkbox items with owner, timeline, priority badge

**Data sources:**
- Simulation config → attack_path.kill_chain, scheduled_events
- Graph context → systems, threats, relationships
- Simulation actions → timeline
- Exercise report → conclusions.actionItems (technical ones)

### View 4: Playbook

**Audience:** IR team. Runnable incident response procedure.

**Structure (NIST SP 800-61r2 format):**

```
1. Overview
   - Incident type (from scenario)
   - Scope (systems affected, data at risk)
   - Regulatory context (from compliance nodes in graph)

2. Part 1: Evidence Acquisition
   - What logs to collect (mapped to actual systems in graph)
   - AWS-specific: CloudTrail, VPC Flow Logs, S3 access logs
   - Chain of custody requirements
   - Sensitivity classification of affected data

3. Part 2: Containment
   - Immediate actions (from simulation's successful containment steps)
   - IAM revocation steps (specific roles from IOCs)
   - Network isolation (specific subnets/VPCs)
   - Service suspension (specific services from graph)

4. Part 3: Eradication
   - Root cause removal (from 5 Whys root cause)
   - Credential rotation scope
   - Patch/update requirements
   - Configuration remediation

5. Part 4: Recovery
   - Service restoration sequence
   - Verification steps
   - Communication plan (from simulation's comms patterns)
   - Regulatory notification timeline (from compliance graph data)

6. Part 5: Post-Incident
   - Lessons learned (from exercise report conclusions)
   - Policy updates needed (from root cause analysis)
   - Training recommendations
   - Next exercise schedule
```

**Data sources:**
- All of the above + graph context (systems, compliance, threats)
- Simulation actions (what containment steps actually worked)
- Exercise report root causes + recommendations
- LLM generation using all collected data as context

**Generation approach:**
- Backend: new LLM call in exercise_report_agent.py that generates the playbook
- Uses the simulation data + graph context + MC stats as input
- Produces structured JSON matching the 5-part NIST format
- Frontend renders as a styled document with checkboxes, collapsible sections

## Backend Changes

### 1. Wire MC aggregation into exercise report

**File: `frontend/app/workflows/crucible-pipeline.ts`**
- Pass `batch_id` to exercise report trigger: `POST /exercise-report { batch_id, branch_ids }`

**File: `backend/app/api/crucible.py`**
- Exercise report endpoint accepts `batch_id` and `branch_ids` from request body

**File: `backend/app/services/exercise_report_agent.py`**
- Accept `batch_id` parameter
- Load `aggregation.json` from MC batch directory
- Include outcome_distribution, containment_stats, decision_divergence, agent_consistency in report JSON
- Call `config_mutator.score_resilience()` if stress test data exists
- Generate playbook section using new LLM call

### 2. Playbook generation

**File: `backend/app/services/exercise_report_agent.py`**
- New function `_generate_playbook()` that takes:
  - Scenario config (systems, threats, attack path)
  - Graph context (org hierarchy, system dependencies, compliance)
  - Simulation actions (what worked, what failed)
  - Root cause analysis results
- LLM call with NIST SP 800-61r2 template as system prompt
- Produces structured JSON with 5 parts

## Frontend Changes

### 1. Report page redesign

**File: `frontend/app/report/exercise/[projectId]/page.tsx`**
- Add segmented control (Board | CISO | Security Team | Playbook)
- Render different component per selected view
- All views share the same data fetch

### 2. New components

**Create:**
- `frontend/app/components/report/exercise/BoardView.tsx`
- `frontend/app/components/report/exercise/CISOView.tsx`
- `frontend/app/components/report/exercise/SecurityTeamView.tsx`
- `frontend/app/components/report/exercise/PlaybookView.tsx`
- `frontend/app/components/report/exercise/OutcomeDistributionBar.tsx` (shared)
- `frontend/app/components/report/exercise/ReadinessGauge.tsx` (shared)
- `frontend/app/components/report/exercise/MiniGraph.tsx` (shared)
- `frontend/app/components/report/exercise/KillChainFlow.tsx`
- `frontend/app/components/report/exercise/StressTestResults.tsx` (shared)

### 3. Existing components to keep

- `ExerciseKPIStrip.tsx` — adapt for Board View
- `HeatmapChart.tsx` — use in CISO View
- `FiveWhysTree.tsx` — use in CISO View
- `ConclusionsSection.tsx` — use actions table in all views

## Data Flow

```
MC batch completes → aggregation.json saved to disk
                  → WDK pipeline passes batch_id to exercise report
                  → exercise_report_agent loads aggregation + stress results
                  → generates report JSON with MC stats + playbook
                  → frontend fetches report
                  → segmented control renders correct view
```

## Verification

1. Run full pipeline (standard mode, 10+ MC iterations)
2. Board View: shows outcome distribution, readiness score, decision callout
3. CISO View: shows decision divergence table, heatmap, agent consistency, stress results
4. Security Team View: shows kill chain, systems table, IOCs, remediation checklist
5. Playbook View: shows 5-part NIST-format playbook with scenario-specific steps
6. All views export to PDF/Markdown
7. Segmented control works, URL updates with view parameter
