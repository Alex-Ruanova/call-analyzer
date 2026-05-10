# Infrastructure

Live deployment runs on Azure. The Terraform under `infra/` provisions the entire stack from a single `terraform apply`. This doc describes *what's there* and *why those choices*. The operator runbook (apply/destroy steps, rotation, GitHub Actions wiring) lives in `docs/deployment.md` and is gitignored — it carries deploy-time secrets and is not part of the public submission.

## Resource map

| Local (`docker-compose.yml`) | Azure (`infra/main.tf`) | Why this service |
|---|---|---|
| `api` container | `azurerm_container_app.api` | Container Apps gives autoscaling + scale-to-zero behind a managed ingress; cheaper than AKS, less ceremony than App Service for a multi-container stack. |
| `worker` container | `azurerm_container_app.worker` | Same Container App Environment as the API — shared networking, separate scaling rules. Worker scales on Celery queue depth; API scales on HTTP concurrency. |
| `frontend` container | `azurerm_container_app.frontend` | Same environment. Could move to Static Web Apps later for CDN; kept as a Container App so all three services share one deploy command. |
| `db` (Postgres) | `azurerm_postgresql_flexible_server` + database | Flexible Server (not Single Server) for HA and pgvector availability. Firewall rule allows Azure-internal traffic; no public ingress. |
| `redis` | `azurerm_redis_cache` | Managed Redis for Celery broker, token bucket, daily-budget counter, rate limit. Basic tier in the MVP — Standard for prod (replication). |
| `storage/audio/` (host volume) | `azurerm_storage_account` + `azurerm_storage_container.audio` | Blob Storage replaces the local volume. The `StorageProvider` Protocol (`backend/app/core/storage.py`) abstracts the swap — same code path locally and in cloud. Audio is deleted right after `status=done` regardless of backend. |
| (none) | `azurerm_container_registry` | ACR holds the API / worker / frontend images. CI builds, pushes, then bumps the Container App revision. |
| (none) | `azurerm_log_analytics_workspace` | Required dependency of the Container App Environment; also where stdout from all three containers ends up. Single place to grep for errors. |

## Why Azure

Project requirement / pre-existing tenant. Nothing in the design is Azure-specific:

- **AWS port** would be roughly: ECS Fargate or App Runner (api/worker/frontend), RDS Postgres, ElastiCache Redis, S3 (audio), ECR (images), CloudWatch Logs. The `StorageProvider` Protocol is the only place the swap touches code — it currently has Azure Blob and local-filesystem implementations; an `S3Storage` class is one new file.
- **GCP port** would be: Cloud Run, Cloud SQL Postgres, Memorystore, GCS, Artifact Registry, Cloud Logging.

## What's parametrized vs hardcoded

`infra/variables.tf` exposes every operationally-meaningful knob:

- `daily_budget_usd` — wired to the `DAILY_BUDGET_USD` env on the API container, so the budget cap is set at infrastructure time, not just app config.
- `rate_limit_uploads_per_hour` — same path, drives `RATE_LIMIT_UPLOADS_PER_HOUR`.
- `allowed_origins`, `frontend_domain` — CORS + the URL the frontend embeds at build time.
- `openai_api_key`, `api_key`, `pg_admin_password` — marked `sensitive = true`, never logged.

Region (`eastus`), project prefix (`altur`), and Postgres admin user have safe defaults. Nothing else is hardcoded.

## What's deliberately not in Terraform

- **Custom domain + TLS.** Container Apps gives a `*.azurecontainerapps.io` FQDN out of the box, which is what the MVP uses. A custom domain is one extra block (`azurerm_container_app_custom_domain`) plus DNS / cert; left out because it's environment-specific.
- **Backups beyond Flexible Server defaults.** Flexible Server already does PITR for 7 days; long-term backup vault is a production concern, not MVP.
- **VNet integration / private endpoints.** All services are public-internet with firewall rules. Production would lock Postgres and Redis behind a VNet; that's a one-day refactor of the same Terraform.
- **Monitoring / alerting beyond Log Analytics.** No alerts wired (cost spikes, error rate, queue depth). The signals are all there in `Analysis.cost_usd_breakdown` and Container App metrics; only the alert rules are missing.

## Production gaps

Honest list of what would change before shipping this to a real customer, in priority order:

1. **VNet + private endpoints** for Postgres and Redis. Today they're public with firewall rules.
2. **Custom domain + managed TLS** on the API and frontend Container Apps.
3. **Read replica on Postgres Flexible Server** once dashboard reads start competing with worker writes.
4. **Container App scaling rules tuned per role.** Worker on Celery queue depth (custom KEDA scaler), API on HTTP concurrency, frontend on RPS.
5. **Cost / error-rate alerts** in Log Analytics + Action Groups.
6. **Backup vault** for Postgres beyond the 7-day default PITR.
7. **OIDC GitHub → Azure** instead of long-lived service principal credentials in CI.

These map 1:1 to entries in `docs/improvements.md` (strategic section).
