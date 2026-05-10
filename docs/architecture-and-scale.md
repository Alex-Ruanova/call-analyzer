# Architecture & Scaling Analysis

## The Happy Path: Processing One Call

1. **Upload** → User POST to `/api/calls` with audio file.
2. **Intake** → FastAPI handler creates `Call` row (status=`pending`) in Postgres, stores audio to `AUDIO_STORAGE_DIR`.
3. **Task dispatch** → Celery task `process_call(call_id)` enqueued to Redis.
4. **Worker pickup** → One of N workers grabs task from queue.
5. **STT stage** → Worker calls OpenAI `gpt-4o-transcribe-diarize` on audio. Chunks >24MB split at silence boundaries (ffmpeg). Returns `Transcript` with speaker diarization. Duration: 8–15s per 5-min segment.
6. **Mood stage** → LLM batches 10–20 transcript segments, calls gpt-4o-mini with `response_format={"type": "json_schema", ...}`. Schema: `MoodLabels`. Logs cost to `Analysis.cost_usd_breakdown["mood"]`.
7. **Tagging stage** → Full transcript → gpt-4o-mini → `TagSuggestion` (multi-label, confidence scores). Logs cost.
8. **Insights stage** → Full transcript → gpt-4o-mini → `InsightExtraction` (pain points, objections, buying signals, next steps, timeline, budget). Logs cost.
9. **Synthesis stage** → Full transcript + prior outputs → gpt-4o-mini → `Synthesis` (headline, summary, sentiment). Logs cost.
10. **Finalize** → Worker aggregates costs, writes `Analysis` row. Updates `Call.status = "done"`. Updates `Call.updated_at`.
11. **Audio cleanup** → Worker deletes `storage/audio/<uuid>.wav` immediately after the call reaches `done`. The transcript in Postgres carries everything downstream features consume. `Call.filename` is kept as a historical reference but the file is gone — reduces disk pressure and PII footprint.
12. **Poll** → Frontend polls `/api/calls/{id}/status` every 1.5s. Sees status=`done`, fetches full call data (transcript, tags, insights, synthesis).

**Total latency (5-min call):** ~30–50s (STT dominates; LLM stages ~1s each).

---

## Data lifecycle

- **Audio file**: written to local disk at upload, deleted immediately after the call's pipeline reaches `status='done'` (step 11 above). A failed call retains its audio so it can be inspected; an explicit user delete removes whatever is left.
- **Calls**: soft-deleted, never hard-deleted. `DELETE /api/calls/{id}` and bulk-delete stamp `Call.deleted_at`. The row plus its `Analysis` / `Transcript` / `Insight` / `ActionItem` / `Participant` children stay in the database.
- **Why**: cost paid to OpenAI is real and not refundable. If hard-delete dropped `Analysis`, the dashboard's `Total cost` and `Calls this week` would silently lie about historical spend and volume. Soft-delete keeps the audit trail intact.
- **What user-facing endpoints see**: nothing soft-deleted. Lists, detail, client view, and the upload-dedup query all filter `WHERE deleted_at IS NULL`. The user perceives the call as gone.
- **What dashboard sees**: split by intent. Cost / volume queries (`Total cost`, `Calls this week`, `Calls per day`) include soft-deleted rows — the user paid, the activity occurred. Quality queries (`Positive rate`, `Talk:Listen`, `sentiment_trend`, `pipeline`, `top_pain_points`) drop them — "this call doesn't represent my flow anymore" is a legitimate user signal.
- **Restore**: not implemented. To undo a deletion today, run SQL: `UPDATE calls SET deleted_at = NULL WHERE id = ?`. Acceptable for a single-user MVP.
- **Future GC**: no scheduled purge of long-soft-deleted rows. In production a job that hard-deletes rows older than e.g. 1 year is reasonable.
- **Future re-STT**: because audio is dropped at `done`, any future "reanalyze with a new STT provider" feature would need to switch this from immediate delete to TTL (e.g. keep 30 days). See `docs/improvements.md` #8.

---

## Scaling to 10,000 Calls/Day

### What Breaks First?

