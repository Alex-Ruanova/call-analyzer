# Infrastructure

Live deployment runs on a single Azure Linux VM at [altur.norvaru.com](https://altur.norvaru.com/). The Terraform under `infra/` provisions the VM, networking, and an Azure Container Registry for images; the application stack itself is the same `docker-compose.prod.yml` used locally, executed inside the VM.

## Resource map

| Local (`docker-compose.yml`) | Azure (`infra/main.tf`) | Why this service |
|---|---|---|
| `api` / `worker` / `frontend` containers | `azurerm_linux_virtual_machine.main` (`Standard_B2s`) | The same compose file runs on the VM. One host, three containers, shared loopback — no managed runtime, no ingress controller. |
| `db` (Postgres) | Container on the VM | Postgres runs as a docker-compose service alongside the app, with a named volume for persistence. |
| `redis` | Container on the VM | Same pattern. Acts as Celery broker, daily-budget counter, rate-limit token bucket. |
| `storage/audio/` (host volume) | Bind mount on the VM | Audio files land in `/tmp/audio` on the VM. API and worker share the same filesystem; no object store needed because everything runs on one host. Audio is deleted right after `status=done` regardless. |
| (none) | `azurerm_container_registry` | ACR holds the API / worker / frontend images. CI builds, pushes, and SSHes to the VM to pull + recreate the compose stack. |
| (none) | `azurerm_virtual_network` + `azurerm_subnet` + `azurerm_network_interface` + `azurerm_public_ip` | Standard networking glue for the VM. |
| (none) | `azurerm_network_security_group` | Inbound rules for SSH (locked to operator IP), 80, 443. Postgres and Redis are bound to the VM's loopback only — never exposed. |
| (none) | Cloudflare (managed outside Terraform) | DNS for `altur.norvaru.com` + TLS termination + basic bot/rate-limit protection in front of the VM. |

## Why this shape, not managed services

The original plan was Container Apps + Postgres Flexible Server + Azure Cache for Redis + Blob Storage — the textbook managed-PaaS layout. It didn't ship: PostgreSQL Flexible Server is restricted in every region available to an Azure free-tier subscription (`LocationIsOfferRestricted`), and the equivalent quota bump is a paid-support ticket I wasn't going to file for a take-home demo.

The single-VM compose stack is the deliberate fallback: it preserves "the same image runs locally and in cloud", costs ~$22/month instead of ~$40, and keeps the demo public for the evaluation window. The managed-services version is still represented in the codebase — `backend/app/core/storage.py` ships both `LocalAudioStorage` and `AzureBlobAudioStorage` behind the same Protocol, so swapping back is a single env var, not a refactor. The full original plan, the failure mode, and the migration path back to managed services are documented in `docs/deployment.md` (operator runbook, not committed).

Nothing in the design is Azure-specific:

- **AWS port** would be: an EC2 `t3.small` with the same compose, ECR for images, Route 53/Cloudflare for DNS. To go managed: ECS Fargate (api/worker), App Runner or CloudFront+S3 (frontend), RDS Postgres, ElastiCache Redis, S3 (audio). The `StorageProvider` Protocol means an `S3Storage` class is one new file.
- **GCP port** would be: a Compute Engine `e2-small`, Artifact Registry, Cloud DNS. Managed: Cloud Run, Cloud SQL, Memorystore, GCS.

## What's parametrized vs hardcoded

`infra/variables.tf` exposes every operationally-meaningful knob:

- `daily_budget_usd` — wired to the `DAILY_BUDGET_USD` env on the API container, so the budget cap is set at infrastructure time, not just app config.
- `rate_limit_uploads_per_hour` — same path, drives `RATE_LIMIT_UPLOADS_PER_HOUR`.
- `allowed_origins`, `frontend_domain` — CORS + the URL the frontend embeds at build time.
- `openai_api_key`, `api_key`, `pg_admin_password` — marked `sensitive = true`, never logged.
- `ssh_public_key`, `ssh_source_ip` — VM access control; SSH is locked to the operator's IP.

Region (`eastus`), project prefix (`altur`), and VM size have safe defaults.

## What's deliberately not in Terraform

- **Cloudflare DNS + TLS.** The A record `altur.norvaru.com → VM IP` and the TLS termination live in Cloudflare's free tier, configured by hand. Could be moved to the `cloudflare` Terraform provider; left out because it's a one-time setup.
- **Application bootstrap on the VM.** The VM is provisioned bare; `docker`, `docker-compose`, and the initial pull are handled by a CI step (GitHub Actions SSHes in, runs `docker compose pull && up -d`). Putting that in `cloud-init` would make the Terraform self-contained; today it's split.
- **Backups.** The Postgres container writes to a named volume on the VM disk. No off-host backup. Production would either move to managed Postgres (with PITR) or run `pg_dump` on a cron to Blob Storage.
- **Monitoring / alerting.** Container stdout is the only log surface. No metrics scrape, no alerts.

## Production gaps

Honest list of what would change before shipping this to a real customer, in priority order. The first two are the cost of the free-tier pivot — they'd un-do themselves the moment the subscription can host managed services:

1. **Move Postgres off the VM** to managed Postgres (Flexible Server on a paid subscription, or RDS / Cloud SQL on a port). Single-VM Postgres has no PITR, no replica, and dies with the VM.
2. **Move Redis off the VM** to managed Redis. Same reasoning — durability and replication.
3. **Move audio to object storage** (`AzureBlobAudioStorage` already exists in code). The VM's local disk is fine for a demo but doesn't survive horizontal scaling.
4. **Replace the single VM with a runtime that scales** (Container Apps, ECS, Cloud Run). At that point the worker can scale on Celery queue depth and the API on HTTP concurrency, which the single VM can't do.
5. **VNet integration / private endpoints** for whatever managed services land. Today there's no private network because there's only one host.
6. **OIDC GitHub → Azure** instead of long-lived service principal credentials in CI.
7. **Cost / error-rate alerts** wired to whatever logging surface ships next.

These map 1:1 to entries in `docs/improvements.md` (strategic section).
