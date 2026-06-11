resource "google_artifact_registry_repository" "direphish" {
  location      = var.region
  repository_id = var.repo_id
  description   = "DirePhish container images (backend/judge + frontend)."
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}