**Celery worker concurrency.** The MVP ships with 1 worker, 4 concurrent slots. That's:
- 4 calls processing in parallel
- 1 call every ~7–10 seconds (including STT, all LLM stages, DB writes)
- **Throughput: ~360–500 calls/day per worker**

At 10k calls/day, you need **20–30 workers minimum** to keep latency flat.

### Bottleneck Breakdown

| Component | Latency | Constraint |
|---|---|---|
| **STT (gpt-4o-transcribe-diarize)** | 8–15s per segment | OpenAI API quota + per-call parallelization limit |
| **LLM stages (gpt-4o-mini, 4 stages)** | 1s each ≈ 4s total | Token limits; batching (mood) helps |
| **Postgres writes** | ~100ms aggregate | Connection pool; for 10k/day at 30 workers, need 30+ pool size |
| **Audio storage (local disk)** | ~50ms write | Becomes I/O bottleneck; S3 offloads to object store |
| **Redis (queue + budget counter)** | <5ms per operation | In-memory; single instance fine up to ~1M tasks/day |

**Latency timeline at 10k/day:** 30–50s per call (same as MVP) if workers are plentiful. **If workers are scarce:** queue backs up; latency climbs to 10+ minutes per call.

### Changes for Production

#### 1. Horizontal Worker Scaling

```bash
# Spin up 25 workers across 3 machines (e.g., K8s, ECS, Fly)
# Each worker: 4 concurrent slots, all fed from same Redis broker
docker run -e CELERY_BROKER_URL=redis://redis:6379/0 worker:latest
```

Redis broker handles task distribution. No coordination needed — just scale up worker count.

**Cost:** 25 workers on small VMs (~$0.05/hr each) ≈ $30/month compute.

#### 2. Postgres Connection Pooling

Local docker dev uses direct connection. Production needs `pgBouncer` or `PgPartman`:

```yaml
# docker-compose.prod.yml
pgbouncer:
  image: pgbouncer:latest
  environment:
    DATABASES_HOST: db
    DATABASES_USER: altur
    DATABASES_PASSWORD: ${DB_PASSWORD}
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 1000
    PGBOUNCER_DEFAULT_POOL_SIZE: 25
```

At 30 workers × 4 slots = 120 concurrent connections, a pool size of 25 (with transaction-mode multiplexing) is sufficient.

#### 3. Audio Storage Swap (object storage)

MVP uses local disk locally (`AUDIO_STORAGE_DIR=/app/storage/audio`). The **live Azure deploy already runs on Blob Storage** through the same `StorageProvider` Protocol — see `docs/infrastructure.md`. The S3 examples below are illustrative for the AWS port; the abstraction covers both.

```python
# Local: LocalAudioStorage (host volume)
storage = LocalAudioStorage(base_path="/app/storage/audio")

# Live Azure deploy: AzureBlobAudioStorage (already shipped)
storage = AzureBlobAudioStorage(account_url=..., container="audio")

# AWS port: a new S3AudioStorage class implementing the same Protocol
# storage = S3AudioStorage(bucket="altur-audio", region="us-west-2")
```

**Cost:** S3 ≈ $0.023/GB/month + $0.40/10k GET reqs. For 10k calls/day × 5MB avg = 50GB/month ≈ $1.50/month storage + $0.40 retrieval.

#### 4. STT Provider Abstraction

Similarly, STT provider is protocol-based:

```python
# Current: OpenAI
stt = OpenAISTT(model="gpt-4o-transcribe-diarize")
transcript = await stt.transcribe(audio_bytes)

# Production: Deepgram or AssemblyAI (cheaper, faster)
stt = DeepgramSTT(api_key=..., model="nova-2")
transcript = await stt.transcribe(audio_bytes)
```

**Cost impact:** OpenAI gpt-4o-transcribe-diarize ≈ $0.06/min. Deepgram Nova ≈ $0.0043/min (14x cheaper). At 10k calls/day × 5min avg = 50k mins/day. Swap saves ~$2500/month.

#### 5. Rate Limiting (Already MVP)

Redis token bucket on `POST /api/calls`:

```python
# redis key: "rate_limit:upload:<ip_address>"
# Allow N reqs/hour per IP
if not bucket.allow(ip_address, rate=10):
    return HTTPException(status_code=429, detail="rate_limited")
```

