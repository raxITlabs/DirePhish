# Pipeline Graph-Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the pipeline page from a vertical step checklist into a Graph + Context Panel split layout where the knowledge graph is the hero element.

**Architecture:** SplitPanel (modified with `splitRatio` prop) holds GraphPanel on the left and an adaptive PipelineContextPanel on the right. A thin PipelineProgressBar sits above. A `useSimulationPolling` hook extracts polling logic from the simulation page for reuse. Pre-simulation steps show a placeholder; once simulations start, the live graph takes over.

**Tech Stack:** Next.js (app router), React, TypeScript, D3.js (existing GraphPanel), Tailwind CSS, shadcn/ui components

**Spec:** `docs/superpowers/specs/2026-03-22-pipeline-graph-hero-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/app/components/shared/SplitPanel.tsx` | Modify | Add optional `splitRatio` prop |
| `frontend/app/hooks/useSimulationPolling.ts` | Create | Polling hook for sim status, actions, graph data |
| `frontend/app/components/pipeline/PipelineProgressBar.tsx` | Create | Thin segment progress bar + active step text |
| `frontend/app/components/pipeline/PipelineGraphPlaceholder.tsx` | Create | Pre-simulation placeholder for left panel |
| `frontend/app/components/pipeline/PipelineContextPanel.tsx` | Create | Adaptive right panel that switches content per step |
| `frontend/app/components/pipeline/SimulationLivePanel.tsx` | Create | Sim stats + scrollable action feed |
| `frontend/app/pipeline/[runId]/page.tsx` | Rewrite | Full-width split layout, wire everything together |

---

### Task 1: Add `splitRatio` prop to SplitPanel

**Files:**
- Modify: `frontend/app/components/shared/SplitPanel.tsx`

- [ ] **Step 1: Add `splitRatio` to SplitPanelProps interface**

```typescript
interface SplitPanelProps {
  viewMode: ViewMode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  leftHeader?: React.ReactNode;
  rightHeader?: React.ReactNode;
  splitRatio?: [number, number];  // e.g. [60, 40], defaults to [50, 50]
}
```

- [ ] **Step 2: Use `splitRatio` in width calculations**

Update the component function signature to destructure `splitRatio = [50, 50]` and replace the hardcoded `"50%"` values:

```typescript
export default function SplitPanel({
  viewMode,
  leftPanel,
  rightPanel,
  leftHeader,
  rightHeader,
  splitRatio = [50, 50],
}: SplitPanelProps) {
  const leftWidth = viewMode === "graph" ? "100%" : viewMode === "split" ? `${splitRatio[0]}%` : "0%";
  const rightWidth = viewMode === "focus" ? "100%" : viewMode === "split" ? `${splitRatio[1]}%` : "0%";
  // ... rest unchanged
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (this is a backward-compatible change — existing callers use default `[50, 50]`)

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/shared/SplitPanel.tsx
git commit -m "feat(pipeline): add splitRatio prop to SplitPanel"
```

---

### Task 2: Create `useSimulationPolling` hook

**Files:**
- Create: `frontend/app/hooks/useSimulationPolling.ts`

This hook extracts the polling logic from `frontend/app/simulation/[simId]/page.tsx` (lines 37-85) into a reusable hook. Both the simulation page and the new pipeline page will use it.

- [ ] **Step 1: Create the hooks directory and the hook file**

