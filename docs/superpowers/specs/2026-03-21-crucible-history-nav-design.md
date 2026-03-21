# Crucible History & Navigation Design Spec

**Goal:** Add simulation history to the home page so users can browse past simulations, view their status, and navigate to reports/configs. Also add breadcrumb navigation across pages.

**Sub-project:** 5 of 5 (Foundation ✅ → Report ✅ → Graph ✅ → Sim Dashboard ✅ → **History & Nav**)

---

## Features

### 1. Simulation History Section (Home Page)
New section on the home page between "Research Your Company" and "Presets" showing recent simulations:
- Card grid showing recent simulations (fetched from backend)
- Each card shows: simulation ID, company name, status badge, round progress, created date, agent count
- Click card → navigate to simulation (if running) or report (if completed)
- "No simulations yet" empty state

### 2. Backend Endpoint
The backend needs a simple list endpoint. Check if one exists — the Crucible manager tracks simulations in memory. If no list endpoint exists, we'll add a minimal one.

### 3. Breadcrumb Navigation
Add breadcrumbs to all inner pages:
- Simulation: `Home / Simulation / {simId}`
- Report: `Home / Report / {simId}`
- Research: `Home / Research / {projectId}`
- Configure: `Home / Configure / {presetId}`

Uses shadcn Breadcrumb component (install if not present).

### 4. Header Enhancement
- Add nav links to Header for quick access: Home, (current simulation if active)
- Show current page context

---

## Files

### New Files
- `frontend/app/components/home/SimulationHistory.tsx` — history card grid
- `frontend/app/components/home/SimulationCard.tsx` — single simulation history card
- `frontend/app/components/layout/Breadcrumbs.tsx` — breadcrumb nav component

### Modified Files
- `frontend/app/page.tsx` — add SimulationHistory section
- `frontend/app/actions/simulation.ts` — add `listSimulations()` action
- `frontend/app/types/simulation.ts` — add `SimulationSummary` type
- `frontend/app/simulation/[simId]/page.tsx` — add breadcrumbs
- `frontend/app/report/[simId]/page.tsx` — add breadcrumbs
- `frontend/app/research/[projectId]/page.tsx` — add breadcrumbs
- `frontend/app/configure/[presetId]/page.tsx` — add breadcrumbs
- `frontend/app/configure/project/[projectId]/page.tsx` — add breadcrumbs

### Backend (if needed)
- `backend/app/api/crucible.py` — add `GET /api/crucible/simulations` list endpoint

---

## Success Criteria

1. Home page shows recent simulations with status badges
2. Clicking a simulation card navigates to the right page
3. Breadcrumbs appear on all inner pages
4. Empty state shown when no simulations exist
5. `pnpm build` succeeds
