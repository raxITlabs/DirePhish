# Crucible Next.js Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-page Next.js frontend (Home, Configure, Simulation Dashboard, After-Action Report) with a Flask backend blueprint that serves Crucible preset configs, manages simulation subprocesses, and streams action data.

**Architecture:** Flask blueprint (`/api/crucible/*`) provides REST endpoints. Next.js Server Actions call Flask server-side and return typed data to React components. Simulation dashboard uses polling (3s status, 30s graph). D3.js renders a force-directed knowledge graph in a split-panel layout.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, D3.js, pnpm (frontend). Flask, Python 3.12, UV (backend).

**Spec:** `docs/superpowers/specs/2026-03-21-crucible-nextjs-frontend-design.md`

---

## File Structure

### Backend (new files)

```
backend/app/api/
└── crucible.py                        # New Flask blueprint — all /api/crucible/* endpoints

backend/app/services/
└── crucible_manager.py                # Crucible simulation lifecycle — load presets, launch subprocess, parse actions
```

### Frontend (new/modified files)

```
frontend/
├── app/
│   ├── layout.tsx                      # MODIFY — update metadata, add Crucible branding
│   ├── globals.css                     # MODIFY — add Crucible design tokens
│   ├── page.tsx                        # REPLACE — Home page with preset grid
│   ├── actions/
│   │   ├── presets.ts                  # Server Actions — getPresets, getPresetConfig
│   │   ├── simulation.ts              # Server Actions — launch, status, actions, stop
│   │   ├── report.ts                  # Server Actions — generate, get report
│   │   └── graph.ts                   # Server Actions — getGraphData
│   ├── types/
│   │   ├── index.ts                   # Re-exports all types
│   │   ├── preset.ts                  # Preset interface
│   │   ├── simulation.ts              # SimulationConfig, AgentConfig, WorldConfig, PressureConfig, ScheduledEvent
│   │   ├── status.ts                  # SimulationStatus, AgentAction, ActivePressureState
│   │   ├── graph.ts                   # GraphData, GraphNode, GraphEdge
│   │   └── report.ts                  # Report, TimelineEntry, AgentScore
│   ├── lib/
│   │   └── api.ts                     # Shared fetch helper for Flask backend
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.tsx             # Top nav bar (Crucible branding)
│   │   ├── home/
│   │   │   ├── PresetGrid.tsx         # Grid of preset cards
│   │   │   ├── PresetCard.tsx         # Individual preset card
│   │   │   └── UploadZone.tsx         # JSON config file upload (client component)
│   │   ├── configure/
│   │   │   ├── AgentCards.tsx         # Agent card grid
│   │   │   ├── WorldList.tsx          # World/channel list
│   │   │   ├── PressureCards.tsx      # Pressure config cards
│   │   │   ├── EventTimeline.tsx      # Scheduled events list
│   │   │   └── LaunchBar.tsx          # Sticky launch button (client component)
│   │   ├── simulation/
│   │   │   ├── ViewToggle.tsx         # Graph/Split/Focus toggle
│   │   │   ├── GraphPanel.tsx         # D3 force-directed graph (client component)
│   │   │   ├── GraphNodeDetail.tsx    # Node click detail overlay
│   │   │   ├── WorldTabs.tsx          # Tab container for world views
│   │   │   ├── SlackWorld.tsx         # Chat-style Slack message list
│   │   │   ├── EmailWorld.tsx         # Inbox-style email list
│   │   │   ├── TimelineView.tsx       # Chronological all-world feed
│   │   │   ├── RoundDivider.tsx       # Round separator component
│   │   │   ├── EventInjectBanner.tsx  # Scheduled event highlight
│   │   │   └── PressureStrip.tsx      # Horizontal pressure cards with live severity
│   │   └── report/
│   │       ├── ReportHeader.tsx       # Report header with metadata
│   │       ├── ReportTimeline.tsx     # Key decisions timeline
│   │       ├── AgentScorecard.tsx     # Individual agent score card
│   │       ├── AgentScoreGrid.tsx     # Grid of scorecards
│   │       └── ExportButton.tsx       # Download as markdown (client component)
│   ├── configure/
│   │   └── [presetId]/
│   │       └── page.tsx               # Config review & launch page
│   └── simulation/
│   │   └── [simId]/
│   │       └── page.tsx               # Live simulation dashboard page
│   └── report/
│       └── [simId]/
│           └── page.tsx               # After-action report page
├── package.json                        # MODIFY — add d3 dependency
└── next.config.ts                      # MODIFY — add rewrites if needed
```

---

## Task 1: TypeScript Types

**Files:**
- Create: `frontend/app/types/preset.ts`
- Create: `frontend/app/types/simulation.ts`
- Create: `frontend/app/types/status.ts`
- Create: `frontend/app/types/graph.ts`
- Create: `frontend/app/types/report.ts`
- Create: `frontend/app/types/index.ts`

- [ ] **Step 1: Create types directory**

```bash
mkdir -p frontend/app/types
```

- [ ] **Step 2: Write preset.ts**

```typescript
// frontend/app/types/preset.ts
export interface Preset {
  id: string;
  name: string;
  description: string;
  industry: string;
  size: string;
  worldTypes: string[];
  pressureCount: number;
}
```

- [ ] **Step 3: Write simulation.ts**

```typescript
// frontend/app/types/simulation.ts
export interface SimulationConfig {
  simulationId?: string;
  companyName: string;
  scenario: string;
  totalRounds: number;
  hoursPerRound: number;
  agents: AgentConfig[];
  worlds: WorldConfig[];
  pressures: PressureConfig[];
  scheduledEvents: ScheduledEvent[];
}

export interface AgentConfig {
  name: string;
  role: string;
  persona: string;
}

export interface WorldConfig {
  type: string;
  name: string;
}

export interface PressureConfig {
  name: string;
  type: "countdown" | "deadline" | "threshold" | "triggered";
  affectsRoles: string[];
  hours?: number;
  hoursUntil?: number;
  value?: number;
  unit?: string;
  triggeredBy?: string;
  severityAt50pct: string;
  severityAt25pct: string;
}

export interface ScheduledEvent {
  round: number;
  description: string;
}
```

- [ ] **Step 4: Write status.ts**

```typescript
// frontend/app/types/status.ts
export interface SimulationStatus {
  simId: string;
  status: "starting" | "running" | "completed" | "stopped" | "failed";
  currentRound: number;
  totalRounds: number;
  actionCount: number;
  recentActions: AgentAction[];
  pressures: ActivePressureState[];
}

export interface AgentAction {
  round: number;
  timestamp: string;
  simulationId: string;
  agent: string;
  role: string;
  world: string;
  action: string;
  args: Record<string, unknown>;
  result: { success: boolean; action: string; agentId: string } | null;
}

export interface ActivePressureState {
  name: string;
  type: string;
  affectsRoles: string[];
  remainingHours?: number;
  value?: number;
  unit?: string;
  severity: string;
  triggered: boolean;
}
```

- [ ] **Step 5: Write graph.ts**

```typescript
// frontend/app/types/graph.ts
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  type: string;
}
```

- [ ] **Step 6: Write report.ts**

```typescript
// frontend/app/types/report.ts
export interface Report {
  simId: string;
  status: "generating" | "complete" | "failed";
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

export interface TimelineEntry {
  round: number;
  timestamp: string;
  description: string;
  significance: "normal" | "high" | "critical";
  agent?: string;
}

export interface AgentScore {
  name: string;
  role: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  actionCount: number;
  worldBreakdown: Record<string, number>;
}
```

- [ ] **Step 7: Write index.ts barrel export**

```typescript
// frontend/app/types/index.ts
export * from "./preset";
export * from "./simulation";
export * from "./status";
export * from "./graph";
export * from "./report";
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add frontend/app/types/
git commit -m "feat(frontend): add TypeScript type definitions for Crucible"
```

---

## Task 2: Flask Crucible Blueprint — Presets + Simulation Launch

This task creates the backend API that the frontend consumes. It reads Crucible builtin presets, manages simulation configs, launches the Crucible subprocess, and serves actions.

**Files:**
- Create: `backend/app/api/crucible.py`
- Create: `backend/app/services/crucible_manager.py`
- Modify: `backend/app/__init__.py` (register blueprint)

**Reference files to read first:**
- `backend/uploads/test_crucible_config.json` — the JSON config format the simulation runner expects
- `backend/scripts/run_crucible_simulation.py` — how simulations are launched
- Crucible builtins: `/Users/adeshgairola/Documents/raxIT/code/testing-folder/crucible/src/crucible/builtins/presets/cybersecurity_ir.yaml`

