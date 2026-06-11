# A2A Containment Judge — same image as the backend, command overridden to uvicorn.
resource "google_cloud_run_v2_service" "judge" {
  name                = "direphish-judge"
  location            = var.region
  deletion_protection = false

  template {
    service_account = google_service_account.run.email
    timeout         = "600s"

    scaling {
      min_instance_count = 1
      max_instance_count = 3
    }

    containers {
      image   = var.backend_image
      command = ["sh", "-c", "exec uv run python -m uvicorn adk.a2a.judge_service:app --host 0.0.0.0 --port $PORT"]

      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
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
      # Match the backend: judge scores on flash (Pro DSQ pool exhausted) with
      # 429 backoff. Lift GEMINI_PRO_MODEL_NAME once a higher tier is available.
      env {
        name  = "GEMINI_PRO_MODEL_NAME"
        value = "gemini-3.5-flash"
      }
      env {
        name  = "DIREPHISH_GEMINI_BACKOFF"
        value = "1"
      }
      # Self URL for the published AgentCard endpoint (set on 2nd apply).
      env {
        name  = "A2A_PUBLIC_URL"
        value = var.judge_public_url
      }
    }
  }

  depends_on = [google_project_service.apis, google_project_iam_member.run_roles]
}
