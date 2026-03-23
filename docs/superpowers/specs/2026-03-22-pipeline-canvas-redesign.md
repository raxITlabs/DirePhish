# Pipeline Canvas Redesign — Design Spec

**Date:** 2026-03-22
**Status:** Draft
**Replaces:** `docs/superpowers/specs/2026-03-22-pipeline-graph-hero-design.md` (split-panel approach)

## Problem

The current pipeline page uses a rigid 60/40 split panel (graph left, context right). This constrains the graph to a partial viewport, forces a fixed layout that can't adapt to user needs, and doesn't match the product vision of a war-room simulation workspace. Users can't freely arrange their view or focus on what matters.

## Solution

Replace the split panel with a **full-screen React Flow canvas** where the knowledge graph and pipeline stage cards coexist as draggable nodes. The canvas fills the entire viewport below the header. Pipeline stages appear as floating cards on the canvas. The existing sidebar pattern (floating overlay with collapse) provides navigation between stages.

## Tech Stack

- **@xyflow/react** (React Flow) — canvas, pan/zoom, draggable nodes, edges, controls, minimap
- **Existing:** `useSimulationPolling` hook, graph/simulation APIs (unchanged)
- **Removed:** D3 force simulation, `SplitPanel` (on pipeline page), `PipelineGraphPlaceholder`

---

## Data Flow

```
pipeline/[runId]/page.tsx (owns all state)
  │
  ├─ Pipeline polling: /api/pipeline/stream (2s interval)
  │   └─ steps: Record<string, StepState>
  │       └─ Drives stage card nodes (status, content, auto-expand)
  │
  ├─ useSimulationPolling(activeSimId)
  │   ├─ simStatus → stage card "Simulation" content
  │   ├─ simActions → action feed in Simulation card
  │   └─ graphData → useGraphLayout → React Flow graph nodes/edges
  │
  └─ PipelineCanvas receives:
      ├─ stageNodes: Node[] (from steps state)
      ├─ graphNodes: Node[] (from useGraphLayout)
      ├─ graphEdges: Edge[] (from useGraphLayout)
      └─ expandedStageId: string (from auto-expand logic)
```

The page component owns both polling loops and passes data down. `PipelineCanvas` is a pure rendering component.

---

## Architecture

### Layout

```
┌──────────────────────────────────────────────────┐
│ DirePhish [Alpha]                                │ GlobalHeader
│ by raxIT Labs                                    │
├──────┬───────────────────────────────────────────┤
│ Side │                                           │
│ bar  │        React Flow Canvas                  │
│      │     (full viewport, pan/zoom)             │
│ Stg1 │                                           │
│ Stg2 │   [Stage Card]    ○──○──○                 │
│ Stg3 │                    \ | /                  │
│ ...  │                     ○─○                   │
│  ‹   │              [Node Detail]                │
│      │                                           │
│      │                        [+] [-] [⊡] [map] │ Controls
└──────┴───────────────────────────────────────────┘
```

- **GlobalHeader** — fixed at top (existing, unchanged)
- **AppSidebar** — floating overlay at z-20 (existing shell, new pipeline content)
- **React Flow canvas** — `absolute inset-0` fills the content area below header
- **Controls** — bottom-right: zoom +/-, fit-to-view, minimap toggle

### Two Node Types on the Canvas

**1. Graph nodes** — knowledge graph entities (people, orgs, systems, threats)
- Custom React Flow node component styled with type-based colors
- Edges rendered by React Flow (replacing D3 SVG paths)
- Positioned via auto-layout (dagre/elkjs), user-draggable
- Click → anchored detail card appears nearby

**2. Stage cards** — pipeline stage panels (Research, Dossier, Simulation, etc.)
- Custom React Flow node component styled as floating cards
- Two states: collapsed (pill) and expanded (full content)
- Positioned in a vertical column on the left area of canvas by default
- User-draggable to any position

---

## Stage Cards

### States