- [ ] **Step 1: Create crucible_manager.py — preset loading**

This service loads Crucible builtin presets from the installed package and manages simulation state.

```python
# backend/app/services/crucible_manager.py
"""
Crucible simulation manager — loads presets, launches simulations, tracks state.
"""
import json
import os
import subprocess
import threading
import uuid
from pathlib import Path

import yaml

# Crucible builtins location (from installed package)
try:
    import crucible
    CRUCIBLE_BUILTINS = Path(crucible.__file__).parent / "builtins"
except ImportError:
    CRUCIBLE_BUILTINS = None

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
SIMULATIONS_DIR = UPLOADS_DIR / "simulations"
SCRIPTS_DIR = Path(__file__).parent.parent.parent / "scripts"

# Preset metadata not in YAML — kept here for simplicity
PRESET_METADATA = {
    "cybersecurity_ir": {
        "description": "Incident response simulation for a cybersecurity breach with GDPR compliance pressure, SLA timers, and multi-team coordination.",
    },
}


def list_presets() -> list[dict]:
    """List available Crucible presets from builtins directory."""
    if not CRUCIBLE_BUILTINS:
        return []
    presets_dir = CRUCIBLE_BUILTINS / "presets"
    if not presets_dir.exists():
        return []
    presets = []
    for yaml_file in sorted(presets_dir.glob("*.yaml")):
        preset_id = yaml_file.stem
        with open(yaml_file) as f:
            data = yaml.safe_load(f)
        enterprise = data.get("enterprise", {})
        meta = PRESET_METADATA.get(preset_id, {})
        presets.append({
            "id": preset_id,
            "name": enterprise.get("name", preset_id),
            "description": meta.get("description", ""),
            "industry": enterprise.get("industry", ""),
            "size": enterprise.get("size", "medium"),
            "worldTypes": [w.get("name", w.get("type", "")) for w in enterprise.get("worlds", [])],
            "pressureCount": len(enterprise.get("pressures", [])),
        })
    return presets


def get_preset_config(preset_id: str) -> dict | None:
    """Load a preset YAML and return it as a SimulationConfig-shaped dict.
    Also handles custom uploaded configs (IDs starting with 'custom_')."""
    # Handle custom uploaded configs
    if preset_id.startswith("custom_"):
        config_path = UPLOADS_DIR / "configs" / f"{preset_id}.json"
        if not config_path.exists():
            return None
        import json
        with open(config_path) as f:
            return json.load(f)

    if not CRUCIBLE_BUILTINS:
        return None
    yaml_path = CRUCIBLE_BUILTINS / "presets" / f"{preset_id}.yaml"
    if not yaml_path.exists():
        return None
    with open(yaml_path) as f:
        data = yaml.safe_load(f)
    enterprise = data.get("enterprise", {})
    # Transform to SimulationConfig shape (snake_case for JSON transport)
    # Extract agents from org.reporting_lines (role names become agent stubs)
    org = enterprise.get("org", {})
    reporting_lines = org.get("reporting_lines", {})
    agent_profiles = []
    for role_name in reporting_lines:
        agent_profiles.append({
            "name": role_name.replace("_", " ").title(),
            "role": role_name,
            "persona": f"{role_name.replace('_', ' ').title()} at {enterprise.get('name', 'the company')}.",
        })
    # Also add any roles that only appear as managers (values not in keys)
    for manager in set(reporting_lines.values()):
        if manager not in reporting_lines:
            agent_profiles.append({
                "name": manager.replace("_", " ").title(),
                "role": manager,
                "persona": f"{manager.replace('_', ' ').title()} at {enterprise.get('name', 'the company')}.",
            })

    return {
        "company_name": enterprise.get("name", ""),
        "scenario": "",  # filled by user or seed doc
        "total_rounds": 5,  # default
        "hours_per_round": 1.0,
        "agent_profiles": agent_profiles,
        "worlds": enterprise.get("worlds", []),
        "pressures": enterprise.get("pressures", []),
        "scheduled_events": [],
    }


# --- Simulation lifecycle ---

_simulations: dict[str, dict] = {}  # in-memory state
_processes: dict[str, subprocess.Popen] = {}


def launch_simulation(config: dict) -> str:
    """Save config and launch run_crucible_simulation.py as subprocess."""
    sim_id = config.get("simulation_id") or f"crucible_{uuid.uuid4().hex[:8]}"
    config["simulation_id"] = sim_id

    sim_dir = SIMULATIONS_DIR / sim_id
    sim_dir.mkdir(parents=True, exist_ok=True)

    config_path = sim_dir / "config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    _simulations[sim_id] = {
        "sim_id": sim_id,
        "status": "starting",
        "current_round": 0,
        "total_rounds": config.get("total_rounds", 5),
        "action_count": 0,
    }

    script_path = SCRIPTS_DIR / "run_crucible_simulation.py"
    proc = subprocess.Popen(
        ["uv", "run", "python", str(script_path), str(config_path)],
        cwd=str(Path(__file__).parent.parent.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    _processes[sim_id] = proc
    _simulations[sim_id]["status"] = "running"

    # Monitor in background
    def _monitor():
        proc.wait()
        if sim_id in _simulations:
            _simulations[sim_id]["status"] = "completed" if proc.returncode == 0 else "failed"

    threading.Thread(target=_monitor, daemon=True).start()

    return sim_id


def get_simulation_status(sim_id: str) -> dict | None:
    """Get current simulation status including action count from actions.jsonl."""
    state = _simulations.get(sim_id)
    if not state:
        return None

    actions_path = SIMULATIONS_DIR / sim_id / "actions.jsonl"
    actions = _read_actions(actions_path)
    if actions:
        state["action_count"] = len(actions)
        state["current_round"] = max(a.get("round", 0) for a in actions)

    # Read pressure state if available
    state["pressures"] = []  # TODO: read from Crucible engine state

    state["recent_actions"] = actions[-10:] if actions else []
    return state


def get_simulation_actions(sim_id: str, world: str | None = None, from_round: int | None = None) -> list[dict]:
    """Read actions from actions.jsonl with optional filters."""
    actions_path = SIMULATIONS_DIR / sim_id / "actions.jsonl"
    actions = _read_actions(actions_path)
    if world:
        actions = [a for a in actions if a.get("world") == world]
    if from_round is not None:
        actions = [a for a in actions if a.get("round", 0) >= from_round]
    return actions


def stop_simulation(sim_id: str) -> str:
    """Stop a running simulation."""
    proc = _processes.get(sim_id)
    if proc and proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=10)
    if sim_id in _simulations:
        _simulations[sim_id]["status"] = "stopped"
    return "stopped"


def _read_actions(path: Path) -> list[dict]:
    """Read actions.jsonl file."""
    if not path.exists():
        return []
    actions = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    actions.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return actions
```

- [ ] **Step 2: Create crucible.py Flask blueprint**

