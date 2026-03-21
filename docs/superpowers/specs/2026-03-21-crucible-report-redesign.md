# Crucible Report Redesign Design Spec

**Goal:** Replace the minimal 6-section Crucible report page with a rich report UI powered by the full `report.py` backend — real-time section streaming, agent log timeline, tool call visualization, console logs, and chat interface.

**Sub-project:** 2 of 5 (Foundation ✅ → **Report Redesign** → Graph → Sim Dashboard → History)

---

## Architecture

Switch from Crucible report endpoints (`/api/crucible/simulations/{simId}/report`) to the full report backend (`/api/report/*`).

### Backend Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/report/generate` | POST | Trigger report generation (returns `task_id`, `report_id`) |
| `/api/report/generate/status` | POST | Poll generation task status |
| `/api/report/{id}/progress` | GET | Real-time progress (%, current section, status) |
| `/api/report/{id}/sections` | GET | Fetch all generated sections (incremental) |
| `/api/report/{id}/section/{index}` | GET | Fetch single section content |
| `/api/report/{id}` | GET | Full report with outline + markdown |
| `/api/report/{id}/agent-log` | GET | Structured JSON logs (incremental via `from_line`) |
| `/api/report/{id}/console-log` | GET | Plain text console output |
| `/api/report/chat` | POST | Chat with report agent |
| `/api/report/{id}/download` | GET | Download as markdown file |

### Report Generation Workflow

1. User clicks "Generate Report" on simulation page (or navigates to report URL)
2. Frontend calls `POST /api/report/generate` with `{ simulation_id }`
3. Backend returns `{ task_id, report_id }`
4. Frontend enters polling loop:
   - Poll `GET /api/report/{id}/progress` every 2s → updates progress bar + current section
   - Poll `GET /api/report/{id}/sections` every 3s → renders new sections as they complete
   - Poll `GET /api/report/{id}/agent-log?from_line=N` every 2s → updates agent timeline
5. When status = `COMPLETED`: stop polling, fetch full report, enable chat
6. When status = `FAILED`: show error with retry button

### Report Data Structure (from backend)

```typescript
// Report status enum
type ReportStatus = "PENDING" | "PLANNING" | "GENERATING" | "COMPLETED" | "FAILED";

// Report outline (from planning phase)
interface ReportOutline {
  title: string;
  summary: string;  // one-sentence core finding
  sections: { title: string; content: string }[];  // 2-5 sections
}

// Progress response
interface ReportProgress {
  status: ReportStatus;
  progress: number;  // 0-100
  currentSection: string | null;
  sectionsCompleted: number;
  totalSections: number;
}

// Section content
interface ReportSectionData {
  index: number;
  title: string;
  content: string;  // markdown
  status: "pending" | "generating" | "complete";
}

// Agent log entry
interface AgentLogEntry {
  timestamp: string;
  elapsed_seconds: number;
  report_id: string;
  action: "report_start" | "planning_start" | "planning_complete" | "section_start" | "section_content" | "section_complete" | "tool_call" | "tool_result" | "llm_response" | "report_complete";
  stage: "planning" | "generating" | "completed";
  section_title?: string;
  section_index?: number;
  details: Record<string, unknown>;
}

// Chat message
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
```

---

## Page Layout

### Split Panel (reuses SplitPanel component)

