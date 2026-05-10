output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "acr_username" {
  value = azurerm_container_registry.main.admin_username
}

output "acr_password" {
  value     = azurerm_container_registry.main.admin_password
  sensitive = true
}

output "api_fqdn" {
  value = azurerm_container_app.api.latest_revision_fqdn
}

output "frontend_fqdn" {
  value = azurerm_container_app.frontend.latest_revision_fqdn
}

output "pg_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "redis_hostname" {
  value = azurerm_redis_cache.main.hostname
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}
