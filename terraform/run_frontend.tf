# Frontend (Next.js). One pinned instance: the local Workflow SDK persists durable
# run state to the per-instance filesystem. cpu_idle=false lets durable steps
# advance between requests. NEXT_PUBLIC_* are baked into the image at build time.
resource "google_cloud_run_v2_service" "frontend" {
  name                = "direphish-frontend"
  location            = var.region
  deletion_protection = false

  template {
    service_account  = google_service_account.fe.email
    timeout          = "600s"
    session_affinity = true

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = var.frontend_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle = false
      }

      # Server-side calls to the backend.
      env {
        name  = "FLASK_API_URL"
        value = google_cloud_run_v2_service.backend.uri
      }
      env {
        name  = "WORKFLOW_TARGET_WORLD"
        value = "local"
      }
      env {
        name  = "WORKFLOW_LOCAL_DATA_DIR"
        value = "/tmp/workflow-data"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }
  }

  depends_on = [google_project_service.apis]
}
