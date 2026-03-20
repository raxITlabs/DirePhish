# Crucible Generative Pipeline — Design Spec

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Add a research-driven generative pipeline to Crucible so users can go from a company URL + optional context to a fully dynamic enterprise simulation — matching the original MiroFish's "document in → simulation out" flow.

---

## Goal

Replace the static preset-only flow with a dynamic pipeline: user provides a company URL and optional context (text or file uploads), a research agent gathers intelligence about the company, builds a knowledge graph in Zep, the user confirms the findings, then an LLM generates a complete simulation config (agents with real personas, worlds, pressures, scheduled events). The existing dashboard and report pages consume this generated config without changes.

## Problem

The Phase 1 frontend (built earlier today) has a display layer (dashboard, world views, D3 graph, pressure strip, report) but only supports static presets. Agents are stub names from YAML org charts. There's no document upload, no research, no ontology, no graph building, no LLM-generated personas. The original MiroFish's power was its generative pipeline — this spec adds that to Crucible.

## Tech Stack

- **LLM:** Gemini 3.1 Flash Lite (already configured, OpenAI-compatible via Google AI Studio)
- **Graph:** Zep Cloud (already configured, API key in .env)
- **Web scraping:** Defuddle CLI or direct fetch
- **Web search:** WebSearch for news, market data, incident history
- **Document extraction:** Reuse existing MiroFish text extraction (PDF, MD, TXT)
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind v4 (already set up)
- **Backend:** Flask, Python 3.12, UV (already set up)

---

## Pipeline Flow

```
User Input (company URL [required] + context text [optional] + file uploads [optional])
    ↓
Research Agent (async task)
  Step 1: Web scrape company URL (+ follow about/team/products pages, max 5)
  Step 2: Web search for news, incidents, market data (top 5-10 results)
  Step 3: Extract text from uploaded PDF/MD/TXT files
  Step 4: LLM synthesis → structured Company Dossier (JSON)
  Step 5: Push to Zep (entities, relationships, episodes)
    ↓
★ STOP 1: Company Intelligence Review (/research/[projectId])
  - Split panel: D3 Zep graph (left) + editable dossier (right)
  - User confirms or edits company profile, org, systems, risks, events
  - Edits sync back to Zep
  - "Confirm & Generate Config" button
    ↓
Config Generator (async task)
  - LLM reads Zep graph + user context
  - Generates: agent profiles (real personas), worlds, pressures, scheduled events, scenario narrative
  - Output: SimulationConfig JSON (same format as existing)
    ↓
★ STOP 2: Simulation Config Review (/configure/project/[projectId])
  - Existing Configure page components (AgentCards, WorldList, PressureCards, EventTimeline, LaunchBar)
  - Now populated with rich LLM-generated data instead of preset stubs
  - User can edit before launch
    ↓
Launch Simulation → Dashboard → Report (all existing, unchanged)
```

---

## Routes

| Route | Page | Status |
|-------|------|--------|
| `/` | Home — research form + presets | Modify existing |
| `/research/[projectId]` | Company Intelligence Review | New |
| `/configure/[presetId]` | Config review (preset path) | Exists unchanged |
| `/configure/project/[projectId]` | Config review (research path) | New route, reuses components |
| `/simulation/[simId]` | Live dashboard | Exists unchanged |
| `/report/[simId]` | After-action report | Exists unchanged |

**Two entry paths:**
1. **Preset path:** `/` → pick preset → `/configure/[presetId]` → Launch
2. **Research path:** `/` → enter URL + context/files → `/research/[projectId]` → confirm → `/configure/project/[projectId]` → Launch

---

## User Input

**Home page — new "Research Your Company" section (above presets):**

- **Company URL** (required) — text input
- **Additional Context** (optional) — textarea for free text ("We just had a ransomware scare", "Our CISO started 2 weeks ago", "Focus on GDPR compliance")
- **File Uploads** (optional) — drop zone accepting PDF, MD, TXT files (same as original MiroFish)
- **"Start Research" button** — creates project, uploads files, kicks off research agent, redirects to `/research/[projectId]`

---

## Research Agent

**Service:** `backend/app/services/research_agent.py`

