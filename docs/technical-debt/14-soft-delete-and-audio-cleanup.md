# 14 — Soft delete de calls + borrado de audio post-procesamiento

- **Estado:** resuelto (incluye migración 0003)
- **Fecha:** 2026-05-09
- **Severidad:** alta (los costos pagados a OpenAI se "olvidaban" del dashboard al borrar calls; el audio se retenía sin uso)

## Síntomas

1. **Borrar una call desde la UI hacía un hard DELETE** con cascade a `Analysis`, `Transcript`, `TranscriptSegment`, `Insight`, `ActionItem`, `Participant`. El dashboard agregaba costos vía `JOIN analyses → calls`, y al desaparecer la fila, la suma "olvidaba" el costo de esa call. Mismo problema con `calls_this_week` y `calls_per_day`. **Los costos a OpenAI no son reembolsables**: la métrica mentía retroactivamente.

2. **El archivo `.wav` original se conservaba indefinidamente** en `storage/audio/` aunque ningún flujo lo consumía después de `status='done'`. Acumulaba GB de audio + presentaba riesgo PII (voz biométrica retenida sin política de retención).

## Causa raíz

### Cascade DELETE

`backend/app/models/call.py` declara `cascade="all, delete-orphan"` en todas las relaciones de `Call` (transcript, analysis, insights, etc.). El endpoint `DELETE /api/calls/{id}` hacía `session.delete(call) → cascade → all gone`.

### Audio retenido

`process_call.py` graba `storage/audio/<uuid>.wav` antes de procesar (necesario porque el worker async lee del disco), pero al terminar el pipeline ningún paso limpiaba el archivo. La única ruta de borrado era el endpoint de delete (que no se ejecuta para calls "exitosas"). El doc `docs/architecture-and-scale.md` ya identificaba "encrypt audio at rest + retention policy" como tarea pendiente; faltaba el primer paso (borrarlo).

## Solución aplicada

### Soft delete

Migración `0003_calls_soft_delete`: añade `Call.deleted_at: datetime | None` con índice. La migración corre automáticamente al arrancar el contenedor `api` (commit `8a8ad78`).

`DELETE /api/calls/{id}` y `POST /api/calls/bulk-delete` ahora hacen `UPDATE calls SET deleted_at=now()` en vez de borrar. La fila más sus relaciones se conservan.

Las queries del API se dividen en dos categorías por intención:

| Tipo | Filtra `deleted_at IS NULL`? | Por qué |
|---|---|---|
| Lista de calls (`/api/calls`), detalle (`/api/calls/{id}`), recent_calls del cliente | ✅ Sí | El usuario pidió ocultarla |
| Dedup en upload (`content_sha256` match) | ✅ Sí | Si la borraste, puedes resubir |
| Dashboard: `total_cost_usd`, `calls_this_week`, `calls_per_day` | ❌ **No** | Auditoría — el costo pagado existió, el volumen ocurrió |
| Dashboard: `avg_sentiment` (Positive rate), `talk_listen_ratio`, `sentiment_trend`, `pipeline`, `top_pain_points` | ✅ Sí | Métricas de calidad — borrar = "esta no representa mi flujo" |
| Client aggregates (`calls`, `last_call`, `sentiment`) | ✅ Sí | Vista del cliente, no auditoría global |

### Audio cleanup automático

`process_call._run_pipeline` ahora invoca `_delete_audio_for_call(call_id)` justo después de marcar `status='done'`. La función lee `Call.filename`, hace `Path(...).unlink(missing_ok=True)`, y reporta warning si falla.

El endpoint de delete sigue intentando borrar el archivo (cubre el caso edge de borrar mientras la call estaba procesando), pero en operación normal el archivo ya no existe al momento del delete.

`Call.filename` se conserva como referencia histórica para diagnósticos / auditoría. Apunta a un archivo que ya no existe.

## Init from scratch

Migración `0003` corre automáticamente — ningún paso manual. Volume de Postgres existente: la migración `add_column` no destruye datos.

## Trade-offs y deuda residual

- **Sin reanalyze con re-STT**: si en el futuro implementamos un endpoint que rehace transcripción (no solo synthesis), se necesita el audio. La opción correcta sería **TTL** (e.g. 30 días) en vez de borrado inmediato. Tracked en `docs/improvements.md` #8.
- **Sin endpoint de "restore"**: una call soft-deleted no se puede restaurar desde la UI. Si el usuario borra por error, recuperarla requiere SQL (`UPDATE calls SET deleted_at=NULL WHERE id=?`). Aceptable para un MVP single-user; en producción multi-usuario conviene un undo de N segundos antes de comprometer el delete.
- **Sin GC de filas soft-deleted**: la tabla acumula filas con `deleted_at` indefinidamente. Para producción sería razonable un job que purgue filas con `deleted_at < now() - INTERVAL '1 year'` (incluido cascade real). Hoy no existe.
- **`Call.filename` apunta a un archivo borrado**: si por alguna razón el delete del audio falla pero la call termina en `done`, el archivo queda huérfano. La referencia en BD funciona como flag para futuros GC scripts.
- **Pipeline en `failed` retiene audio**: `_delete_audio_for_call` solo se ejecuta en el path exitoso. Una call que falla a la mitad deja su audio en disco hasta que se borra explícitamente. Aceptable: el operador puede querer inspeccionarlo.
