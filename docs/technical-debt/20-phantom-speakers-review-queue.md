# 20 — Phantom speakers: cola de revisión en lugar de merge silencioso

- **Estado:** resuelto (parcial — falta backfill de llamadas existentes)
- **Fecha:** 2026-05-09
- **Severidad:** media

## Síntoma

`gpt-4o-transcribe-diarize` (`backend/app/providers/openai_stt.py`)
ocasionalmente inventa hablantes para cross-talk, respiración, ruido
transitorio o cambios bruscos de prosodia. Una llamada con 2 personas
reales llegaba con 4 etiquetas de speaker, contaminando:

- la lista de Participants en el panel de Transcript info,
- el cálculo de `talk_ratio`,
- la distribución de emociones,
- los `segment_idx` referenciados por insights.

La API de transcripción de OpenAI no acepta `num_speakers` ni un campo
`prompt` que afecte al diarizador, así que el filtrado tiene que pasar
del lado de la app.

## Solución actual

Heurística determinística + cola de revisión humana. Implementada en
`backend/app/services/pipeline.py:_flag_minor_speakers`.

### Heurística (qué cuenta como "fantasma")

Un speaker se marca como **sospechoso** sólo cuando cumple **las tres**
condiciones a la vez:

- Tiempo total < 2.0s
- Share del total < 2%
- Conteo de segmentos < 2

El AND es lo que mantiene baja la tasa de falsos positivos: un
participante real con voz corta y participación rara puede cumplir 1 ó
2, pero las 3 simultáneamente es muy improbable. Si TODOS los speakers
califican (transcripts de 1-2 segmentos), la heurística se aborta para
no marcar al único participante.

### Comportamiento

Antes (decisión revertida): se reasignaba el `speaker_label` del
segmento al hablante dominante más cercano por midpoint temporal. Esto
borraba a un tercer participante real que sólo dijo dos palabras
("perdón, ¿necesitas algo?") en una llamada larga — error silencioso e
irrecuperable desde la UI.

Ahora: el speaker se preserva, sólo se marca el segmento con
`needs_review=true`. La UI lo surface como una cola de revisión donde
el usuario decide:

- **Reasignar** a un speaker existente (dropdown con los labels
  conocidos del transcript + los participants ya configurados).
- **Crear nuevo** speaker — vía el botón "Add participant" del mismo
  panel, luego asignar el segmento a ese label nuevo.
- **Editar el texto** del segmento si la transcripción está mal.
- **Confirmar tal cual** — guarda con la asignación actual y limpia el
  flag.

Cualquier edición del usuario (`speaker_label`, `text`, o un PATCH
vacío) limpia el flag.

## Schema

`backend/alembic/versions/0006_segments_needs_review.py` agrega
`transcript_segments.needs_review BOOLEAN NOT NULL DEFAULT false`.

## API

`PATCH /api/calls/{call_id}/segments/{idx}` — body:

```json
{ "speaker_label": "B", "text": "..." }
```

Ambos campos opcionales (`exclude_unset`). El flag `needs_review` se
limpia por side effect al recibir cualquier edición.

## Frontend

`ReviewQueue` en `frontend/src/screens/DetailScreen.tsx`. Se renderiza
dentro del Section "Transcript information" en el SummaryTab cuando hay
≥1 segmentos flagged. Sólo se muestra cuando hay trabajo que hacer.

## Trade-offs aceptados

- Las llamadas existentes (en DB antes de esta migración) tienen
  `needs_review=false` por default, así que no aparecen en la cola.
  Para retroactivar habría que correr el reanalyze (`improvements.md
  #8`) o un job batch que aplique `_flag_minor_speakers` sobre los
  segmentos ya guardados.
- Los umbrales (`2.0s / 2% / 2 segmentos`) son magic numbers calibrados
  para sales calls de varios minutos. Para llamadas <30s la heurística
  se desactiva sola. Si aparecen falsos positivos sostenidos, ajustar
  con telemetría — no a ojo.
- No hay aún logging del `len(phantom)` por call. Sería útil agregar
  un `logger.info("flagged %d minor speakers in call %d", ...)` en
  `_flag_minor_speakers` para detectar si la heurística está
  sobre-marcando.

## Si OpenAI agrega `num_speakers`

La heurística se vuelve redundante. Borrar `_flag_minor_speakers` y la
columna `needs_review` con una migración inversa sería trivial.

## Tests

`backend/tests/test_pipeline.py` cubre 4 casos: collapses correctly,
balanced no-op, empty, single-segment skip.
