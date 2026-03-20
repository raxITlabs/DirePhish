# Crucible Next.js Frontend — Design Spec

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Crucible-first frontend for enterprise simulation — preset selection, config review, live simulation dashboard with GraphRAG, and after-action reports.

---

## Goal

Build a Next.js frontend for the Crucible enterprise simulation engine. Users pick a preset (or upload a config), review and launch the simulation, watch it unfold in real-time across enterprise communication channels (Slack, Email), and review a scored after-action report.

## Tech Stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Visualization:** D3.js (force-directed knowledge graph)
- **Package manager:** pnpm
- **Backend communication:** Next.js Server Actions → Flask API (localhost:5001)
- **State management:** React state + polling (no external state library)

## Architecture

```
Browser (React Client Components)
  ↓ calls
Next.js Server Actions (app/actions/*.ts)
  ↓ fetches
Flask Backend (localhost:5001/api/crucible/*)
  ↓ manages
Crucible subprocess + actions.jsonl + Zep graph
```

Server Actions act as the bridge layer: they run server-side, call Flask, and return typed data. No Flask endpoints exposed to the browser, no CORS needed.

### New Flask Blueprint: `/api/crucible/*` (must be built)

**This is entirely new backend work.** The existing Flask app has `/api/graph`, `/api/simulation`, and `/api/report` blueprints, all oriented around the OASIS social media flow. The Crucible blueprint is separate — it loads Crucible presets, manages Crucible subprocess execution, and serves actions.jsonl data.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/crucible/presets` | GET | List builtin presets |
| `/api/crucible/presets/:id` | GET | Load preset config |
| `/api/crucible/simulations` | POST | Launch simulation (subprocess) |
| `/api/crucible/simulations/:id/status` | GET | Poll round progress |
| `/api/crucible/simulations/:id/actions` | GET | Get actions (paginated, filterable by world) |
| `/api/crucible/simulations/:id/stop` | POST | Stop running simulation |
| `/api/crucible/simulations/:id/report` | POST | Generate after-action report |
| `/api/crucible/simulations/:id/report` | GET | Get generated report |
| `/api/crucible/simulations/:id/graph` | GET | Get graph data for visualization |

---

## Routes

| Route | Page | Type |
|-------|------|------|
| `/` | Home — Preset grid + upload | Server component |
| `/configure/[presetId]` | Config review & launch | Server component + client islands |
| `/simulation/[simId]` | Live simulation dashboard | Client component (polling) |
| `/report/[simId]` | After-action report | Server component |

---

## Server Actions

### `app/actions/presets.ts`
- `getPresets()` → `Preset[]` — list all builtin presets
- `getPreset(id: string)` → `Preset` — get preset metadata
- `getPresetConfig(id: string)` → `SimulationConfig` — get full config for a preset

### `app/actions/simulation.ts`
- `launchSimulation(config: SimulationConfig)` → `{ simId: string }` — start simulation subprocess
- `getSimulationStatus(simId: string)` → `SimulationStatus` — poll current round, status, action counts
- `getSimulationActions(simId: string, opts?: { world?: string, fromRound?: number })` → `AgentAction[]` — get actions with optional filters
- `stopSimulation(simId: string)` → `{ status: string }` — stop running simulation

### `app/actions/report.ts`
- `generateReport(simId: string)` → `{ status: string }` — trigger report generation (keyed by simId)
- `getReport(simId: string)` → `Report` — get completed report (keyed by simId)

### `app/actions/graph.ts`
- `getGraphData(simId: string)` → `GraphData` — get nodes and edges for D3 visualization

---

## Types (`app/types/`)

Types are aligned with the actual Crucible Python models. Server Actions transform between backend JSON and these frontend types where needed.

```typescript
// app/types/preset.ts
// Presets are derived from Crucible's builtin YAML files.
// Metadata (id, description, agentCount, roundCount) is synthesized by the
// Flask endpoint from parsing the YAML + a small metadata registry file.
interface Preset {
  id: string;               // e.g., "cybersecurity_ir" (YAML filename without ext)
  name: string;             // from EnterpriseConfig.name
  description: string;      // from metadata registry
  industry: string;         // from EnterpriseConfig.industry
  size: string;             // from EnterpriseConfig.size ("small" | "medium" | "large")
  worldTypes: string[];     // derived from worlds[].type
  pressureCount: number;    // derived from pressures.length
}

// app/types/simulation.ts
// Maps to the JSON config format used by run_crucible_simulation.py
// (see backend/uploads/test_crucible_config.json for reference)
interface SimulationConfig {
  simulationId?: string;
  companyName: string;       // "company_name" in JSON
  scenario: string;
  totalRounds: number;       // "total_rounds" in JSON
  hoursPerRound: number;     // "hours_per_round" in JSON
  agents: AgentConfig[];     // "agent_profiles" in JSON
  worlds: WorldConfig[];
  pressures: PressureConfig[];
  scheduledEvents: ScheduledEvent[];
}

