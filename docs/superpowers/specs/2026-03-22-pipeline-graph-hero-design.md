# Pipeline Page Redesign: Graph as Hero

**Date:** 2026-03-22
**Status:** Design approved

## Problem

The current pipeline page (`/pipeline/[runId]`) shows an 8-step vertical checklist with status icons and messages. Users see checkmarks appear but have no visibility into *what* is being discovered or *what* the simulation is doing. This causes anxiety — the user's most valuable artifact (the knowledge graph) is invisible until they navigate to a separate simulation page.

## Solution

Redesign the pipeline page as a **Graph + Context Panel** split layout:

- **Top:** Thin segment progress bar (one colored segment per pipeline step)
- **Left (~60%):** The knowledge graph — placeholder for pre-sim steps, live `GraphPanel` during simulations
- **Right (~40%):** An adaptive context panel that changes content based on the active pipeline step

The graph is the hero — it occupies the majority of the viewport and live-updates during simulations. The right panel provides readable narrative context so users understand *what* is happening, not just *that* something is happening.

**Layout change:** The current page uses `max-w-4xl mx-auto` for a narrow centered layout. The new design uses full-width (`h-screen flex flex-col`) to give the split panel maximum space.

## Layout Architecture

```
┌─────────────────────────────────────────────────────┐
│ Header                                              │
├─────────────────────────────────────────────────────┤
│ [██████████████████░░░░░░░░░░] Segment Progress Bar │
│ Simulations — 1/2 running...                        │
├──────────────────────────┬──────────────────────────┤
│                          │  Context Panel (~40%)    │
│   Left Panel (~60%)      │                          │
│                          │  Content changes per     │
│   Steps 1-5: Placeholder │  active pipeline step    │
│   Step 6+: GraphPanel    │                          │
│                          │  See "Panel States"      │
│                          │  below                   │
│                          │                          │
└──────────────────────────┴──────────────────────────┘
```

## Segment Progress Bar

A thin horizontal bar at the very top of the content area. One segment per pipeline step (8 total). Color-coded:

- **Green** — completed
- **Orange** — active/running
- **Gray** — pending
- **Red** — failed

Below the bar, a single line of text: the current step name and its status message (e.g., "Simulations — 1/2 running...").

No step labels on the segments themselves — this is a glanceable progress indicator, not a stepper.

## Left Panel — Graph Area

### Steps 1-5: Placeholder (No Graph Data)

Before simulations launch, no `simId` exists and no graph data is available. The left panel renders a **placeholder component** (`PipelineGraphPlaceholder`) instead of `GraphPanel`:

```
┌─────────────────────────────────────┐
│                                     │
│           [Company Icon]            │
│           Goldman Sachs             │
│                                     │
│     Graph builds during simulation  │
│                                     │
└─────────────────────────────────────┘
```

Subtle, not distracting. Uses `text-muted-foreground` colors. The right panel is the focus during these early steps.

### Steps 6+: Live GraphPanel

Once simulations start, the placeholder is replaced with the existing `GraphPanel` component from `frontend/app/components/simulation/GraphPanel.tsx`. No modifications to GraphPanel needed.

**Props wiring:**
```typescript
<GraphPanel
  data={graphData}          // from useSimulationPolling hook
  isLive={isSimRunning}     // true while sim status is "running"
  isPushing={graphPushing}  // from sim status graphPush.pushing
  onRefresh={pollGraph}     // from useSimulationPolling hook
/>
```

The `onRefresh` callback is a required prop — it triggers a manual graph data fetch via `getGraphData(simId)`.

## SplitPanel Modifications

The existing `SplitPanel` (`frontend/app/components/shared/SplitPanel.tsx`) uses hardcoded 50/50 widths and requires a `viewMode` prop. Two changes needed:

1. **Add optional `splitRatio` prop** — defaults to `[50, 50]`, pipeline page passes `[60, 40]`
2. **Pipeline page always uses `viewMode="split"`** — no view toggle needed (unlike the simulation page)

