output "backend_uri" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "Public backend URL (API + SSE)."
}

output "judge_uri" {
  value       = google_cloud_run_v2_service.judge.uri
  description = "Public A2A judge URL. Set this as judge_public_url and re-apply so the AgentCard publishes it."
}

output "frontend_uri" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "Public frontend URL — the hosted project URL for judging."
}

output "repo_url" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repo_id}"
  description = "Artifact Registry repo for image pushes."
}

output "runtime_sa_email" {
  value       = google_service_account.run.email
  description = "Backend/judge runtime service account."
}
