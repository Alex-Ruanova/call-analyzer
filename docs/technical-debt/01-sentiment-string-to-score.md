# 01 — Sentiment: string categórico vs número en UI

- **Estado:** resuelto (parcial — el campo string queda como legacy)
- **Fecha:** 2026-05-09
- **Severidad:** alta (bug visible en lista de calls, dashboard, detalle de cliente)

## Síntoma

En la lista de calls, en el dashboard y en el detalle de cliente, la columna de sentiment mostraba siempre `0.00` con barra naranja, sin importar el sentiment real. En el detalle de la llamada el "Overall sentiment" mostraba `+0.00`.

## Causa raíz

Doble desalineación tipo:

1. El backend guarda `Analysis.overall_sentiment` como string categórico (`"positive" | "neutral" | "negative"`, definido en `backend/app/llm/schemas/synthesis.py` y persistido como `String(50)` en `backend/app/models/analysis.py`).
2. El frontend hacía `parseFloat(c.overall_sentiment)` en cinco pantallas (`ListScreen`, `DashboardScreen`, `ClientsScreen`, `ClientDetailScreen`, `DetailScreen`). `parseFloat("positive") === NaN`, y la rama `!= null ? ... : 0` caía a `0`.
3. Adicionalmente, `CallSummary` del backend ni siquiera incluía `overall_sentiment`, así que el campo llegaba como `undefined` y la rama de `null` se ejecutaba.

## Solución aplicada

- Se añadió un helper `sentiment_to_score(value: str | None) -> float | None` en `backend/app/llm/schemas/synthesis.py` con el mapeo `positive=+1.0, neutral=0.0, negative=-1.0`.
- Se añadieron campos `sentiment_score: float | None` (y `overall_sentiment: str | None` cuando faltaba) en:
  - `backend/app/schemas/call.py` — `CallSummary`, `CallDetail`
  - `backend/app/schemas/client.py` — `ClientOut`
- Se cablearon los campos en los endpoints que devuelven calls/clients:
  - `backend/app/api/calls.py` — `list_calls`, `get_call`
  - `backend/app/api/clients.py` — `_build_client_out`, `_build_call_summary`, `get_client`
- Frontend: se añadió `sentiment_score: number | null` a `BackendCallSummary`, `BackendCallDetail`, `BackendClientOut`, `CallSummary`, `Client`. Se reemplazó `parseFloat(...)` por `sentiment_score` directo en las cinco pantallas. Cuando el score es `null`, se renderiza `—` en lugar de pintar una barra a 0 (que daba la falsa sensación de "neutral").

## Decisión de diseño

El mapeo +1/0/-1 es **discreto, no continuo**. El backend nunca calculó un score continuo — el LLM emite la etiqueta categórica directamente. Si en el futuro queremos un score continuo (-1.0 a +1.0), hay que cambiar el prompt/schema de síntesis (`backend/app/llm/schemas/synthesis.py:Synthesis.overall_sentiment`) y persistirlo como `Float` en `Analysis`.

## Deuda residual

- El campo string `overall_sentiment` sigue exponiéndose en `CallSummary`, `CallDetail`, `AnalysisOut` y `Client`. Hoy no se usa para renderizar, pero queda como API contract. **No remover** sin migrar consumidores externos.
- El `mapper` de `mapCallSummary` sigue devolviendo `overall_sentiment` para mantener compatibilidad con código que lo pueda leer; sólo `sentiment_score` se usa en el render.
- Granularidad limitada: con el mapeo discreto, el promedio de un cliente con dos llamadas (`positive`, `neutral`) da `0.5`, lo cual es interpretable pero pierde matiz frente a un score continuo del LLM.
