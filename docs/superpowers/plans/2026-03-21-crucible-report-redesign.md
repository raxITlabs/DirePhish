# Crucible Report Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal report page with a rich split-panel report UI powered by the full `report.py` backend — real-time section streaming, agent log timeline, tool call visualization, console logs, and chat interface.

**Architecture:** Switch from `/api/crucible/simulations/{simId}/report` to `/api/report/*` endpoints. Report page becomes a split panel: left side streams report sections as markdown, right side shows agent activity timeline with tool calls. After completion, a chat interface lets users ask the report agent questions.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui, react-markdown, remark-gfm, Lucide React icons, Motion

**Spec:** `docs/superpowers/specs/2026-03-21-crucible-report-redesign.md`

---

## File Structure

### New Files
```
frontend/app/
├── components/report/
│   ├── ReportContent.tsx          # Left panel: header + streaming sections list
│   ├── ReportSection.tsx          # Single collapsible section with markdown
│   ├── WorkflowTimeline.tsx       # Right panel: metrics bar + agent activity timeline
│   ├── ToolCallEntry.tsx          # Single timeline entry (tool call, section event, etc.)
│   ├── MetricsBar.tsx             # Counters: sections, elapsed, tool calls, status
│   ├── ConsoleLog.tsx             # Collapsible scrolling console output
│   ├── ReportChat.tsx             # Chat interface with message history
│   └── ChatMessage.tsx            # Single chat message (user or agent)
├── types/report.ts                # REWRITE — new types for report.py backend
└── actions/report.ts              # REWRITE — server actions for all report.py endpoints
```

### Modified Files
```
frontend/app/
├── report/[simId]/page.tsx        # REWRITE — split panel + polling
└── simulation/[simId]/page.tsx    # Update "View Report" to trigger report.py generation
```

### Deleted Files
```
frontend/app/components/report/
├── ReportHeader.tsx               # Replaced by ReportContent header
├── ReportTimeline.tsx             # Replaced by WorkflowTimeline
├── AgentScorecard.tsx             # Replaced (scores shown in report sections now)
├── AgentScoreGrid.tsx             # Replaced
└── ExportButton.tsx               # Moved into ReportContent header
```

---

### Task 1: Install Dependencies and Rewrite Types

**Files:**
- Modify: `frontend/package.json`
- Rewrite: `frontend/app/types/report.ts`

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm add react-markdown remark-gfm
```

- [ ] **Step 2: Rewrite report types**

Replace `frontend/app/types/report.ts` with types matching the `report.py` backend:

```typescript
// Report status from backend ReportStatus enum
export type ReportStatus = "PENDING" | "PLANNING" | "GENERATING" | "COMPLETED" | "FAILED";

// POST /api/report/generate response
export interface GenerateReportResponse {
  simulation_id: string;
  report_id: string;
  task_id: string;
  status: string;
  message: string;
  already_generated: boolean;
}

// GET /api/report/{id}/progress response
export interface ReportProgress {
  status: ReportStatus;
  progress: number;
  message: string;
  current_section: string | null;
  completed_sections: string[];
  updated_at: string;
}

// GET /api/report/{id}/sections response
export interface ReportSectionsResponse {
  report_id: string;
  sections: ReportSectionData[];
  total_sections: number;
  is_complete: boolean;
}

export interface ReportSectionData {
  filename: string;
  section_index: number;
  content: string; // markdown
}