interface AgentConfig {
  name: string;
  role: string;
  persona: string;           // matches "persona" field in JSON config
}

// Matches Crucible's WorldRef model (enterprise_config.py)
interface WorldConfig {
  type: string;              // "slack", "email", etc. (str, not enum — extensible)
  name: string;              // "IR War Room", "Corporate Email"
}

// Matches Crucible's PressureConfig model (pressure_config.py)
interface PressureConfig {
  name: string;
  type: "countdown" | "deadline" | "threshold" | "triggered";
  affectsRoles: string[];    // "affects_roles" — which agent roles feel this pressure
  hours?: number;            // for countdown type
  hoursUntil?: number;       // for deadline type
  value?: number;            // for threshold type
  unit?: string;             // for threshold type (e.g., "tx/backlog")
  triggeredBy?: string;      // for triggered type
  severityAt50pct: string;   // "high" | "critical" — severity when 50% consumed
  severityAt25pct: string;   // "high" | "critical" — severity when 25% remaining
}

interface ScheduledEvent {
  round: number;
  description: string;       // matches JSON config format (no separate name field)
}

// app/types/status.ts
interface SimulationStatus {
  simId: string;
  status: "starting" | "running" | "completed" | "stopped" | "failed";
  currentRound: number;
  totalRounds: number;
  actionCount: number;
  recentActions: AgentAction[];
  pressures: ActivePressureState[];
}

// Matches the actions.jsonl line format from run_crucible_simulation.py
interface AgentAction {
  round: number;
  timestamp: string;
  simulationId: string;
  agent: string;             // agent name
  role: string;              // agent role
  world: string;             // world name (e.g., "IR War Room")
  action: string;            // "send_message" | "send_email"
  args: SlackActionArgs | EmailActionArgs;  // structured, varies by action type
  result: { success: boolean; action: string; agentId: string } | null;
}

interface SlackActionArgs {
  content: string;
  channel: string;
}

interface EmailActionArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

// Matches Crucible's ActivePressure dataclass (pressure/types.py)
interface ActivePressureState {
  name: string;
  type: string;
  affectsRoles: string[];    // "affects_roles"
  remainingHours?: number;   // "remaining_hours" — null for non-countdown types
  value?: number;            // current value for threshold types
  unit?: string;
  severity: string;          // "normal" | "high" | "critical" — computed by PressureEngine
  triggered: boolean;
}

// app/types/graph.ts
// Graph data is constructed by the Flask endpoint from simulation config,
// not from Zep. Nodes represent agents, the org, pressures, and threats.
// Edges represent relationships (reports_to, affected_by, etc.)
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  name: string;
  type: string;             // "agent", "org", "threat", "compliance", "system"
  attributes: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  type: string;
}

// app/types/report.ts
interface Report {
  simId: string;
  companyName: string;
  scenarioName: string;
  completedAt: string;
  duration: string;
  executiveSummary: string;
  timeline: TimelineEntry[];
  communicationAnalysis: string;
  tensions: string;
  agentScores: AgentScore[];
  recommendations: string[];
}

interface TimelineEntry {
  round: number;
  timestamp: string;
  description: string;
  significance: "normal" | "high" | "critical";
  agent?: string;
}