```typescript
interface SplitPanelProps {
  viewMode: ViewMode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  leftHeader?: React.ReactNode;
  rightHeader?: React.ReactNode;
  splitRatio?: [number, number];  // NEW — e.g. [60, 40]
}
```

Width calculation changes from hardcoded `"50%"` to `${splitRatio[0]}%` / `${splitRatio[1]}%`.

## Context Panel (Right) — Per-Step Content

The right panel is a single React component (`PipelineContextPanel`) that receives the current step state and renders different content based on which step is active.

### Step 1: Company Research (running)

```
┌─────────────────────────┐
│ RESEARCHING              │
│ Goldman Sachs            │
│ goldmansachs.com         │
│ [spinner] Researching... │
├─────────────────────────┤
│ STATUS                   │
│ ┃ Starting research...   │
│ ┃ Researching company... │
│ ┃ Research complete      │
└─────────────────────────┘
```

**Data source:** Pipeline update messages (`step: "research"`, `message` field). The status log shows the actual messages emitted by the workflow: `"Starting company research..."`, `"Researching company..."`, `"Research complete"`. These are the only messages the workflow emits for this step — no granular discovery events exist. The company URL is passed from the pipeline input.

### Step 2: Dossier Review (waiting for user)

```
┌─────────────────────────┐
│ DOSSIER SUMMARY          │
│ Industry: Financial Svcs  │
│ Employees: ~45,000        │
│ Key Systems: 2            │
│ Vendors: 12 identified    │
├─────────────────────────┤
│ ⏸ Awaiting your review   │
│ Review the dossier and    │
│ confirm to continue.      │
├─────────────────────────┤
│ [Confirm & Continue]      │
│ [Edit Dossier]            │
└─────────────────────────┘
```

**Data source:** `getDossier(projectId)` — already fetched in current pipeline page when `hookData` is set. Confirm action uses existing `POST /api/pipeline/confirm` with `hookToken`. Edit button navigates to `/research/${projectId}`.

### Steps 3-4: Threat Analysis → Scenario Selection (completed)

```
┌─────────────────────────┐
│ SELECTED SCENARIOS       │
│ ┃ The Algorithmic Leak    │
│ ┃ 45% probability         │
│ ┃                         │
│ ┃ Deepfake Settlement     │
│ ┃ 35% probability         │
└─────────────────────────┘
```

**Data source:** Scenario titles and probabilities are parsed from the pipeline update `detail` field for the `scenario_selection` completed step: `"The Algorithmic Leak (45%), The Deepfake Settlement Heist (35%)"`. Parse with regex: `/(.+?)\s*\((\d+)%\)/g`. No threat surface tags — the workflow does not emit category data, and adding an API call here would add complexity for minimal value.

### Step 5: Config Generation

Brief status card showing "Generating simulation configs..." with a spinner. Transitions quickly — usually only visible for a few seconds. Shows `"2 scenario configs ready"` from the detail field when completed.

### Step 6: Simulations (running) — THE MAIN EVENT

```
┌─────────────────────────┐
│ SIMULATION 1 OF 2        │
│ The Algorithmic Leak   ● │
│                          │
│    3        14       11  │
│  of 10    nodes    edges │
│  rounds                  │
├─────────────────────────┤
│ ACTION FEED              │
│ ┃ Red Team · Round 3     │
│ ┃ Sent spear-phishing    │
│ ┃ email to CFO           │
│ ┃                        │
│ ┃ Blue Team · Round 2    │
│ ┃ Detected anomalous     │
│ ┃ login from unusual IP  │
│ ┃                        │
│ ┃ Red Team · Round 1     │
│ ┃ OSINT recon — found    │
│ ┃ exposed S3 bucket      │
└─────────────────────────┘
```

**Data sources:**
- Simulation status: `getSimulationStatus(simId)` — provides `currentRound`, `totalRounds`, `graphPush`
- Actions feed: `getSimulationActions(simId)` — provides the `AgentAction[]` array
- Graph data: `getGraphData(simId)` — feeds the left panel's `GraphPanel`