```python
# backend/app/api/crucible.py
"""
Flask blueprint for Crucible simulation API.
All endpoints under /api/crucible/*
"""
import json
from pathlib import Path

from flask import Blueprint, jsonify, request

from ..services.crucible_manager import (
    list_presets,
    get_preset_config,
    launch_simulation,
    get_simulation_status,
    get_simulation_actions,
    stop_simulation,
)

crucible_bp = Blueprint("crucible", __name__)


@crucible_bp.route("/presets", methods=["GET"])
def presets():
    return jsonify({"data": list_presets()})


@crucible_bp.route("/presets/<preset_id>", methods=["GET"])
def preset_config(preset_id):
    config = get_preset_config(preset_id)
    if not config:
        return jsonify({"error": f"Preset '{preset_id}' not found"}), 404
    return jsonify({"data": config})


@crucible_bp.route("/configs/upload", methods=["POST"])
def upload_config():
    """Store a custom config temporarily and return a config ID."""
    import json, uuid
    from pathlib import Path
    data = request.get_json()
    if not data or "config" not in data:
        return jsonify({"error": "No config provided"}), 400
    config_id = f"custom_{uuid.uuid4().hex[:8]}"
    config_dir = Path(__file__).parent.parent.parent / "uploads" / "configs"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_path = config_dir / f"{config_id}.json"
    with open(config_path, "w") as f:
        f.write(data["config"])
    return jsonify({"data": {"configId": config_id}})


@crucible_bp.route("/simulations", methods=["POST"])
def create_simulation():
    config = request.get_json()
    if not config:
        return jsonify({"error": "No config provided"}), 400
    sim_id = launch_simulation(config)
    return jsonify({"data": {"simId": sim_id}}), 201


@crucible_bp.route("/simulations/<sim_id>/status", methods=["GET"])
def simulation_status(sim_id):
    status = get_simulation_status(sim_id)
    if not status:
        return jsonify({"error": f"Simulation '{sim_id}' not found"}), 404
    return jsonify({"data": status})


@crucible_bp.route("/simulations/<sim_id>/actions", methods=["GET"])
def simulation_actions(sim_id):
    world = request.args.get("world")
    from_round = request.args.get("from_round", type=int)
    actions = get_simulation_actions(sim_id, world=world, from_round=from_round)
    return jsonify({"data": actions})


@crucible_bp.route("/simulations/<sim_id>/stop", methods=["POST"])
def simulation_stop(sim_id):
    status = stop_simulation(sim_id)
    return jsonify({"data": {"status": status}})


@crucible_bp.route("/simulations/<sim_id>/graph", methods=["GET"])
def simulation_graph(sim_id):
    """Build graph data from simulation config (agents, org, pressures)."""
    status = get_simulation_status(sim_id)
    if not status:
        return jsonify({"error": f"Simulation '{sim_id}' not found"}), 404

    # Read config to build graph
    config_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id / "config.json"
    if not config_path.exists():
        return jsonify({"data": {"nodes": [], "edges": []}})

    with open(config_path) as f:
        config = json.load(f)

    nodes = []
    edges = []

    # Org node
    company = config.get("company_name", "Company")
    nodes.append({"id": "org_0", "name": company, "type": "org", "attributes": {}})

    # Agent nodes
    for i, agent in enumerate(config.get("agent_profiles", [])):
        agent_id = f"agent_{i}"
        nodes.append({
            "id": agent_id,
            "name": agent.get("name", f"Agent {i}"),
            "type": "agent",
            "attributes": {"role": agent.get("role", ""), "persona": agent.get("persona", "")},
        })
        edges.append({"source": agent_id, "target": "org_0", "label": agent.get("role", "member"), "type": "works_at"})

    # Pressure nodes
    for i, pressure in enumerate(config.get("pressures", [])):
        p_id = f"pressure_{i}"
        p_type = "compliance" if "gdpr" in pressure.get("name", "").lower() else "threat"
        nodes.append({
            "id": p_id,
            "name": pressure.get("name", f"Pressure {i}"),
            "type": p_type,
            "attributes": {"pressure_type": pressure.get("type", ""), "severity_at_50pct": pressure.get("severity_at_50pct", "")},
        })
        # Connect affected agents
        for j, agent in enumerate(config.get("agent_profiles", [])):
            if agent.get("role") in pressure.get("affects_roles", []):
                edges.append({"source": f"pressure_{i}", "target": f"agent_{j}", "label": "affects", "type": "pressure"})

    return jsonify({"data": {"nodes": nodes, "edges": edges}})


@crucible_bp.route("/simulations/<sim_id>/report", methods=["POST"])
def generate_report(sim_id):
    """Trigger after-action report generation via subprocess."""
    import json, subprocess, threading
    from pathlib import Path

    sim_dir = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id
    config_path = sim_dir / "config.json"
    actions_path = sim_dir / "actions.jsonl"
    report_path = sim_dir / "report.json"

    if not config_path.exists() or not actions_path.exists():
        return jsonify({"error": "Simulation data not found"}), 404

    if report_path.exists():
        return jsonify({"data": {"status": "complete"}}), 200

    script_path = Path(__file__).parent.parent.parent / "scripts" / "generate_after_action_report.py"

    def _run():
        subprocess.run(
            ["uv", "run", "python", str(script_path), str(config_path), str(actions_path), str(report_path)],
            cwd=str(Path(__file__).parent.parent.parent),
        )

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/simulations/<sim_id>/report", methods=["GET"])
def get_report(sim_id):
    """Get generated after-action report."""
    import json
    from pathlib import Path
    report_path = Path(__file__).parent.parent.parent / "uploads" / "simulations" / sim_id / "report.json"
    if not report_path.exists():
        return jsonify({"data": {"simId": sim_id, "status": "generating"}}), 200
    with open(report_path) as f:
        report = json.load(f)
    report["simId"] = sim_id
    report["status"] = "complete"
    return jsonify({"data": report})
```

- [ ] **Step 3: Register blueprint in Flask app**

Inside the `create_app()` function in `backend/app/__init__.py`, add after line 69 (after the existing `app.register_blueprint` calls for graph, simulation, and report):

```python
from .api.crucible import crucible_bp
app.register_blueprint(crucible_bp, url_prefix='/api/crucible')
```

This MUST be inside `create_app()` — `app` is a local variable in that function.

- [ ] **Step 4: Test endpoints manually**

Start the Flask server and test with curl:

```bash
cd backend && uv run python -m flask --app app run --port 5001
```

In another terminal:
```bash
curl http://localhost:5001/api/crucible/presets | python -m json.tool
curl http://localhost:5001/api/crucible/presets/cybersecurity_ir | python -m json.tool
```

Expected: JSON responses with preset data.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/crucible.py backend/app/services/crucible_manager.py backend/app/__init__.py
git commit -m "feat(backend): add Crucible Flask blueprint with preset and simulation endpoints"
```

---

## Task 3: Server Actions + API Helper

**Files:**
- Create: `frontend/app/lib/api.ts`
- Create: `frontend/app/actions/presets.ts`
- Create: `frontend/app/actions/simulation.ts`
- Create: `frontend/app/actions/report.ts`
- Create: `frontend/app/actions/graph.ts`

- [ ] **Step 1: Create lib directory and api.ts helper**

```typescript
// frontend/app/lib/api.ts
const API_BASE = process.env.FLASK_API_URL || "http://localhost:5001";

export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      return { error: json.error || `HTTP ${res.status}` };
    }
    return { data: json.data as T };
  } catch {
    return { error: "Backend not connected. Start the Flask server on port 5001." };
  }
}
```

- [ ] **Step 2: Write presets.ts server actions**

```typescript
// frontend/app/actions/presets.ts
"use server";

import { fetchApi } from "@/app/lib/api";
import type { Preset, SimulationConfig, PressureConfig } from "@/app/types";

export async function getPresets(): Promise<{ data: Preset[] } | { error: string }> {
  return fetchApi<Preset[]>("/api/crucible/presets");
}

export async function uploadCustomConfig(
  jsonText: string
): Promise<{ data: { configId: string } } | { error: string }> {
  return fetchApi<{ configId: string }>("/api/crucible/configs/upload", {
    method: "POST",
    body: JSON.stringify({ config: jsonText }),
  });
}

export async function getPresetConfig(
  presetId: string
): Promise<{ data: SimulationConfig } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/presets/${presetId}`);
  if ("error" in result) return result;

  // Transform snake_case backend response to camelCase frontend types
  const d = result.data;
  return {
    data: {
      companyName: (d.company_name as string) || "",
      scenario: (d.scenario as string) || "",
      totalRounds: (d.total_rounds as number) || 5,
      hoursPerRound: (d.hours_per_round as number) || 1.0,
      agents: ((d.agent_profiles as Array<Record<string, string>>) || []).map((a) => ({
        name: a.name || "",
        role: a.role || "",
        persona: a.persona || "",
      })),
      worlds: ((d.worlds as Array<Record<string, string>>) || []).map((w) => ({
        type: w.type || "",
        name: w.name || "",
      })),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map((p) => ({
        name: (p.name as string) || "",
        type: p.type as PressureConfig["type"],
        affectsRoles: (p.affects_roles as string[]) || [],
        hours: p.hours as number | undefined,
        hoursUntil: p.hours_until as number | undefined,
        value: p.value as number | undefined,
        unit: p.unit as string | undefined,
        triggeredBy: p.triggered_by as string | undefined,
        severityAt50pct: (p.severity_at_50pct as string) || "high",
        severityAt25pct: (p.severity_at_25pct as string) || "critical",
      })),
      scheduledEvents: ((d.scheduled_events as Array<Record<string, unknown>>) || []).map((e) => ({
        round: (e.round as number) || 0,
        description: (e.description as string) || "",
      })),
    },
  };
}
```

(PressureConfig is already imported in the import line above.)