```typescript
// frontend/app/hooks/useSimulationPolling.ts
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSimulationStatus, getSimulationActions } from "@/app/actions/simulation";
import { getGraphData } from "@/app/actions/graph";
import type { SimulationStatus, AgentAction, GraphData } from "@/app/types";

interface UseSimulationPollingResult {
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  graphData: GraphData;
  graphPushing: boolean;
  error: string | null;
  pollGraph: () => Promise<void>;
}

export function useSimulationPolling(simId: string | null): UseSimulationPollingResult {
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [simActions, setSimActions] = useState<AgentAction[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [graphPushing, setGraphPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphVersionRef = useRef(0);

  // Reset state when simId changes
  useEffect(() => {
    setSimStatus(null);
    setSimActions([]);
    setGraphData({ nodes: [], edges: [] });
    setGraphPushing(false);
    setError(null);
    graphVersionRef.current = 0;
  }, [simId]);

  const pollStatus = useCallback(async () => {
    if (!simId) return;
    const result = await getSimulationStatus(simId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSimStatus(result.data);
  }, [simId]);

  const pollActions = useCallback(async () => {
    if (!simId) return;
    const result = await getSimulationActions(simId);
    if ("data" in result) {
      setSimActions(result.data);
    }
  }, [simId]);

  const pollGraph = useCallback(async () => {
    if (!simId) return;
    const result = await getGraphData(simId);
    if ("data" in result) setGraphData(result.data);
  }, [simId]);

  // Initial load when simId becomes available
  useEffect(() => {
    if (!simId) return;
    pollStatus();
    pollActions();
    pollGraph();
  }, [simId, pollStatus, pollActions, pollGraph]);

  // Status + actions polling (every 3s while running)
  useEffect(() => {
    if (!simId) return;
    if (!simStatus || (simStatus.status !== "running" && simStatus.status !== "starting")) return;
    const statusInterval = setInterval(pollStatus, 3000);
    const actionsInterval = setInterval(pollActions, 3000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(actionsInterval);
    };
  }, [simId, simStatus?.status, pollStatus, pollActions]);

  // Reactive graph polling — fetch when push version increments
  useEffect(() => {
    const pushInfo = simStatus?.graphPush;
    if (!pushInfo) return;
    setGraphPushing(pushInfo.pushing);
    if (pushInfo.version > graphVersionRef.current) {
      graphVersionRef.current = pushInfo.version;
      pollGraph();
    }
  }, [simStatus?.graphPush, pollGraph]);

  return { simStatus, simActions, graphData, graphPushing, error, pollGraph };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/hooks/useSimulationPolling.ts
git commit -m "feat(pipeline): create useSimulationPolling hook"
```

---

### Task 3: Create `PipelineProgressBar`

**Files:**
- Create: `frontend/app/components/pipeline/PipelineProgressBar.tsx`

- [ ] **Step 1: Create the pipeline components directory and progress bar**

