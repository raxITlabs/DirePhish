# Runtime service account for backend + judge (Vertex, Firestore, Secrets, Trace).
resource "google_service_account" "run" {
  account_id   = "direphish-run"
  display_name = "DirePhish Cloud Run runtime (backend + judge)"
  depends_on   = [google_project_service.apis]
}

# Minimal SA for the frontend (proxies to the backend; no GCP data access).
resource "google_service_account" "fe" {
  account_id   = "direphish-fe"
  display_name = "DirePhish Cloud Run runtime (frontend)"
  depends_on   = [google_project_service.apis]
}

locals {
  run_roles = [
    "roles/aiplatform.user", # Gemini via Vertex
    "roles/datastore.user",  # Firestore
    "roles/secretmanager.secretAccessor",
    "roles/cloudtrace.agent", # Cloud Trace export
  ]
}

resource "google_project_iam_member" "run_roles" {
  for_each = toset(local.run_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.run.email}"
}