- [ ] **Step 3: Write simulation.ts server actions**

```typescript
// frontend/app/actions/simulation.ts
"use server";

import { fetchApi } from "@/app/lib/api";
import type { SimulationConfig, SimulationStatus, AgentAction } from "@/app/types";

export async function launchSimulation(
  config: SimulationConfig
): Promise<{ data: { simId: string } } | { error: string }> {
  // Transform camelCase to snake_case for backend
  const payload = {
    simulation_id: config.simulationId,
    company_name: config.companyName,
    scenario: config.scenario,
    total_rounds: config.totalRounds,
    hours_per_round: config.hoursPerRound,
    agent_profiles: config.agents.map((a) => ({
      name: a.name,
      role: a.role,
      persona: a.persona,
    })),
    worlds: config.worlds.map((w) => ({ type: w.type, name: w.name })),
    pressures: config.pressures.map((p) => ({
      name: p.name,
      type: p.type,
      affects_roles: p.affectsRoles,
      hours: p.hours,
      hours_until: p.hoursUntil,
      value: p.value,
      unit: p.unit,
      triggered_by: p.triggeredBy,
      severity_at_50pct: p.severityAt50pct,
      severity_at_25pct: p.severityAt25pct,
    })),
    scheduled_events: config.scheduledEvents.map((e) => ({
      round: e.round,
      description: e.description,
    })),
  };
  return fetchApi<{ simId: string }>("/api/crucible/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSimulationStatus(
  simId: string
): Promise<{ data: SimulationStatus } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(`/api/crucible/simulations/${simId}/status`);
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      simId: (d.sim_id as string) || simId,
      status: d.status as SimulationStatus["status"],
      currentRound: (d.current_round as number) || 0,
      totalRounds: (d.total_rounds as number) || 0,
      actionCount: (d.action_count as number) || 0,
      recentActions: ((d.recent_actions as Array<Record<string, unknown>>) || []).map(transformAction),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map((p) => ({
        name: (p.name as string) || "",
        type: (p.type as string) || "",
        affectsRoles: (p.affects_roles as string[]) || [],
        remainingHours: p.remaining_hours as number | undefined,
        value: p.value as number | undefined,
        unit: p.unit as string | undefined,
        severity: (p.severity as string) || "normal",
        triggered: (p.triggered as boolean) || false,
      })),
    },
  };
}

export async function getSimulationActions(
  simId: string,
  opts?: { world?: string; fromRound?: number }
): Promise<{ data: AgentAction[] } | { error: string }> {
  const params = new URLSearchParams();
  if (opts?.world) params.set("world", opts.world);
  if (opts?.fromRound !== undefined) params.set("from_round", String(opts.fromRound));
  const qs = params.toString();
  const result = await fetchApi<Array<Record<string, unknown>>>(
    `/api/crucible/simulations/${simId}/actions${qs ? `?${qs}` : ""}`
  );
  if ("error" in result) return result;
  return { data: result.data.map(transformAction) };
}

export async function stopSimulation(
  simId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/simulations/${simId}/stop`, {
    method: "POST",
  });
}

function transformAction(a: Record<string, unknown>): AgentAction {
  return {
    round: (a.round as number) || 0,
    timestamp: (a.timestamp as string) || "",
    simulationId: (a.simulation_id as string) || "",
    agent: (a.agent as string) || "",
    role: (a.role as string) || "",
    world: (a.world as string) || "",
    action: (a.action as string) || "",
    args: (a.args as Record<string, unknown>) || {},
    result: a.result as AgentAction["result"],
  };
}
```

- [ ] **Step 4: Write report.ts server actions**

```typescript
// frontend/app/actions/report.ts
"use server";

import { fetchApi } from "@/app/lib/api";
import type { Report } from "@/app/types";

export async function generateReport(
  simId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/simulations/${simId}/report`, {
    method: "POST",
  });
}

export async function getReport(
  simId: string
): Promise<{ data: Report } | { error: string }> {
  return fetchApi<Report>(`/api/crucible/simulations/${simId}/report`);
}
```

- [ ] **Step 5: Write graph.ts server actions**

```typescript
// frontend/app/actions/graph.ts
"use server";

import { fetchApi } from "@/app/lib/api";
import type { GraphData } from "@/app/types";

export async function getGraphData(
  simId: string
): Promise<{ data: GraphData } | { error: string }> {
  return fetchApi<GraphData>(`/api/crucible/simulations/${simId}/graph`);
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/app/lib/ frontend/app/actions/
git commit -m "feat(frontend): add Server Actions and API helper for Crucible backend"
```

---

## Task 4: Layout + Design Tokens + Header

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Create: `frontend/app/components/layout/Header.tsx`

- [ ] **Step 1: Update globals.css with Crucible design tokens**

Replace the contents of `frontend/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --background: #fafafa;
  --foreground: #1a1a1a;
  --card: #ffffff;
  --border: #e5e5e5;
  --accent: #ff4500;
  --text-secondary: #666666;
  --text-tertiary: #aaaaaa;
  --severity-normal-text: #16a34a;
  --severity-normal-bg: #f0fdf4;
  --severity-normal-border: #bbf7d0;
  --severity-high-text: #d97706;
  --severity-high-bg: #fffbeb;
  --severity-high-border: #fde68a;
  --severity-critical-text: #dc2626;
  --severity-critical-bg: #fef2f2;
  --severity-critical-border: #fecaca;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 2: Update layout.tsx with Crucible metadata**

```typescript
// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crucible — Enterprise Simulation",
  description: "Crucible enterprise simulation engine by raxIT Labs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create Header component**

```typescript
// frontend/app/components/layout/Header.tsx
import Link from "next/link";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-lg font-bold text-accent">Crucible</span>
        <span className="text-sm text-text-secondary font-mono">by raxIT Labs</span>
      </Link>
    </header>
  );
}
```

- [ ] **Step 4: Verify dev server runs**

Run: `cd frontend && pnpm dev`
Expected: Next.js dev server starts without errors on localhost:3000

- [ ] **Step 5: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/globals.css frontend/app/components/
git commit -m "feat(frontend): add Crucible layout, design tokens, and Header component"
```

---

## Task 5: Home Page — Preset Grid + Upload

**Files:**
- Replace: `frontend/app/page.tsx`
- Create: `frontend/app/components/home/PresetCard.tsx`
- Create: `frontend/app/components/home/PresetGrid.tsx`
- Create: `frontend/app/components/home/UploadZone.tsx`

- [ ] **Step 1: Create PresetCard component**

```typescript
// frontend/app/components/home/PresetCard.tsx
import Link from "next/link";
import type { Preset } from "@/app/types";

export default function PresetCard({ preset }: { preset: Preset }) {
  return (
    <Link
      href={`/configure/${preset.id}`}
      className="block border border-border rounded-lg bg-card p-5 hover:border-accent transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono uppercase text-text-secondary bg-background px-2 py-0.5 rounded">
          {preset.industry}
        </span>
        <span className="text-xs text-text-tertiary">{preset.size}</span>
      </div>
      <h3 className="text-base font-semibold mb-1">{preset.name}</h3>
      <p className="text-sm text-text-secondary mb-3 line-clamp-2">{preset.description}</p>
      <div className="flex gap-2 flex-wrap">
        {preset.worldTypes.map((w) => (
          <span key={w} className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border">
            {w}
          </span>
        ))}
        <span className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border">
          {preset.pressureCount} pressures
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create PresetGrid component**

```typescript
// frontend/app/components/home/PresetGrid.tsx
import type { Preset } from "@/app/types";
import PresetCard from "./PresetCard";

export default function PresetGrid({ presets }: { presets: Preset[] }) {
  if (presets.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary">
        No presets available. Check that Crucible is installed.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {presets.map((p) => (
        <PresetCard key={p.id} preset={p} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create UploadZone component**

```typescript
// frontend/app/components/home/UploadZone.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCustomConfig } from "@/app/actions/presets";

export default function UploadZone() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".json")) return;
      const text = await file.text();
      // Upload via Server Action — stores on server, returns temp config ID
      const result = await uploadCustomConfig(text);
      if ("error" in result) return;
      router.push(`/configure/${result.data.configId}`);
    },
    [router]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? "border-accent bg-accent/5" : "border-border"
      }`}
    >
      <p className="text-text-secondary mb-2">Drop a JSON config file here</p>
      <label className="inline-block cursor-pointer text-accent hover:underline">
        or browse
        <input
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>
      <p className="text-xs text-text-tertiary mt-2">
        Seed document upload — coming soon
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Replace page.tsx with Home page**

```typescript
// frontend/app/page.tsx
import Header from "@/app/components/layout/Header";
import PresetGrid from "@/app/components/home/PresetGrid";
import UploadZone from "@/app/components/home/UploadZone";
import { getPresets } from "@/app/actions/presets";