At 10k calls/day, this prevents any single IP from hogging capacity. Scales to unlimited IPs (no global contention).

#### 6. Daily Budget Cap (Already MVP)

Redis counter for OpenAI spend:

```python
# redis key: "spend:2026-05-15" (date-bucketed)
daily_spend = redis.incrby(f"spend:{date}", stage_cost_cents)
if daily_spend > DAILY_BUDGET_USD * 100:
    return HTTPException(status_code=429, detail="budget_exceeded")
```

At 10k calls/day ≈ $12–30/day (depending on models). Set `DAILY_BUDGET_USD=50` for headroom.

---

## PII Handling & Data Retention

Audio + transcript = high privacy risk. Production checklist:

### Encryption at Rest

**Audio files:**
```
S3 SSE-KMS (customer-managed key)
GET /api/calls/{id}/audio checks row-level permissions
```

**Postgres:**
```sql
-- Encrypt sensitive columns with pgcrypto
CREATE TABLE transcripts (
  id UUID PRIMARY KEY,
  raw_payload_json BYTEA,  -- encrypted JSON blob
  encrypted_with_key_id INT,
  ...
);

-- Decrypt on read only for authorized users
SELECT pgp_sym_decrypt(raw_payload_json, 'key') 
FROM transcripts WHERE id = $1 AND call.user_id = $2;
```

### PII Redaction Before LLM

Before mood/tagging/insights stages, scan transcript for names, emails, phone numbers:

```python
async def redact_pii(transcript: str) -> str:
    """Regex + NER (spaCy) to mask PII."""
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', transcript)
    text = re.sub(r'\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b', '[PHONE]', text)
    # NER pass for names (optional, slower)
    doc = nlp(text)
    for ent in doc.ents:
        if ent.label_ == "PERSON":
            text = text.replace(ent.text, "[NAME]")
    return text
```

Input to LLM = redacted transcript. Original stored encrypted.

### Retention & Deletion Policy

```python
# Batch job (daily): delete old audio, retain redacted transcript
delete_before = datetime.now() - timedelta(days=90)
old_calls = db.query(Call).filter(Call.created_at < delete_before).all()

for call in old_calls:
    await storage.delete(call.filename)
    db.execute(
        "UPDATE transcripts SET raw_payload_json = NULL WHERE call_id = ?",
        call.id
    )
    db.commit()
```

Frontend can still show call summaries (synthesis, tags, insights) because those are computed from redacted data.

### Right-to-Delete Handler

When user requests deletion (GDPR/CCPA):

```python
async def delete_call(call_id: UUID, user_id: UUID):
    call = db.query(Call).filter(Call.id == call_id, Call.user_id == user_id).one()
    
    # Cascade delete
    await storage.delete(call.filename)
    db.delete(db.query(Transcript).filter(Transcript.call_id == call_id))
    db.delete(db.query(Analysis).filter(Analysis.call_id == call_id))
    db.delete(call)
    db.commit()
    
    # Log for audit trail
    log(f"User {user_id} deleted call {call_id}")
```

---

## Production Evolution Paths

### Real-Time Progress (WebSocket)

Replace polling with Redis pub/sub + SSE/WebSocket:

```python
# Worker publishes progress
redis.publish(f"call:{call_id}:progress", json.dumps({
    "stage": "tagging",
    "pct": 75,
    "eta_seconds": 5
}))

# Frontend subscribes; displays live progress bar
```

Reduces frontend polling from 2s interval to 0 polling. Latency perceived as real-time. Scales to 10k+ concurrent users.

### Semantic Search via pgvector

Embed transcript chunks (1000-token windows) and store in Postgres pgvector column:

```python
# During synthesis, embed each chunk
embeddings = await openai_client.embeddings.create(
    model="text-embedding-3-small",
    input=[chunk1, chunk2, ...]
)

db.execute("""
    INSERT INTO transcript_embeddings (call_id, chunk_id, embedding)
    VALUES ($1, $2, $3::vector)
""", call_id, chunk_id, embedding_vector)

# Frontend: search all calls by semantic similarity
results = db.query(TranscriptChunk).filter(
    TranscriptChunk.embedding.cosine_distance(query_vector) < 0.2
).limit(10)
```