```
┌─────────────────────────────────────────────────┐
│ Header: Crucible | Report | report_id | status  │
├────────────────────────┬────────────────────────┤
│                        │ METRICS BAR            │
│ REPORT CONTENT         │ 3/5 sections | 2:34    │
│                        │ elapsed | 12 tool calls│
│ ┌────────────────────┐ ├────────────────────────┤
│ │ Title + Summary    │ │                        │
│ │ Metadata badges    │ │ WORKFLOW TIMELINE      │
│ └────────────────────┘ │                        │
│                        │ ● Planning started     │
│ ┌─ Section 01 ──────┐ │ ● Outline generated    │
│ │ ▼ Title     ✓done │ │ ● Section 1 started    │
│ │ Markdown content   │ │   🔍 insight_forge     │
│ │ with evidence...   │ │   🌐 panorama_search   │
│ └────────────────────┘ │   ✓ Section 1 complete │
│                        │ ● Section 2 started    │
│ ┌─ Section 02 ──────┐ │   🔍 insight_forge     │
│ │ ▼ Title   ⟳ gen   │ │   👥 interview_agents  │
│ │ Loading skeleton   │ │   ...                  │
│ └────────────────────┘ │                        │
│                        ├────────────────────────┤
│ ┌─ Section 03 ──────┐ │ CONSOLE LOG (collapse) │
│ │ ▶ Title   ○ pend  │ │ [12:34:01] INFO: ...   │
│ └────────────────────┘ │ [12:34:03] INFO: ...   │
│                        │                        │
├────────────────────────┴────────────────────────┤
│ CHAT (after completion)                          │
│ ┌──────────────────────────────────────┐ [Send] │
│ │ Ask the report agent a question...   │        │
│ └──────────────────────────────────────┘        │
│ Chat message history...                          │
└─────────────────────────────────────────────────┘
```

### Left Panel — Report Content

**Report Header:**
- Title (from outline)
- Summary badge (one-sentence finding)
- Metadata: report ID (mono), generation time, section count

**Sections List:**
- Numbered (01, 02, ...) with collapsible content
- Status per section:
  - `pending` — collapsed, gray badge "○ Pending"
  - `generating` — expanded, orange badge "⟳ Generating", skeleton content
  - `complete` — expanded by default (collapsible), green badge "✓ Done", markdown rendered
- Markdown rendered via `react-markdown` + `remark-gfm`
- Sections appear progressively as they complete

### Right Panel — Workflow Timeline

**Metrics Bar (top):**
- Sections: `3/5 completed`
- Elapsed: `2:34`
- Tool calls: `12`
- Status badge (PLANNING → GENERATING → COMPLETED)

**Agent Activity Timeline:**
- Chronological list of agent log entries
- Entry types with icons:
  - `planning_start` / `planning_complete` — 📋 Planning
  - `section_start` / `section_complete` — 📄 Section N
  - `tool_call` — icon by tool type:
    - `insight_forge` — 🔍 (Lucide: `Search`)
    - `panorama_search` — 🌐 (Lucide: `Globe`)
    - `quick_search` — ⚡ (Lucide: `Zap`)
    - `interview_agents` — 👥 (Lucide: `Users`)
  - `tool_result` — collapsible detail showing result data
  - `llm_response` — 🤖 (Lucide: `Bot`)
  - `report_complete` — ✅ (Lucide: `CheckCircle`)
- Each tool call entry is collapsible: click to see parameters + raw result
- Tool result displays:
  - `interview_agents` — agent name + quotes
  - `insight_forge` — facts + relationships
  - `panorama_search` — valid + expired facts
  - `quick_search` — ranked list

**Console Log (bottom, collapsible):**
- Plain text scrolling log
- Auto-scrolls to bottom
- Max height with scroll
- Collapsible via shadcn Collapsible or details/summary

### Bottom — Chat Interface (after generation completes)

- Input field + Send button
- Message history (user messages + agent responses)
- Agent responses rendered as markdown
- Calls `POST /api/report/chat` with `{ simulation_id, message, chat_history }`

---

## New Dependencies

```bash
pnpm add react-markdown remark-gfm
```

---

## Files

### New Files

```
frontend/app/
├── report/[simId]/
│   └── page.tsx                          # Complete rewrite — split panel + polling
├── components/report/
│   ├── ReportContent.tsx                 # Left panel: header + streaming sections
│   ├── ReportSection.tsx                 # Single collapsible section with markdown
│   ├── WorkflowTimeline.tsx              # Right panel: metrics + agent timeline
│   ├── ToolCallEntry.tsx                 # Single tool call with collapsible detail
│   ├── MetricsBar.tsx                    # Sections/time/tools counters
│   ├── ConsoleLog.tsx                    # Scrolling console output panel
│   ├── ReportChat.tsx                    # Chat interface with message history
│   └── ChatMessage.tsx                   # Single chat message bubble
├── actions/report.ts                     # Rewrite — all report.py endpoints
├── types/report.ts                       # Rewrite — new types for report.py
└── lib/api.ts                            # Add report.py base URL if different
```

### Deleted Files