// GET /api/report/{id} response — full report
export interface FullReport {
  report_id: string;
  simulation_id: string;
  graph_id: string;
  simulation_requirement: string;
  status: ReportStatus;
  outline: ReportOutline | null;
  markdown_content: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface ReportOutline {
  title: string;
  summary: string;
  sections: { title: string; content: string }[];
}

// GET /api/report/{id}/agent-log response
export interface AgentLogResponse {
  logs: AgentLogEntry[];
  total_lines: number;
  from_line: number;
  has_more: boolean;
}

export interface AgentLogEntry {
  timestamp: string;
  elapsed_seconds: number;
  report_id: string;
  action: "report_start" | "planning_start" | "planning_complete" | "section_start" | "section_content" | "section_complete" | "tool_call" | "tool_result" | "llm_response" | "report_complete";
  stage: "planning" | "generating" | "completed";
  section_title?: string;
  section_index?: number;
  details: Record<string, unknown>;
}

// GET /api/report/{id}/console-log response
export interface ConsoleLogResponse {
  logs: string[];
  total_lines: number;
  from_line: number;
  has_more: boolean;
}

// POST /api/report/chat response
export interface ChatResponse {
  response: string;
  tool_calls: unknown[];
  sources: unknown[];
}

// Chat message for UI state
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// GET /api/report/check/{simulation_id} response
export interface ReportCheckResponse {
  simulation_id: string;
  has_report: boolean;
  report_status: string | null;
  report_id: string | null;
  interview_unlocked: boolean;
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

Note: Build may warn about unused old types — that's fine, they'll be consumed in later tasks.

- [ ] **Step 4: Commit**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add frontend/package.json frontend/pnpm-lock.yaml frontend/app/types/report.ts && git commit -m "feat: add react-markdown and rewrite report types for report.py backend"
```

---

### Task 2: Rewrite Report Server Actions

**Files:**
- Rewrite: `frontend/app/actions/report.ts`

- [ ] **Step 1: Rewrite report server actions**

Replace `frontend/app/actions/report.ts` with actions for all report.py endpoints:

```typescript
"use server";

import { fetchApi } from "@/app/lib/api";
import type {
  GenerateReportResponse,
  ReportProgress,
  ReportSectionsResponse,
  FullReport,
  AgentLogResponse,
  ConsoleLogResponse,
  ChatResponse,
  ReportCheckResponse,
} from "@/app/types";

// Check if a report exists for a simulation
export async function checkReport(
  simulationId: string
): Promise<{ data: ReportCheckResponse } | { error: string }> {
  return fetchApi<ReportCheckResponse>(`/api/report/check/${simulationId}`);
}

// Trigger report generation
export async function generateReport(
  simulationId: string,
  forceRegenerate = false
): Promise<{ data: GenerateReportResponse } | { error: string }> {
  return fetchApi<GenerateReportResponse>("/api/report/generate", {
    method: "POST",
    body: JSON.stringify({
      simulation_id: simulationId,
      force_regenerate: forceRegenerate,
    }),
  });
}

// Poll generation task status
export async function getGenerateStatus(
  taskId?: string,
  simulationId?: string
): Promise<{ data: { status: string; progress: number; message: string; report_id?: string } } | { error: string }> {
  return fetchApi("/api/report/generate/status", {
    method: "POST",
    body: JSON.stringify({
      task_id: taskId,
      simulation_id: simulationId,
    }),
  });
}

// Get real-time progress
export async function getReportProgress(
  reportId: string
): Promise<{ data: ReportProgress } | { error: string }> {
  return fetchApi<ReportProgress>(`/api/report/${reportId}/progress`);
}

// Get generated sections (incremental)
export async function getReportSections(
  reportId: string
): Promise<{ data: ReportSectionsResponse } | { error: string }> {
  return fetchApi<ReportSectionsResponse>(`/api/report/${reportId}/sections`);
}

// Get full report
export async function getFullReport(
  reportId: string
): Promise<{ data: FullReport } | { error: string }> {
  return fetchApi<FullReport>(`/api/report/${reportId}`);
}

// Get report by simulation ID
export async function getReportBySimulation(
  simulationId: string
): Promise<{ data: FullReport } | { error: string }> {
  return fetchApi<FullReport>(`/api/report/by-simulation/${simulationId}`);
}

// Get agent log (incremental)
export async function getAgentLog(
  reportId: string,
  fromLine = 0
): Promise<{ data: AgentLogResponse } | { error: string }> {
  return fetchApi<AgentLogResponse>(`/api/report/${reportId}/agent-log?from_line=${fromLine}`);
}

// Get console log (incremental)
export async function getConsoleLog(
  reportId: string,
  fromLine = 0
): Promise<{ data: ConsoleLogResponse } | { error: string }> {
  return fetchApi<ConsoleLogResponse>(`/api/report/${reportId}/console-log?from_line=${fromLine}`);
}

// Chat with report agent
export async function chatWithReport(
  simulationId: string,
  message: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<{ data: ChatResponse } | { error: string }> {
  return fetchApi<ChatResponse>("/api/report/chat", {
    method: "POST",
    body: JSON.stringify({
      simulation_id: simulationId,
      message,
      chat_history: chatHistory,
    }),
  });
}

// Download report markdown
export function getReportDownloadUrl(reportId: string): string {
  const base = process.env.FLASK_API_URL || "http://localhost:5001";
  return `${base}/api/report/${reportId}/download`;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add frontend/app/actions/report.ts && git commit -m "feat: rewrite report server actions for report.py backend"
```

---

### Task 3: Build Report Sub-Components

**Files:**
- Create: `frontend/app/components/report/MetricsBar.tsx`
- Create: `frontend/app/components/report/ToolCallEntry.tsx`
- Create: `frontend/app/components/report/ReportSection.tsx`
- Create: `frontend/app/components/report/ConsoleLog.tsx`
- Create: `frontend/app/components/report/ChatMessage.tsx`

These are small, focused components. Read the spec at `docs/superpowers/specs/2026-03-21-crucible-report-redesign.md` for layout details.

- [ ] **Step 1: Create MetricsBar**

Horizontal bar showing 4 stats + status badge. Uses shadcn `Badge`, `Separator`.

Props:
```typescript
interface MetricsBarProps {
  sectionsCompleted: number;
  totalSections: number;
  elapsedSeconds: number;
  toolCallCount: number;
  status: ReportStatus;
}
```

Format elapsed as `M:SS`. Status badge: PLANNING → secondary variant, GENERATING → default with pulse, COMPLETED → outline, FAILED → destructive.

- [ ] **Step 2: Create ToolCallEntry**

Single timeline entry for the agent activity log. Uses shadcn `Badge`, `Button` (ghost for collapse toggle), Lucide icons.

Props:
```typescript
interface ToolCallEntryProps {
  entry: AgentLogEntry;
}
```

Icon mapping for tool names:
- `insight_forge` → Lucide `Search`
- `panorama_search` → Lucide `Globe`
- `quick_search` → Lucide `Zap`
- `interview_agents` → Lucide `Users`

Action icons:
- `planning_start` / `planning_complete` → Lucide `ClipboardList`
- `section_start` / `section_complete` → Lucide `FileText`
- `tool_call` / `tool_result` → icon by tool name (from details.tool_name)
- `llm_response` → Lucide `Bot`
- `report_complete` → Lucide `CheckCircle`

Each entry shows: icon, timestamp (elapsed), description. Tool calls are collapsible — click to show parameters + result. Use `<pre>` or code block for raw data, truncated to 500 chars with expand.

- [ ] **Step 3: Create ReportSection**

Collapsible section with markdown rendering. Uses shadcn `Badge`, `Skeleton`, `Button` (ghost for collapse toggle), `react-markdown`.

Props:
```typescript
interface ReportSectionProps {
  index: number;
  title: string;
  content: string;
  status: "pending" | "generating" | "complete";
  defaultOpen?: boolean;
}
```

Section number formatted as `01`, `02`. Status badge variants:
- pending: outline, "Pending"
- generating: default with animate-pulse, "Generating..."
- complete: secondary, "Done"

When generating: show 3-4 Skeleton lines. When complete: render markdown via `<ReactMarkdown remarkPlugins={[remarkGfm]}>`. Collapse/expand via button with chevron icon.

- [ ] **Step 4: Create ConsoleLog**

Collapsible panel showing plain text console output. Uses shadcn `Button` (ghost for toggle), monospace font (JetBrains Mono via `font-mono`).

Props:
```typescript
interface ConsoleLogProps {
  lines: string[];
  isOpen?: boolean;
  onToggle?: () => void;
}
```

Max height 200px with overflow-y scroll. Auto-scroll to bottom when new lines added (via ref + useEffect). Each line in `<div className="font-mono text-xs">`.

- [ ] **Step 5: Create ChatMessage**

Single chat message bubble. Uses `react-markdown` for agent responses.

Props:
```typescript
interface ChatMessageProps {
  message: ChatMessage;
}
```

User messages: right-aligned, `bg-primary text-primary-foreground` rounded bubble.
Agent messages: left-aligned, `bg-muted` card with markdown rendering.

- [ ] **Step 6: Delete old report components**

Remove:
- `frontend/app/components/report/ReportHeader.tsx`
- `frontend/app/components/report/ReportTimeline.tsx`
- `frontend/app/components/report/AgentScorecard.tsx`
- `frontend/app/components/report/AgentScoreGrid.tsx`
- `frontend/app/components/report/ExportButton.tsx`

- [ ] **Step 7: Verify build**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

Note: Report page will break since we deleted old components but haven't rewritten the page yet — that's Task 5. The build should still succeed if the page import errors are the only issue (Next.js may error). If so, temporarily comment out the report page imports.

- [ ] **Step 8: Commit**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add frontend/app/components/report/ && git commit -m "feat: create report sub-components (MetricsBar, ToolCallEntry, ReportSection, ConsoleLog, ChatMessage)"
```

---

### Task 4: Build Report Content and Workflow Timeline Panels

**Files:**
- Create: `frontend/app/components/report/ReportContent.tsx`
- Create: `frontend/app/components/report/WorkflowTimeline.tsx`
- Create: `frontend/app/components/report/ReportChat.tsx`

- [ ] **Step 1: Create ReportContent (left panel)**

Shows report header (title, summary, metadata) and list of streaming sections.

Props:
```typescript
interface ReportContentProps {
  outline: ReportOutline | null;
  sections: ReportSectionData[];
  progress: ReportProgress | null;
  reportId: string | null;
}
```

Layout:
1. Report header card: title from outline, summary as subtitle, report ID badge, generation time
2. Sections list: map outline.sections by index. For each:
   - Check if section data exists in `sections` array (by section_index)
   - If exists: `<ReportSection status="complete" content={section.content}>`
   - If index matches progress.current_section: `<ReportSection status="generating">`
   - Otherwise: `<ReportSection status="pending">`
3. Download button (uses `getReportDownloadUrl`) when complete

- [ ] **Step 2: Create WorkflowTimeline (right panel)**

Shows metrics bar at top, then scrollable agent log entries.

Props:
```typescript
interface WorkflowTimelineProps {
  entries: AgentLogEntry[];
  progress: ReportProgress | null;
  status: ReportStatus;
}
```

Layout:
1. `<MetricsBar>` at top
2. Scrollable list of `<ToolCallEntry>` items
3. Auto-scroll to bottom via ref
4. Visual separator between sections (when section_index changes)

- [ ] **Step 3: Create ReportChat**

Chat interface shown after report completes.

Props:
```typescript
interface ReportChatProps {
  simulationId: string;
  reportId: string;
}
```

State: messages array, input text, loading boolean.
On submit: call `chatWithReport()`, append user message + agent response to messages.
Layout:
1. Message list with `<ChatMessage>` for each
2. Input row: shadcn `<Input>` + `<Button>` send
3. Disabled while loading, shows spinner

- [ ] **Step 4: Verify build**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add frontend/app/components/report/ && git commit -m "feat: create ReportContent, WorkflowTimeline, and ReportChat panels"
```

---

### Task 5: Rewrite Report Page with Split Panel and Polling

**Files:**
- Rewrite: `frontend/app/report/[simId]/page.tsx`

This is the core integration task. The page orchestrates all polling and renders the split panel.

- [ ] **Step 1: Rewrite report page**

The page is a `"use client"` component with this flow:

**State:**
```typescript
const [reportId, setReportId] = useState<string | null>(null);
const [taskId, setTaskId] = useState<string | null>(null);
const [status, setStatus] = useState<ReportStatus>("PENDING");
const [progress, setProgress] = useState<ReportProgress | null>(null);
const [outline, setOutline] = useState<ReportOutline | null>(null);
const [sections, setSections] = useState<ReportSectionData[]>([]);
const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
const [error, setError] = useState<string | null>(null);
const [viewMode, setViewMode] = useState<ViewMode>("split");
```

**On mount:**
1. Call `checkReport(simId)` to see if report exists
2. If `has_report && report_status === "COMPLETED"`: fetch full report + agent logs, show complete view
3. If `has_report && report_status !== "COMPLETED"`: enter polling with existing `report_id`
4. If `!has_report`: show "Generate Report" button

**On "Generate Report" click:**
1. Call `generateReport(simId)`
2. Store `report_id` and `task_id`
3. Enter polling mode

**Polling mode (while status is PENDING/PLANNING/GENERATING):**
- Every 2s: `getReportProgress(reportId)` → update progress, status, current section
- Every 3s: `getReportSections(reportId)` → update sections array
- Every 2s: `getAgentLog(reportId, agentLogs.length)` → append new log entries
- Every 5s: `getConsoleLog(reportId, consoleLogs.length)` → append new console lines
- When progress returns outline (after planning): set outline
- When status === "COMPLETED": stop polling, fetch full report
- When status === "FAILED": stop polling, show error

**Layout:**
```tsx
<div className="h-screen flex flex-col">
  <Header />
  {/* Status bar */}
  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
    <div className="flex items-center gap-3">
      <span className="font-semibold">Report</span>
      <span className="text-sm text-muted-foreground font-mono">{reportId || simId}</span>
    </div>
    <div className="flex items-center gap-3">
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      <Badge variant={statusVariant}>{status}</Badge>
    </div>
  </div>

  {/* Pre-generation state */}
  {status === "PENDING" && !reportId && (
    <div className="flex-1 flex items-center justify-center">
      <Button onClick={handleGenerate}>Generate Report</Button>
    </div>
  )}

  {/* Error state */}
  {error && (
    <Alert variant="destructive" className="mx-4 mt-3">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )}

  {/* Split panel (when generating or complete) */}
  {reportId && (
    <SplitPanel
      viewMode={viewMode}
      leftPanel={<ReportContent outline={outline} sections={sections} progress={progress} reportId={reportId} />}
      rightPanel={
        <div className="flex flex-col h-full">
          <WorkflowTimeline entries={agentLogs} progress={progress} status={status} />
          <ConsoleLog lines={consoleLogs} />
        </div>
      }
      leftHeader={<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report</span>}
      rightHeader={<span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workflow</span>}
    />
  )}

  {/* Chat (after completion) */}
  {status === "COMPLETED" && reportId && (
    <div className="border-t border-border">
      <ReportChat simulationId={simId} reportId={reportId} />
    </div>
  )}
</div>
```

Use `useEffect` + `setInterval` for polling, with cleanup on unmount and when status changes to COMPLETED/FAILED.

- [ ] **Step 2: Verify build**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add frontend/app/report/ && git commit -m "feat: rewrite report page with split panel, streaming sections, and polling"
```

---

### Task 6: Update Simulation Page Report Integration

**Files:**
- Modify: `frontend/app/simulation/[simId]/page.tsx`

- [ ] **Step 1: Update "View Report" button handler**

The simulation page currently calls the old Crucible report endpoint. Update `handleViewReport` to:
1. Call `generateReport(simId)` from the new report actions
2. Navigate to `/report/${simId}` (the report page will handle polling)

Read the current file, find the `handleViewReport` function, and update it:

```typescript
import { generateReport } from "@/app/actions/report";

const handleViewReport = async () => {
  // Trigger generation via report.py backend (idempotent — returns existing if already generated)
  await generateReport(simId);
  router.push(`/report/${simId}`);
};
```

Also update the import — remove the old `generateReport` import from `@/app/actions/report` if it was importing from the old module, and import from the new one.

- [ ] **Step 2: Verify build**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add frontend/app/simulation/ && git commit -m "refactor: update simulation page to use report.py backend for report generation"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build check**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && pnpm build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Verify no old report type imports remain**

Search for any imports of the old `Report` type or old component names:

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish/frontend && grep -r "AgentScoreGrid\|AgentScorecard\|ReportTimeline\|ReportHeader" app/ --include="*.tsx" --include="*.ts"
```

Expected: No matches (all old imports removed).

- [ ] **Step 3: Commit any fixes**

```bash
cd /Users/adeshgairola/Documents/raxIT/code/testing-folder/MiroFish && git add -A && git commit -m "fix: clean up report redesign"
```
