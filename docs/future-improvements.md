# Future improvements

Features intentionally cut from the MVP. Each is sized so a follow-up sprint can pick them up without ambiguity.

## UX polish (small)

- **Transcript-local search bar.** Frontend-only filter on `TranscriptSegment.text` shown above the transcript view (visible in the design mock). One controlled input + a `useMemo` filter. ~30 min.
- **Per-call download button** (already an endpoint — `GET /api/calls/{id}/export` — just unbound in the UI). Wire it to the download icon in the detail header. ~10 min.
- **Per-call share button** with public read-only URL. Requires a backend share-token table + a public `/share/{token}` route that bypasses (future) auth. PII risk: must not expose audio or PII-bearing transcript without redaction first. ~2 hours done responsibly.

## Auth, multi-tenancy, RBAC

OAuth2 / OIDC (Auth0, Keycloak, or Supabase Auth), `User` / `Org` tables, row-level filters on every list/detail endpoint (a user only sees their own org's calls), admin role that can see all owners' calls inside an org. `Call.owner` becomes a real FK to `User`. ~1.5–2 hours for the basic version, more for production-grade.

## Cloud-storage ingestion (SharePoint / Google Drive)

OAuth-connected source pickers so users select existing recordings without re-uploading. Async pull job copies to local storage, then enters the same pipeline. The browser 500 MB upload cap already covers most calls; this feature is mainly about **importing existing libraries of recordings** rather than working around a size limit. ~2-3 hours per provider.

## Realtime progress (SSE / WebSocket)

Today the frontend polls `GET /api/calls/{id}/status` every 1.5s. Swap to Server-Sent Events backed by Redis pub/sub: Celery worker `PUBLISH`es stage transitions, API holds an SSE connection per active call. Tradeoff: stickier sessions, harder to scale behind a stateless LB.

## Notifications

WebSocket / email / Slack push when long-running analyses complete. Most useful in batch-upload scenarios.

## Voice-based participant identification

Beyond per-call diarization (`SPEAKER_00`, `SPEAKER_01`), identify *who* is speaking across calls. `pyannote-audio` or `Resemblyzer` for voiceprint embeddings, similarity threshold for auto-tagging the rep on every new call. Requires a human-in-the-loop confirmation flow on first match — false positives are damaging.

## Semantic search + embeddings layer

`text-embedding-3-small` on every transcript chunk, stored in Postgres with `pgvector` (HNSW index). Unlocks (a) global search across calls/clients/transcripts ("search for client X and find every transcript that mentions them"), (b) similarity-based tag suggestion as a cheaper alternative to per-call LLM tagging at scale, (c) clustering pain points / objections across thousands of calls without re-running the LLM, (d) RAG into the synthesis prompt with top-k similar past calls.

## Event-driven backbone (Redpanda)

Migrate from Celery+Redis when a *second* consumer needs the same event (real-time analytics dashboard fed by `call.tagged`, audit log for compliance, feedback loop that retrains tag classifiers from user overrides, billing service that meters per-call cost). Pipeline stages become event handlers on topics like `call.uploaded → call.transcribed → call.tagged → call.analyzed`.

## PII handling and storage hardening

Encrypt audio at rest (S3 SSE-KMS), row-level encryption on transcript text, explicit retention policy (delete audio after 90 days, retain only redacted transcripts), PII redaction pass before LLM stages (regex + small NER for names/emails/phones), data residency (EU vs US), per-row audit log, right-to-delete cascade.

## Object storage (S3 / R2)

Move audio off local disk to S3-compatible storage. `StorageProvider` Protocol already implies the swap. Required for multi-instance deployment.

## Per-call cost & margin metrics extension

MVP tracks token cost per call. Production extension: aggregate to per-client / per-rep / per-org dashboards, alert when a single call exceeds N× the median cost, expose as a "cost per dollar of pipeline analyzed" KPI.
