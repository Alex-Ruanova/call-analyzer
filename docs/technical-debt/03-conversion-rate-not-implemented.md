# 03 — Conversion rate (eliminado, reemplazado por Total cost)

- **Estado:** resuelto vía eliminación + reemplazo
- **Fecha:** 2026-05-09 (decisión inicial: pendiente). 2026-05-09 (resuelto)
- **Severidad:** baja

## Resolución final

El KPI "Conversion rate" se eliminó del dashboard. En su lugar ahora se muestra **"Total cost"** con la suma de `analyses.cost_usd_total` de todas las llamadas, comparado contra el gasto previo a los 30 días (delta = costo últimos 30d, asumiendo un baseline cumulativo "antes").

Razón del cambio: la métrica de conversión nunca tuvo definición de producto (ver discusión histórica abajo). Mostrar `0` con label "not implemented" era ruido. El gasto en LLM/STT, en cambio, es un dato real, accionable (visibilidad de costo de OpenAI) y ya está calculado en BD.

### Cambios concretos

- **Backend** (`backend/app/api/dashboard.py`, `backend/app/schemas/dashboard.py`):
  - `DashboardOut.conversion_rate` → `DashboardOut.total_cost_usd`.
  - Nueva query: `SELECT COALESCE(SUM(cost_usd_total), 0.0) FROM analyses` para el valor actual; otra query con `WHERE c.created_at < now() - INTERVAL '30 days'` para el baseline previo. Delta = actual − previo.
- **Frontend** (`frontend/src/api/mappers.ts`, `DashboardScreen.tsx`, `types.ts`):
  - Tipo `BackendDashboardOut.total_cost_usd: BackendKPIItem`.
  - Card formatea valor como `$0.005` y delta como `+$0.005` (signo conservado).
  - **Inversión semántica del color**: `positive: (delta ?? 0) <= 0`. Un costo subiendo NO es positivo (es más gasto), así que el delta verde aparece cuando el costo bajó.
  - Nuevo campo `delta_label: string | null` en `Kpi` para permitir formato monetario sin afectar la lógica numérica de los otros KPIs.

## Discusión histórica (por qué no se implementó conversion_rate)

No había una definición de "conversión" en el dominio actual:

- El proyecto no tiene concepto de "deal stage" o "pipeline progression" más allá del status técnico (`pending → processing → done`).
- Los tags del LLM (`positive-outcome`, `follow-up-agreed`) son indicadores soft pero no equivalen a un conversion event auditado.
- El frontend tenía un campo `deal_status: DealStatus | null` en `CallSummary` que ningún flujo escribía.

### Opciones que se evaluaron

1. Heurística por tags (% de calls con `positive-outcome` últimos 30d).
2. Deal status manual (campo editable + UI + migración).
3. Integración con CRM (HubSpot/Salesforce).

Ninguna se priorizó porque la métrica no estaba alineada con un objetivo de producto activo. Cuando se priorice una de las tres, el approach correcto es **añadir un KPI nuevo** (no resucitar conversion_rate), porque el grid de 4 KPIs ahora está completo con dato real (Calls / Sentiment / Total cost / Talk:Listen).

## Deuda residual

- El `delta` de Total cost compara contra "costo de calls anteriores a los últimos 30 días". Para un proyecto que recién arranca con 2 calls hechas hoy, ambas caen en "últimos 30d" y el baseline previo es 0, por lo que delta = total. Eso es correcto pero potencialmente confuso. A medida que pase el tiempo y haya histórico, el delta cobra sentido.
- Si en el futuro se quiere ver costo por llamada o por modelo (STT vs LLM), el dato está en `analyses.cost_usd_breakdown` (JSONB). Hoy no se expone.