| State | Visual | Content |
|-------|--------|---------|
| **Collapsed** | Small pill: status icon + name | `✓ Research` or `◉ Simulation` or `○ Reports` |
| **Expanded** | Full card with stage-specific content | Varies by stage (see below) |

### Auto-expand Rules

1. The currently active stage auto-expands when it starts running
2. When a stage completes, its card collapses and the next stage auto-expands
3. User can manually expand/collapse any stage by clicking
4. Only one card expanded at a time — expanding one collapses the previously expanded

### Stage Content (when expanded)

| Stage | Expanded Content |
|-------|------------------|
| Research | Research log entries, company URL |
| Dossier Review | Dossier summary, "Confirm & Continue" button |
| Threat Analysis | Loading spinner while running, results when done |
| Scenario Selection | Scenario titles with probability percentages |
| Config Generation | Generation status |
| Simulations | **Live panel:** round counter, node/edge counts, scrollable action feed (red team vs defense), "Live" pulse indicator |
| Reports | Generation status or link to view report |
| Comparative | Link to comparative report page |

### Default Positions

Stage cards start in a vertical column at approximately `x: 50, y: 50 + (index * 60)` when collapsed. Graph nodes populate the center-right area. "Recenter" / fit-to-view resets to this default layout.

---

## Sidebar

### Routing Strategy

`AppSidebar` becomes a client component that uses `usePathname()` to switch its own content internally. The root `layout.tsx` renders `<AppSidebar />` once — no route-based children injection needed from the server layout.

```tsx
// AppSidebar.tsx (client component)
export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="absolute top-0 left-0 w-[17rem] ...">
      <div className="bg-sidebar rounded-xl ...">
        {pathname.startsWith('/pipeline/') ? (
          <PipelineStagesContent />
        ) : (
          <RunHistoryContent />
        )}
      </div>
    </aside>
  );
}
```

Simulation data for run history and pipeline step data are fetched inside each content component (or received via context), not passed as props from the server layout. This eliminates the server-component routing problem.

### Pipeline Page: Remove Duplicate Header

The current `pipeline/[runId]/page.tsx` renders its own `<Header />` and `<Breadcrumbs>`. These must be removed — the root layout's `GlobalHeader` is the only header. Breadcrumb info (pipeline name) moves into the sidebar's pipeline content area as a title.

### Pipeline Sidebar Content

- Thin progress bar at top showing overall completion
- List of 8 stages, each showing:
  - Status icon: `✓` completed, `◉` active (highlighted in primary), `○` pending, `✗` failed
  - Stage name
  - Duration (if completed)
- Click a stage → canvas pans to that stage's card via `fitView({ nodes: [stageNodeId] })` and expands it

---

## Graph Node Migration (D3 → React Flow)

### What Changes

| Current (D3) | New (React Flow) |
|---------------|-------------------|
| `d3.forceSimulation()` | React Flow node positioning + auto-layout |
| SVG `<circle>` elements | Custom React Flow node component |
| SVG `<path>` edges with Bezier curves | React Flow `<Edge>` with custom styling |
| Manual drag via D3 drag behavior | React Flow built-in drag |
| Manual pan/zoom via D3 zoom | React Flow built-in viewport |
| `GraphPanel.tsx` (single component) | `PipelineCanvas.tsx` + `GraphNode.tsx` + `StageCard.tsx` |

### What Stays

- `useSimulationPolling` hook — unchanged, still polls status/actions/graph
- `getGraphData()` API — still returns `{ nodes: GraphNode[], edges: GraphEdge[] }`
- Node type colors: agent (blue), org (orange), threat (red), compliance (purple), system (green), event (yellow), location (cyan), document (pink), process (violet)
- Graph data shape: `GraphNode` and `GraphEdge` types unchanged

### Data Mapping