Enables "find all calls where pricing was a blocker" via natural language query. Cost: ~$0.02 per embedding; 1 call ≈ 5–10 embeddings.

### Event-Driven Backbone (Redpanda/Kafka)

Swap Celery task queue for event log. Enable fan-out to multiple consumers:

```python
# Phase 1: Transcription (consumer 1)
producer.send("call.transcribed", {
    "call_id": "...",
    "transcript": "...",
    "duration_seconds": 300
})

# Phase 2: Mood + tagging + insights (consumer 2–4, in parallel)
# Phase 3: Alerts (consumer 5: "if Insight.kind='buying-signal' with weight ≥ 1.5, send Slack")
```

Decouples producers from consumers. New consumer = new feature (e.g., data warehouse pipeline, real-time Slack alerts) without touching core pipeline.

### Auth & Multi-Tenancy

Add JWT + row-level filters:

```python
# auth.py
def get_current_user(token: str) -> User:
    payload = jwt.decode(token, SECRET_KEY)
    return db.query(User).filter(User.id == payload["sub"]).one()

# routes.py
@app.get("/api/calls")
async def list_calls(user: User = Depends(get_current_user)):
    return db.query(Call).filter(Call.user_id == user.id).all()  # RLS
```

Frontend stores JWT in secure httpOnly cookie. Every request includes `Authorization: Bearer <token>`. Rate limits become per-org instead of per-IP.

### Voice-Based Participant Identity

Detect speaker identity across calls using voice embeddings:

```python
# Phase 1: Extract speaker segments from diarization
# Phase 2: Compute speaker embedding (pyannote-audio)
speaker_embedding = embedding_model.embed_speaker(audio_chunk)

# Phase 3: Store + compare across calls
db.execute("""
    INSERT INTO speaker_profiles (org_id, speaker_embedding, call_id)
    VALUES ($1, $2::vector, $3)
""")

# Phase 4: Identify "Sarah from Acme appeared in 5 calls"
same_speaker_calls = db.query(Call).filter(
    Call.speaker_embedding.cosine_distance(sarah_embedding) < 0.3
)
```

Enables "find all calls with the same buyer" for relationship mapping.

### Per-Call Cost & Margin Metrics

Aggregate Analysis.cost_usd_breakdown to client/deal dashboards:

```python
# Dashboard query
SELECT
    client_id,
    SUM(analysis.cost_usd_total) as total_cost,
    COUNT(call_id) as call_count,
    AVG(analysis.cost_usd_total) as cost_per_call,
    STDDEV(analysis.cost_usd_total) as cost_volatility
FROM calls
JOIN analysis ON calls.id = analysis.call_id
WHERE calls.created_at >= now() - interval '30 days'
GROUP BY client_id
ORDER BY total_cost DESC;
```

Alert on outliers (e.g., single call > $1.00 = possible runaway LLM loop). Feed to sales manager dashboard: "Cost to close this deal: $12 in transcription + analysis."

---

## Summary Table: MVP → 10k/day

| Component | MVP | 10k/day | Change |
|---|---|---|---|
| Workers | 1 (4 slots) | 25–30 | Horizontal scale |
| Postgres pool | Direct conn | pgBouncer (size 25) | Add middleware |
| Audio storage | Local disk | S3 + SSE-KMS | Protocol swap |
| STT provider | OpenAI (gpt-4o-transcribe) | Deepgram Nova (or OpenAI if budget ok) | Protocol swap |
| Cost/call | $0.01–0.03 | $0.01–0.03 (same) | Unchanged |
| Daily OpenAI spend | ~$5–10 | ~$30–50 | Linear with scale |
| Latency (p50) | 35s | 35s (same) | Unchanged |
| Latency (p99) | 90s (queue bkup) | 90s (same) | Unchanged |

**Total monthly ops cost at 10k/day:** ~$60 (workers) + $10 (Postgres managed) + $50 (OpenAI, assuming gpt-4o-mini) + $2 (S3 + egress) = ~$120/month baseline. Budget cap ensures it never exceeds that.
