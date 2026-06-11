# Hardened access (Google-recommended): least-privilege service-to-service.
# Only the frontend is public; backend + judge are private and reached via OIDC.

# Judge ← backend only (backend runs as direphish-run, calls judge with an OIDC token).
resource "google_cloud_run_v2_service_iam_member" "judge_invoker" {
  name     = google_cloud_run_v2_service.judge.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.run.email}"
}

# Backend ← frontend only (Next.js proxies browser calls with an OIDC token).
resource "google_cloud_run_v2_service_iam_member" "backend_invoker" {
  name     = google_cloud_run_v2_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.fe.email}"
}

# Frontend: the ONLY public service. Anonymous access still requires an allUsers
# binding, which Domain-Restricted-Sharing blocks until a NARROW exception is
# granted for this one service (or project). Toggle with var.frontend_public so a
# DRS-blocked apply doesn't fail the whole run.
resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  count    = var.frontend_public ? 1 : 0
  name     = google_cloud_run_v2_service.frontend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
