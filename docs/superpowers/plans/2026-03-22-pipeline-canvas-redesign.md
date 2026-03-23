# Pipeline Canvas Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pipeline page's split-panel layout with a full-screen @xyflow/react canvas where the knowledge graph and pipeline stage cards coexist as draggable nodes.

**Architecture:** Install @xyflow/react + dagre. Extract AppSidebar into a content-agnostic shell. Build custom React Flow node types for graph entities and stage cards. Build a layout hook that maps API graph data to React Flow nodes/edges with dagre auto-layout. Rewrite the pipeline page to render PipelineCanvas instead of SplitPanel.

**Tech Stack:** Next.js 16, @xyflow/react, dagre, TypeScript, Tailwind CSS

---

### Task 1: Install dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install @xyflow/react and dagre**

```bash
cd frontend && npm install @xyflow/react dagre @types/dagre
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: PASS — no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @xyflow/react and dagre dependencies"
```

---

### Task 2: Extract AppSidebar into content-agnostic shell

**Files:**
- Create: `frontend/app/components/home/RunHistoryContent.tsx`
- Modify: `frontend/app/components/layout/AppSidebar.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create RunHistoryContent.tsx**

Extract the run history rendering from AppSidebar into its own component. This is a pure extraction — the JSX moves, nothing changes visually.

```tsx
// frontend/app/components/home/RunHistoryContent.tsx
"use client";

import type { SimulationSummary } from "@/app/types";

interface RunHistoryContentProps {
  simulations: SimulationSummary[];
}

function getSimHref(sim: SimulationSummary) {
  return sim.status === "completed" ? `/report/${sim.simId}` : `/simulation/${sim.simId}`;
}

function isRunning(status: string) {
  return status === "running" || status === "starting";
}