**Polling:** Same intervals as the existing simulation page — status every 3s, actions every 3s, graph on `graphPush.version` increment.

#### SimId Extraction and Multi-Simulation Handling

The workflow runs simulations **sequentially** (see `crucible-pipeline.ts` lines 286-289: `for` loop with `await pollSimulation(simIds[i])`). The pipeline page tracks which simulation is active:

**Extraction strategy:**
1. When `simulations` step first emits `"running"` with detail `"simId1, simId2"`, parse with `detail.split(", ")` to get the full `simIds` array. Store this as `allSimIds: string[]`.
2. When subsequent updates arrive with `message` like `"Simulation 1/2 running..."` and `detail` containing a single simId, set `activeSimId` to that value.
3. `activeSimId` is what drives the simulation polling hook and graph panel.

**Transition between simulations:** When sim 1 completes and sim 2 starts:
- The `activeSimId` updates to the next simId from the pipeline update
- `graphData` resets to `{ nodes: [], edges: [] }` — the new sim's graph starts empty
- `simActions` clears — the feed shows the new sim's actions from round 1
- `graphVersion` resets to 0 — fresh version tracking for the new sim
- The `SimulationLivePanel` header updates: "SIMULATION 2 OF 2"
- No animation needed — the graph naturally rebuilds as `graphPush` events arrive

**State:**
```typescript
allSimIds: string[]               // all sim IDs, parsed from first running update
activeSimId: string | null        // currently-running sim ID
activeSimIndex: number            // 0-based index into allSimIds
```

### Steps 7-8: Reports & Comparative Analysis

```
┌─────────────────────────┐
│ SIMULATION RESULTS       │
│ ✓ The Algorithmic Leak   │
│   10 rounds · 24 nodes   │
│   Report ready           │
│                          │
│ ● Deepfake Settlement    │
│   10 rounds · 19 nodes   │
│   Generating...          │
├─────────────────────────┤
│ COMPARATIVE ANALYSIS     │
│ [spinner] Generating...  │
└─────────────────────────┘
```

**Data source:** Pipeline update messages for report generation progress. The graph area continues showing the last simulation's graph (final state from the last `activeSimId`).

### Pipeline Complete

When all steps are done, the right panel shows a completion card with a "View Comparative Report" button (existing behavior, relocated from the bottom of the old page to the right panel).

## Component Structure

```
pipeline/[runId]/page.tsx (redesigned)
├── Header
├── PipelineProgressBar              (new — thin segment bar)
├── SplitPanel                       (modified — add splitRatio prop)
│   ├── left: PipelineGraphPlaceholder (new — steps 1-5)
│   │   OR   GraphPanel              (existing — steps 6+, no changes)
│   └── right: PipelineContextPanel  (new)
│       ├── ResearchPanel            (step 1)
│       ├── DossierReviewPanel       (step 2 — extracted from current inline UI)
│       ├── ScenariosPanel           (steps 3-4)
│       ├── ConfigPanel              (step 5)
│       ├── SimulationLivePanel      (step 6 — the main event)
│       ├── ReportsPanel             (steps 7-8)
│       └── CompletionPanel          (done state)
```

### New Components

1. **`PipelineProgressBar`** — receives `steps` record and `STEP_ORDER`, renders 8 colored segments + active step text
2. **`PipelineGraphPlaceholder`** — centered company name with "Graph builds during simulation" message, shown in left panel for steps 1-5
3. **`PipelineContextPanel`** — receives all pipeline state, renders the correct sub-panel based on active step
4. **`SimulationLivePanel`** — the most complex sub-panel; displays sim status header, stats, and scrollable action feed
5. **`useSimulationPolling(simId)`** — custom hook extracted from simulation page; manages polling for status, actions, and graph data; returns `{ simStatus, simActions, graphData, graphPushing, pollGraph }`

