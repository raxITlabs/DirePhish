# Crucible Generative Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a research-driven generative pipeline so users go from a company URL + optional context/files to a fully dynamic enterprise simulation with LLM-generated agents, scenarios, and pressures — matching the original MiroFish's "document in → simulation out" flow.

**Architecture:** Research Agent (web scrape + search + LLM synthesis) produces a Company Dossier → pushed to Zep as knowledge graph → user reviews/edits → Config Generator (LLM) produces full SimulationConfig → existing dashboard consumes it. Backend uses existing patterns: TaskManager for async tracking, LLMClient for Gemini calls, FileParser for document extraction, Zep Cloud SDK for graph operations.

**Tech Stack:** Python 3.12, Flask, UV, Zep Cloud SDK, Gemini Flash Lite (via LLMClient), Defuddle CLI (web scraping). Next.js 16, React 19, TypeScript, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-03-21-crucible-generative-pipeline-design.md`

---

## File Structure

### Backend (new files)

```
backend/app/services/
├── research_agent.py              # Web scrape + search + doc extraction + LLM synthesis
├── zep_manager.py                 # Create graphs, push/read entities, sync dossier edits
└── config_generator.py            # LLM generates SimulationConfig from Zep graph + dossier

backend/app/services/
└── project_manager.py             # Project lifecycle: create, status, store dossier/config
```

### Backend (modified files)

```
backend/app/api/crucible.py        # Add 7 new project endpoints
```

### Frontend (new files)

```
frontend/app/
├── types/project.ts               # Project, CompanyDossier, OrgRole, etc.
├── lib/api.ts                     # Add fetchMultipart helper
├── actions/project.ts             # Server Actions for project lifecycle
├── components/
│   ├── home/ResearchForm.tsx      # URL + context + file upload form
│   └── research/
│       ├── ResearchProgress.tsx   # Progress bar with stage messages
│       ├── DossierEditor.tsx      # Editable dossier container
│       ├── CompanyProfile.tsx     # Company info section
│       ├── OrgStructure.tsx       # Roles list with CRUD
│       ├── SystemsList.tsx        # Tech stack tags
│       ├── ComplianceTags.tsx     # Compliance tag list
│       ├── RiskProfile.tsx        # Risk cards
│       └── RecentEvents.tsx       # Events list
├── research/[projectId]/page.tsx  # Company Intelligence Review page
└── configure/project/[projectId]/page.tsx  # Config review from research
```

### Frontend (modified files)

```
frontend/app/page.tsx                          # Add ResearchForm section
frontend/app/types/index.ts                    # Add project.ts export
frontend/app/components/simulation/GraphPanel.tsx  # Rename isSimulating → isLive
frontend/app/simulation/[simId]/page.tsx       # Update GraphPanel prop name
```

---

## Task 1: Project Types + API Helper Update

**Files:**
- Create: `frontend/app/types/project.ts`
- Modify: `frontend/app/types/index.ts`
- Modify: `frontend/app/lib/api.ts`

- [ ] **Step 1: Create project.ts types**

```typescript
// frontend/app/types/project.ts
export interface Project {
  projectId: string;
  companyUrl: string;
  userContext?: string;
  uploadedFiles: string[];
  status: "researching" | "research_complete" | "generating_config" | "config_ready" | "failed";
  progress: number;
  progressMessage: string;
  errorMessage?: string;
  graphId?: string;
  simId?: string;
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

- [ ] **Step 2: Add to barrel export**

Add to `frontend/app/types/index.ts`:
```typescript
export * from "./project";
```

- [ ] **Step 3: Add fetchMultipart helper to api.ts**

Add this function to `frontend/app/lib/api.ts` after the existing `fetchApi`:

```typescript
export async function fetchMultipart<T>(
  path: string,
  formData: FormData
): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: formData,
      // Do NOT set Content-Type — browser sets it with multipart boundary
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

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/app/types/project.ts frontend/app/types/index.ts frontend/app/lib/api.ts
git commit -m "feat(frontend): add Project types and fetchMultipart helper"
```

---

## Task 2: Project Manager (Backend)

**Files:**
- Create: `backend/app/services/project_manager.py`

This manages project state (create, status, dossier storage, config storage). Uses the existing `TaskManager` pattern.

- [ ] **Step 1: Create project_manager.py**

```python
# backend/app/services/project_manager.py
"""
Project lifecycle manager — create projects, track research/config status, store dossier and config.
"""
import json
import uuid
from pathlib import Path

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
PROJECTS_DIR = UPLOADS_DIR / "crucible_projects"


def create_project(company_url: str, user_context: str = "", uploaded_files: list[str] = None) -> dict:
    """Create a new Crucible project directory and metadata."""
    project_id = f"proj_{uuid.uuid4().hex[:8]}"
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "files").mkdir(exist_ok=True)

    project = {
        "project_id": project_id,
        "company_url": company_url,
        "user_context": user_context,
        "uploaded_files": uploaded_files or [],
        "status": "researching",
        "progress": 0,
        "progress_message": "Starting research...",
        "error_message": None,
        "graph_id": None,
        "sim_id": None,
        "created_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    _save_project(project_id, project)
    return project


def get_project(project_id: str) -> dict | None:
    """Get project metadata."""
    return _load_project(project_id)


def update_project(project_id: str, **updates) -> dict | None:
    """Update project fields."""
    project = _load_project(project_id)
    if not project:
        return None
    project.update(updates)
    _save_project(project_id, project)
    return project


def get_dossier(project_id: str) -> dict | None:
    """Get the company dossier for a project."""
    path = PROJECTS_DIR / project_id / "dossier.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def save_dossier(project_id: str, dossier: dict) -> None:
    """Save the company dossier."""
    path = PROJECTS_DIR / project_id / "dossier.json"
    with open(path, "w") as f:
        json.dump(dossier, f, indent=2)


def get_config(project_id: str) -> dict | None:
    """Get the generated simulation config for a project."""
    path = PROJECTS_DIR / project_id / "config.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def save_config(project_id: str, config: dict) -> None:
    """Save the generated simulation config."""
    path = PROJECTS_DIR / project_id / "config.json"
    with open(path, "w") as f:
        json.dump(config, f, indent=2)


def get_project_dir(project_id: str) -> Path:
    """Get the project directory path."""
    return PROJECTS_DIR / project_id


def _save_project(project_id: str, project: dict) -> None:
    path = PROJECTS_DIR / project_id / "project.json"
    with open(path, "w") as f:
        json.dump(project, f, indent=2)


def _load_project(project_id: str) -> dict | None:
    path = PROJECTS_DIR / project_id / "project.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.project_manager import create_project; p = create_project('https://example.com'); print(p['project_id'])"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/project_manager.py
git commit -m "feat(backend): add project manager for Crucible project lifecycle"
```

---

## Task 3: Research Agent (Backend)

The biggest backend task. Creates the research agent that scrapes, searches, extracts docs, synthesizes via LLM, and pushes to Zep.

**Files:**
- Create: `backend/app/services/research_agent.py`

**Reference files to read first:**
- `backend/app/utils/llm_client.py` — LLMClient usage pattern (`chat_json()` for structured output)
- `backend/app/utils/file_parser.py` — FileParser for PDF/MD/TXT extraction
- `backend/app/services/graph_builder.py` — how episodes are pushed to Zep
- `backend/app/config.py` — Config class for ZEP_API_KEY, LLM settings

- [ ] **Step 1: Create research_agent.py**

```python
# backend/app/services/research_agent.py
"""
Research Agent — gathers company intelligence from Cloudflare /crawl API, web search,
uploaded documents, and LLM synthesis. Produces a structured Company Dossier
and pushes it to Zep as a knowledge graph.
"""
import json
import re
import subprocess
import threading
import time
import urllib.parse
from pathlib import Path

import requests

from ..config import Config
from ..utils.llm_client import LLMClient
from ..utils.file_parser import FileParser
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("research_agent")


def run_research(project_id: str) -> None:
    """Run the full research pipeline in a background thread."""
    thread = threading.Thread(target=_research_pipeline, args=(project_id,), daemon=True)
    thread.start()


def _research_pipeline(project_id: str) -> None:
    """Execute research steps sequentially with progress tracking."""
    try:
        # Step 1: Web scrape
        project_manager.update_project(project_id, progress=5, progress_message="Scraping company website...")
        project = project_manager.get_project(project_id)
        scraped_text = _scrape_website(project["company_url"])

        # Step 2: Web search
        project_manager.update_project(project_id, progress=25, progress_message="Searching for company intelligence...")
        search_results = _web_search(scraped_text)

        # Step 3: Process uploaded documents
        project_manager.update_project(project_id, progress=45, progress_message="Processing uploaded documents...")
        project_dir = project_manager.get_project_dir(project_id)
        doc_text = _process_documents(project_dir / "files", project.get("uploaded_files", []))

        # Step 4: LLM synthesis
        project_manager.update_project(project_id, progress=55, progress_message="Synthesizing company dossier...")
        user_context = project.get("user_context", "")
        dossier = _synthesize_dossier(scraped_text, search_results, doc_text, user_context)
        project_manager.save_dossier(project_id, dossier)

        # Step 5: Push to Zep
        project_manager.update_project(project_id, progress=85, progress_message="Building knowledge graph...")
        graph_id = _push_to_zep(project_id, dossier)

        project_manager.update_project(
            project_id,
            status="research_complete",
            progress=100,
            progress_message="Research complete.",
            graph_id=graph_id,
        )
    except Exception as e:
        logger.error(f"Research failed for {project_id}: {e}")
        project_manager.update_project(
            project_id,
            status="failed",
            error_message=str(e),
            progress_message="Research failed.",
        )


def _scrape_website(url: str) -> str:
    """Scrape company website using Cloudflare /crawl API. Returns markdown content."""
    cf_account_id = Config.CLOUDFLARE_ACCOUNT_ID
    cf_token = Config.CLOUDFLARE_API_TOKEN

    if not cf_account_id or not cf_token:
        logger.warning("Cloudflare credentials not configured, falling back to basic fetch")
        return _scrape_basic(url)

    try:
        # Step 1: Initiate crawl job
        crawl_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/browser-rendering/crawl"
        resp = requests.post(crawl_url, headers={
            "Authorization": f"Bearer {cf_token}",
            "Content-Type": "application/json",
        }, json={
            "url": url,
            "limit": 8,
            "depth": 2,
            "formats": ["markdown"],
            "render": False,
            "rejectResourceTypes": ["image", "media", "font", "stylesheet"],
            "options": {
                "excludePatterns": ["**/blog/**", "**/news/**", "**/press/**"],
            },
        }, timeout=30)
        resp.raise_for_status()
        job_id = resp.json().get("result")
        if not job_id:
            return _scrape_basic(url)

        # Step 2: Poll for completion (max 60s)
        for _ in range(12):
            time.sleep(5)
            poll = requests.get(f"{crawl_url}/{job_id}?limit=1", headers={
                "Authorization": f"Bearer {cf_token}",
            }, timeout=15)
            poll.raise_for_status()
            status = poll.json().get("result", {}).get("status")
            if status != "running":
                break

        # Step 3: Get full results
        results_resp = requests.get(f"{crawl_url}/{job_id}?status=completed", headers={
            "Authorization": f"Bearer {cf_token}",
        }, timeout=30)
        results_resp.raise_for_status()
        records = results_resp.json().get("result", {}).get("records", [])

        # Combine markdown from all crawled pages
        pages = []
        for record in records:
            md = record.get("markdown", "")
            page_url = record.get("url", "")
            title = record.get("metadata", {}).get("title", "")
            if md:
                pages.append(f"## {title}\nURL: {page_url}\n\n{md}")

        combined = "\n\n---\n\n".join(pages)
        return combined[:20000] if combined else _scrape_basic(url)

    except Exception as e:
        logger.warning(f"Cloudflare crawl failed for {url}: {e}, falling back to basic fetch")
        return _scrape_basic(url)


def _scrape_basic(url: str) -> str:
    """Fallback scraper using curl when Cloudflare is not available."""
    try:
        result = subprocess.run(
            ["curl", "-sL", "--max-time", "15", url],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            return f"Failed to fetch {url}"
        html = result.stdout
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:15000]
    except Exception as e:
        return f"Could not scrape {url}: {e}"


def _web_search(scraped_text: str) -> str:
    """Search for additional company intelligence. Returns combined search results."""
    # Extract company name from scraped text using a quick LLM call
    llm = LLMClient()
    try:
        company_name = llm.chat(
            [{"role": "user", "content": "Extract ONLY the company name from this text. Return just the name, nothing else:\n\n" + scraped_text[:3000]}]
        ).strip()
    except Exception:
        company_name = "the company"

    # Build search queries
    queries = [
        f'"{company_name}" security incident OR data breach',
        f'"{company_name}" technology stack engineering',
        f'"{company_name}" org structure leadership team',
    ]

    results = []
    for query in queries:
        try:
            encoded_query = urllib.parse.quote_plus(query)
            search_result = subprocess.run(
                ["curl", "-sL", "--max-time", "10",
                 f"https://lite.duckduckgo.com/lite/?q={encoded_query}"],
                capture_output=True, text=True, timeout=15
            )
            if search_result.returncode == 0:
                text = re.sub(r"<[^>]+>", " ", search_result.stdout)
                text = re.sub(r"\s+", " ", text).strip()
                results.append(f"Search: {query}\n{text[:3000]}\n")
        except Exception as e:
            logger.warning(f"Search failed for '{query}': {e}")
            results.append(f"Search: {query}\nFailed: {e}\n")

    return "\n---\n".join(results)


def _process_documents(files_dir: Path, filenames: list[str]) -> str:
    """Extract text from uploaded PDF/MD/TXT files using existing FileParser."""
    if not filenames:
        return ""
    file_paths = [str(files_dir / f) for f in filenames if (files_dir / f).exists()]
    if not file_paths:
        return ""
    return FileParser.extract_from_multiple(file_paths)


def _synthesize_dossier(scraped: str, search: str, docs: str, user_context: str) -> dict:
    """Use LLM to synthesize a structured Company Dossier from all gathered data."""
    llm = LLMClient()

    prompt = f"""You are a corporate intelligence analyst. Analyze the following data about a company and produce a structured Company Dossier as JSON.

## Scraped Website Content
{scraped[:8000]}

## Web Search Results
{search[:5000]}

## Uploaded Documents
{docs[:5000] if docs else "None provided."}

## User Context
{user_context if user_context else "None provided."}

## Output Format
Return ONLY valid JSON matching this exact structure:
{{
  "company": {{
    "name": "Company Name",
    "industry": "industry sector",
    "size": "small|medium|large",
    "products": ["product1", "product2"],
    "geography": "regions of operation",
    "publicCompany": true/false
  }},
  "org": {{
    "departments": ["Dept1", "Dept2"],
    "roles": [
      {{ "title": "Role Title", "department": "Department", "reportsTo": "Manager Role" }}
    ]
  }},
  "systems": [
    {{ "name": "System Name", "category": "database|infrastructure|application|security|communication", "criticality": "low|medium|high|critical" }}
  ],
  "compliance": ["GDPR", "PCI-DSS", "SOC 2"],
  "risks": [
    {{ "name": "Risk Name", "likelihood": "low|medium|high", "impact": "low|medium|high|critical" }}
  ],
  "recentEvents": [
    {{ "date": "YYYY-MM-DD", "description": "Event description", "source": "news|document|inferred" }}
  ]
}}

Be thorough but realistic. If information is not available, make reasonable inferences based on the industry and company size. Include at least 5 roles, 3 systems, 2 compliance frameworks, and 3 risks."""

    dossier = llm.chat_json([{"role": "user", "content": prompt}])
    return dossier


def _push_to_zep(project_id: str, dossier: dict) -> str:
    """Push the dossier to Zep as a knowledge graph. Returns the graph ID."""
    from zep_cloud.client import Zep
    from zep_cloud.types import EpisodeData

    client = Zep(api_key=Config.ZEP_API_KEY)
    graph_id = f"crucible_{project_id}"

    # Push company info as an episode
    company = dossier.get("company", {})
    company_text = (
        f"Company: {company.get('name', 'Unknown')}. "
        f"Industry: {company.get('industry', 'Unknown')}. "
        f"Size: {company.get('size', 'Unknown')}. "
        f"Products: {', '.join(company.get('products', []))}. "
        f"Geography: {company.get('geography', 'Unknown')}."
    )

    # Push org structure as episodes
    org_texts = []
    for role in dossier.get("org", {}).get("roles", []):
        org_texts.append(
            f"{role['title']} works in {role['department']} department and reports to {role['reportsTo']}."
        )

    # Push systems
    system_texts = []
    for sys in dossier.get("systems", []):
        system_texts.append(
            f"System: {sys['name']} ({sys['category']}, criticality: {sys['criticality']})."
        )

    # Push compliance
    compliance_text = f"Compliance requirements: {', '.join(dossier.get('compliance', []))}."

    # Push risks
    risk_texts = []
    for risk in dossier.get("risks", []):
        risk_texts.append(
            f"Risk: {risk['name']} (likelihood: {risk['likelihood']}, impact: {risk['impact']})."
        )

    # Push recent events
    event_texts = []
    for event in dossier.get("recentEvents", []):
        event_texts.append(f"Event ({event['date']}): {event['description']} [source: {event['source']}].")

    # Combine all into episodes and push
    all_texts = [company_text] + org_texts + system_texts + [compliance_text] + risk_texts + event_texts

    for i, text in enumerate(all_texts):
        try:
            client.graph.add(
                group_id=graph_id,
                data=text,
                type="text",
            )
        except Exception as e:
            logger.warning(f"Failed to push episode {i} to Zep: {e}")

    return graph_id
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.research_agent import run_research; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/research_agent.py
git commit -m "feat(backend): add Research Agent with web scrape, search, LLM synthesis, and Zep push"
```

---

## Task 4: Config Generator (Backend)

**Files:**
- Create: `backend/app/services/config_generator.py`

- [ ] **Step 1: Create config_generator.py**

```python
# backend/app/services/config_generator.py
"""
Config Generator — reads Zep graph + company dossier and generates a full
SimulationConfig via LLM, matching the format run_crucible_simulation.py expects.
"""
import json
import threading

from ..utils.llm_client import LLMClient
from ..utils.logger import get_logger
from . import project_manager

logger = get_logger("config_generator")


def run_config_generation(project_id: str) -> None:
    """Generate simulation config in a background thread."""
    thread = threading.Thread(target=_generate_pipeline, args=(project_id,), daemon=True)
    thread.start()


def _generate_pipeline(project_id: str) -> None:
    """Generate a full SimulationConfig from the dossier."""
    try:
        project_manager.update_project(
            project_id,
            status="generating_config",
            progress=10,
            progress_message="Generating simulation config...",
        )

        dossier = project_manager.get_dossier(project_id)
        if not dossier:
            raise ValueError("No dossier found for project")

        project = project_manager.get_project(project_id)
        user_context = project.get("user_context", "")

        config = _generate_config(dossier, user_context, project_id)
        project_manager.save_config(project_id, config)

        project_manager.update_project(
            project_id,
            status="config_ready",
            progress=100,
            progress_message="Config ready.",
        )
    except Exception as e:
        logger.error(f"Config generation failed for {project_id}: {e}")
        project_manager.update_project(
            project_id,
            status="failed",
            error_message=str(e),
            progress_message="Config generation failed.",
        )


def _generate_config(dossier: dict, user_context: str, project_id: str) -> dict:
    """Use LLM to generate a full simulation config from the dossier."""
    llm = LLMClient()

    company = dossier.get("company", {})
    org = dossier.get("org", {})
    roles_desc = "\n".join(
        f"- {r['title']} in {r['department']}, reports to {r['reportsTo']}"
        for r in org.get("roles", [])
    )
    systems_desc = "\n".join(
        f"- {s['name']} ({s['category']}, criticality: {s['criticality']})"
        for s in dossier.get("systems", [])
    )
    compliance_desc = ", ".join(dossier.get("compliance", []))
    risks_desc = "\n".join(
        f"- {r['name']} (likelihood: {r['likelihood']}, impact: {r['impact']})"
        for r in dossier.get("risks", [])
    )
    events_desc = "\n".join(
        f"- [{e['date']}] {e['description']}"
        for e in dossier.get("recentEvents", [])
    )

    prompt = f"""You are a simulation architect. Generate a complete enterprise incident response simulation config for the following company.

## Company
Name: {company.get('name', 'Unknown')}
Industry: {company.get('industry', 'Unknown')}
Size: {company.get('size', 'medium')}
Products: {', '.join(company.get('products', []))}
Geography: {company.get('geography', 'Unknown')}

## Org Structure
{roles_desc}

## Technology Stack
{systems_desc}

## Compliance Requirements
{compliance_desc}

## Risk Profile
{risks_desc}

## Recent Events
{events_desc}

## User Context
{user_context if user_context else "No specific scenario requested — choose the most realistic incident for this company."}

## Output Format
Return ONLY valid JSON matching this EXACT structure:
{{
  "simulation_id": "{project_id}_sim",
  "company_name": "{company.get('name', 'Company')}",
  "total_rounds": 5,
  "hours_per_round": 1.0,
  "scenario": "A detailed 3-5 sentence description of the opening incident situation...",
  "worlds": [
    {{ "type": "slack", "name": "IR War Room" }},
    {{ "type": "email", "name": "Corporate Email" }}
  ],
  "scheduled_events": [
    {{ "round": 3, "description": "A realistic escalation event..." }},
    {{ "round": 4, "description": "An external pressure event..." }}
  ],
  "pressures": [
    {{
      "name": "Pressure Name",
      "type": "countdown|threshold|deadline|triggered",
      "affects_roles": ["role1", "role2"],
      "hours": 72,
      "severity_at_50pct": "high",
      "severity_at_25pct": "critical"
    }}
  ],
  "agent_profiles": [
    {{
      "name": "Realistic Full Name",
      "role": "role_id",
      "persona": "A detailed 2-3 sentence personality description with experience, communication style, biases, and tensions..."
    }}
  ]
}}

REQUIREMENTS:
- Generate 5-8 agent profiles with realistic diverse names and detailed personas
- Include at least 2 worlds (Slack + Email)
- Include 2-3 pressures based on the compliance requirements
- Include 2-3 scheduled events that escalate across rounds
- The scenario should be specific to this company's industry and risk profile
- Each persona should include potential tensions with other team members"""

    config = llm.chat_json([{"role": "user", "content": prompt}])
    return config
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.config_generator import run_config_generation; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/config_generator.py
git commit -m "feat(backend): add Config Generator — LLM produces SimulationConfig from dossier"
```

---

## Task 5: Zep Manager (Backend)

**Files:**
- Create: `backend/app/services/zep_manager.py`

- [ ] **Step 1: Create zep_manager.py**

```python
# backend/app/services/zep_manager.py
"""
Zep Manager — read graph data for D3 visualization, sync dossier edits back to Zep.
"""
from ..config import Config
from ..utils.logger import get_logger

logger = get_logger("zep_manager")


def get_graph_data(graph_id: str) -> dict:
    """Read nodes and edges from a Zep graph for D3 visualization."""
    try:
        from zep_cloud.client import Zep
        client = Zep(api_key=Config.ZEP_API_KEY)

        # Fetch nodes
        nodes_response = client.graph.node.get_by_group_id(group_id=graph_id)
        nodes = []
        for node in (nodes_response or []):
            # Map Zep node labels to our color-map types
            node_type = _classify_node(node)
            nodes.append({
                "id": node.uuid or str(len(nodes)),
                "name": node.name or "Unknown",
                "type": node_type,
                "attributes": node.attributes or {},
            })

        # Fetch edges
        edges_response = client.graph.edge.get_by_group_id(group_id=graph_id)
        edges = []
        for edge in (edges_response or []):
            edges.append({
                "source": edge.source_node_uuid or "",
                "target": edge.target_node_uuid or "",
                "label": edge.name or "",
                "type": edge.fact_type or "related",
            })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        logger.warning(f"Failed to read Zep graph {graph_id}: {e}")
        return {"nodes": [], "edges": []}


def sync_dossier_to_zep(graph_id: str, dossier: dict) -> None:
    """Re-push the dossier to Zep after user edits.
    Simple approach: add new episodes with updated information.
    Zep's graph engine will reconcile entities."""
    from zep_cloud.client import Zep
    client = Zep(api_key=Config.ZEP_API_KEY)

    # Build text episodes from the updated dossier
    company = dossier.get("company", {})
    texts = [
        f"Updated company profile: {company.get('name', 'Unknown')}, "
        f"industry: {company.get('industry', '')}, size: {company.get('size', '')}, "
        f"products: {', '.join(company.get('products', []))}, "
        f"geography: {company.get('geography', '')}.",
    ]

    for role in dossier.get("org", {}).get("roles", []):
        texts.append(f"{role['title']} works in {role['department']} and reports to {role['reportsTo']}.")

    for sys in dossier.get("systems", []):
        texts.append(f"System: {sys['name']} ({sys['category']}, criticality: {sys['criticality']}).")

    texts.append(f"Compliance: {', '.join(dossier.get('compliance', []))}.")

    for risk in dossier.get("risks", []):
        texts.append(f"Risk: {risk['name']} (likelihood: {risk['likelihood']}, impact: {risk['impact']}).")

    for event in dossier.get("recentEvents", []):
        texts.append(f"Event ({event['date']}): {event['description']}.")

    for text in texts:
        try:
            client.graph.add(group_id=graph_id, data=text, type="text")
        except Exception as e:
            logger.warning(f"Failed to sync episode to Zep: {e}")


def _classify_node(node) -> str:
    """Classify a Zep node into our D3 color-map types."""
    name = (node.name or "").lower()
    labels = [l.lower() for l in (node.labels or [])]

    # Try to classify by labels first
    for label in labels:
        if any(k in label for k in ["person", "role", "analyst", "officer", "director", "lead", "manager"]):
            return "agent"
        if any(k in label for k in ["department", "team", "system", "server", "database"]):
            return "system"
        if any(k in label for k in ["company", "org", "corporation"]):
            return "org"
        if any(k in label for k in ["risk", "threat", "attack", "breach", "ransomware"]):
            return "threat"
        if any(k in label for k in ["compliance", "regulation", "gdpr", "pci", "soc", "hipaa"]):
            return "compliance"

    # Fallback to name matching
    if any(k in name for k in ["ciso", "ceo", "cto", "analyst", "engineer", "counsel", "officer"]):
        return "agent"
    if any(k in name for k in ["risk", "threat", "ransomware", "breach"]):
        return "threat"
    if any(k in name for k in ["gdpr", "pci", "soc", "hipaa", "compliance"]):
        return "compliance"

    return "system"  # default
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && uv run python -c "from app.services.zep_manager import get_graph_data; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/zep_manager.py
git commit -m "feat(backend): add Zep Manager for graph reading and dossier sync"
```

---

## Task 6: Flask Project Endpoints

**Files:**
- Modify: `backend/app/api/crucible.py`

Add 7 new project endpoints to the existing Crucible blueprint.

- [ ] **Step 1: Add project endpoints to crucible.py**

Add these routes to the bottom of `backend/app/api/crucible.py`:

```python
# --- Project endpoints (generative pipeline) ---

from ..services import project_manager
from ..services.research_agent import run_research
from ..services.config_generator import run_config_generation
from ..services import zep_manager


@crucible_bp.route("/projects", methods=["POST"])
def create_project():
    """Create project, save uploaded files, start research."""
    company_url = request.form.get("company_url")
    if not company_url:
        return jsonify({"error": "company_url is required"}), 400

    user_context = request.form.get("user_context", "")

    # Collect files first, then create project with filenames, then save files, then start research
    files = request.files.getlist("files")
    uploaded_files = [f.filename for f in files if f.filename]

    project = project_manager.create_project(company_url, user_context, uploaded_files)
    project_dir = project_manager.get_project_dir(project["project_id"])

    for f in files:
        if f.filename:
            f.save(str(project_dir / "files" / f.filename))

    # Start research AFTER files are saved and project metadata is complete
    run_research(project["project_id"])

    return jsonify({"data": {"projectId": project["project_id"]}}), 201


@crucible_bp.route("/projects/<project_id>/status", methods=["GET"])
def project_status(project_id):
    """Poll project research/config-gen progress."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": f"Project '{project_id}' not found"}), 404
    return jsonify({"data": project})


@crucible_bp.route("/projects/<project_id>/dossier", methods=["GET"])
def get_dossier(project_id):
    """Get company dossier."""
    dossier = project_manager.get_dossier(project_id)
    if not dossier:
        return jsonify({"error": "Dossier not found"}), 404
    return jsonify({"data": dossier})


@crucible_bp.route("/projects/<project_id>/dossier", methods=["PUT"])
def update_dossier(project_id):
    """Update dossier and sync to Zep."""
    dossier = request.get_json()
    if not dossier:
        return jsonify({"error": "No dossier provided"}), 400

    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    project_manager.save_dossier(project_id, dossier)

    # Sync to Zep if graph exists
    graph_id = project.get("graph_id")
    if graph_id:
        try:
            zep_manager.sync_dossier_to_zep(graph_id, dossier)
        except Exception as e:
            return jsonify({"error": f"Zep sync failed: {e}"}), 500

    return jsonify({"data": {"status": "updated"}})


@crucible_bp.route("/projects/<project_id>/graph", methods=["GET"])
def project_graph(project_id):
    """Get Zep graph data for D3 visualization."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    graph_id = project.get("graph_id")
    if not graph_id:
        return jsonify({"data": {"nodes": [], "edges": []}})

    data = zep_manager.get_graph_data(graph_id)
    return jsonify({"data": data})


@crucible_bp.route("/projects/<project_id>/generate-config", methods=["POST"])
def generate_config(project_id):
    """Trigger config generation from dossier."""
    project = project_manager.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    run_config_generation(project_id)
    return jsonify({"data": {"status": "generating"}}), 202


@crucible_bp.route("/projects/<project_id>/config", methods=["GET"])
def get_project_config(project_id):
    """Get generated SimulationConfig."""
    config = project_manager.get_config(project_id)
    if not config:
        # Check if still generating
        project = project_manager.get_project(project_id)
        if project and project.get("status") == "generating_config":
            return jsonify({"data": None, "status": "generating"}), 202
        return jsonify({"error": "Config not found"}), 404
    return jsonify({"data": config})
```

- [ ] **Step 2: Verify Flask app starts**

```bash
cd backend && uv run python -c "from app import create_app; app = create_app(); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/crucible.py
git commit -m "feat(backend): add project endpoints for research pipeline"
```

---

## Task 7: Frontend Server Actions for Projects

**Files:**
- Create: `frontend/app/actions/project.ts`

- [ ] **Step 1: Create project.ts server actions**

```typescript
// frontend/app/actions/project.ts
"use server";

import { fetchApi, fetchMultipart } from "@/app/lib/api";
import type {
  Project,
  CompanyDossier,
  GraphData,
  SimulationConfig,
} from "@/app/types";

export async function createProject(
  formData: FormData
): Promise<{ data: { projectId: string } } | { error: string }> {
  return fetchMultipart<{ projectId: string }>(
    "/api/crucible/projects",
    formData
  );
}

export async function getProjectStatus(
  projectId: string
): Promise<{ data: Project } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/status`
  );
  if ("error" in result) return result;
  const d = result.data;
  return {
    data: {
      projectId: (d.project_id as string) || projectId,
      companyUrl: (d.company_url as string) || "",
      userContext: d.user_context as string | undefined,
      uploadedFiles: (d.uploaded_files as string[]) || [],
      status: d.status as Project["status"],
      progress: (d.progress as number) || 0,
      progressMessage: (d.progress_message as string) || "",
      errorMessage: d.error_message as string | undefined,
      graphId: d.graph_id as string | undefined,
      simId: d.sim_id as string | undefined,
      createdAt: (d.created_at as string) || "",
    },
  };
}