```typescript
// GraphNode → React Flow Node
function toFlowNode(gn: GraphNode): Node {
  return {
    id: gn.id,
    type: 'graphEntity',          // custom node type
    position: layoutPosition(gn), // from auto-layout
    data: {
      name: gn.name,
      entityType: gn.type,
      attributes: gn.attributes,
      summary: gn.summary,
    },
  };
}

// GraphEdge → React Flow Edge
function toFlowEdge(ge: GraphEdge): Edge {
  return {
    id: ge.uuid || `${ge.source}-${ge.target}-${ge.label}-${Math.random().toString(36).slice(2, 6)}`,
    source: ge.source,
    target: ge.target,
    label: ge.label,
    type: 'smoothstep',
    animated: ge.type === 'action',
  };
}
```

### Layout Strategy

Use `dagre` for automatic graph layout. Handle incremental updates during simulation:

1. Maintain a `pinnedPositions: Map<string, {x, y}>` in `useGraphLayout`
2. When user drags a node, add it to `pinnedPositions`
3. On each graph data update from polling:
   - Detect new nodes (IDs not in previous set)
   - Run dagre on the full graph to get positions for new nodes
   - For pinned nodes, override dagre positions with pinned positions
   - For existing non-pinned nodes, keep their current positions (don't re-layout)
   - Only new nodes get dagre-computed positions
4. "Recenter" button clears `pinnedPositions` and runs full dagre layout

---

## Node Detail

Clicking a graph node opens a **detail panel** as a React Flow `<Panel>` (absolutely positioned overlay), not a canvas node. This avoids polluting the node array, layout calculations, and minimap.

Content:
- Node name, type, type-color badge
- Summary (if available)
- Attributes table
- Connected edges list (clickable)
- Close button (or click elsewhere to dismiss)

Positioned in the top-right of the canvas viewport (like the current `GraphNodeDetail`). This replaces the current fixed-position panel with the same visual treatment.

---

## Controls & Interactions

### Canvas Controls (bottom-right)

- **Zoom +/-** — React Flow `<Controls />`
- **Fit to view** — `fitView()` shows all nodes and cards
- **Minimap** — React Flow `<MiniMap />` (toggleable)

### Stage Card Interactions

| Action | Result |
|--------|--------|
| Click stage in sidebar | Canvas pans to card, card expands |
| Click collapsed card on canvas | Card expands |
| Click expanded card's collapse button | Card collapses to pill |
| Drag card | Freely repositions on canvas |

### Graph Node Interactions

| Action | Result |
|--------|--------|
| Click node | Detail card appears anchored nearby |
| Click edge | Edge detail tooltip |
| Drag node | Repositions freely |
| Double-click node | fitView to node's 1-hop neighborhood |

### Keyboard

| Key | Action |
|-----|--------|
| `0` (when canvas focused) | Fit to view / recenter |
| `Escape` | Collapse open card, close detail panel |

---

## Empty, Loading & Error States

### Initial state (pipeline just started)
- Stage cards appear immediately in their default column (all collapsed, first one expanding)
- Graph area is empty — a subtle centered label reads "Graph builds during simulation" (same message as current placeholder, but as a React Flow `<Panel>` that disappears when first node arrives)

### Loading
- Stage cards show inline loading spinners when their stage is running (already defined in stage content table)
- No full-page loading spinner — the canvas is always interactive

### Errors
- Pipeline polling failure → toast notification at top of canvas (React Flow `<Panel position="top-center">`)
- Simulation error → the Simulation stage card shows error state with red border and error message
- Stage failure → stage card shows `✗` icon with red text, card auto-expands to show the error

---

## Graph Toolbar & Filtering

The current `GraphPanel` has search, type filtering, edge filtering, and label toggle via `GraphToolbar`. These features carry forward as a React Flow `<Panel position="top-center">`:

- **Search** — text input that highlights matching nodes (dims non-matches)
- **Type filter** — toggle chips for node types (agent, org, threat, etc.)
- **Label toggle** — show/hide node and edge labels
- **Legend** — React Flow `<Panel position="bottom-left">` showing node type colors with counts

The toolbar panel is collapsible (small toggle button when collapsed) to maximize canvas space.

---

## Mobile

On screens below `md` breakpoint:
- Sidebar is hidden (existing `hidden md:block` behavior)
- React Flow canvas fills the viewport with touch gestures (pan, pinch-zoom — built-in)
- Stage cards are still visible and tappable on the canvas
- Controls (zoom, fit-to-view) remain in bottom-right
- Toolbar is hidden; filtering is deferred to desktop

Mobile is a functional but simplified experience. Full canvas interaction is desktop-first.

---

## Files

### New

| File | Purpose |
|------|---------|
| `components/pipeline/PipelineCanvas.tsx` | React Flow canvas wrapper, manages node types, viewport |
| `components/pipeline/nodes/StageCardNode.tsx` | Custom node: collapsed pill / expanded stage content |
| `components/pipeline/nodes/GraphEntityNode.tsx` | Custom node: knowledge graph entity circle |
| `components/pipeline/panels/NodeDetailPanel.tsx` | Overlay panel for clicked entity detail (React Flow Panel) |
| `components/pipeline/panels/GraphToolbarPanel.tsx` | Search, type filter, label toggle (React Flow Panel) |
| `components/pipeline/PipelineStagesContent.tsx` | Sidebar content for pipeline page (stage list) |
| `components/home/RunHistoryContent.tsx` | Sidebar content for home page (extracted from AppSidebar) |
| `components/pipeline/useGraphLayout.ts` | Hook: maps GraphData → React Flow nodes/edges with auto-layout |

### Modified

| File | Change |
|------|--------|
| `pipeline/[runId]/page.tsx` | Rewrite: remove Header/Breadcrumbs, replace SplitPanel with PipelineCanvas |
| `components/layout/AppSidebar.tsx` | Refactor: use `usePathname()` to switch between RunHistoryContent and PipelineStagesContent internally |
| `layout.tsx` | Simplify: render `<AppSidebar />` with no props (it fetches its own data) |

### Removed (from pipeline page usage)

| File | Reason |
|------|--------|
| `SplitPanel` usage in pipeline | Replaced by full-screen canvas |
| `PipelineGraphPlaceholder` | Stage cards replace the placeholder |
| `GraphPanel` (D3-based) | Replaced by React Flow canvas |
| D3 imports in pipeline | React Flow handles rendering |

**Note:** `SplitPanel`, `GraphPanel`, and D3 may still be used on other pages (simulation, report). Only the pipeline page changes.

---

## Migration Safety

- The `simulation/[simId]/page.tsx` and `report/[simId]/page.tsx` pages still use `SplitPanel` + `GraphPanel` (D3). Those are NOT changed in this spec.
- `useSimulationPolling` hook is shared and unchanged.
- No API changes. No backend changes.
- `AppSidebar` refactoring: the existing run history rendering moves into `RunHistoryContent.tsx` — a pure extraction, no behavior change. Home page sidebar looks identical.
- Pipeline page removes its own `<Header />` and `<Breadcrumbs>` — relies on root layout's `GlobalHeader`. Other pages that use `<Header />` are NOT changed (they still render it, which produces a separator — acceptable until those pages are migrated to the canvas pattern too).

---

## Dependencies

```bash
npm install @xyflow/react dagre @types/dagre
```

---

## Verification

1. `pnpm build` — no TypeScript errors
2. Pipeline page loads with React Flow canvas filling viewport
3. Stage cards appear as collapsed pills on the left
4. Active stage auto-expands with correct content
5. Clicking stage in sidebar pans canvas and expands card
6. Graph nodes appear during simulation with proper colors and edges
7. All nodes and cards are draggable
8. Fit-to-view button recenters everything
9. Sidebar collapses/expands (same as home page)
10. Home page sidebar still shows run history (no regression)
11. Simulation and report pages still work with SplitPanel (no regression)