interface AgentScore {
  name: string;
  role: string;
  score: number;            // 1-10
  strengths: string[];
  weaknesses: string[];
  actionCount: number;
  worldBreakdown: Record<string, number>;  // { "IR War Room": 8, "Corporate Email": 3 }
}
```

### Server Action Transformations

Server Actions handle the camelCase ↔ snake_case mapping between TypeScript and Python. Key transformations:

- `PressureConfig.affectsRoles` ← `affects_roles`
- `PressureConfig.severityAt50pct` ← `severity_at_50pct`
- `AgentAction.args` is typed as a discriminated union (SlackActionArgs | EmailActionArgs) based on `action` field
- `ActivePressureState.remainingHours` ← `remaining_hours` (raw float, formatted to "HH:MM:SS" in the UI component)
- `Preset` metadata is synthesized from YAML parsing + a metadata registry

### Custom Config Upload

For `/configure/custom`, the uploaded JSON file is stored temporarily via a Server Action that writes it to a temp directory on the server and returns a config ID. The configure page loads it by that ID. No localStorage or URL params needed — the Server Action handles persistence.

---

## Page Designs

### 1. Home (`/`)

**Server component.** Calls `getPresets()` at render time.

**Layout:**
- Top: Crucible branding + tagline
- Middle: Grid of preset cards (2-3 columns)
  - Each card: industry icon, name, description, agent/world/round badges
  - Click → navigates to `/configure/:presetId`
- Bottom: Upload section
  - Drop zone for JSON config file
  - JSON upload → navigates to `/configure/custom` with config loaded
  - Seed doc upload: placeholder, disabled with "coming soon"
- Below fold (optional v1): Recent simulation history list

### 2. Configure (`/configure/:presetId`)

**Server component** with client islands for edit toggle and launch button.

Calls `getPresetConfig(presetId)` at render time. For `/configure/custom`, loads the uploaded config by temp ID (see "Custom Config Upload" in Types section).

**Layout:** Single-column, scrollable with sections:

1. **Header** — Preset name, industry tag, edit toggle button
2. **Scenario** — Company name, scenario description (read-only by default, editable when toggled)
3. **Agents** — Card grid: name, role, personality summary. Editable in edit mode.
4. **Worlds** — Channel list with type badges. Shows agent-to-world access mapping.
5. **Pressures** — Cards: type, name, severity, parameters. Color-coded by severity.
6. **Scheduled Events** — Timeline list: round number, event name, description.
7. **Settings** — Total rounds, timing.
8. **Launch button** — Sticky bottom bar. Calls `launchSimulation(config)`, redirects to `/simulation/:simId`.

### 3. Simulation Dashboard (`/simulation/:simId`)

**Client component.** Polls `getSimulationStatus()` every 3 seconds. Polls `getGraphData()` every 30 seconds.

**Layout:** Split-panel with Graph/Split/Focus toggle.

**Top bar:**
- Left: Crucible branding + simulation name
- Center: Graph/Split/Focus toggle (controls panel widths)
- Right: Round counter, status badge, stop button

**Pressure strip** (below top bar):
- Horizontal row of pressure cards
- Each shows: name, description, remaining time or current value, progress bar
- Color-coded: green (safe) → yellow (warning) → red (critical)
- Colors transition as severity escalates during simulation

**Left panel — Knowledge Graph (D3):**
- Force-directed graph rendered in SVG
- Nodes colored by type: Agent (blue), Org (orange), Threat (red), Compliance (purple), System (green)
- Click node → detail panel overlay with agent info, action count, world access
- Legend at bottom
- Refresh button + "Updating..." indicator during simulation
- Graph data refreshes every 30 seconds

**Right panel — Tabbed world views:**

Tabs: **Slack** | **Email** | **Timeline**

**Slack tab:**
- Chat-style message list
- Agent avatar (initials), name, role badge, timestamp
- Message content
- Round dividers between rounds
- Event inject banners (highlighted, colored) when scheduled events fire
- Auto-scrolls to bottom on new messages

**Email tab:**
- Inbox-style list
- Each row: From, To, Subject, timestamp, round number
- Click to expand email body (accordion)

**Timeline tab:**
- Chronological feed of all actions across all worlds
- Each entry: timestamp, agent, world icon, action summary
- Round markers as section dividers
- Event injects highlighted

**View modes:**
- Graph: 100% graph, 0% tabs
- Split: 50% graph, 50% tabs (default)
- Focus: 0% graph, 100% tabs

**Completion state:**
- When simulation completes, status badge changes to "Completed"
- Stop button replaced with "View Report" button
- Calls `generateReport(simId)` then redirects to `/report/:simId`

### 4. After-Action Report (`/report/:simId`)

**Server component.** Calls `getReport(simId)` at render time.

**Layout:** Single-column reading layout, max-width constrained.

**Sections:**

1. **Header** — Simulation name, company, date, duration, completion badge
2. **Executive Summary** — 2-3 paragraph overview
3. **Timeline** — Visual timeline of key decisions with round markers. Critical events highlighted. Event injects called out.
4. **Communication Effectiveness** — Analysis of cross-world coordination, response times, Slack vs Email patterns
5. **Tensions & Conflicts** — Where agents disagreed or made conflicting decisions
6. **Agent Scorecards** — Grid of cards (2-3 columns):
   - Name, role
   - Score bar (1-10) with numeric label
   - Strengths bullets
   - Weaknesses bullets
   - Action count by world
7. **Recommendations** — Bullet list of improvements
8. **Export** — Download as Markdown button (top-right, sticky)

---

## Component Structure

```
app/
├── actions/
│   ├── presets.ts
│   ├── simulation.ts
│   ├── report.ts
│   └── graph.ts
├── types/
│   ├── preset.ts
│   ├── simulation.ts
│   ├── status.ts
│   ├── graph.ts
│   └── report.ts
├── components/
│   ├── layout/
│   │   ├── Header.tsx              # Top nav bar (shared)
│   │   └── PressureStrip.tsx       # Horizontal pressure cards
│   ├── home/
│   │   ├── PresetGrid.tsx          # Grid of preset cards
│   │   ├── PresetCard.tsx          # Individual preset card
│   │   └── UploadZone.tsx          # Config file upload
│   ├── configure/
│   │   ├── AgentCards.tsx          # Agent card grid
│   │   ├── WorldList.tsx           # World/channel list
│   │   ├── PressureCards.tsx       # Pressure config display
│   │   ├── EventTimeline.tsx       # Scheduled events list
│   │   └── LaunchBar.tsx           # Sticky launch button (client)
│   ├── simulation/
│   │   ├── ViewToggle.tsx          # Graph/Split/Focus toggle
│   │   ├── GraphPanel.tsx          # D3 force-directed graph
│   │   ├── GraphNodeDetail.tsx     # Node detail overlay
│   │   ├── WorldTabs.tsx           # Tab container
│   │   ├── SlackWorld.tsx          # Chat-style message list
│   │   ├── EmailWorld.tsx          # Inbox-style list
│   │   ├── TimelineView.tsx        # Chronological all-world feed
│   │   ├── RoundDivider.tsx        # Round separator
│   │   └── EventInjectBanner.tsx   # Scheduled event highlight
│   └── report/
│       ├── ExecutiveSummary.tsx     # Summary section
│       ├── ReportTimeline.tsx      # Key decisions timeline
│       ├── AgentScorecard.tsx      # Individual agent score card
│       ├── AgentScoreGrid.tsx      # Grid of scorecards
│       └── ExportButton.tsx        # Download markdown
├── page.tsx                        # Home page
├── configure/
│   └── [presetId]/
│       └── page.tsx                # Config review page
├── simulation/
│   └── [simId]/
│       └── page.tsx                # Simulation dashboard
└── report/
    └── [simId]/
        └── page.tsx                # After-action report