export async function getDossier(
  projectId: string
): Promise<{ data: CompanyDossier } | { error: string }> {
  return fetchApi<CompanyDossier>(`/api/crucible/projects/${projectId}/dossier`);
}

export async function updateDossier(
  projectId: string,
  dossier: CompanyDossier
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/dossier`,
    {
      method: "PUT",
      body: JSON.stringify(dossier),
    }
  );
}

export async function getProjectGraph(
  projectId: string
): Promise<{ data: GraphData } | { error: string }> {
  return fetchApi<GraphData>(`/api/crucible/projects/${projectId}/graph`);
}

export async function triggerConfigGeneration(
  projectId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(
    `/api/crucible/projects/${projectId}/generate-config`,
    { method: "POST" }
  );
}

export async function getProjectConfig(
  projectId: string
): Promise<{ data: SimulationConfig } | { error: string }> {
  const result = await fetchApi<Record<string, unknown>>(
    `/api/crucible/projects/${projectId}/config`
  );
  if ("error" in result) return result;
  // The config from the backend is already in SimulationConfig shape (snake_case)
  // Reuse the same transformation as getPresetConfig
  const d = result.data;
  return {
    data: {
      simulationId: d.simulation_id as string | undefined,
      companyName: (d.company_name as string) || "",
      scenario: (d.scenario as string) || "",
      totalRounds: (d.total_rounds as number) || 5,
      hoursPerRound: (d.hours_per_round as number) || 1.0,
      agents: ((d.agent_profiles as Array<Record<string, string>>) || []).map(
        (a) => ({
          name: a.name || "",
          role: a.role || "",
          persona: a.persona || "",
        })
      ),
      worlds: ((d.worlds as Array<Record<string, string>>) || []).map((w) => ({
        type: w.type || "",
        name: w.name || "",
      })),
      pressures: ((d.pressures as Array<Record<string, unknown>>) || []).map(
        (p) => ({
          name: (p.name as string) || "",
          type: p.type as "countdown" | "deadline" | "threshold" | "triggered",
          affectsRoles: (p.affects_roles as string[]) || [],
          hours: p.hours as number | undefined,
          hoursUntil: p.hours_until as number | undefined,
          value: p.value as number | undefined,
          unit: p.unit as string | undefined,
          triggeredBy: p.triggered_by as string | undefined,
          severityAt50pct: (p.severity_at_50pct as string) || "high",
          severityAt25pct: (p.severity_at_25pct as string) || "critical",
        })
      ),
      scheduledEvents: (
        (d.scheduled_events as Array<Record<string, unknown>>) || []
      ).map((e) => ({
        round: (e.round as number) || 0,
        description: (e.description as string) || "",
      })),
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/actions/project.ts
git commit -m "feat(frontend): add project Server Actions for research pipeline"
```

---

## Task 8: GraphPanel Prop Rename + ResearchForm Component

**Files:**
- Modify: `frontend/app/components/simulation/GraphPanel.tsx` (rename `isSimulating` → `isLive`)
- Modify: `frontend/app/simulation/[simId]/page.tsx` (update prop name)
- Create: `frontend/app/components/home/ResearchForm.tsx`
- Modify: `frontend/app/page.tsx` (add ResearchForm section)

- [ ] **Step 1: Rename GraphPanel prop**

In `frontend/app/components/simulation/GraphPanel.tsx`:
- Change `isSimulating: boolean` → `isLive: boolean` in the Props interface
- Change `{isSimulating &&` → `{isLive &&` in the JSX

In `frontend/app/simulation/[simId]/page.tsx`:
- Change `isSimulating={isRunning}` → `isLive={isRunning}`

- [ ] **Step 2: Create ResearchForm component**

```typescript
// frontend/app/components/home/ResearchForm.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions/project";

export default function ResearchForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("company_url", url.trim());
    if (context.trim()) formData.append("user_context", context.trim());
    for (const file of files) {
      formData.append("files", file);
    }

    const result = await createProject(formData);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(`/research/${result.data.projectId}`);
  }, [url, context, files, router]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|md|txt)$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  return (
    <div className="border border-border rounded-lg bg-card p-6">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Company URL *</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://company.com"
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:border-accent"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Additional Context <span className="text-text-tertiary">(optional)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="E.g., 'We just had a ransomware scare', 'Focus on GDPR compliance', 'Our CISO started 2 weeks ago'..."
          rows={3}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Documents <span className="text-text-tertiary">(optional — PDF, MD, TXT)</span>
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-border rounded-md p-4 text-center text-sm text-text-secondary"
        >
          {files.length === 0 ? (
            <>
              <p>Drop files here or{" "}
                <label className="text-accent cursor-pointer hover:underline">
                  browse
                  <input
                    type="file"
                    accept=".pdf,.md,.txt"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      setFiles((prev) => [...prev, ...selected]);
                    }}
                  />
                </label>
              </p>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-background border border-border rounded px-2 py-1 text-xs">
                  {f.name}
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-text-tertiary hover:text-foreground"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-severity-critical-text">{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!url.trim() || loading}
        className="w-full px-4 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {loading ? "Starting Research..." : "Start Research"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update Home page to include ResearchForm**

In `frontend/app/page.tsx`, add the ResearchForm section above the Presets section:

Add import:
```typescript
import ResearchForm from "@/app/components/home/ResearchForm";
```

Add before the `<section className="mb-10">` (Presets section):
```tsx
<section className="mb-10">
  <h2 className="text-lg font-semibold mb-4">Research Your Company</h2>
  <ResearchForm />
</section>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/simulation/GraphPanel.tsx frontend/app/simulation/ frontend/app/components/home/ResearchForm.tsx frontend/app/page.tsx
git commit -m "feat(frontend): add ResearchForm and rename GraphPanel isSimulating to isLive"
```

---

## Task 9: Research Page + Dossier Editor

This is the largest frontend task. Creates the Company Intelligence Review page with progress tracking and editable dossier.

**Files:**
- Create: `frontend/app/research/[projectId]/page.tsx`
- Create: `frontend/app/components/research/ResearchProgress.tsx`
- Create: `frontend/app/components/research/DossierEditor.tsx`
- Create: `frontend/app/components/research/CompanyProfile.tsx`
- Create: `frontend/app/components/research/OrgStructure.tsx`
- Create: `frontend/app/components/research/SystemsList.tsx`
- Create: `frontend/app/components/research/ComplianceTags.tsx`
- Create: `frontend/app/components/research/RiskProfile.tsx`
- Create: `frontend/app/components/research/RecentEvents.tsx`

Due to the size of this task, the implementer should read the spec for the Company Intelligence Review Page section (lines 196-239 of the spec) and create components that:

1. **ResearchProgress.tsx** — progress bar (0-100%) with stage message text. Shows error state with retry button.
2. **CompanyProfile.tsx** — editable fields: name (input), industry (input), size (select), products (tag-style with add/remove), geography (input), publicCompany (checkbox). Takes `company` object and `onChange` callback.
3. **OrgStructure.tsx** — list of roles. Each row: title, department, reportsTo. Add/remove/edit rows. Takes `org` object and `onChange` callback.
4. **SystemsList.tsx** — list of systems. Each row: name, category (select), criticality (select). Add/remove. Takes `systems` array and `onChange` callback.
5. **ComplianceTags.tsx** — tag-style list with add (text input + Enter) and remove (x button). Takes `compliance` array and `onChange` callback.
6. **RiskProfile.tsx** — list of risks. Each row: name, likelihood (select), impact (select). Add/remove. Takes `risks` array and `onChange` callback.
7. **RecentEvents.tsx** — list of events. Each row: date (input), description (input), source (input). Add/remove. Takes `recentEvents` array and `onChange` callback.
8. **DossierEditor.tsx** — container that holds all the above sections, manages the `CompanyDossier` state, and has the "Confirm & Generate Config" button. Calls `updateDossier()` then `triggerConfigGeneration()` then redirects.
9. **Research page** — client component. Polls `getProjectStatus()` every 3s while researching. Shows `ResearchProgress` during research. After completion, shows split panel: `GraphPanel` (left) + `DossierEditor` (right) with `ViewToggle`.

- [ ] **Step 1: Create all research components**

Create all 8 component files in `frontend/app/components/research/` following the patterns above. Each component should be a client component that receives data and an onChange callback.

- [ ] **Step 2: Create the research page**

Create `frontend/app/research/[projectId]/page.tsx` as a client component that:
- Uses `use(params)` for Next.js 16
- Polls `getProjectStatus()` every 3s while `status === "researching"`
- Shows `ResearchProgress` during research
- On completion, loads dossier via `getDossier()` and graph via `getProjectGraph()`
- Shows split panel with `ViewToggle`, `GraphPanel` (isLive={false}), and `DossierEditor`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add frontend/app/research/ frontend/app/components/research/
git commit -m "feat(frontend): add Research page with dossier editor and progress tracking"
```

---

## Task 10: Configure Project Page + Project-Simulation Linkage

**Files:**
- Create: `frontend/app/configure/project/[projectId]/page.tsx`
- Modify: `backend/app/api/crucible.py` — add PATCH endpoint for project updates
- Modify: `frontend/app/actions/project.ts` — add `linkSimToProject` action

This page reuses all existing configure components but loads config from `getProjectConfig()` instead of `getPresetConfig()`. It also links the project to the launched simulation so the Zep graph carries through.

**Before creating the page, add the project linkage pieces:**

Add to `backend/app/api/crucible.py`:
```python
@crucible_bp.route("/projects/<project_id>", methods=["PATCH"])
def patch_project(project_id):
    """Update project fields (e.g., link simId after launch)."""
    updates = request.get_json()
    if not updates:
        return jsonify({"error": "No updates provided"}), 400
    project = project_manager.update_project(project_id, **updates)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    return jsonify({"data": {"status": "updated"}})
```

Add to `frontend/app/actions/project.ts`:
```typescript
export async function linkSimToProject(
  projectId: string,
  simId: string
): Promise<{ data: { status: string } } | { error: string }> {
  return fetchApi<{ status: string }>(`/api/crucible/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ sim_id: simId }),
  });
}
```

- [ ] **Step 1: Create the configure project page**

```typescript
// frontend/app/configure/project/[projectId]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import { useState as useStateHook } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/layout/Header";
import AgentCards from "@/app/components/configure/AgentCards";
import WorldList from "@/app/components/configure/WorldList";
import PressureCards from "@/app/components/configure/PressureCards";
import EventTimeline from "@/app/components/configure/EventTimeline";
import { getProjectStatus, getProjectConfig, linkSimToProject } from "@/app/actions/project";
import { launchSimulation } from "@/app/actions/simulation";
import type { SimulationConfig, Project } from "@/app/types";