export default async function Home() {
  const result = await getPresets();
  const presets = "data" in result ? result.data : [];
  const error = "error" in result ? result.error : null;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Crucible</h1>
          <p className="text-text-secondary">
            Enterprise simulation engine. Pick a preset or upload a config to get started.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text text-sm">
            {error}
          </div>
        )}

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Presets</h2>
          <PresetGrid presets={presets} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Custom Config</h2>
          <UploadZone />
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Verify page renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3000
Expected: Home page with Crucible branding, preset grid (may be empty if Flask not running), and upload zone.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx frontend/app/components/home/
git commit -m "feat(frontend): add Home page with preset grid and config upload"
```

---

## Task 6: Configure Page

**Files:**
- Create: `frontend/app/configure/[presetId]/page.tsx`
- Create: `frontend/app/components/configure/AgentCards.tsx`
- Create: `frontend/app/components/configure/WorldList.tsx`
- Create: `frontend/app/components/configure/PressureCards.tsx`
- Create: `frontend/app/components/configure/EventTimeline.tsx`
- Create: `frontend/app/components/configure/LaunchBar.tsx`

- [ ] **Step 1: Create AgentCards component**

```typescript
// frontend/app/components/configure/AgentCards.tsx
import type { AgentConfig } from "@/app/types";

