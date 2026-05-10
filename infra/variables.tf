variable "project" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "altur"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "westus2"
}

variable "ssh_public_key" {
  description = "SSH public key for VM access"
  type        = string
}

variable "pg_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "api_key" {
  description = "App API key for auth middleware (32+ chars)"
  type        = string
  sensitive   = true
}

variable "daily_budget_usd" {
  description = "Daily OpenAI spend cap in USD"
  type        = number
  default     = 5
}

variable "rate_limit_uploads_per_hour" {
  description = "Per-IP upload rate limit"
  type        = number
  default     = 10
}

variable "allowed_origins" {
  description = "CORS allowed origin (e.g. https://altur.norvaru.com)"
  type        = string
}
