# Improvements roadmap

Forward-looking enhancements that are **not technical debt** (no broken
behavior, no rotted decision) but features and refinements worth doing.
Distinct from `docs/technical-debt/` which documents what's broken or
incomplete.

Every entry includes a justification, an effort estimate, and dependencies.
Effort is rough person-hours.

The list is split into:

- **Quick wins** — tactical items, ≤2h each. Things you'd pick up in a
  follow-up session.
- **Strategic** — multi-day work that unlocks new product surface (auth,
  multi-tenancy, semantic search, event-driven backbone, etc.).

---

## Quick wins

### Tags

#### 1. Tag management screen (`/tags`)

Today tags are edited via SQL or by typing a new name in the inline
`TagEditor` on a call. Once the catalog grows past ~15 tags, a CRUD page
becomes worth the effort: list with name, color, usage count, inline color
picker, delete with cascade-warning.

- Backend: `POST /api/tags`, `PATCH /api/tags/{id}`, `DELETE /api/tags/{id}`.
  Delete should refuse `is_system=true` (or require explicit confirmation
  when the tag is in use).
- Frontend: new `/tags` route with a table, inline color picker, delete modal.

**Effort:** 1.5–2h. **Dependencies:** none.

#### 2. `Tag.llm_visible: bool`

Today there is no way to keep a tag in the catalog for manual assignment
while preventing the LLM from picking it. Useful for client-specific tags
(`acme-corp-priority`) that the LLM should not auto-apply on unrelated
calls.

- Add a bool column on `Tag`, ship an Alembic migration, filter the
  taxonomy query in `tag_stage` with `WHERE llm_visible = true`.

**Effort:** 30 min. **Dependencies:** only worth it once there are many
client-specific tags.

#### 3. Top-N taxonomy in the LLM prompt

If the catalog grows past ~50 tags, the prompt token count balloons and
selection quality drops. Send the top-N most used tags only.

- Change the taxonomy query to `LEFT JOIN call_tags GROUP BY tag.id ORDER
  BY COUNT(*) DESC LIMIT 30`.

**Effort:** 20 min. **Dependencies:** only when the catalog grows.

### Dashboard / metrics

#### 4. Conversion rate (real definition)

The KPI was removed because there was no product definition (see
`docs/technical-debt/03-conversion-rate-not-implemented.md`). When a
definition exists, reintroduce it as a **new** KPI rather than reviving
the old hardcoded one.

Implementation options:

- Tag heuristic (`positive-outcome / total` over the last N days).
- Manual deal status field on `Call` + edit UI.
- CRM integration (HubSpot / Salesforce).

**Effort:** 1h (heuristic) → 4h+ (CRM). **Dependencies:** product decision.

#### 5. Cost breakdown by stage in `DetailScreen`

`Analysis.cost_usd_breakdown` (JSONB) already stores the per-stage split
(STT vs LLM-synthesis vs LLM-mood vs LLM-tags). Today the UI only shows
the total. Useful to understand where cost concentrates.

- In `DetailScreen`, expand the cost pill into a small expandable table
  using `Object.entries(breakdown)`.

**Effort:** 20 min. **Dependencies:** none.

#### 6. Cost aggregated per client

`ClientDetail` does not show cost rollup by client. Useful to see which
accounts consume the most budget.

- In `_build_client_out` (or a separate endpoint), `SUM(Analysis.cost_usd_total)
  WHERE Call.client_id = X`.

**Effort:** 30 min.

#### 7. Date-range selector in the dashboard

The "Last 14 days" button was removed because it was decorative. If you
actually want it, parametrize the dashboard endpoint.

- `GET /api/dashboard?days=N` (default 14). Frontend dropdown that triggers
  refetch with React Query.

**Effort:** 45 min.

### Processing

#### 8. Reanalyze a call in place (no re-STT)

Today, when you change the synthesis prompt or want to apply a fix
(language detection, multilingual recap) to existing calls, the choices
are:

- **Reupload with `force=true`** (commit `64c50be`): every reanalysis
  creates a **new row** in `calls` (new id), a new transcript, a new
  analysis, another audio file on disk, and re-pays STT. Reprocessing the
  same audio four times leaves four indistinguishable rows in the list,
  4× the STT cost, and four physical `.wav` files. **This is the wrong
  pattern for prompt iteration** — it's intended for "the user uploaded
  the wrong file and wants to re-upload cleanly".

- **Dedicated `POST /api/calls/{id}/reanalyze`** (this item): reuses the
  existing `Transcript` and `TranscriptSegment` rows, only runs `tag_stage`
  + `analyze_stage` with the new prompt. **Overwrites** the previous
  `Analysis` and the `CallTag(source='llm')` rows for the same call. Same
  id, no duplicates, only the LLM is paid (cents).

