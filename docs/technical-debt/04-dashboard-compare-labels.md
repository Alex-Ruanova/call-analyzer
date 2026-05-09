# 04 — Dashboard: etiquetas "vs last week" mentían

- **Estado:** resuelto
- **Fecha:** 2026-05-09
- **Severidad:** baja (cosmético / confianza en métricas)

## Síntoma

Los cuatro KPIs del dashboard mostraban siempre el mismo subtítulo `"vs last week"` debajo del delta.

## Causa raíz

La cadena `"vs last week"` estaba hardcodeada en `frontend/src/screens/DashboardScreen.tsx`. En realidad las queries del backend comparan distintos periodos:

| KPI | Query (en `backend/app/api/dashboard.py`) | Periodo de comparación real |
|---|---|---|
| Calls this week | `date_trunc('week', now())` vs semana anterior | semana actual vs semana previa ✅ |
| Avg sentiment | últimos 30d vs 30d anteriores | **vs prior 30 days** ❌ decía "last week" |
| Conversion rate | hardcoded 0 | n/a |
| Talk:listen ratio | últimos 30d vs 30d anteriores | **vs prior 30 days** ❌ decía "last week" |

## Solución aplicada

En vez de unificar las queries (que cambia significado de las métricas), se añadió un campo `compare_label: string` a la interfaz `Kpi` (`frontend/src/types.ts`) y se setea por KPI en `mapDashboard` (`frontend/src/api/mappers.ts`):

- Calls this week → `"vs last week"`
- Avg sentiment → `"vs prior 30 days"`
- Conversion rate → `"not implemented"` (ver [03](./03-conversion-rate-not-implemented.md))
- Talk:Listen ratio → `"vs prior 30 days"`

`DashboardScreen` ahora renderiza `{k.compare_label}` directamente.

## Deuda residual

- Si se decide reescribir todas las queries para que comparen "esta semana vs la previa", hay que actualizar `dashboard.py` (queries SQL con `INTERVAL '30 days'` → `'7 days'`) y volver los labels a `"vs last week"`. Trade-off: 30d da más estabilidad estadística, 7d es más responsivo a cambios.
