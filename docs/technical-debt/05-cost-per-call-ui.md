# 05 — Costo por llamada: dato existía pero no se mostraba

- **Estado:** resuelto (parcial — sólo en DetailScreen)
- **Fecha:** 2026-05-09
- **Severidad:** baja (no es bug, era falta de surface en UI)

## Síntoma

Alex preguntó "¿dónde veo el costo por llamada?" — la respuesta era: en ningún lado de la UI.

## Estado previo

El backend ya calcula y persiste el costo total por llamada:

- `Analysis.cost_usd_total` (Numeric) y `Analysis.cost_usd_breakdown` (JSONB con desglose por modelo) — `backend/app/models/analysis.py`.
- Se incluye en `CallSummary.cost_usd_total` y `AnalysisOut.cost_usd_total` / `cost_usd_breakdown` (`backend/app/schemas/call.py`).
- Llega al frontend tipado en `frontend/src/types.ts:103-104` y mapeado en `frontend/src/api/mappers.ts:288-289`.

Nunca se renderizó. Un `grep -rn "cost" frontend/src/screens` no retornaba nada.

## Solución aplicada

En `frontend/src/screens/DetailScreen.tsx`, la barra de metadatos del header (al lado de fecha, duración e idioma) ahora incluye `${cost.toFixed(3)}` cuando `call.analysis?.cost_usd_total != null`. Tooltip: "LLM + STT cost for this call".

## Deuda residual

- **Lista de calls** (`ListScreen`): no muestra cost. La columna existiría pero la tabla ya tiene 7 columnas; añadirla requiere repensar el layout o hacer la columna ocultable.
- **Dashboard**: no hay KPI de "cost this week / cost this month / cost per call avg". Es una métrica útil para monitorear gasto OpenAI; queda pendiente.
- **Cost breakdown**: `cost_usd_breakdown` (desglose por modelo: STT, mood, synthesis, insights, tags) llega al frontend pero no se muestra. Útil para detail page como tabla expandible.
- **Cost del cliente**: `ClientDetail` no agrega cost total. Requiere `SUM(Analysis.cost_usd_total)` en `_build_client_out`.

## Decisión

Se priorizó mostrar el cost en `DetailScreen` (donde el usuario ya está mirando una llamada específica) sobre añadirlo a la lista. Si se necesita visibilidad agregada de gasto, mejor un KPI de dashboard que una columna por fila.