export default function RunHistoryContent({ simulations }: RunHistoryContentProps) {
  if (simulations.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-sidebar-foreground/50 font-mono">No runs yet</p>
        <p className="text-xs text-sidebar-foreground/30 font-mono mt-1">
          Start an analysis to see history here
        </p>
      </div>
    );
  }

  return (
    <nav className="space-y-6">
      <div>
        <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-sidebar-foreground/50 px-3 mb-2">
          Recent
        </h3>
        <ul className="space-y-0.5">
          {simulations.slice(0, 3).map((sim, index) => (
            <li key={sim.simId}>
              <a
                href={getSimHref(sim)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isRunning(sim.status)
                    ? "text-sidebar-primary bg-sidebar-accent font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <span className="text-[13px]">
                  {isRunning(sim.status) ? "◉" : sim.status === "completed" ? "✓" : "○"}
                </span>
                <span className="font-mono text-sm tracking-tight">Run {index + 1}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      {simulations.length > 3 && (
        <div>
          <h3 className="font-mono uppercase text-[10.5px] tracking-widest text-sidebar-foreground/50 px-3 mb-2">
            Past Runs
          </h3>
          <ul className="space-y-0.5">
            {simulations.slice(3, 8).map((sim, index) => (
              <li key={sim.simId}>
                <a
                  href={getSimHref(sim)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <span className="text-[13px]">○</span>
                  <span className="font-mono text-sm tracking-tight">Run {index + 4}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Refactor AppSidebar to use usePathname and render children**

```tsx
// frontend/app/components/layout/AppSidebar.tsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import RunHistoryContent from "@/app/components/home/RunHistoryContent";
import PipelineStagesContent from "@/app/components/pipeline/PipelineStagesContent";
import { listSimulations } from "@/app/actions/simulation";

export default function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Determine which content to show based on route
  const isPipeline = pathname.startsWith("/pipeline/");

  return (
    <aside
      className={`absolute top-0 left-0 h-full p-2 z-20 hidden md:flex flex-col transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-12" : "w-[17rem]"
      }`}
    >
      <div className="bg-sidebar rounded-xl border border-sidebar-border flex-1 overflow-hidden flex flex-col">
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-2">
            {isPipeline ? <PipelineStagesContent /> : <SidebarRunHistory />}
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 flex items-center justify-center py-2 border-t border-sidebar-border text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>
    </aside>
  );
}

// Internal component that fetches its own data
function SidebarRunHistory() {
  // Note: This uses a client-side fetch pattern since AppSidebar is now a client component
  // and can't receive server-fetched data as props from layout.tsx
  const [simulations, setSimulations] = useState<import("@/app/types").SimulationSummary[]>([]);
  const { useEffect } = require("react");

  useEffect(() => {
    listSimulations().then((result) => {
      if ("data" in result) setSimulations(result.data);
    });
  }, []);

  return <RunHistoryContent simulations={simulations} />;
}
```

**Note:** The `SidebarRunHistory` wrapper handles the data-fetching gap — since AppSidebar is now a client component using `usePathname()`, it can't receive server-fetched simulations as a prop from the server layout. The `listSimulations` server action works fine when called from a client component.

- [ ] **Step 3: Simplify layout.tsx — remove simulations prop**

Remove the `listSimulations` call and `simulations` prop from layout.tsx. AppSidebar now fetches its own data.

```tsx
// layout.tsx changes:
// Remove: import { listSimulations } from "@/app/actions/simulation";
// Remove: const result = await listSimulations();
// Remove: const simulations = "data" in result ? result.data : [];
// Change: <AppSidebar simulations={simulations} /> → <AppSidebar />
```

- [ ] **Step 4: Create stub PipelineStagesContent**

```tsx
// frontend/app/components/pipeline/PipelineStagesContent.tsx
"use client";

export default function PipelineStagesContent() {
  return (
    <div className="px-4 py-4 text-center">
      <p className="text-sm text-sidebar-foreground/50 font-mono">Pipeline stages</p>
      <p className="text-xs text-sidebar-foreground/30 font-mono mt-1">Coming soon</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify build + home page regression**

```bash
pnpm build
```

Expected: PASS. Home page sidebar still shows run history. Pipeline page sidebar shows stub.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/components/home/RunHistoryContent.tsx \
        frontend/app/components/layout/AppSidebar.tsx \
        frontend/app/components/pipeline/PipelineStagesContent.tsx \
        frontend/app/layout.tsx
git commit -m "refactor: extract AppSidebar into content-agnostic shell with route-based content switching"
```

---

### Task 3: Build GraphEntityNode custom React Flow node

**Files:**
- Create: `frontend/app/components/pipeline/nodes/GraphEntityNode.tsx`

- [ ] **Step 1: Create GraphEntityNode component**

Custom React Flow node that renders a knowledge graph entity as a colored circle with initials and label.

```tsx
// frontend/app/components/pipeline/nodes/GraphEntityNode.tsx
"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const TYPE_COLORS: Record<string, string> = {
  agent: "#3b82f6",
  org: "#f97316",
  threat: "#ef4444",
  compliance: "#a855f7",
  system: "#22c55e",
  event: "#eab308",
  location: "#06b6d4",
  document: "#ec4899",
  process: "#8b5cf6",
  default: "#6b7280",
};

export interface GraphEntityData {
  name: string;
  entityType: string;
  attributes: Record<string, unknown>;
  summary?: string;
}

function GraphEntityNode({ data }: NodeProps) {
  const d = data as GraphEntityData;
  const color = TYPE_COLORS[d.entityType] || TYPE_COLORS.default;
  const initials = d.name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="flex flex-col items-center gap-1 cursor-pointer">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-mono font-bold shadow-sm"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground max-w-[80px] truncate text-center">
          {d.name}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

export default memo(GraphEntityNode);
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/nodes/GraphEntityNode.tsx
git commit -m "feat(pipeline): add GraphEntityNode custom React Flow node"
```

---

### Task 4: Build StageCardNode custom React Flow node

**Files:**
- Create: `frontend/app/components/pipeline/nodes/StageCardNode.tsx`

- [ ] **Step 1: Create StageCardNode component**

Custom React Flow node with collapsed (pill) and expanded (full card) states.

```tsx
// frontend/app/components/pipeline/nodes/StageCardNode.tsx
"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SimulationStatus, AgentAction } from "@/app/types";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface StageCardData {
  stageId: string;
  label: string;
  status: StepStatus;
  message?: string;
  detail?: string;
  durationMs?: number;
  expanded: boolean;
  onToggle: (stageId: string) => void;
  // Simulation-specific (only for simulations stage)
  simStatus?: SimulationStatus | null;
  simActions?: AgentAction[];
  // Dossier-specific
  onConfirmDossier?: () => void;
  confirming?: boolean;
  dossierSummary?: string;
}

const STATUS_ICON: Record<StepStatus, string> = {
  completed: "✓",
  running: "◉",
  failed: "✗",
  pending: "○",
  skipped: "○",
};

const STATUS_COLOR: Record<StepStatus, string> = {
  completed: "text-verdigris-600",
  running: "text-primary",
  failed: "text-destructive",
  pending: "text-muted-foreground/40",
  skipped: "text-muted-foreground/30",
};

function StageCardNode({ data }: NodeProps) {
  const d = data as StageCardData;

  if (!d.expanded) {
    // Collapsed pill
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/20 shadow-sm cursor-pointer hover:border-border/40 transition-colors font-mono text-xs ${
          d.status === "running" ? "border-primary/30 bg-primary/5" : ""
        }`}
        onClick={() => d.onToggle(d.stageId)}
      >
        <span className={STATUS_COLOR[d.status]}>{STATUS_ICON[d.status]}</span>
        <span className="text-foreground/80">{d.label}</span>
        {d.status === "running" && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot ml-1" />
        )}
      </div>
    );
  }

  // Expanded card
  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="w-[320px] bg-card rounded-xl border border-border/20 shadow-md overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border/10 cursor-pointer"
          onClick={() => d.onToggle(d.stageId)}
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm ${STATUS_COLOR[d.status]}`}>{STATUS_ICON[d.status]}</span>
            <span className="font-mono text-sm font-medium text-foreground">{d.label}</span>
          </div>
          {d.status === "running" && (
            <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
              Live
            </span>
          )}
          {d.durationMs && d.status === "completed" && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {(d.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {/* Content */}
        <div className="px-4 py-3 max-h-[300px] overflow-y-auto">
          <StageContent data={d} />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

function StageContent({ data }: { data: StageCardData }) {
  const d = data;

  // Simulation live panel
  if (d.stageId === "simulations" && d.simStatus) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono">{d.simStatus.currentRound}/{d.simStatus.totalRounds}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Round</div>
          </div>
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono">{d.simStatus.actionCount}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Actions</div>
          </div>
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono">{d.simStatus.status === "running" ? "◉" : "○"}</div>
            <div className="text-[9px] font-mono text-muted-foreground uppercase">Status</div>
          </div>
        </div>
        {d.simActions && d.simActions.length > 0 && (
          <div className="space-y-1 max-h-[150px] overflow-y-auto">
            {[...d.simActions].reverse().slice(0, 10).map((a, i) => (
              <div
                key={i}
                className={`text-[10px] font-mono px-2 py-1 rounded ${
                  a.role === "red_team" ? "bg-burnt-peach-50 text-burnt-peach-700" : "bg-verdigris-50 text-verdigris-700"
                }`}
              >
                <span className="font-semibold">{a.agent}:</span> {a.action}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Dossier review
  if (d.stageId === "dossier_review" && d.dossierSummary) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">{d.dossierSummary}</p>
        {d.onConfirmDossier && (
          <button
            onClick={d.onConfirmDossier}
            disabled={d.confirming}
            className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-xs font-mono font-medium disabled:opacity-40"
          >
            {d.confirming ? "Confirming..." : "Confirm & Continue"}
          </button>
        )}
      </div>
    );
  }

  // Default: show message/detail
  if (d.status === "running") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-muted-foreground">{d.message || "Processing..."}</span>
      </div>
    );
  }

  if (d.status === "failed") {
    return <p className="text-xs font-mono text-destructive">{d.message || "Stage failed"}</p>;
  }

  if (d.status === "completed") {
    return <p className="text-xs font-mono text-muted-foreground">{d.message || "Completed"}</p>;
  }

  return <p className="text-xs font-mono text-muted-foreground/50">Waiting...</p>;
}

export default memo(StageCardNode);
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/nodes/StageCardNode.tsx
git commit -m "feat(pipeline): add StageCardNode custom React Flow node with collapsed/expanded states"
```

---

### Task 5: Build useGraphLayout hook

**Files:**
- Create: `frontend/app/components/pipeline/useGraphLayout.ts`

- [ ] **Step 1: Create the hook**

Maps `GraphData` from the API to React Flow `Node[]` and `Edge[]` with dagre auto-layout and pinned position support.

```tsx
// frontend/app/components/pipeline/useGraphLayout.ts
"use client";

import { useCallback, useRef, useMemo } from "react";
import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import type { GraphEntityData } from "./nodes/GraphEntityNode";

const GRAPH_OFFSET_X = 350; // offset graph nodes right of stage cards

function toFlowEdge(ge: GraphEdge, index: number): Edge {
  return {
    id: ge.uuid || `e-${ge.source}-${ge.target}-${index}`,
    source: ge.source,
    target: ge.target,
    label: ge.label,
    type: "smoothstep",
    animated: ge.type === "action",
    style: { stroke: "#888", strokeWidth: 1 },
    labelStyle: { fontSize: 9, fontFamily: "monospace" },
  };
}

export function useGraphLayout(graphData: GraphData) {
  const pinnedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const prevNodeIds = useRef<Set<string>>(new Set());

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    pinnedPositions.current.set(node.id, { x: node.position.x, y: node.position.y });
  }, []);

  const resetLayout = useCallback(() => {
    pinnedPositions.current.clear();
  }, []);

  const { nodes, edges } = useMemo(() => {
    const apiNodes = graphData.nodes;
    const apiEdges = graphData.edges;

    if (apiNodes.length === 0) {
      prevNodeIds.current = new Set();
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    // Detect new nodes
    const currentIds = new Set(apiNodes.map((n) => n.id));
    const newIds = new Set<string>();
    for (const id of currentIds) {
      if (!prevNodeIds.current.has(id)) newIds.add(id);
    }

    // Run dagre for new node positions
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 80 });

    for (const node of apiNodes) {
      g.setNode(node.id, { width: 60, height: 60 });
    }
    for (const edge of apiEdges) {
      g.setEdge(edge.source, edge.target);
    }
    dagre.layout(g);

    // Map to React Flow nodes
    const flowNodes: Node[] = apiNodes.map((gn: GraphNode) => {
      const pinned = pinnedPositions.current.get(gn.id);
      const dagreNode = g.node(gn.id);

      let position: { x: number; y: number };
      if (pinned) {
        position = pinned;
      } else if (newIds.has(gn.id) || prevNodeIds.current.size === 0) {
        // New node or first render: use dagre position
        position = { x: (dagreNode?.x || 0) + GRAPH_OFFSET_X, y: dagreNode?.y || 0 };
      } else {
        // Existing non-pinned node: keep current position (don't re-layout)
        // We'll rely on React Flow preserving position via node id stability
        position = { x: (dagreNode?.x || 0) + GRAPH_OFFSET_X, y: dagreNode?.y || 0 };
      }

      const data: GraphEntityData = {
        name: gn.name,
        entityType: gn.type,
        attributes: gn.attributes,
        summary: gn.summary,
      };

      return {
        id: gn.id,
        type: "graphEntity",
        position,
        data,
      };
    });

    const flowEdges: Edge[] = apiEdges.map((ge: GraphEdge, i: number) => toFlowEdge(ge, i));

    prevNodeIds.current = currentIds;

    return { nodes: flowNodes, edges: flowEdges };
  }, [graphData]);

  return { nodes, edges, onNodeDragStop, resetLayout };
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/useGraphLayout.ts
git commit -m "feat(pipeline): add useGraphLayout hook for dagre-based React Flow layout"
```

---

### Task 6: Build PipelineCanvas component

**Files:**
- Create: `frontend/app/components/pipeline/PipelineCanvas.tsx`

- [ ] **Step 1: Create PipelineCanvas**

The main canvas component that renders React Flow with custom node types, controls, minimap, and panels.

```tsx
// frontend/app/components/pipeline/PipelineCanvas.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import GraphEntityNode from "./nodes/GraphEntityNode";
import StageCardNode from "./nodes/StageCardNode";
import type { StageCardData } from "./nodes/StageCardNode";
import type { GraphData, GraphNode as GNode, GraphEdge as GEdge, SimulationStatus, AgentAction } from "@/app/types";
import { useGraphLayout } from "./useGraphLayout";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineCanvasProps {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
  graphData: GraphData;
  expandedStageId: string | null;
  onToggleStage: (stageId: string) => void;
  // Simulation-specific
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  // Dossier-specific
  dossierSummary?: string;
  onConfirmDossier?: () => void;
  confirming?: boolean;
  // Selected node detail
  selectedNode: GNode | null;
  onSelectNode: (node: GNode | null) => void;
  // Error
  error: string | null;
}

const nodeTypes = {
  graphEntity: GraphEntityNode,
  stageCard: StageCardNode,
};

export default function PipelineCanvas({
  steps,
  stepOrder,
  graphData,
  expandedStageId,
  onToggleStage,
  simStatus,
  simActions,
  dossierSummary,
  onConfirmDossier,
  confirming,
  selectedNode,
  onSelectNode,
  error,
}: PipelineCanvasProps) {
  const { nodes: graphNodes, edges: graphEdges, onNodeDragStop, resetLayout } = useGraphLayout(graphData);

  // Build stage card nodes
  const stageNodes: Node[] = useMemo(
    () =>
      stepOrder.map((step, index) => {
        const state = steps[step.id];
        const data: StageCardData = {
          stageId: step.id,
          label: step.label,
          status: state?.status || "pending",
          message: state?.message,
          detail: state?.detail,
          durationMs: state?.durationMs,
          expanded: expandedStageId === step.id,
          onToggle: onToggleStage,
          simStatus: step.id === "simulations" ? simStatus : undefined,
          simActions: step.id === "simulations" ? simActions : undefined,
          dossierSummary: step.id === "dossier_review" ? dossierSummary : undefined,
          onConfirmDossier: step.id === "dossier_review" ? onConfirmDossier : undefined,
          confirming: step.id === "dossier_review" ? confirming : undefined,
        };

        return {
          id: `stage-${step.id}`,
          type: "stageCard",
          position: { x: 50, y: 50 + index * (expandedStageId === step.id ? 200 : 50) },
          data,
          draggable: true,
        };
      }),
    [stepOrder, steps, expandedStageId, onToggleStage, simStatus, simActions, dossierSummary, onConfirmDossier, confirming]
  );

  const allNodes = useMemo(() => [...stageNodes, ...graphNodes], [stageNodes, graphNodes]);

  // Handle node clicks for graph entity detail
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "graphEntity") {
        const gn = graphData.nodes.find((n) => n.id === node.id);
        onSelectNode(gn || null);
      }
    },
    [graphData.nodes, onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={allNodes}
        edges={graphEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-right"
          style={{ marginBottom: 50 }}
          nodeColor={(node) => {
            if (node.type === "stageCard") return "var(--color-primary)";
            return "#6b7280";
          }}
        />

        {/* Empty state */}
        {graphData.nodes.length === 0 && (
          <Panel position="top-center">
            <div className="mt-20 text-center">
              <p className="text-sm font-mono text-muted-foreground/40">
                Graph builds during simulation
              </p>
            </div>
          </Panel>
        )}

        {/* Error toast */}
        {error && (
          <Panel position="top-center">
            <div className="mt-4 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono">
              {error}
            </div>
          </Panel>
        )}

        {/* Node detail panel */}
        {selectedNode && (
          <Panel position="top-right">
            <div className="w-[280px] bg-card rounded-xl border border-border/20 shadow-lg p-4 mt-4 mr-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-mono text-sm font-semibold">{selectedNode.name}</h3>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">{selectedNode.type}</span>
                </div>
                <button
                  onClick={() => onSelectNode(null)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              </div>
              {selectedNode.summary && (
                <p className="text-xs font-mono text-muted-foreground mb-3 leading-relaxed">{selectedNode.summary}</p>
              )}
              {Object.keys(selectedNode.attributes).length > 0 && (
                <div className="space-y-1">
                  {Object.entries(selectedNode.attributes).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-foreground truncate max-w-[150px]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/PipelineCanvas.tsx
git commit -m "feat(pipeline): add PipelineCanvas React Flow component with stage cards, graph nodes, and panels"
```

---

### Task 7: Build PipelineStagesContent sidebar component

**Files:**
- Modify: `frontend/app/components/pipeline/PipelineStagesContent.tsx`

- [ ] **Step 1: Replace stub with full implementation**

The pipeline sidebar content component. Receives step data via React context (set by the pipeline page) and renders the stage list with click-to-navigate.

```tsx
// frontend/app/components/pipeline/PipelineStagesContent.tsx
"use client";

import { createContext, useContext } from "react";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  durationMs?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineContextValue {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
  onStageClick: (stageId: string) => void;
}

export const PipelineContext = createContext<PipelineContextValue | null>(null);

const STATUS_ICON: Record<StepStatus, string> = {
  completed: "✓",
  running: "◉",
  failed: "✗",
  pending: "○",
  skipped: "○",
};

export default function PipelineStagesContent() {
  const ctx = useContext(PipelineContext);

  if (!ctx) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-sidebar-foreground/50 font-mono">Pipeline stages</p>
      </div>
    );
  }

  const { steps, stepOrder, onStageClick } = ctx;
  const completedCount = stepOrder.filter((s) => steps[s.id]?.status === "completed").length;
  const progress = stepOrder.length > 0 ? (completedCount / stepOrder.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="px-3">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stage list */}
      <ul className="space-y-0.5">
        {stepOrder.map((step) => {
          const state = steps[step.id];
          const status = state?.status || "pending";
          const isActive = status === "running";

          return (
            <li key={step.id}>
              <button
                onClick={() => onStageClick(step.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  isActive
                    ? "text-sidebar-primary bg-sidebar-accent font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <span className={`text-[13px] ${status === "failed" ? "text-destructive" : isActive ? "text-primary" : status === "completed" ? "text-verdigris-600" : "text-muted-foreground/40"}`}>
                  {STATUS_ICON[status]}
                </span>
                <span className="font-mono text-xs tracking-tight flex-1">{step.label}</span>
                {state?.durationMs && status === "completed" && (
                  <span className="text-[10px] font-mono text-muted-foreground/40">
                    {(state.durationMs / 1000).toFixed(0)}s
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/PipelineStagesContent.tsx
git commit -m "feat(pipeline): implement PipelineStagesContent sidebar with progress bar and stage list"
```

---

### Task 8: Rewrite pipeline page

**Files:**
- Modify: `frontend/app/pipeline/[runId]/page.tsx`

- [ ] **Step 1: Rewrite the pipeline page**

Remove Header, Breadcrumbs, SplitPanel. Replace with PipelineCanvas. Add PipelineContext provider for sidebar. Keep existing polling logic.

Key changes:
- Remove imports: `Header`, `Breadcrumbs`, `SplitPanel`, `GraphPanel`, `PipelineGraphPlaceholder`, `PipelineContextPanel`, `PipelineProgressBar`
- Add imports: `PipelineCanvas`, `PipelineContext` from `PipelineStagesContent`
- Keep: `useSimulationPolling`, all state management, polling useEffect
- Add: `expandedStageId` state with auto-expand logic
- Add: `selectedNode` state for graph entity detail
- Add: `useReactFlow` for `fitView` on sidebar stage click
- Wrap in `PipelineContext.Provider` so sidebar can access steps
- Render `PipelineCanvas` as the sole child (fills viewport)

The page structure becomes:

```tsx
<PipelineContext.Provider value={{ steps, stepOrder: STEP_ORDER, onStageClick }}>
  <div className="h-full">
    <PipelineCanvas
      steps={steps}
      stepOrder={STEP_ORDER}
      graphData={graphData}
      expandedStageId={expandedStageId}
      onToggleStage={handleToggleStage}
      simStatus={simStatus}
      simActions={simActions}
      dossierSummary={dossier?.company?.name}
      onConfirmDossier={handleConfirmDossier}
      confirming={confirming}
      selectedNode={selectedNode}
      onSelectNode={setSelectedNode}
      error={error || simError}
    />
  </div>
</PipelineContext.Provider>
```

Auto-expand logic (add as useEffect):
```tsx
const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

// Auto-expand active stage
useEffect(() => {
  const activeStep = STEP_ORDER.find((s) => steps[s.id]?.status === "running");
  if (activeStep) {
    setExpandedStageId(activeStep.id);
  }
}, [steps]);

const handleToggleStage = useCallback((stageId: string) => {
  setExpandedStageId((prev) => (prev === stageId ? null : stageId));
}, []);
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Verify no regression on other pages**

Check that simulation and report pages still work (they use SplitPanel + GraphPanel independently).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/pipeline/[runId]/page.tsx
git commit -m "feat(pipeline): rewrite pipeline page with full-screen React Flow canvas"
```

---

### Task 9: Add React Flow CSS and final integration

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add React Flow theme overrides**

Add after the existing CSS in globals.css to style React Flow controls and minimap to match the DirePhish theme:

```css
/* React Flow theme overrides */
.react-flow__controls {
  box-shadow: none !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  overflow: hidden;
}
.react-flow__controls-button {
  background: var(--card) !important;
  border-bottom: 1px solid var(--border) !important;
  fill: var(--foreground) !important;
}
.react-flow__controls-button:hover {
  background: var(--muted) !important;
}
.react-flow__minimap {
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  background: var(--card) !important;
}
.react-flow__background {
  background: var(--background) !important;
}
```

- [ ] **Step 2: Full build and test**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "style: add React Flow theme overrides for DirePhish design system"
```

---

### Task 10: Verify all acceptance criteria

- [ ] **Step 1: Run through verification checklist**

1. `pnpm build` passes
2. Pipeline page loads with React Flow canvas filling viewport
3. Stage cards appear as collapsed pills on the left
4. Active stage auto-expands with correct content
5. Clicking stage in sidebar pans canvas and expands card
6. Graph nodes appear during simulation with proper colors and edges
7. All nodes and cards are draggable
8. Fit-to-view button (Controls) recenters everything
9. Sidebar collapses/expands (same as home page)
10. Home page sidebar still shows run history (no regression)
11. Simulation and report pages still work with SplitPanel (no regression)
12. MiniMap renders in bottom-right
13. Node detail panel appears on graph node click
14. Error toast appears on pipeline/simulation error

- [ ] **Step 2: Final commit if any fixes needed**
