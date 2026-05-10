variable "project" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "altur"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "pg_admin_user" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "altur"
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
  description = "CORS allowed origin (your domain, e.g. https://yourdomain.com)"
  type        = string
}

variable "frontend_domain" {
  description = "Frontend domain for VITE_API_BASE_URL (e.g. yourdomain.com)"
  type        = string
}
