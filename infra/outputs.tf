output "vm_public_ip" {
  value = azurerm_public_ip.main.ip_address
}

output "ssh_command" {
  value = "ssh azureuser@${azurerm_public_ip.main.ip_address}"
}

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
