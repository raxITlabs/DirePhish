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