Implementation:

1. `POST /api/calls/{id}/reanalyze` validates `status='done'` and that a
   transcript exists.
2. Enqueues a Celery task with a `from_stage='analyze'` parameter.
3. The task deletes the previous `Analysis` and `CallTag(source='llm')`,
   then re-runs `analyze_stage` and `tag_stage` reusing the
   `transcript_id`.
4. Frontend: a "Re-run analysis" button (refresh icon) on `DetailScreen`
   that fires the mutation and polls status until `done`.

**Effort:** 30–45 min. **Dependencies:** none, *as long as you only re-run
LLM stages*. The audio file on disk is currently deleted right after
`status='done'` (technical-debt #14) — so this endpoint can ONLY rewind
to `analyze_stage` / `tag_stage`, never to `transcribe_stage`. If a future
need is to redo STT (e.g. swap STT provider), the right move is to
introduce a TTL on the audio (e.g. keep 30 days then unlink) instead of
the current immediate delete.

This is the right tool for "I changed a prompt, I want the existing calls
to reflect it". It also fixes the legacy calls (`prueba`, `PruebaMultiple`)
whose recap is still in English because they were processed under
`PROMPT_VERSION='v1'` before the multilingual fix.

#### 9. Continuous sentiment score (-1.0 to +1.0)

The LLM emits a categorical (`positive` / `neutral` / `negative`) and we
map it to discrete `+1 / 0 / -1`. Two calls labelled `positive` look
identical in the UI even when one is "the customer signed" and another is
"the customer sounded interested".

- Switch `Synthesis.overall_sentiment` to
  `Synthesis.sentiment_score: float = Field(ge=-1, le=1)`. Persist as
  `Float` in `Analysis` (Alembic migration). Bump `SYNTHESIS_VERSION`.

**Effort:** 1h. **Dependencies:** the LLM has to play along with numeric
output — gpt-4o handles it fine.

#### 10. Real duration via ffprobe

Today the duration fallback is `max(seg.end)` over the segments. ~99%
correct but ignores trailing silence. To be exact, call ffprobe on the
audio file (already used for `_build_chunk_intervals`).

- In `transcribe_stage`, after STT, if `duration_seconds is None`, run
  `ffprobe -show_format` and read `format.duration`.

**Effort:** 30 min. **Dependencies:** none.

### UI / UX

#### 11. Replace hardcoded copy in `DetailScreen`

The Overall sentiment card shows "Net Positive / Trended positive in 4 of
5 segments" — both hardcoded (technical-debt #06).

- Derive the label and the segment count from the real `sentiment_score`
  and `emotion_distribution`.

**Effort:** 30 min.

#### 12. Per-call download / share buttons

The download endpoint `GET /api/calls/{id}/export` already exists; just
wire it to the download icon in the call detail header. Per-call share
URL needs a backend share-token table and a public route bypassing (future)
auth, plus PII redaction before exposing.

**Effort:** 10 min (download) → 2h (share, done responsibly).

#### 13. Transcript-local search bar

Frontend-only filter over `TranscriptSegment.text` shown above the
transcript view (visible in the design mock). One controlled input + a
`useMemo` filter.

**Effort:** 30 min.

### Security / deploy

#### 14. Configure `DAILY_BUDGET_USD` before deploy

The `check_budget` middleware in `backend/app/api/middleware.py` already
exists. Set a sensible value in `.env` before exposing the app.

**Effort:** 5 min.

#### 15. Per-IP rate limit

Protects against indiscriminate abuse on a public deploy without requiring
auth.

- FastAPI middleware or nginx in front.

**Effort:** 30–60 min.

#### 16. Settings screen with per-user OpenAI API key

Lets each visitor of a public deploy use their own key instead of the
deploy's. Reduces the risk of an attacker draining the shipped key.

**Cost:** invasive refactor (Celery worker has to receive the key without
persisting it; logging must scrub it; sessionStorage with TTL on the
frontend; no DB or Redis persistence without encryption). See
`docs/technical-debt/` discussion from 2026-05-09.

**Effort:** 4–6h.

**Recommendation:** skip unless the public deploy is a hard requirement
and the budget cap (#14) is not enough.

### Frontend dev experience

#### 17. Hot-reload for the frontend in Docker

Today any change in `frontend/src/` requires `docker compose build frontend
&& up -d frontend`. Slow to iterate.

- Add a `dev` profile in `docker-compose.yml` that runs `npm run dev` and
  bind-mounts `./frontend/src`.

**Effort:** 30 min.

---

## Strategic

### Auth, multi-tenancy, RBAC

OAuth2 / OIDC (Auth0, Keycloak, Supabase Auth), `User` / `Org` tables,
row-level filters on every list/detail endpoint (a user only sees their
own org's calls), admin role that can see everyone's calls inside the
same org. `Call.owner` becomes a real foreign key to `User`.

#### Multiple owners per client + per-action permissions

Today `Client.owner` is a single free-text string and is purely
descriptive — the UI shows it on the client card and on each call, but
it doesn't gate anything. Once auth lands, evolve it to a real
many-to-many `client_owners (client_id, user_id, role)` table so a
client can be co-owned (e.g. AE + CSM + sales engineer) and each
membership carries its own permission set. Suggested capabilities to
model independently:

- `client.view` — see the client and their calls (read-only).
- `call.upload` — upload new recordings against this client.
- `call.reanalyze` — re-run analysis (costs LLM/STT $$).
- `call.edit_metadata` — rename, retag, override participants.
- `client.manage_owners` — add/remove other owners.
- `client.delete` — destructive, admin-only by default.

Backed by either (a) a small fixed role enum (`viewer`, `contributor`,
`admin`) that maps to those capabilities, or (b) a true ABAC store like
Cerbos / OpenFGA if rules get complex. The current free-text `owner`
field stays as a denormalized "primary owner" display for the card, but
authorization always reads from the membership table.

UX implication: the New Client modal grows an "Invite owners" step
(email + role picker), the call detail surfaces the full owner list
(not just one name), and upload/reanalyze buttons hide for users
without those capabilities.

**Effort:** 1.5–2h for a basic version, more for production-grade.

### Cloud-storage ingestion (SharePoint / Google Drive)

OAuth-connected source pickers so users select existing recordings without
re-uploading. An async pull job copies them to local storage then enters
the same pipeline. The browser 500 MB upload cap already covers most
calls; this feature is mainly about **importing existing libraries of
recordings** rather than working around a size limit.

**Effort:** 2–3h per provider.

### Realtime progress (SSE / WebSocket)

Today the frontend polls `GET /api/calls/{id}/status` every 1.5s. Swap to
Server-Sent Events backed by Redis pub/sub: the Celery worker `PUBLISH`es
stage transitions and the API holds an SSE connection per active call.
Trade-off: stickier sessions, harder to scale behind a stateless load
balancer.

### Notifications

WebSocket / email / Slack push when long-running analyses complete. Most
useful for batch-upload flows.

### Voice-based participant identification

Beyond per-call diarization (`SPEAKER_00`, `SPEAKER_01`), identify *who*
is speaking across calls. `pyannote-audio` or `Resemblyzer` for voiceprint
embeddings; similarity threshold for auto-tagging the rep on every new
call. Requires a human-in-the-loop confirmation flow on first match —
false positives are damaging.

### Semantic search + embeddings layer

`text-embedding-3-small` on every transcript chunk, stored in PostgreSQL
with `pgvector` (HNSW index). Unlocks (a) global search across calls /
clients / transcripts ("search for client X and find every transcript that
mentions them"), (b) similarity-based tag suggestion as a cheaper
alternative to per-call LLM tagging at scale, (c) clustering pain points
and objections across thousands of calls without re-running the LLM, (d)
RAG into the synthesis prompt with top-k similar past calls.

### Event-driven backbone (Redpanda)

Migrate from Celery + Redis when a *second* consumer needs the same event
(real-time analytics dashboard fed by `call.tagged`, audit log for
compliance, feedback loop that retrains tag classifiers from user
overrides, billing service that meters per-call cost). Pipeline stages
become event handlers on topics like `call.uploaded → call.transcribed →
call.tagged → call.analyzed`.

### PII handling and storage hardening

Encrypt audio at rest (S3 SSE-KMS), row-level encryption on transcript
text, explicit retention policy (delete audio after 90 days, retain only
redacted transcripts), PII redaction pass before LLM stages (regex + small
NER for names / emails / phones), data residency (EU vs US), per-row audit
log, right-to-delete cascade.

### Object storage (S3 / R2)

Move audio off local disk to S3-compatible storage. The `StorageProvider`
Protocol already implies the swap. Required for multi-instance deployment.

### Per-call cost & margin metrics extension

The MVP tracks token cost per call. Production extension: aggregate to
per-client / per-rep / per-org dashboards, alert when a single call exceeds
N× the median cost, expose as a "cost per dollar of pipeline analyzed"
KPI.

---

## Suggested priority

If you have ~2 more hours of budget:

1. **#14 Configure `DAILY_BUDGET_USD`** (5 min) — basic protection.
2. **#11 Replace hardcoded sentiment copy** (30 min) — removes a visible
   lie in the UI.
3. **#5 Cost breakdown in DetailScreen** (20 min) — high visibility.
4. **#8 Reanalyze in place** (30–45 min) — fixes legacy-call recap and
   becomes the canonical "iterate on prompts" tool.

Anything else is roadmap.