export default function AgentCards({ agents }: { agents: AgentConfig[] }) {
  if (agents.length === 0) {
    return <p className="text-text-secondary text-sm">No agents configured. Add agents before launching.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {agents.map((agent, i) => (
        <div key={i} className="border border-border rounded-lg bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
              {agent.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-semibold">{agent.name}</div>
              <div className="text-xs text-text-secondary font-mono">{agent.role}</div>
            </div>
          </div>
          <p className="text-xs text-text-secondary line-clamp-3">{agent.persona}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create WorldList component**

```typescript
// frontend/app/components/configure/WorldList.tsx
import type { WorldConfig } from "@/app/types";

export default function WorldList({ worlds }: { worlds: WorldConfig[] }) {
  return (
    <div className="flex flex-col gap-2">
      {worlds.map((world, i) => (
        <div key={i} className="flex items-center gap-3 border border-border rounded-lg bg-card px-4 py-3">
          <span className="text-lg">{world.type === "slack" ? "#" : "📧"}</span>
          <div>
            <div className="text-sm font-medium">{world.name}</div>
            <div className="text-xs text-text-secondary font-mono">{world.type}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create PressureCards component**

```typescript
// frontend/app/components/configure/PressureCards.tsx
import type { PressureConfig } from "@/app/types";

function severityColor(severity: string) {
  if (severity === "critical") return "border-severity-critical-border bg-severity-critical-bg text-severity-critical-text";
  if (severity === "high") return "border-severity-high-border bg-severity-high-bg text-severity-high-text";
  return "border-severity-normal-border bg-severity-normal-bg text-severity-normal-text";
}

export default function PressureCards({ pressures }: { pressures: PressureConfig[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {pressures.map((p, i) => (
        <div key={i} className={`border rounded-lg p-4 ${severityColor(p.severityAt25pct)}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{p.name}</span>
            <span className="text-xs font-mono uppercase">{p.type}</span>
          </div>
          <div className="text-xs space-y-1">
            {p.hours != null && <div>Duration: {p.hours}h</div>}
            {p.value != null && <div>Threshold: {p.value}{p.unit || ""}</div>}
            {p.triggeredBy && <div>Triggered by: {p.triggeredBy}</div>}
            <div>Affects: {p.affectsRoles.join(", ") || "all"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create EventTimeline component**

```typescript
// frontend/app/components/configure/EventTimeline.tsx
import type { ScheduledEvent } from "@/app/types";

export default function EventTimeline({ events }: { events: ScheduledEvent[] }) {
  if (events.length === 0) {
    return <p className="text-text-secondary text-sm">No scheduled events.</p>;
  }
  return (
    <div className="border-l-2 border-border pl-4 space-y-4">
      {events.map((event, i) => (
        <div key={i} className="relative">
          <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-accent" />
          <div className="text-xs font-mono text-text-secondary mb-1">Round {event.round}</div>
          <div className="text-sm">{event.description}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create LaunchBar client component**

```typescript
// frontend/app/components/configure/LaunchBar.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { launchSimulation } from "@/app/actions/simulation";
import type { SimulationConfig } from "@/app/types";

export default function LaunchBar({ config }: { config: SimulationConfig }) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    const result = await launchSimulation(config);
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    router.push(`/simulation/${result.data.simId}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-6 py-3 flex items-center justify-between z-50">
      <div className="text-sm text-text-secondary">
        {config.agents.length} agents · {config.worlds.length} worlds · {config.totalRounds} rounds
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-sm text-severity-critical-text">{error}</span>}
        <button
          onClick={handleLaunch}
          disabled={launching || config.agents.length === 0}
          className="px-6 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {launching ? "Launching..." : "Launch Simulation"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create configure page**

```typescript
// frontend/app/configure/[presetId]/page.tsx
import Header from "@/app/components/layout/Header";
import AgentCards from "@/app/components/configure/AgentCards";
import WorldList from "@/app/components/configure/WorldList";
import PressureCards from "@/app/components/configure/PressureCards";
import EventTimeline from "@/app/components/configure/EventTimeline";
import LaunchBar from "@/app/components/configure/LaunchBar";
import { getPresetConfig } from "@/app/actions/presets";

export default async function ConfigurePage({
  params,
}: {
  params: Promise<{ presetId: string }>;
}) {
  const { presetId } = await params;
  const result = await getPresetConfig(presetId);

  if ("error" in result) {
    return (
      <>
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text">
            {result.error}
          </div>
        </main>
      </>
    );
  }

  const config = result.data;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 pb-24">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">{config.companyName || presetId}</h1>
          {config.scenario && (
            <p className="text-sm text-text-secondary mt-2">{config.scenario}</p>
          )}
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Agents</h2>
          <AgentCards agents={config.agents} />
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Worlds</h2>
          <WorldList worlds={config.worlds} />
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Pressures</h2>
          <PressureCards pressures={config.pressures} />
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Scheduled Events</h2>
          <EventTimeline events={config.scheduledEvents} />
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Settings</h2>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-text-secondary">Rounds:</span>{" "}
              <span className="font-medium">{config.totalRounds}</span>
            </div>
            <div>
              <span className="text-text-secondary">Hours per round:</span>{" "}
              <span className="font-medium">{config.hoursPerRound}</span>
            </div>
          </div>
        </section>

        <LaunchBar config={config} />
      </main>
    </>
  );
}
```

- [ ] **Step 7: Verify page renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3000/configure/cybersecurity_ir (with Flask running)
Expected: Config review page with sections for agents, worlds, pressures, events, settings, and launch button.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/configure/ frontend/app/components/configure/
git commit -m "feat(frontend): add Configure page with agent cards, worlds, pressures, and launch"
```

---

## Task 7: Simulation Dashboard — Shell + Polling

This is the largest task. Build the dashboard page shell with polling, pressure strip, view toggle, and tabbed world views. The D3 graph is Task 8.

**Files:**
- Create: `frontend/app/simulation/[simId]/page.tsx`
- Create: `frontend/app/components/simulation/PressureStrip.tsx`
- Create: `frontend/app/components/simulation/ViewToggle.tsx`
- Create: `frontend/app/components/simulation/WorldTabs.tsx`
- Create: `frontend/app/components/simulation/SlackWorld.tsx`
- Create: `frontend/app/components/simulation/EmailWorld.tsx`
- Create: `frontend/app/components/simulation/TimelineView.tsx`
- Create: `frontend/app/components/simulation/RoundDivider.tsx`
- Create: `frontend/app/components/simulation/EventInjectBanner.tsx`

- [ ] **Step 1: Create RoundDivider component**

```typescript
// frontend/app/components/simulation/RoundDivider.tsx
export default function RoundDivider({ round, timestamp }: { round: number; timestamp?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-text-tertiary bg-background px-3 py-1 rounded">
        Round {round}{timestamp ? ` — ${new Date(timestamp).toLocaleTimeString()}` : ""}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
```

- [ ] **Step 2: Create EventInjectBanner component**

```typescript
// frontend/app/components/simulation/EventInjectBanner.tsx
import type { ScheduledEvent } from "@/app/types";

export default function EventInjectBanner({ event }: { event: ScheduledEvent }) {
  return (
    <div className="border border-severity-critical-border bg-severity-critical-bg rounded-lg px-4 py-3 my-3 flex items-start gap-2">
      <span className="text-base">🔴</span>
      <div>
        <div className="text-xs font-semibold text-severity-critical-text uppercase">
          Event Inject — Round {event.round}
        </div>
        <div className="text-sm text-severity-critical-text mt-0.5">{event.description}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create SlackWorld component**

```typescript
// frontend/app/components/simulation/SlackWorld.tsx
"use client";

import { useEffect, useRef } from "react";
import type { AgentAction, ScheduledEvent } from "@/app/types";
import RoundDivider from "./RoundDivider";
import EventInjectBanner from "./EventInjectBanner";

const ROLE_COLORS: Record<string, string> = {
  ir_lead: "bg-purple-100 text-purple-700",
  ciso: "bg-green-100 text-green-700",
  ceo: "bg-amber-100 text-amber-700",
  legal: "bg-red-100 text-red-700",
  vp_eng: "bg-yellow-100 text-yellow-700",
  cto: "bg-blue-100 text-blue-700",
  soc_analyst: "bg-teal-100 text-teal-700",
};

function getRoleColor(role: string) {
  return ROLE_COLORS[role] || "bg-gray-100 text-gray-700";
}

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function SlackWorld({ actions, scheduledEvents }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actions.length]);

  const slackActions = actions.filter(
    (a) => a.action === "send_message" || a.action === "reply_in_thread"
  );

  let lastRound = 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-1">
      {slackActions.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          Waiting for messages...
        </p>
      )}
      {slackActions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        const roundEvent = showRoundDivider
          ? scheduledEvents.find((e) => e.round === action.round)
          : undefined;
        lastRound = action.round;
        const initials = action.agent
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2);
        const content = (action.args.content as string) || "";

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} timestamp={action.timestamp} />}
            {roundEvent && <EventInjectBanner event={roundEvent} />}
            <div className="flex gap-2 py-2">
              <div
                className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold ${getRoleColor(action.role)}`}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{action.agent}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getRoleColor(action.role)}`}
                  >
                    {action.role}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">{content}</div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Create EmailWorld component**

```typescript
// frontend/app/components/simulation/EmailWorld.tsx
"use client";

import { useState } from "react";
import type { AgentAction } from "@/app/types";
import RoundDivider from "./RoundDivider";

interface Props {
  actions: AgentAction[];
}

export default function EmailWorld({ actions }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const emailActions = actions.filter(
    (a) => a.action === "send_email" || a.action === "reply_email"
  );

  let lastRound = 0;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {emailActions.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          No emails yet...
        </p>
      )}
      {emailActions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        lastRound = action.round;
        const isExpanded = expanded === i;

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} />}
            <button
              onClick={() => setExpanded(isExpanded ? null : i)}
              className="w-full text-left border border-border rounded-lg bg-card px-4 py-3 mb-2 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {action.agent}
                  </span>
                  <span className="text-xs text-text-tertiary">→</span>
                  <span className="text-xs text-text-secondary truncate">
                    {(action.args.to as string) || ""}
                  </span>
                </div>
                <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">
                  R{action.round}
                </span>
              </div>
              <div className="text-sm font-medium mt-1 truncate">
                {(action.args.subject as string) || "(no subject)"}
              </div>
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border text-sm text-text-secondary whitespace-pre-wrap">
                  {(action.args.body as string) || ""}
                  {action.args.cc && (
                    <div className="mt-2 text-xs text-text-tertiary">
                      CC: {action.args.cc as string}
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Create TimelineView component**

```typescript
// frontend/app/components/simulation/TimelineView.tsx
import type { AgentAction, ScheduledEvent } from "@/app/types";
import RoundDivider from "./RoundDivider";
import EventInjectBanner from "./EventInjectBanner";

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function TimelineView({ actions, scheduledEvents }: Props) {
  let lastRound = 0;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {actions.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          Waiting for actions...
        </p>
      )}
      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        const roundEvent = showRoundDivider
          ? scheduledEvents.find((e) => e.round === action.round)
          : undefined;
        lastRound = action.round;

        const worldIcon = action.action.includes("email") ? "📧" : "#";
        const summary =
          action.action === "send_email"
            ? `${action.args.subject || "(no subject)"}`
            : `${((action.args.content as string) || "").slice(0, 120)}...`;

        return (
          <div key={i}>
            {showRoundDivider && <RoundDivider round={action.round} timestamp={action.timestamp} />}
            {roundEvent && <EventInjectBanner event={roundEvent} />}
            <div className="flex items-start gap-3 py-2">
              <span className="text-xs text-text-tertiary w-16 flex-shrink-0 pt-0.5">
                {new Date(action.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-sm w-4 flex-shrink-0">{worldIcon}</span>
              <div className="min-w-0">
                <span className="text-sm font-medium">{action.agent}</span>
                <span className="text-xs text-text-secondary ml-2">{action.action}</span>
                <div className="text-xs text-text-secondary mt-0.5 truncate">{summary}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Create PressureStrip component**

```typescript
// frontend/app/components/simulation/PressureStrip.tsx
import type { ActivePressureState } from "@/app/types";

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function severityClasses(severity: string) {
  if (severity === "critical")
    return "border-severity-critical-border bg-severity-critical-bg text-severity-critical-text";
  if (severity === "high")
    return "border-severity-high-border bg-severity-high-bg text-severity-high-text";
  return "border-severity-normal-border bg-severity-normal-bg text-severity-normal-text";
}

export default function PressureStrip({ pressures }: { pressures: ActivePressureState[] }) {
  if (pressures.length === 0) return null;

  return (
    <div className="flex gap-2 mb-3">
      {pressures.map((p, i) => (
        <div key={i} className={`flex-1 border rounded-lg px-3 py-2 ${severityClasses(p.severity)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wide">{p.name}</div>
          <div className="text-lg font-bold mt-0.5">
            {p.remainingHours != null ? formatHours(p.remainingHours) : ""}
            {p.value != null ? `${p.value}${p.unit || ""}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create ViewToggle component**

```typescript
// frontend/app/components/simulation/ViewToggle.tsx
"use client";

export type ViewMode = "graph" | "split" | "focus";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: ViewMode[] = ["graph", "split", "focus"];

export default function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="flex bg-background rounded-md overflow-hidden border border-border text-xs">
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 capitalize transition-colors ${
            mode === m
              ? "bg-card font-semibold shadow-sm"
              : "text-text-secondary hover:text-foreground"
          }`}
        >
          {m === "graph" ? "Graph" : m === "split" ? "Split" : "Focus"}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Create WorldTabs component**

```typescript
// frontend/app/components/simulation/WorldTabs.tsx
"use client";

import { useState } from "react";
import type { AgentAction, ScheduledEvent } from "@/app/types";
import SlackWorld from "./SlackWorld";
import EmailWorld from "./EmailWorld";
import TimelineView from "./TimelineView";

const TABS = ["Slack", "Email", "Timeline"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function WorldTabs({ actions, scheduledEvents }: Props) {
  const [tab, setTab] = useState<Tab>("Slack");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b-2 border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t
                ? "border-b-2 border-accent text-accent font-medium -mb-[2px]"
                : "text-text-secondary hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "Slack" && <SlackWorld actions={actions} scheduledEvents={scheduledEvents} />}
        {tab === "Email" && <EmailWorld actions={actions} />}
        {tab === "Timeline" && <TimelineView actions={actions} scheduledEvents={scheduledEvents} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create simulation dashboard page**

```typescript
// frontend/app/simulation/[simId]/page.tsx
"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import PressureStrip from "@/app/components/simulation/PressureStrip";
import ViewToggle, { type ViewMode } from "@/app/components/simulation/ViewToggle";
import WorldTabs from "@/app/components/simulation/WorldTabs";
import { getSimulationStatus, getSimulationActions, stopSimulation } from "@/app/actions/simulation";
import { generateReport } from "@/app/actions/report";
import type { SimulationStatus, AgentAction, ScheduledEvent } from "@/app/types";

export default function SimulationPage({
  params,
}: {
  params: Promise<{ simId: string }>;
}) {
  const { simId } = use(params);
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [scheduledEvents] = useState<ScheduledEvent[]>([]); // loaded from config
  const [error, setError] = useState<string | null>(null);

  const pollStatus = useCallback(async () => {
    const result = await getSimulationStatus(simId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStatus(result.data);
  }, [simId]);

  const pollActions = useCallback(async () => {
    const result = await getSimulationActions(simId);
    if ("data" in result) {
      setActions(result.data);
    }
  }, [simId]);

  // Initial load
  useEffect(() => {
    pollStatus();
    pollActions();
  }, [pollStatus, pollActions]);

  // Polling
  useEffect(() => {
    if (!status || (status.status !== "running" && status.status !== "starting")) return;
    const statusInterval = setInterval(pollStatus, 3000);
    const actionsInterval = setInterval(pollActions, 3000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(actionsInterval);
    };
  }, [status?.status, pollStatus, pollActions]);

  const handleStop = async () => {
    await stopSimulation(simId);
    pollStatus();
  };

  const handleViewReport = async () => {
    await generateReport(simId);
    router.push(`/report/${simId}`);
  };

  const isRunning = status?.status === "running";
  const isDone = status?.status === "completed" || status?.status === "stopped";

  const statusColor = {
    starting: "bg-yellow-100 text-yellow-700",
    running: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    stopped: "bg-gray-100 text-gray-600",
    failed: "bg-red-100 text-red-700",
  }[status?.status || "starting"];

  // Panel widths based on view mode
  const graphWidth = viewMode === "graph" ? "100%" : viewMode === "split" ? "50%" : "0%";
  const tabsWidth = viewMode === "focus" ? "100%" : viewMode === "split" ? "50%" : "0%";

  return (
    <div className="h-screen flex flex-col">
      <Header />
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Crucible</span>
          <span className="text-sm text-text-secondary">{simId}</span>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <span className="text-sm font-medium">
            Round <strong>{status?.currentRound || 0}</strong>/{status?.totalRounds || "?"}
          </span>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor}`}>
            {status?.status || "loading"}
          </span>
          {isRunning && (
            <button
              onClick={handleStop}
              className="px-3 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600"
            >
              Stop
            </button>
          )}
          {isDone && (
            <button
              onClick={handleViewReport}
              className="px-3 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90"
            >
              View Report
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-severity-critical-bg text-severity-critical-text text-sm">
          {error}
        </div>
      )}

      {/* Pressure strip */}
      <div className="px-4 pt-3">
        <PressureStrip pressures={status?.pressures || []} />
      </div>

      {/* Split panels */}
      <div className="flex-1 flex overflow-hidden px-4 pb-4 gap-3">
        {/* Graph panel placeholder */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ width: graphWidth, opacity: viewMode === "focus" ? 0 : 1 }}
        >
          <div className="h-full border border-border rounded-lg bg-card flex items-center justify-center text-text-secondary text-sm">
            Graph Panel (Task 8)
          </div>
        </div>
        {/* World tabs */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ width: tabsWidth, opacity: viewMode === "graph" ? 0 : 1 }}
        >
          <div className="h-full border border-border rounded-lg bg-card overflow-hidden">
            <WorldTabs actions={actions} scheduledEvents={scheduledEvents} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Verify page renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3000/simulation/test
Expected: Dashboard with top bar, view toggle, pressure strip, and tabbed world views. Graph panel shows placeholder.

- [ ] **Step 11: Commit**

```bash
git add frontend/app/simulation/ frontend/app/components/simulation/
git commit -m "feat(frontend): add Simulation Dashboard with polling, world views, and pressure strip"
```

---

## Task 8: D3 Graph Panel

**Files:**
- Modify: `frontend/package.json` (add d3 dependency)
- Create: `frontend/app/components/simulation/GraphPanel.tsx`
- Create: `frontend/app/components/simulation/GraphNodeDetail.tsx`
- Modify: `frontend/app/simulation/[simId]/page.tsx` (replace placeholder)

- [ ] **Step 1: Install D3**

```bash
cd frontend && pnpm add d3 && pnpm add -D @types/d3
```

- [ ] **Step 2: Create GraphNodeDetail component**

```typescript
// frontend/app/components/simulation/GraphNodeDetail.tsx
import type { GraphNode } from "@/app/types";

interface Props {
  node: GraphNode;
  onClose: () => void;
}

export default function GraphNodeDetail({ node, onClose }: Props) {
  return (
    <div className="absolute bottom-3 right-3 bg-card border border-border rounded-lg p-3 shadow-lg w-48 z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{node.name}</span>
        <button onClick={onClose} className="text-text-tertiary hover:text-foreground text-xs">
          ✕
        </button>
      </div>
      <div className="text-xs space-y-1 text-text-secondary">
        <div>Type: {node.type}</div>
        {Object.entries(node.attributes).map(([k, v]) => (
          <div key={k}>
            {k}: {String(v)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create GraphPanel component**

```typescript
// frontend/app/components/simulation/GraphPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge } from "@/app/types";
import GraphNodeDetail from "./GraphNodeDetail";

const NODE_COLORS: Record<string, string> = {
  agent: "#3b82f6",
  org: "#ff4500",
  threat: "#ef4444",
  compliance: "#a855f7",
  system: "#4ade80",
};

interface Props {
  data: GraphData;
  isSimulating: boolean;
  onRefresh: () => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  label: string;
  type: string;
}

export default function GraphPanel({ data, isSimulating, onRefresh }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type,
    }));

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Edges
    const link = g
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#e5e5e5")
      .attr("stroke-width", 1.5);

    // Nodes
    const node = g
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => (d.type === "org" ? 18 : 12))
      .attr("fill", (d) => NODE_COLORS[d.type] || "#999")
      .attr("opacity", 0.9)
      .attr("cursor", "pointer")
      .on("click", (_, d) => {
        setSelectedNode({ id: d.id, name: d.name, type: d.type, attributes: d.attributes });
      })
      .call(
        d3.drag<SVGCircleElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Labels
    const label = g
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.type === "org" ? 4 : 3))
      .attr("fill", "white")
      .attr("font-size", (d) => (d.type === "org" ? 7 : 6))
      .attr("font-weight", 600)
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <div className="h-full relative">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-text-secondary">Knowledge Graph</span>
        <div className="flex items-center gap-2">
          {isSimulating && <span className="text-xs text-severity-high-text">● Updating</span>}
          <button
            onClick={onRefresh}
            className="text-xs px-2 py-0.5 border border-border rounded hover:bg-background"
          >
            Refresh
          </button>
        </div>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: "calc(100% - 70px)" }} />
      {/* Legend */}
      <div className="flex gap-3 px-3 py-1.5 text-[10px] text-text-secondary">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>
      {selectedNode && (
        <GraphNodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire GraphPanel into simulation page**

In `frontend/app/simulation/[simId]/page.tsx`, replace the graph placeholder and add graph polling:

1. Add imports at top:
```typescript
import GraphPanel from "@/app/components/simulation/GraphPanel";
import { getGraphData } from "@/app/actions/graph";
import type { GraphData } from "@/app/types";
```

2. Add graph state and polling:
```typescript
const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });

const pollGraph = useCallback(async () => {
  const result = await getGraphData(simId);
  if ("data" in result) setGraphData(result.data);
}, [simId]);

// Add to initial load useEffect:
pollGraph();

// Add graph polling useEffect:
useEffect(() => {
  if (!status || status.status !== "running") return;
  const graphInterval = setInterval(pollGraph, 30000);
  return () => clearInterval(graphInterval);
}, [status?.status, pollGraph]);
```

3. Replace the placeholder div with:
```tsx
<GraphPanel data={graphData} isSimulating={isRunning} onRefresh={pollGraph} />
```

- [ ] **Step 5: Verify graph renders**

Run: `cd frontend && pnpm dev`
With Flask running and a simulation launched, open the simulation dashboard.
Expected: D3 force-directed graph with nodes and edges. Click node shows detail panel.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/app/components/simulation/GraphPanel.tsx frontend/app/components/simulation/GraphNodeDetail.tsx frontend/app/simulation/
git commit -m "feat(frontend): add D3 force-directed GraphPanel with node detail and live refresh"
```

---

## Task 9: After-Action Report Page

**Files:**
- Create: `frontend/app/report/[simId]/page.tsx`
- Create: `frontend/app/components/report/ReportHeader.tsx`
- Create: `frontend/app/components/report/ReportTimeline.tsx`
- Create: `frontend/app/components/report/AgentScorecard.tsx`
- Create: `frontend/app/components/report/AgentScoreGrid.tsx`
- Create: `frontend/app/components/report/ExportButton.tsx`

- [ ] **Step 1: Create ReportHeader component**

```typescript
// frontend/app/components/report/ReportHeader.tsx
import type { Report } from "@/app/types";

export default function ReportHeader({ report }: { report: Report }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">{report.companyName}</h1>
        <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
          {report.status}
        </span>
      </div>
      <p className="text-text-secondary text-sm">{report.scenarioName}</p>
      <div className="flex gap-4 mt-3 text-xs text-text-secondary">
        <span>Duration: {report.duration}</span>
        <span>Completed: {new Date(report.completedAt).toLocaleString()}</span>
        <span>{report.agentScores.length} agents scored</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ReportTimeline component**

```typescript
// frontend/app/components/report/ReportTimeline.tsx
import type { TimelineEntry } from "@/app/types";

const SIG_COLORS = {
  normal: "bg-gray-300",
  high: "bg-severity-high-text",
  critical: "bg-severity-critical-text",
};

export default function ReportTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="border-l-2 border-border pl-4 space-y-4">
      {entries.map((entry, i) => (
        <div key={i} className="relative">
          <div
            className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ${SIG_COLORS[entry.significance]}`}
          />
          <div className="flex items-center gap-2 text-xs text-text-secondary mb-0.5">
            <span className="font-mono">Round {entry.round}</span>
            {entry.agent && <span>· {entry.agent}</span>}
          </div>
          <p className="text-sm">{entry.description}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create AgentScorecard component**

```typescript
// frontend/app/components/report/AgentScorecard.tsx
import type { AgentScore } from "@/app/types";

export default function AgentScorecard({ score }: { score: AgentScore }) {
  const pct = (score.score / 10) * 100;
  const color =
    score.score >= 7 ? "bg-green-500" : score.score >= 4 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-sm">{score.name}</div>
          <div className="text-xs text-text-secondary font-mono">{score.role}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">{score.score}</div>
          <div className="text-[10px] text-text-tertiary">/10</div>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mb-3">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {score.strengths.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-green-700 uppercase mb-1">Strengths</div>
          <ul className="text-xs text-text-secondary space-y-0.5">
            {score.strengths.map((s, i) => (
              <li key={i}>+ {s}</li>
            ))}
          </ul>
        </div>
      )}
      {score.weaknesses.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-red-700 uppercase mb-1">Weaknesses</div>
          <ul className="text-xs text-text-secondary space-y-0.5">
            {score.weaknesses.map((w, i) => (
              <li key={i}>- {w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-[10px] text-text-tertiary mt-2">
        {Object.entries(score.worldBreakdown).map(([world, count]) => (
          <span key={world} className="mr-3">
            {world}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create AgentScoreGrid component**

```typescript
// frontend/app/components/report/AgentScoreGrid.tsx
import type { AgentScore } from "@/app/types";
import AgentScorecard from "./AgentScorecard";

export default function AgentScoreGrid({ scores }: { scores: AgentScore[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {scores.map((s, i) => (
        <AgentScorecard key={i} score={s} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create ExportButton component**

```typescript
// frontend/app/components/report/ExportButton.tsx
"use client";

import type { Report } from "@/app/types";

export default function ExportButton({ report }: { report: Report }) {
  const handleExport = () => {
    const md = [
      `# ${report.companyName} — After-Action Report`,
      "",
      `**Scenario:** ${report.scenarioName}`,
      `**Duration:** ${report.duration}`,
      `**Completed:** ${report.completedAt}`,
      "",
      "## Executive Summary",
      report.executiveSummary,
      "",
      "## Communication Analysis",
      report.communicationAnalysis,
      "",
      "## Tensions & Conflicts",
      report.tensions,
      "",
      "## Agent Scores",
      ...report.agentScores.map(
        (s) => `- **${s.name}** (${s.role}): ${s.score}/10`
      ),
      "",
      "## Recommendations",
      ...report.recommendations.map((r) => `- ${r}`),
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${report.simId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="px-4 py-1.5 text-xs border border-border rounded-md hover:bg-background transition-colors"
    >
      Export Markdown
    </button>
  );
}
```

- [ ] **Step 6: Create report page**

```typescript
// frontend/app/report/[simId]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import Header from "@/app/components/layout/Header";
import ReportHeader from "@/app/components/report/ReportHeader";
import ReportTimeline from "@/app/components/report/ReportTimeline";
import AgentScoreGrid from "@/app/components/report/AgentScoreGrid";
import ExportButton from "@/app/components/report/ExportButton";
import { getReport } from "@/app/actions/report";
import type { Report } from "@/app/types";

export default function ReportPage({
  params,
}: {
  params: Promise<{ simId: string }>;
}) {
  const { simId } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const result = await getReport(simId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setReport(result.data);
    };
    load();
  }, [simId]);

  // Poll while generating
  useEffect(() => {
    if (!report || report.status !== "generating") return;
    const interval = setInterval(async () => {
      const result = await getReport(simId);
      if ("data" in result) setReport(result.data);
    }, 5000);
    return () => clearInterval(interval);
  }, [report?.status, simId]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        {error && (
          <div className="p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text mb-6">
            {error}
          </div>
        )}

        {report?.status === "generating" && (
          <div className="text-center py-20">
            <div className="text-lg font-medium mb-2">Generating report...</div>
            <div className="text-sm text-text-secondary">
              The AI is analyzing {report.simId} simulation data.
            </div>
          </div>
        )}

        {report?.status === "complete" && (
          <>
            <div className="flex justify-end mb-4">
              <ExportButton report={report} />
            </div>

            <ReportHeader report={report} />

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Executive Summary</h2>
              <div className="text-sm text-text-secondary whitespace-pre-wrap">
                {report.executiveSummary}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Timeline</h2>
              <ReportTimeline entries={report.timeline} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Communication Effectiveness</h2>
              <div className="text-sm text-text-secondary whitespace-pre-wrap">
                {report.communicationAnalysis}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Tensions & Conflicts</h2>
              <div className="text-sm text-text-secondary whitespace-pre-wrap">
                {report.tensions}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Agent Scorecards</h2>
              <AgentScoreGrid scores={report.agentScores} />
            </section>

            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Recommendations</h2>
              <ul className="list-disc list-inside text-sm text-text-secondary space-y-1">
                {report.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        {report?.status === "failed" && (
          <div className="text-center py-20">
            <div className="text-lg font-medium text-severity-critical-text mb-2">
              Report generation failed
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-accent hover:underline"
            >
              Retry
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Verify page renders**

Run: `cd frontend && pnpm dev`
Open: http://localhost:3000/report/test
Expected: Report page shows loading/generating state or report content.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/report/ frontend/app/components/report/
git commit -m "feat(frontend): add After-Action Report page with scorecards, timeline, and export"
```

---

## Task 10: Integration Test — Full Flow

Test the full flow end-to-end: Home → Configure → Launch → Dashboard → Report.

**Files:** None (testing only)

- [ ] **Step 1: Start Flask backend**

```bash
cd backend && uv run python -m flask --app app run --port 5001
```

- [ ] **Step 2: Start Next.js frontend**

```bash
cd frontend && pnpm dev
```

- [ ] **Step 3: Test Home page**

Open: http://localhost:3000
Expected: Preset cards showing Crucible builtins (at least cybersecurity_ir). Upload zone visible.

- [ ] **Step 4: Test Configure page**

Click cybersecurity_ir preset card.
Expected: Navigate to /configure/cybersecurity_ir. Shows company name, worlds, pressures. Launch button at bottom.

- [ ] **Step 5: Test Simulation Dashboard**

Click Launch (may fail if agents not configured — this is expected for the preset-only flow).
If simulation starts, verify:
- Polling works (status updates)
- Slack tab shows messages
- Email tab shows emails
- Graph renders nodes
- Pressure strip shows pressure states

- [ ] **Step 6: Test Report page**

Navigate to /report/{simId} after simulation completes.
Verify report sections render.

- [ ] **Step 7: Fix any issues found**

Address any runtime errors, styling issues, or data flow problems.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "fix(frontend): address integration test issues"
```

- [ ] **Step 9: Verify build succeeds**

```bash
cd frontend && pnpm build
```

Expected: Build completes without errors.