### Modified Components

- **`SplitPanel`** — add optional `splitRatio` prop for configurable width split

### Reused Components (no changes)

- `GraphPanel` — the D3 force graph
- `GraphToolbar`, `GraphLegend`, `GraphNodeDetail` — graph controls
- `Header`, `Breadcrumbs`
- `Button` (shadcn)

## Data Flow

```
Pipeline polling (every 2s)
  └── /api/pipeline/stream?runId={runId}
      └── PipelineUpdate[] → updates step states
          ├── Drives PipelineProgressBar
          ├── Drives PipelineContextPanel (which sub-panel to show)
          ├── Extracts projectId from research step detail
          ├── Extracts hookToken from dossier_review step detail
          └── Extracts simIds from simulations step detail

Simulation polling (starts when activeSimId available, every 3s)
  ├── getSimulationStatus(activeSimId) → round, pressures, graphPush
  ├── getSimulationActions(activeSimId) → action feed for right panel
  └── getGraphData(activeSimId) → GraphPanel data for left panel
      └── Triggered by graphPush.version increment
```

No new API endpoints needed. No backend changes.

## State Management

The pipeline page manages:

```typescript
// Existing state (keep as-is)
steps: Record<string, StepState>       // from pipeline polling
hookData: { hookToken, projectId }      // for dossier confirmation
dossier: CompanyDossier                 // fetched on hook
projectId: string                       // from research detail
pipelineComplete: boolean

// New state
allSimIds: string[]                    // parsed from first simulations running update
activeSimId: string | null             // currently-running sim (from per-sim updates)
activeSimIndex: number                 // 0-based index for "SIM 1 OF 2" display

// From useSimulationPolling(activeSimId) hook
simStatus: SimulationStatus | null
simActions: AgentAction[]
graphData: GraphData
graphVersion: number
graphPushing: boolean
```

## Error Handling

- **Pipeline polling fails:** Silent retry (existing behavior). The polling interval continues.
- **Simulation polling fails:** Show error in context panel as a red banner: `"Failed to fetch simulation status"`. Continue polling — transient errors recover automatically.
- **Graph data fetch fails:** GraphPanel receives empty data, shows its natural empty state. No special error UI needed.
- **Pipeline step fails:** Progress bar segment turns red. Context panel shows error message from the failed step's `StepState.message`.

## Responsive Behavior

- **Desktop (>1024px):** Side-by-side split via SplitPanel, 60/40 ratio
- **Tablet (768-1024px):** Same split, SplitPanel handles it naturally
- **Mobile (<768px):** Override SplitPanel with `flex-col` — graph on top (50vh), panel below (scrollable). This requires a media query wrapper in the pipeline page or a minor SplitPanel enhancement.

## Files to Modify

| File | Action |
|------|--------|
| `frontend/app/pipeline/[runId]/page.tsx` | **Major rewrite** — full-width layout with split panel |
| `frontend/app/components/shared/SplitPanel.tsx` | **Minor change** — add `splitRatio` prop |
| `frontend/app/components/pipeline/PipelineProgressBar.tsx` | **New** — segment progress bar |
| `frontend/app/components/pipeline/PipelineGraphPlaceholder.tsx` | **New** — pre-sim placeholder |
| `frontend/app/components/pipeline/PipelineContextPanel.tsx` | **New** — adaptive right panel |
| `frontend/app/components/pipeline/SimulationLivePanel.tsx` | **New** — sim status + action feed |
| `frontend/app/hooks/useSimulationPolling.ts` | **New** — extracted from simulation page |

## What This Does NOT Change

- No backend changes
- No new API endpoints
- No changes to `GraphPanel`, `GraphToolbar`, `GraphLegend`, `GraphNodeDetail`
- No changes to the workflow orchestration (`crucible-pipeline.ts`)
- No changes to the simulation page (`simulation/[simId]/page.tsx`)
- The simulation page remains independently accessible for deep-dive viewing