```typescript
// frontend/app/components/pipeline/PipelineProgressBar.tsx
"use client";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
  cost?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineProgressBarProps {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
}

const STATUS_COLORS: Record<StepStatus, string> = {
  completed: "bg-green-500",
  running: "bg-primary",
  failed: "bg-destructive",
  pending: "bg-muted",
  skipped: "bg-muted",
};

export default function PipelineProgressBar({ steps, stepOrder }: PipelineProgressBarProps) {
  // Find the currently active step for the status text
  const activeStep = stepOrder.find((s) => steps[s.id]?.status === "running");
  const activeState = activeStep ? steps[activeStep.id] : null;

  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      {/* Segment bar */}
      <div className="flex gap-1">
        {stepOrder.map((stepDef) => {
          const status = steps[stepDef.id]?.status || "pending";
          return (
            <div
              key={stepDef.id}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${STATUS_COLORS[status]}`}
            />
          );
        })}
      </div>
      {/* Active step text */}
      <div className="mt-2 text-sm">
        {activeStep ? (
          <span>
            <span className="font-medium">{activeStep.label}</span>
            {activeState?.message && (
              <span className="text-muted-foreground"> — {activeState.message}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {stepOrder.every((s) => steps[s.id]?.status === "completed")
              ? "Pipeline complete"
              : "Starting pipeline..."}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/PipelineProgressBar.tsx
git commit -m "feat(pipeline): create PipelineProgressBar component"
```

---

### Task 4: Create `PipelineGraphPlaceholder`

**Files:**
- Create: `frontend/app/components/pipeline/PipelineGraphPlaceholder.tsx`

- [ ] **Step 1: Create the placeholder component**

```typescript
// frontend/app/components/pipeline/PipelineGraphPlaceholder.tsx
"use client";

interface PipelineGraphPlaceholderProps {
  companyName?: string;
}

export default function PipelineGraphPlaceholder({ companyName }: PipelineGraphPlaceholderProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-2xl font-bold">
          {companyName ? companyName.charAt(0).toUpperCase() : "?"}
        </span>
      </div>
      {companyName && (
        <p className="text-sm font-medium text-foreground mb-1">{companyName}</p>
      )}
      <p className="text-xs">Graph builds during simulation</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/PipelineGraphPlaceholder.tsx
git commit -m "feat(pipeline): create PipelineGraphPlaceholder component"
```

---

### Task 5: Create `SimulationLivePanel`

**Files:**
- Create: `frontend/app/components/pipeline/SimulationLivePanel.tsx`

This is the most complex context panel sub-component — it shows simulation stats and a scrollable action feed.

- [ ] **Step 1: Create the SimulationLivePanel component**

```typescript
// frontend/app/components/pipeline/SimulationLivePanel.tsx
"use client";

import type { SimulationStatus, AgentAction, GraphData } from "@/app/types";

interface SimulationLivePanelProps {
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  graphData: GraphData;
  activeSimIndex: number;
  totalSims: number;
  error: string | null;
}

export default function SimulationLivePanel({
  simStatus,
  simActions,
  graphData,
  activeSimIndex,
  totalSims,
  error,
}: SimulationLivePanelProps) {
  const isRunning = simStatus?.status === "running" || simStatus?.status === "starting";

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 gap-3">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive shrink-0">
          {error}
        </div>
      )}

      {/* Sim header + stats */}
      <div className="rounded-lg border border-border bg-card p-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Simulation {activeSimIndex + 1} of {totalSims}
          </span>
          {isRunning && (
            <span className="text-xs text-primary font-semibold flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold font-mono">{simStatus?.currentRound || 0}</div>
            <div className="text-[10px] text-muted-foreground">
              of {simStatus?.totalRounds || "?"} rounds
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono">{graphData.nodes.length}</div>
            <div className="text-[10px] text-muted-foreground">nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono">{graphData.edges.length}</div>
            <div className="text-[10px] text-muted-foreground">edges</div>
          </div>
        </div>
      </div>

      {/* Action feed */}
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-card flex flex-col">
        <div className="px-4 py-2 border-b border-border shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Action Feed
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {simActions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Waiting for first action...
            </p>
          )}
          {[...simActions].reverse().map((action, i) => (
            <div
              key={`${action.round}-${action.agent}-${i}`}
              className={`text-xs p-3 rounded-md border-l-2 ${
                action.role === "red_team"
                  ? "bg-red-50 border-l-red-400 dark:bg-red-950/30"
                  : "bg-teal-50 border-l-teal-400 dark:bg-teal-950/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold ${
                  action.role === "red_team" ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-400"
                }`}>
                  {action.agent}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Round {action.round}
                </span>
              </div>
              <p className="text-foreground">{action.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/SimulationLivePanel.tsx
git commit -m "feat(pipeline): create SimulationLivePanel component"
```

---

### Task 6: Create `PipelineContextPanel`

**Files:**
- Create: `frontend/app/components/pipeline/PipelineContextPanel.tsx`

This is the adaptive right panel that switches content based on which step is active.

- [ ] **Step 1: Create the PipelineContextPanel component**

```typescript
// frontend/app/components/pipeline/PipelineContextPanel.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import SimulationLivePanel from "./SimulationLivePanel";
import type { CompanyDossier, SimulationStatus, AgentAction, GraphData } from "@/app/types";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
  cost?: number;
}

interface StepDef {
  id: string;
  label: string;
}

interface PipelineContextPanelProps {
  steps: Record<string, StepState>;
  stepOrder: StepDef[];
  // Dossier review
  dossier: CompanyDossier | null;
  hookData: { hookToken: string; projectId: string } | null;
  confirming: boolean;
  onConfirmDossier: () => void;
  projectId: string;
  companyUrl?: string;
  // Simulation
  simStatus: SimulationStatus | null;
  simActions: AgentAction[];
  graphData: GraphData;
  activeSimIndex: number;
  totalSims: number;
  simError: string | null;
  // Completion
  pipelineComplete: boolean;
}

/** Find the most relevant active step to display */
function getActiveStepId(steps: Record<string, StepState>, stepOrder: StepDef[]): string | null {
  // Show the currently running step
  const running = stepOrder.find((s) => steps[s.id]?.status === "running");
  if (running) return running.id;

  // If nothing is running, show the last completed step
  let lastCompleted: string | null = null;
  for (const s of stepOrder) {
    if (steps[s.id]?.status === "completed") lastCompleted = s.id;
  }
  return lastCompleted;
}

/** Parse "Title (45%), Title2 (35%)" into structured data */
function parseScenarios(detail: string): { title: string; probability: number }[] {
  const results: { title: string; probability: number }[] = [];
  const regex = /(.+?)\s*\((\d+)%\)/g;
  let match;
  while ((match = regex.exec(detail)) !== null) {
    results.push({ title: match[1].trim(), probability: parseInt(match[2], 10) });
  }
  return results;
}

export default function PipelineContextPanel({
  steps,
  stepOrder,
  dossier,
  hookData,
  confirming,
  onConfirmDossier,
  projectId,
  companyUrl,
  simStatus,
  simActions,
  graphData,
  activeSimIndex,
  totalSims,
  simError,
  pipelineComplete,
}: PipelineContextPanelProps) {
  const router = useRouter();
  const activeStepId = getActiveStepId(steps, stepOrder);

  // Pipeline complete
  if (pipelineComplete) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-green-600 text-xl">&#10003;</span>
          </div>
          <h2 className="text-lg font-semibold mb-2">Pipeline Complete</h2>
          <p className="text-sm text-muted-foreground mb-4">
            All simulations and reports have been generated.
          </p>
          {projectId && (
            <Button onClick={() => router.push(`/report/comparative/${projectId}`)}>
              View Comparative Report
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Step 6: Simulations — delegate to SimulationLivePanel
  if (activeStepId === "simulations" && totalSims > 0) {
    return (
      <SimulationLivePanel
        simStatus={simStatus}
        simActions={simActions}
        graphData={graphData}
        activeSimIndex={activeSimIndex}
        totalSims={totalSims}
        error={simError}
      />
    );
  }

  // Step 2: Dossier Review — show summary + confirm/edit buttons
  if (activeStepId === "dossier_review" && hookData) {
    return (
      <div className="h-full flex flex-col p-4 gap-3">
        {dossier && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Dossier Summary
            </div>
            <div className="text-xs space-y-2 text-muted-foreground">
              <p><strong className="text-foreground">Company:</strong> {dossier.company?.name}</p>
              <p><strong className="text-foreground">Industry:</strong> {dossier.company?.industry}</p>
              <p><strong className="text-foreground">Size:</strong> {dossier.company?.size} ({dossier.company?.employeeCount} employees)</p>
              <p><strong className="text-foreground">Systems:</strong> {dossier.systems?.length || 0} tracked</p>
              <p><strong className="text-foreground">Risks:</strong> {dossier.risks?.length || 0} identified</p>
              <p><strong className="text-foreground">Compliance:</strong> {dossier.compliance?.join(", ")}</p>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="text-sm text-primary font-medium mb-1">Awaiting your review</div>
          <p className="text-xs text-muted-foreground">
            Review the dossier and confirm to continue the pipeline.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <Button onClick={onConfirmDossier} disabled={confirming} className="flex-1">
            {confirming ? "Confirming..." : "Confirm & Continue"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push(`/research/${projectId}`)}
          >
            Edit Dossier
          </Button>
        </div>
      </div>
    );
  }

  // Steps 3-4: Scenarios selected
  if (
    activeStepId === "scenario_selection" ||
    (activeStepId === "threat_analysis") ||
    (activeStepId === "config_expansion" && steps["scenario_selection"]?.status === "completed")
  ) {
    const scenarioDetail = steps["scenario_selection"]?.detail;
    const scenarios = scenarioDetail ? parseScenarios(scenarioDetail) : [];

    if (activeStepId === "threat_analysis" && steps["threat_analysis"]?.status === "running") {
      return (
        <div className="h-full flex flex-col p-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Threat Analysis
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">{steps["threat_analysis"]?.message || "Analyzing threats..."}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col p-4 gap-3">
        {scenarios.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Selected Scenarios
            </div>
            <div className="space-y-3">
              {scenarios.map((s, i) => (
                <div key={i} className="p-3 bg-muted/50 rounded-md border-l-2 border-l-primary">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs font-semibold text-primary">{s.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Config generation status if active */}
        {activeStepId === "config_expansion" && steps["config_expansion"]?.status === "running" && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">{steps["config_expansion"]?.message || "Generating configs..."}</span>
            </div>
          </div>
        )}
        {activeStepId === "config_expansion" && steps["config_expansion"]?.status === "completed" && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-green-600">{steps["config_expansion"]?.detail || "Configs ready"}</div>
          </div>
        )}
      </div>
    );
  }

  // Steps 7-8: Reports & Comparative Analysis
  if (activeStepId === "reports" || activeStepId === "comparative") {
    return (
      <div className="h-full flex flex-col p-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {activeStepId === "reports" ? "After-Action Reports" : "Comparative Analysis"}
          </div>
          <div className="flex items-center gap-2">
            {steps[activeStepId]?.status === "running" ? (
              <>
                <span className="inline-block h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">{steps[activeStepId]?.message}</span>
              </>
            ) : (
              <span className="text-sm text-green-600">{steps[activeStepId]?.message}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Research (default / fallback)
  return (
    <div className="h-full flex flex-col p-4 gap-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {steps["research"]?.status === "running" ? "Researching" : "Company Research"}
        </div>
        {companyUrl ? (
          <p className="text-sm font-medium mb-1">{companyUrl}</p>
        ) : null}
        {steps["research"]?.status === "running" && (
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-block h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">{steps["research"]?.message}</span>
          </div>
        )}
        {steps["research"]?.status === "completed" && (
          <div className="text-sm text-green-600 mt-2">{steps["research"]?.message}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/pipeline/PipelineContextPanel.tsx
git commit -m "feat(pipeline): create PipelineContextPanel with per-step content"
```

---

### Task 7: Rewrite Pipeline Page

**Files:**
- Rewrite: `frontend/app/pipeline/[runId]/page.tsx`

This is the main integration task — wire everything together into the new split layout.

- [ ] **Step 1: Rewrite the pipeline page**

The new page uses:
- `h-screen flex flex-col` layout (replacing `max-w-4xl mx-auto`)
- `PipelineProgressBar` at the top
- `SplitPanel` with `splitRatio={[60, 40]}` and `viewMode="split"`
- Left panel: `PipelineGraphPlaceholder` for steps 1-5, `GraphPanel` for steps 6+
- Right panel: `PipelineContextPanel` with all state wired through
- `useSimulationPolling(activeSimId)` for simulation data
- SimId extraction from pipeline update detail field

```typescript
// frontend/app/pipeline/[runId]/page.tsx
"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import Breadcrumbs from "@/app/components/layout/Breadcrumbs";
import SplitPanel from "@/app/components/shared/SplitPanel";
import GraphPanel from "@/app/components/simulation/GraphPanel";
import PipelineProgressBar from "@/app/components/pipeline/PipelineProgressBar";
import PipelineGraphPlaceholder from "@/app/components/pipeline/PipelineGraphPlaceholder";
import PipelineContextPanel from "@/app/components/pipeline/PipelineContextPanel";
import { useSimulationPolling } from "@/app/hooks/useSimulationPolling";
import { getDossier } from "@/app/actions/project";
import type { CompanyDossier } from "@/app/types";

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PipelineUpdate {
  step: string;
  status: StepStatus;
  message: string;
  detail?: string;
  timestamp: string;
  durationMs?: number;
  cost?: number;
}

interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  durationMs?: number;
  cost?: number;
}

const STEP_ORDER = [
  { id: "research", label: "Company Research" },
  { id: "dossier_review", label: "Dossier Review" },
  { id: "threat_analysis", label: "Threat Analysis" },
  { id: "scenario_selection", label: "Scenario Selection" },
  { id: "config_expansion", label: "Config Generation" },
  { id: "simulations", label: "Simulations" },
  { id: "reports", label: "After-Action Reports" },
  { id: "comparative", label: "Comparative Analysis" },
];

export default function PipelinePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const router = useRouter();

  // Pipeline state (existing)
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [hookData, setHookData] = useState<{ hookToken: string; projectId: string } | null>(null);
  const [dossier, setDossier] = useState<CompanyDossier | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // New simulation state
  const [allSimIds, setAllSimIds] = useState<string[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [activeSimIndex, setActiveSimIndex] = useState(0);

  // Simulation polling hook
  const { simStatus, simActions, graphData, graphPushing, error: simError, pollGraph } =
    useSimulationPolling(activeSimId);

  const isSimRunning = simStatus?.status === "running" || simStatus?.status === "starting";

  // Poll for pipeline updates
  useEffect(() => {
    if (pipelineComplete) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pipeline/stream?runId=${runId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.data?.updates) {
          setSteps((prev) => {
            const newSteps = { ...prev };
            for (const update of json.data.updates as PipelineUpdate[]) {
              newSteps[update.step] = {
                status: update.status,
                message: update.message,
                detail: update.detail,
                durationMs: update.durationMs,
                cost: update.cost,
              };

              // Check for hook data (dossier review pause)
              if (update.step === "dossier_review" && update.detail) {
                try {
                  const parsed = JSON.parse(update.detail);
                  if (parsed.hookToken && parsed.projectId) {
                    setHookData(parsed);
                    setProjectId(parsed.projectId);
                  }
                } catch {
                  // detail is not hook JSON
                }
              }

              // Check for completion
              if (update.step === "complete") {
                setPipelineComplete(true);
              }

              // Extract project ID from research step
              if (update.step === "research" && update.detail?.startsWith("Project:")) {
                const pid = update.detail.replace("Project: ", "");
                setProjectId(pid);
              }

              // Extract simIds from simulations step
              if (update.step === "simulations" && update.status === "running" && update.detail) {
                const ids = update.detail.split(", ").filter(Boolean);
                if (ids.length > 1) {
                  // First "running" update: "simId1, simId2"
                  setAllSimIds(ids);
                  setActiveSimId(ids[0]);
                  setActiveSimIndex(0);
                } else if (ids.length === 1) {
                  // Per-sim update: single simId
                  setActiveSimId(ids[0]);
                }
              }

              // Track sim index from message pattern "Simulation N/M running..."
              if (update.step === "simulations" && update.message) {
                const simMatch = update.message.match(/Simulation (\d+)\/(\d+)/);
                if (simMatch) {
                  setActiveSimIndex(parseInt(simMatch[1], 10) - 1);
                }
              }
            }
            return newSteps;
          });
        }
      } catch {
        // polling failure is ok
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runId, pipelineComplete]);

  // Load dossier when hook fires
  useEffect(() => {
    if (!hookData?.projectId) return;
    getDossier(hookData.projectId).then((result) => {
      if ("data" in result) setDossier(result.data);
    });
  }, [hookData?.projectId]);

  const handleConfirmDossier = useCallback(async () => {
    if (!hookData) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/pipeline/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: hookData.hookToken,
          confirmed: true,
        }),
      });
      if (!res.ok) {
        setError("Failed to confirm dossier");
      }
      setHookData(null);
    } catch {
      setError("Failed to confirm dossier");
    } finally {
      setConfirming(false);
    }
  }, [hookData]);

  // Determine which left panel to show
  // Show GraphPanel as soon as activeSimId is set — GraphPanel handles empty data gracefully
  const showGraph = !!activeSimId;

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Breadcrumbs bar */}
      <div className="px-4 py-2 border-b border-border">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Pipeline" },
          ]}
        />
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Progress bar */}
      <PipelineProgressBar steps={steps} stepOrder={STEP_ORDER} />

      {/* Main split layout */}
      <SplitPanel
        viewMode="split"
        splitRatio={[60, 40]}
        leftPanel={
          showGraph ? (
            <GraphPanel
              data={graphData}
              isLive={isSimRunning}
              isPushing={graphPushing}
              onRefresh={pollGraph}
            />
          ) : (
            <PipelineGraphPlaceholder
              companyName={dossier?.company?.name}
            />
          )
        }
        rightPanel={
          <PipelineContextPanel
            steps={steps}
            stepOrder={STEP_ORDER}
            dossier={dossier}
            hookData={hookData}
            confirming={confirming}
            onConfirmDossier={handleConfirmDossier}
            projectId={projectId}
            companyUrl={undefined}
            simStatus={simStatus}
            simActions={simActions}
            graphData={graphData}
            activeSimIndex={activeSimIndex}
            totalSims={allSimIds.length}
            simError={simError}
            pipelineComplete={pipelineComplete}
          />
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Verify dev server starts and page loads**

Run: `cd frontend && npx next dev` (in a separate terminal)
Navigate to a pipeline URL or check that the page doesn't crash on load.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/pipeline/[runId]/page.tsx
git commit -m "feat(pipeline): rewrite pipeline page with graph-hero split layout

Graph panel takes ~60% of viewport during simulations.
Adaptive context panel shows per-step content on the right.
Thin progress bar replaces the old step checklist.

Closes: pipeline-graph-hero redesign"
```

---

### Task 8: Verify full build and clean up

**Files:**
- All files from tasks 1-7

- [ ] **Step 1: Run full TypeScript check**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors across the entire project

- [ ] **Step 2: Run Next.js build**

Run: `cd frontend && npx next build 2>&1 | tail -30`
Expected: Build succeeds with no errors

- [ ] **Step 3: Fix any build errors found in steps 1-2**

If errors exist, fix them and re-run the checks.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(pipeline): resolve build issues from pipeline redesign"
```
