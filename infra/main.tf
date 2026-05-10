terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# ─── Resource Group ────────────────────────────────────────────────────────────

resource "azurerm_resource_group" "main" {
  name     = "${var.project}-prod"
  location = var.location
}

# ─── Container Registry ────────────────────────────────────────────────────────

resource "azurerm_container_registry" "main" {
  name                = "${var.project}registry"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true
}

# ─── PostgreSQL ────────────────────────────────────────────────────────────────

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${var.project}-pg"
  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  version                = "16"
  administrator_login    = var.pg_admin_user
  administrator_password = var.pg_admin_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
  zone                   = "1"

  authentication {
    active_directory_auth_enabled = false
    password_auth_enabled         = true
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.project
  server_id = azurerm_postgresql_flexible_server.main.id
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ─── Redis ─────────────────────────────────────────────────────────────────────

resource "azurerm_redis_cache" "main" {
  name                = "${var.project}-redis"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  non_ssl_port_enabled = false
  minimum_tls_version = "1.2"
}

# ─── Blob Storage ──────────────────────────────────────────────────────────────

resource "azurerm_storage_account" "main" {
  name                     = "${var.project}audio"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_storage_container" "audio" {
  name                  = "audio"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# ─── Container Apps ────────────────────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project}-logs"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "main" {
  name                       = "${var.project}-env"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
}

locals {
  db_url    = "postgresql+asyncpg://${var.pg_admin_user}:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${var.project}?ssl=require"
  redis_url = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:6380/0"
  acr_server = azurerm_container_registry.main.login_server

  common_secrets = [
    { name = "db-url", value = local.db_url },
    { name = "redis-url", value = local.redis_url },
    { name = "openai-api-key", value = var.openai_api_key },
    { name = "api-key", value = var.api_key },
    { name = "storage-key", value = azurerm_storage_account.main.primary_access_key },
    { name = "acr-password", value = azurerm_container_registry.main.admin_password },
  ]

  common_env_vars = [
    { name = "ENV", value = "production" },
    { name = "DATABASE_URL", secret_name = "db-url" },
    { name = "REDIS_URL", secret_name = "redis-url" },
    { name = "OPENAI_API_KEY", secret_name = "openai-api-key" },
    { name = "API_KEY", secret_name = "api-key" },
    { name = "AUTH_ENABLED", value = "true" },
    { name = "DAILY_BUDGET_USD", value = tostring(var.daily_budget_usd) },
    { name = "RATE_LIMIT_UPLOADS_PER_HOUR", value = tostring(var.rate_limit_uploads_per_hour) },
    { name = "ALLOWED_ORIGINS", value = var.allowed_origins },
    { name = "AZURE_STORAGE_ACCOUNT", value = azurerm_storage_account.main.name },
    { name = "AZURE_STORAGE_KEY", secret_name = "storage-key" },
    { name = "AZURE_STORAGE_CONTAINER", value = "audio" },
  ]
}

resource "azurerm_container_app" "api" {
  name                         = "${var.project}-api"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"

  registry {
    server               = local.acr_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "db-url"
    value = local.db_url
  }
  secret {
    name  = "redis-url"
    value = local.redis_url
  }
  secret {
    name  = "openai-api-key"
    value = var.openai_api_key
  }
  secret {
    name  = "api-key"
    value = var.api_key
  }
  secret {
    name  = "storage-key"
    value = azurerm_storage_account.main.primary_access_key
  }
  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "api"
      image  = "${local.acr_server}/${var.project}-api:latest"
      cpu    = 0.5
      memory = "1Gi"

      command = ["sh", "-c", "alembic -c /app/alembic/alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

      dynamic "env" {
        for_each = local.common_env_vars
        content {
          name        = env.value.name
          value       = lookup(env.value, "value", null)
          secret_name = lookup(env.value, "secret_name", null)
        }
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

resource "azurerm_container_app" "worker" {
  name                         = "${var.project}-worker"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"

  registry {
    server               = local.acr_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "db-url"
    value = local.db_url
  }
  secret {
    name  = "redis-url"
    value = local.redis_url
  }
  secret {
    name  = "openai-api-key"
    value = var.openai_api_key
  }
  secret {
    name  = "api-key"
    value = var.api_key
  }
  secret {
    name  = "storage-key"
    value = azurerm_storage_account.main.primary_access_key
  }
  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  template {
    min_replicas = 1
    max_replicas = 5

    container {
      name   = "worker"
      image  = "${local.acr_server}/${var.project}-worker:latest"
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = local.common_env_vars
        content {
          name        = env.value.name
          value       = lookup(env.value, "value", null)
          secret_name = lookup(env.value, "secret_name", null)
        }
      }
    }
  }
}

resource "azurerm_container_app" "frontend" {
  name                         = "${var.project}-frontend"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"

  registry {
    server               = local.acr_server
    username             = azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.main.admin_password
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "frontend"
      image  = "${local.acr_server}/${var.project}-frontend:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 80
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}
