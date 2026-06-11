# Backend (Flask + ADK runner + MCP worlds). One pinned instance: in-process SSE
# bus + sim-subprocess state live in a single process. cpu_idle=false keeps CPU
# allocated so the spawned runner + MCP procs aren't starved between requests.
resource "google_cloud_run_v2_service" "backend" {
  name                = "direphish-backend"
  location            = var.region
  deletion_protection = false

  template {
    service_account  = google_service_account.run.email
    timeout          = "3600s" # long-lived SSE
    session_affinity = true

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = var.backend_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi"
        }
        cpu_idle          = false # CPU always allocated (background subprocesses)
        startup_cpu_boost = true
      }

      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "TRUE"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.vertex_location
      }
      env {
        name  = "PYTHONPATH"
        value = "/app"
      }
      env {
        name  = "THREAT_ACTOR_PROVIDER"
        value = "gemini"
      }
      # Frontend URL so the backend can resume Workflow hooks when research /
      # sims finish (POST /api/pipeline/resume). Without it, workflow_callback
      # falls back to the local-dev host (direphish.localhost:1355) and fails.
      env {
        name  = "FRONTEND_URL"
        value = var.frontend_url
      }
      # Demo on raxit-ai's current DSQ tier: the Pro pool is token-exhausted, so
      # map the "pro" tier (adversary + judge) to flash. Lift this once a higher
      # tier is available. Defenders are already flash.
      env {
        name  = "GEMINI_PRO_MODEL_NAME"
        value = "gemini-3.5-flash"
      }
      # Run defenders sequentially + retry Gemini 429s with backoff so a live
      # sim survives DSQ contention (see adk/quota_guard.py).
      env {
        name  = "DIREPHISH_SERIAL_DEFENDERS"
        value = "1"
      }
      env {
        name  = "DIREPHISH_GEMINI_BACKOFF"
        value = "1"
      }
      env {
        name  = "CLOUD_TRACE_ENABLED"
        value = "true"
      }
      env {
        name  = "DIREPHISH_FIRESTORE_ENABLED"
        value = "true"
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = var.firestore_database
      }
      # Cross-process A2A judge (orchestrator auto-uses it when set).
      env {
        name  = "A2A_JUDGE_URL"
        value = google_cloud_run_v2_service.judge.uri
      }
      env {
        name  = "CLOUDFLARE_ACCOUNT_ID"
        value = var.cloudflare_account_id
      }
      env {
        name = "CLOUDFLARE_API_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.cloudflare_token.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.run_roles,
    google_secret_manager_secret_iam_member.cf_accessor,
  ]
}