Runs as an async task with progress tracking (same pattern as original MiroFish's ontology generation).

### Step 1: Web Scrape Company URL

- Fetch the provided URL
- Extract: company name, industry, products/services, team/leadership, about page content
- Follow key internal links (about, team, leadership, products, careers — max 5 additional pages total)
- Use Defuddle CLI for clean content extraction (strips nav, ads, etc.)

### Step 2: Web Search

- Search queries:
  - `"{company name}" site:linkedin.com org structure`
  - `"{company name}" security incident OR data breach`
  - `"{company name}" technology stack`
  - For public companies: `"{company name}" market cap revenue`
- Collect top 5-10 relevant results per query
- Extract key facts from each result

### Step 3: Process Uploaded Documents

- Extract text from PDF (using existing MiroFish PDF extractor)
- Read MD and TXT files directly
- Chunk if needed (reuse existing chunking from MiroFish)

### Step 4: LLM Synthesis

- Send all gathered data to Gemini Flash with a structured prompt
- Output: Company Dossier JSON:

```json
{
  "company": {
    "name": "NovaPay Inc.",
    "industry": "fintech",
    "size": "medium",
    "products": ["payment processing", "merchant services"],
    "geography": "US, EU",
    "publicCompany": false
  },
  "org": {
    "departments": ["Engineering", "Security", "Legal", "Executive"],
    "roles": [
      { "title": "CISO", "department": "Security", "reportsTo": "CEO" },
      { "title": "SOC Analyst", "department": "Security", "reportsTo": "CISO" },
      ...
    ]
  },
  "systems": [
    { "name": "PostgreSQL", "category": "database", "criticality": "high" },
    { "name": "Kubernetes", "category": "infrastructure", "criticality": "high" },
    ...
  ],
  "compliance": ["PCI-DSS", "GDPR", "SOC 2"],
  "risks": [
    { "name": "Ransomware", "likelihood": "high", "impact": "critical" },
    { "name": "Supply chain compromise", "likelihood": "medium", "impact": "high" },
    ...
  ],
  "recentEvents": [
    { "date": "2026-03-15", "description": "Competitor breached, similar tech stack", "source": "news" },
    ...
  ]
}
```

### Step 5: Push to Zep

- Create a new Zep graph for this project (graph ID stored on project)
- Push entities:
  - People/roles (from org)
  - Departments (from org)
  - Systems (from tech stack)
  - Compliance frameworks
  - Threats/risks
- Push relationships:
  - reports_to (role → role)
  - belongs_to (role → department)
  - uses (department → system)
  - governed_by (company → compliance)
  - threatened_by (company → risk)
- Push episodes:
  - Recent events as episodes
  - Uploaded document content as episodes
  - User context text as an episode

### Progress Tracking

Research task reports progress through stages:

| Stage | Progress | Message |
|-------|----------|---------|
| scraping | 0-20% | "Scraping company website..." |
| searching | 20-40% | "Searching for company intelligence..." |
| documents | 40-50% | "Processing uploaded documents..." |
| synthesizing | 50-80% | "Synthesizing company dossier..." |
| graph | 80-100% | "Building knowledge graph..." |

Frontend polls `GET /api/crucible/projects/<id>/status` every 3 seconds.

---

## Company Intelligence Review Page

**Route:** `/research/[projectId]`
**Type:** Client component (polling while research runs, then interactive)

### Loading State

While research is running, show progress bar with stage messages. Same pattern as original MiroFish's ontology generation step.

### Review State (after research completes)

**Layout:** Split panel — same Graph/Split/Focus toggle as simulation dashboard.

**Left panel — Zep Knowledge Graph:**
- D3 force-directed graph showing entities and relationships from Zep
- Reuses existing `GraphPanel` component
- Node types use the SAME color map as the existing `GraphPanel`:
  - agent/person: `#3b82f6` (blue)
  - org/company: `#ff4500` (orange)
  - threat: `#ef4444` (red)
  - compliance: `#a855f7` (purple)
  - system/department: `#4ade80` (green)
- The Zep manager maps its entities to these existing type keys (e.g., roles → "agent", departments → "system", company → "org")
- Click node → detail panel

**Right panel — Editable Company Dossier:**

Sections (each editable):

1. **Company Profile** — name, industry, size, products (tag-style), geography
2. **Org Structure** — list of roles with department and reporting line. Add/remove/edit roles.
3. **Technology Stack** — list of systems with category and criticality. Add/remove.
4. **Compliance & Regulations** — tag-style list. Add/remove.
5. **Risk Profile** — list of risks with likelihood and impact. Add/remove/edit.
6. **Recent Events** — list of dated events. Add/remove/edit.
7. **User Context** — the original text they entered (read-only reference)
8. **Uploaded Documents** — filenames and extracted text summaries (read-only reference)

**Bottom bar:** "Confirm & Generate Config" button — triggers a two-step sequence:
1. Frontend calls `PUT /dossier` with the edited dossier. Backend saves dossier and syncs changes to Zep. Frontend waits for 200 response.
2. On success, frontend calls `POST /generate-config`. Backend kicks off async config generation. Frontend redirects to `/configure/project/[projectId]`.
If the PUT (Zep sync) fails, show error and do NOT proceed to config generation.

**Error state:** If research fails (`status: "failed"`), show `project.errorMessage` with a "Retry Research" button that calls `POST /api/crucible/projects` again with the same inputs.

---

## Config Generator

**Service:** `backend/app/services/config_generator.py`

Runs as an async task after user confirms the dossier.

**Input:** Zep graph ID + user context + dossier JSON

**LLM prompt instructs Gemini to generate:**

1. **Agent profiles** — realistic personas derived from org roles. Each agent gets:
   - A realistic full name
   - Their role
   - A detailed persona (personality, experience, communication style, biases, tensions)
   - Example from the NovaPay test config: "Yuki Tanaka, methodical and calm under pressure. Former SOC analyst with 8 years experience. Prefers structured communication and clear escalation paths."

2. **Worlds** — communication channels appropriate for the company:
   - Slack-type (with channel names like #ir-war-room, #security-alerts)
   - Email-type (Corporate Email)
   - Based on company size and industry

3. **Pressures** — derived from compliance requirements and risk profile:
   - GDPR 72h countdown if EU data
   - PCI-DSS if payment processing
   - SLA timers based on products/services
   - Revenue thresholds based on company size

4. **Scheduled events** — realistic incident injects across rounds:
   - Escalation sequence based on the risk profile
   - If user context mentions a specific scenario, build injects around it
   - External events (press leak, regulator inquiry) for realism

5. **Scenario narrative** — the opening situation description

**Output:** SimulationConfig JSON in the exact format `run_crucible_simulation.py` expects (same as `test_crucible_config.json`).

---

## New Flask Endpoints

**Blueprint:** Add to existing `/api/crucible/*`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/crucible/projects` | POST | Create project, upload files, start research |
| `/api/crucible/projects/<id>/status` | GET | Poll research/config-gen progress |
| `/api/crucible/projects/<id>/dossier` | GET | Get company dossier |
| `/api/crucible/projects/<id>/dossier` | PUT | Update edited dossier, sync to Zep |
| `/api/crucible/projects/<id>/graph` | GET | Get Zep graph data for D3 |
| `/api/crucible/projects/<id>/generate-config` | POST | Trigger config generation from dossier |
| `/api/crucible/projects/<id>/config` | GET | Get generated SimulationConfig |

---

## New Frontend Types

```typescript
// app/types/project.ts

export interface Project {
  projectId: string;
  companyUrl: string;
  userContext?: string;
  uploadedFiles: string[];   // filenames
  status: "researching" | "research_complete" | "generating_config" | "config_ready" | "failed";
  progress: number;          // 0-100
  progressMessage: string;
  errorMessage?: string;     // populated when status is "failed"
  graphId?: string;          // Zep graph ID
  simId?: string;            // set after simulation is launched — links project to simulation
  createdAt: string;
}

export interface CompanyDossier {
  company: {
    name: string;
    industry: string;
    size: string;
    products: string[];
    geography: string;
    publicCompany: boolean;
  };
  org: {
    departments: string[];
    roles: OrgRole[];
  };
  systems: SystemInfo[];
  compliance: string[];
  risks: RiskInfo[];
  recentEvents: EventInfo[];
}

export interface OrgRole {
  title: string;
  department: string;
  reportsTo: string;
}

export interface SystemInfo {
  name: string;
  category: string;
  criticality: "low" | "medium" | "high" | "critical";
}

export interface RiskInfo {
  name: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
}

export interface EventInfo {
  date: string;
  description: string;
  source: string;
}
```

---

## New Frontend Server Actions

```typescript
// app/actions/project.ts

// createProject uses a separate fetchMultipart helper (not fetchApi)
// because file uploads require multipart/form-data, not application/json.
// The fetchMultipart helper must NOT set Content-Type (browser sets it with boundary).
createProject(formData: FormData) → { projectId: string }

getProjectStatus(projectId: string) → Project
getDossier(projectId: string) → CompanyDossier
updateDossier(projectId: string, dossier: CompanyDossier) → { status: string }
getProjectGraph(projectId: string) → GraphData
generateConfig(projectId: string) → { status: string }
getProjectConfig(projectId: string) → SimulationConfig
```

**Note:** `createProject` sends a `FormData` body (URL + context + files) using a `fetchMultipart` helper in `app/lib/api.ts` that omits the `Content-Type` header. All other actions use the existing `fetchApi` JSON helper.

---

## New Frontend Components

```
app/components/
├── home/
│   └── ResearchForm.tsx        # New — URL + context + file upload form (client component)
├── research/
│   ├── ResearchProgress.tsx    # New — progress bar with stage messages
│   ├── DossierEditor.tsx       # New — editable company dossier (client component)
│   ├── CompanyProfile.tsx      # New — name, industry, size, products section
│   ├── OrgStructure.tsx        # New — roles list with add/edit/remove
│   ├── SystemsList.tsx         # New — tech stack list
│   ├── ComplianceTags.tsx      # New — tag-style compliance list
│   ├── RiskProfile.tsx         # New — risks with likelihood/impact
│   └── RecentEvents.tsx        # New — dated events list
```

---

## Component Structure for New Pages

```
app/
├── research/
│   └── [projectId]/
│       └── page.tsx            # Company Intelligence Review page
├── configure/
│   ├── [presetId]/
│   │   └── page.tsx            # Existing preset config page
│   └── project/
│       └── [projectId]/
│           └── page.tsx        # Research-generated config page (reuses configure components)
```

---

## What Changes in Existing Code

### Home Page (`app/page.tsx`)
- Add `ResearchForm` component above the preset grid
- New section: "Research Your Company"

### GraphPanel Component
- Rename `isSimulating` prop to `isLive` (generic — works for both simulation and research contexts)
- Update simulation page to pass `isLive={isRunning}`, research page passes `isLive={false}`
- No other changes needed — already accepts `GraphData` props

### Types Barrel Export (`app/types/index.ts`)
- Add `export * from "./project";` for the new project types

### Configure Page Components
- `AgentCards`, `WorldList`, `PressureCards`, `EventTimeline`, `LaunchBar` — no changes
- New `/configure/project/[projectId]/page.tsx` uses same components but loads config via `getProjectConfig(projectId)` instead of `getPresetConfig(presetId)`

### Simulation Dashboard
- `GraphPanel` now queries Zep graph instead of config-derived graph
- Backend graph endpoint updated to read from Zep when a project graph ID exists
- When launching from `/configure/project/[projectId]`, the `LaunchBar` calls `launchSimulation(config)` and then updates the project record with the resulting `simId` (via a new `PATCH /api/crucible/projects/<id>` endpoint or by including `projectId` in the launch payload so the backend links them)
- The simulation graph endpoint resolves the Zep graph ID by looking up the project associated with the simulation

---

## What Stays Unchanged

- Simulation dashboard (all components)
- After-action report (all components)
- Preset flow (still works as quick-start)
- Types: SimulationConfig, AgentAction, SimulationStatus, ActivePressureState, Report (all unchanged)
- Server Actions: simulation.ts, report.ts (unchanged)
- Flask endpoints: simulation launch, status, actions, stop (unchanged)

---

## Out of Scope (this phase)

- Real-time Zep graph updates during simulation (agents writing back to graph — future phase)
- Multiple simulation runs per project (re-running with different configs)
- User accounts / saved projects
- Mobile responsive layout
- Post-simulation agent chat