```

---

## Design Language

**Theme:** Light, clean, professional. Based on the original Vue frontend's design language but adapted for enterprise context.

**Typography:**
- Headings: Geist Sans (already configured in layout.tsx), semibold
- Body: Geist Sans, regular
- Code/labels: Geist Mono

**Colors:**
- Primary accent: `#ff4500` (carried from Vue frontend)
- Background: `#fafafa` page, `#ffffff` cards
- Borders: `#e5e5e5`
- Text: `#1a1a1a` primary, `#666666` secondary, `#aaaaaa` tertiary

**Pressure severity colors** (maps to Crucible's PressureEngine severity values):
- Normal: green (`#16a34a` text, `#f0fdf4` bg, `#bbf7d0` border) — pressure active but not urgent
- High: amber (`#d97706` text, `#fffbeb` bg, `#fde68a` border) — at `severity_at_50pct` threshold
- Critical: red (`#dc2626` text, `#fef2f2` bg, `#fecaca` border) — at `severity_at_25pct` threshold

**Status colors:**
- Running: green badge
- Completed: blue badge
- Stopped: gray badge
- Failed: red badge

**Agent role badge colors:**
- Each role gets a distinct color (blue, green, red, amber, purple, etc.)
- Used for avatar backgrounds and role badges in chat

**Graph node colors:**
- Agent: `#3b82f6` (blue)
- Organization: `#ff4500` (orange)
- Threat: `#ef4444` (red)
- Compliance: `#a855f7` (purple)
- System: `#4ade80` (green)

**Spacing:** 8px base unit. Cards have 12-16px padding. Section gaps 24px.

**Border radius:** 6-8px for cards, 12px for badges/pills.

**Animations:**
- Panel resize: 300ms ease transition
- Pressure color transitions: 500ms ease
- New messages: fade-in
- Loading states: subtle pulse

---

## Polling Strategy

| Data | Interval | Condition |
|------|----------|-----------|
| Simulation status | 3 seconds | While status is "running" |
| Simulation actions | 3 seconds | While status is "running", incremental (fromRound param) |
| Graph data | 30 seconds | While status is "running" |
| Pressure states | 3 seconds | Part of status response |

Polling stops when simulation status becomes "completed", "stopped", or "failed".

---

## Error Handling

Server Actions return `{ data: T } | { error: string }` union types. Components check for the `error` key and display appropriate UI.

- **Flask unreachable:** Banner at top of page: "Backend not connected. Start the Flask server on port 5001."
- **Simulation fails:** Status badge turns red, error message displayed in a banner below pressure strip.
- **Report generation fails:** Error state on report page with retry button.
- **Preset load fails:** Fallback to empty state with "No presets available" message.

---

## Out of Scope (v1)

- OASIS social media simulation flow (Twitter/Reddit)
- Seed document → LLM config generation (placeholder only)
- Post-simulation agent chat/interaction
- PagerDuty world view (placeholder tab, disabled)
- Simulation history/replay
- User authentication
- Mobile-responsive layout (desktop-first)
- WebSocket live updates (polling is sufficient)
