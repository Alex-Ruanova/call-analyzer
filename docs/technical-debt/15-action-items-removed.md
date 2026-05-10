# 15 — Action Items: feature removida

- **Estado:** pendiente (decisión de producto tomada, implementación en curso)
- **Fecha:** 2026-05-09
- **Severidad:** baja (no rompe nada, sólo limpia)

## Síntoma

La pantalla de detalle exponía una sección "Action items" con checkboxes y
fechas (`Due 2023-11-01`, etc.) generada por el LLM en la etapa de
extracción de insights. En la práctica:

- Los items son sugerencias del LLM sin contexto suficiente (no sabe quién
  es responsable, ni cuándo es la fecha real, ni si el equipo ya los
  trackea en otro lado).
- No hay flujo para reasignar, completar o sincronizar con un sistema
  externo (Linear, Asana, CRM). Quedan inertes.
- Confunden con notas reales del usuario (sección Notes).

## Localización

- Modelo: `backend/app/models/insight.py` — clase `ActionItem` y
  `Call.action_items` relationship.
- LLM schema: `backend/app/llm/schemas/insights.py` — `ExtractedActionItem`
  y campo `action_items` en `InsightExtraction`.
- Prompt: `backend/app/llm/prompts/insights.py` (instrucciones de extraer
  action items).
- Pipeline: `backend/app/services/pipeline.py` (~líneas 524-538) — crea
  rows de `ActionItem` por cada sugerencia.
- API: `backend/app/api/calls.py` — `selectinload(Call.action_items)`,
  `ActionItemOut`, campo `action_items` en `CallDetail`, payload de export.
- Schema: `backend/app/schemas/call.py` — `ActionItemOut`, `action_items` en
  `CallDetail`.
- Frontend: `frontend/src/types.ts` (`ActionItem`), `frontend/src/api/mappers.ts`,
  `frontend/src/screens/DetailScreen.tsx` (Section "Action items").

## Acción para limpiar

1. Frontend: eliminar la sección "Action items", su tipo `ActionItem` y la
   columna `action_items` del tipo `Call`.
2. API/Schema: quitar `action_items` del response y del export.
3. Pipeline + LLM schema: dejar de pedir y persistir action items.
4. DB: migración Alembic que dropea la tabla `action_items` (FK ON DELETE
   CASCADE → safe).
5. Tests: eliminar fixtures y aserciones que dependan de `action_items`.

## Reversibilidad

Bajo riesgo. El feature no estaba conectado a ningún sistema externo y no
había datos críticos. Si en el futuro vuelve, la implementación correcta
es: integrar contra un tracker existente (Linear/Asana) en lugar de
guardar items en local sin flujo.