Old report components replaced entirely:
- `frontend/app/components/report/ReportHeader.tsx`
- `frontend/app/components/report/ReportTimeline.tsx`
- `frontend/app/components/report/AgentScorecard.tsx`
- `frontend/app/components/report/AgentScoreGrid.tsx`
- `frontend/app/components/report/ExportButton.tsx`

---

## Polling Strategy

```
┌─ Trigger generation ─────────────────────────┐
│ POST /api/report/generate                     │
│ Returns: { task_id, report_id }               │
└───────────────────────────────────────────────┘
           │
           ▼
┌─ Polling loop (while status != COMPLETED) ────┐
│                                                │
│  Every 2s: GET /report/{id}/progress           │
│    → Update progress bar, current section      │
│    → If new section completed:                 │
│        GET /report/{id}/sections               │
│        → Render new section(s)                 │
│                                                │
│  Every 2s: GET /report/{id}/agent-log          │
│    ?from_line={lastLine}                       │
│    → Append new entries to timeline            │
│                                                │
│  Every 5s: GET /report/{id}/console-log        │
│    → Update console panel                      │
│                                                │
│  If status == FAILED:                          │
│    → Show error + retry button                 │
│    → Stop polling                              │
│                                                │
│  If status == COMPLETED:                       │
│    → Stop polling                              │
│    → Fetch full report                         │
│    → Enable chat interface                     │
└────────────────────────────────────────────────┘
```

---

## Component Details

### ReportContent (left panel)
- Props: `outline`, `sections[]`, `status`
- Shows report header when outline available (after planning phase)
- Maps sections with index → `<ReportSection>` for each
- Pending sections shown collapsed with gray badge

### ReportSection
- Props: `index`, `title`, `content`, `status`, `defaultOpen`
- Uses shadcn `Collapsible` or custom collapse with `motion`
- Status badge: Badge variant based on status
- Content: `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
- When `generating`: show Skeleton blocks
- Section number formatted as 2-digit: "01", "02", etc.

### WorkflowTimeline (right panel)
- Props: `entries[]`, `progress`, `status`
- `<MetricsBar>` at top
- Scrollable timeline of `<ToolCallEntry>` items
- Auto-scrolls to latest entry
- Grouped by section (visual separator between sections)

### ToolCallEntry
- Props: `entry: AgentLogEntry`
- Icon based on `action` and `details.tool_name`
- Timestamp + elapsed time
- Collapsible detail panel (click to expand)
- Detail content varies by tool type:
  - Shows parameters sent
  - Shows result summary (truncated, expandable)

### MetricsBar
- Props: `sectionsCompleted`, `totalSections`, `elapsed`, `toolCalls`, `status`
- Horizontal bar with 4 stat items
- Status badge with pulse animation when generating

### ConsoleLog
- Props: `lines: string[]`
- Collapsible panel (default closed)
- Monospace font (JetBrains Mono)
- Auto-scroll to bottom
- Max height ~200px with overflow scroll

### ReportChat
- Props: `simulationId`, `reportId`
- Text input + send button
- Message list with `<ChatMessage>` for each
- Calls `POST /api/report/chat` with message + chat_history
- Shows while report status is COMPLETED

### ChatMessage
- Props: `message: ChatMessage`
- User messages: right-aligned, primary background
- Agent messages: left-aligned, card background, markdown rendered

---

## Routing Change

The report page URL stays `/report/[simId]`. But the flow changes:

1. Page loads → check if report exists for this simId
2. If no report: show "Generate Report" button
3. If report exists and complete: show full report + chat
4. If report exists and generating: enter polling mode
5. If report failed: show error + retry

The `report_id` is fetched via `POST /api/report/generate` (which returns existing if already generated) or stored in URL state.

---

## Success Criteria

1. Report generation triggers via full `report.py` backend
2. Sections stream in one at a time with markdown rendering
3. Agent timeline shows tool calls with icons and collapsible details
4. Console log viewer works
5. Chat interface works after report completes
6. Progress bar and metrics update in real-time
7. Collapse/expand works on all sections and tool call details
8. `pnpm build` succeeds with no TypeScript errors
9. All shadcn components used consistently (Card, Badge, Button, Skeleton, Separator, Alert)
