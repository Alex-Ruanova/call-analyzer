# 02 — Call duration: NULL en BD por respuesta de OpenAI

- **Estado:** resuelto en pipeline + script de backfill
- **Fecha:** 2026-05-09
- **Severidad:** media (bug visible — columna "Duration" mostraba `—`)

## Síntoma

En la lista de llamadas y en el detalle, la duración aparecía como `—` aunque el audio se transcribía correctamente.

## Causa raíz

`OpenAISTT.transcribe` (en `backend/app/providers/openai_stt.py`) usa `response_format="diarized_json"`. Esa variante de la respuesta **no incluye un campo `duration` a nivel raíz** (a diferencia de `verbose_json`). Por eso `raw.get("duration")` retornaba `None`, y por tanto:

- `DiarizedTranscript.duration_seconds` quedaba `None`.
- En `pipeline.transcribe_stage` la asignación `if call.duration_seconds is None and diarized.duration_seconds is not None: call.duration_seconds = ...` nunca se ejecutaba.
- `Call.duration_seconds` se quedaba `NULL` indefinidamente.

## Solución aplicada

En `backend/app/services/pipeline.py`:

1. **Single-shot path** (`transcribe_stage`): si la STT no devolvió duration, se usa `max(seg.end for seg in diarized.segments)` como fallback.
2. **Chunked path** (`_transcribe_chunked`): igual fallback aplicado al ensamblado final, sobre `all_segments`.

Justificación de elegir `max(seg.end)` sobre `ffprobe` adicional: ya hay segmentos en memoria con timestamps absolutos, evita un subprocess extra, y la diferencia con la duración real del archivo es de milisegundos (silencio final).

## Backfill

Para las llamadas que ya estaban procesadas con `duration_seconds = NULL`:

```bash
conda run -n call-analyzer python scripts/backfill_call_duration.py
```

El script (`scripts/backfill_call_duration.py`) hace un `UPDATE ... FROM (SELECT MAX(end_seconds) ...)` cubriendo sólo las filas con `duration_seconds IS NULL` y al menos un segmento.

## Deuda residual

- Si en el futuro se cambia el `response_format` de OpenAI o se añade otro provider STT que sí devuelva `duration`, el fallback de `max(seg.end)` sigue siendo correcto pero dejará de ser necesario; no requiere acción.
- El backfill es idempotente, pero no se ejecuta automáticamente en deploy. Si se reusa la BD existente en otra instalación, alguien debe correrlo a mano.
