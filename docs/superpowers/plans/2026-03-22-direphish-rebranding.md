# DirePhish Rebranding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all user-facing references from MiroFish to DirePhish across the codebase.

**Architecture:** Find-and-replace across 4 layers: root config, frontend, backend, and Docker/CI. Keep internal logger names as `direphish.*` (replacing `mirofish.*`). Keep Crucible as internal engine name. Keep API routes unchanged. Replace README entirely with DirePhish branding copy.

**Tech Stack:** Next.js, Flask, Docker, GitHub Actions

---

### Task 1: Root config and README

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (name field only)
- Modify: `docker-compose.yml`
- Modify: `Dockerfile` (no changes needed — generic)
- Rewrite: `README.md`
- Delete: `README-EN.md` (replaced by new README)
- Modify: `.github/workflows/docker-image.yml`

- [ ] **Step 1: Update package.json** — name to `direphish`, description to English
- [ ] **Step 2: Update package-lock.json** — name fields to `direphish`
- [ ] **Step 3: Update docker-compose.yml** — service name, container name, image
- [ ] **Step 4: Update GitHub Actions workflow** — image name
- [ ] **Step 5: Rewrite README.md** — full DirePhish README per branding spec
- [ ] **Step 6: Delete README-EN.md** — no longer needed
- [ ] **Step 7: Commit**

### Task 2: Frontend branding

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/package.json` (if name field exists)

- [ ] **Step 1: Update layout.tsx metadata** — title and description to DirePhish
- [ ] **Step 2: Update frontend/package.json name** (if applicable)
- [ ] **Step 3: Commit**

### Task 3: Backend branding

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/__init__.py`
- Modify: `backend/app/config.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/run.py`
- Modify: `backend/app/utils/llm_client.py`
- Modify: `backend/app/utils/logger.py`
- Modify: `backend/app/services/simulation_runner.py`
- Modify: `backend/app/services/simulation_config_generator.py`
- Modify: `backend/app/services/simulation_manager.py`
- Modify: `backend/app/services/graph_builder.py`
- Modify: `backend/app/services/ontology_generator.py`
- Modify: `backend/app/services/report_agent.py`
- Modify: `backend/app/services/oasis_profile_generator.py`
- Modify: `backend/app/services/simulation_ipc.py`
- Modify: `backend/app/services/zep_tools.py`
- Modify: `backend/app/services/zep_graph_memory_updater.py`
- Modify: `backend/app/services/zep_entity_reader.py` (via logger)
- Modify: `backend/app/api/graph.py`
- Modify: `backend/app/api/simulation.py`
- Modify: `backend/app/api/report.py`
- Modify: `backend/app/utils/retry.py`
- Modify: `backend/app/utils/zep_paging.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/scripts/run_crucible_simulation.py`

- [ ] **Step 1: Update pyproject.toml** — name, description, authors
- [ ] **Step 2: Update __init__.py** — docstring, service name, log messages, health check
- [ ] **Step 3: Update config.py** — comment and secret key default
- [ ] **Step 4: Update requirements.txt** — comment
- [ ] **Step 5: Update run.py** — comment
- [ ] **Step 6: Bulk rename all logger names** — `mirofish.*` → `direphish.*` across all service/api/util files
- [ ] **Step 7: Update graph_builder.py** — graph name and description strings
- [ ] **Step 8: Update ontology_generator.py** — auto-generated comment
- [ ] **Step 9: Update simulation_manager.py** — conda env reference
- [ ] **Step 10: Update report.py and simulation.py** — example graph_id in docstrings
- [ ] **Step 11: Update tests/conftest.py** — docstring
- [ ] **Step 12: Update scripts/run_crucible_simulation.py** — docstring
- [ ] **Step 13: Regenerate uv.lock**
- [ ] **Step 14: Commit**

### Task 4: Seed files and misc

**Files:**
- Modify: `seeds/ir-rehearsal-prediction-prompt.md`
- Modify: `mirofish-architecture.html`

- [ ] **Step 1: Update seed file** — MiroFish → DirePhish in title
- [ ] **Step 2: Update architecture HTML** — title and heading
- [ ] **Step 3: Commit**
