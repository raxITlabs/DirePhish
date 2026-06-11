variable "project_id" {
  type        = string
  description = "GCP project ID."
  default     = "raxit-ai"
}

variable "region" {
  type        = string
  description = "Cloud Run + Artifact Registry region."
  default     = "us-central1"
}

variable "vertex_location" {
  type        = string
  description = "Vertex AI location for Gemini 3.x (global endpoint)."
  default     = "global"
}

variable "repo_id" {
  type        = string
  description = "Artifact Registry Docker repository id."
  default     = "direphish"
}

variable "firestore_database" {
  type        = string
  description = "Firestore database name."
  default     = "(default)"
}

variable "backend_image" {
  type        = string
  description = "Backend/judge image ref (REGION-docker.pkg.dev/PROJECT/direphish/backend:TAG). Set when applying the run services."
  default     = ""
}

variable "frontend_image" {
  type        = string
  description = "Frontend image ref. Built with the backend URL baked in; set when applying the frontend service."
  default     = ""
}

variable "judge_public_url" {
  type        = string
  description = "Deployed judge URL. Set on the SECOND apply (a service can't reference its own URL) so the AgentCard /.well-known/agent.json publishes the real endpoint. Cosmetic — orchestrator calls A2A_JUDGE_URL regardless."
  default     = ""
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account id for Browser Rendering (web crawling). Token is a Secret Manager secret."
  default     = ""
}

variable "frontend_public" {
  type        = bool
  description = "Grant allUsers invoker on the frontend (the only public service). Requires a Domain-Restricted-Sharing exception for this service/project; set false to deploy everything else first."
  default     = true
}