export default function ConfigureProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useStateHook(false);

  const handleLaunch = async () => {
    if (!config) return;
    setLaunching(true);
    const result = await launchSimulation(config);
    if ("error" in result) {
      setError(result.error);
      setLaunching(false);
      return;
    }
    // Link the simulation to this project so Zep graph carries through
    await linkSimToProject(projectId, result.data.simId);
    router.push(`/simulation/${result.data.simId}`);
  };

  useEffect(() => {
    const load = async () => {
      // Poll status until config is ready
      const statusResult = await getProjectStatus(projectId);
      if ("error" in statusResult) {
        setError(statusResult.error);
        return;
      }
      setProject(statusResult.data);

      if (statusResult.data.status === "config_ready") {
        const configResult = await getProjectConfig(projectId);
        if ("error" in configResult) {
          setError(configResult.error);
          return;
        }
        setConfig(configResult.data);
      }
    };
    load();
  }, [projectId]);

  // Poll while generating config
  useEffect(() => {
    if (!project || project.status !== "generating_config") return;
    const interval = setInterval(async () => {
      const result = await getProjectStatus(projectId);
      if ("data" in result) {
        setProject(result.data);
        if (result.data.status === "config_ready") {
          const configResult = await getProjectConfig(projectId);
          if ("data" in configResult) setConfig(configResult.data);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  if (error) {
    return (
      <>
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text">
            {error}
          </div>
        </main>
      </>
    );
  }

  if (!config) {
    return (
      <>
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
          <div className="text-center py-20">
            <div className="text-lg font-medium mb-2">Generating simulation config...</div>
            <div className="text-sm text-text-secondary">
              {project?.progressMessage || "The AI is building agents, scenarios, and pressures from your company data."}
            </div>
            <div className="mt-4 w-48 mx-auto h-1.5 bg-gray-100 rounded-full">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${project?.progress || 0}%` }}
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 pb-24">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">{config.companyName}</h1>
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

        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card px-6 py-3 flex items-center justify-between z-50">
          <div className="text-sm text-text-secondary">
            {config.agents.length} agents · {config.worlds.length} worlds · {config.totalRounds} rounds
          </div>
          <button
            onClick={handleLaunch}
            disabled={launching || config.agents.length === 0}
            className="px-6 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {launching ? "Launching..." : "Launch Simulation"}
          </button>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/configure/project/
git commit -m "feat(frontend): add Configure Project page for research-generated configs"
```

---

## Task 11: Integration Test

Test the full research pipeline end-to-end.

- [ ] **Step 1: Start both servers**

```bash
./start.sh
```

- [ ] **Step 2: Test Home page**

Open http://localhost:3000
Expected: "Research Your Company" section with URL input, context textarea, file upload. Preset grid still below.

- [ ] **Step 3: Test research flow**

Enter a company URL (e.g., `https://stripe.com`) and optional context. Click "Start Research."
Expected: Redirects to `/research/[projectId]`, shows progress bar updating.

- [ ] **Step 4: Test dossier review**

After research completes, verify:
- D3 graph shows nodes from Zep
- Dossier sections are populated and editable
- Can add/remove roles, systems, risks

- [ ] **Step 5: Test config generation**

Click "Confirm & Generate Config."
Expected: Redirects to `/configure/project/[projectId]`, shows generating state, then populated config.

- [ ] **Step 6: Test launch**

Click "Launch Simulation."
Expected: Redirects to simulation dashboard with real agent personas.

- [ ] **Step 7: Fix any issues found**

- [ ] **Step 8: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "fix: address integration test issues for generative pipeline"
```
