# Secret container only — versions are added out-of-band (runbook) so plaintext
# never lands in Terraform state:
#   printf '%s' "$TOKEN" | gcloud secrets versions add CLOUDFLARE_API_TOKEN --data-file=-
resource "google_secret_manager_secret" "cloudflare_token" {
  secret_id = "CLOUDFLARE_API_TOKEN"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "cf_accessor" {
  secret_id = google_secret_manager_secret.cloudflare_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# Placeholder version so the backend revision can mount `latest` and boot.
# Crawling (Cloudflare) degrades gracefully until you overwrite it with the real
# rotated token (becomes the new `latest`, no redeploy needed):
#   printf '%s' "$NEW_CF_TOKEN" | gcloud secrets versions add CLOUDFLARE_API_TOKEN --data-file=-
# Not a real secret — safe to keep in state.
resource "google_secret_manager_secret_version" "cloudflare_token_placeholder" {
  secret      = google_secret_manager_secret.cloudflare_token.id
  secret_data = "ROTATE_ME"
}
