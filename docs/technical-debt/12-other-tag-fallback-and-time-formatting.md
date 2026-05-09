# 12 — `other` tag + formato de tiempos

- **Estado:** resuelto
- **Fecha:** 2026-05-09
- **Severidad:** baja (UX / honestidad de datos)

## Contexto

Dos issues separados pero menores que afloraron juntos al revisar la UI con datos reales:

### A. Tag `other` para calls que no caen en ninguna categoría

El catálogo curado (commit `4b23e7f`) tenía 9 tags concretos (`discovery`, `demo`, `objection-handling`, `pricing-discussion`, `follow-up-agreed`, `positive-outcome`, `feature-request`, `onboarding`, `renewal`). El LLM venía obligado a elegir uno; si una conversación era de un tema diferente (e.g. introducción cultural, pregunta operativa), el LLM o forzaba un match malo o el filtro de validación dejaba la call sin tags.

Necesitábamos un fallback honesto: "no aplica ninguno de los específicos".

### B. Decimales floating-point ruidosos en la UI

Los timestamps de OpenAI STT vienen como `8.297999999999998` (resultado de operaciones aritméticas con floats). Cuatro pantallas (`DetailScreen`, `ListScreen`, `ClientDetailScreen`, header de detail) los renderizaban directo sin redondeo:

- Lista de calls → `Duration: 8:49.48599999999999`
- Header de detail → `8:49.48599999999999`
- Transcript timestamps → `00:8.297999999999998`

Y el dashboard hacía lo mismo con `Talk:Listen ratio` (`0.754275`) y `Avg sentiment` (`+0.8346`).

## Solución aplicada

### A. Tag `other`

- Añadido a `scripts/seed.py:TAGS_DATA` con `is_system=true` y color gris (`#6b7280`).
- Añadido a `backend/app/llm/prompts/tags.py:FALLBACK_TAXONOMY` para installs sin seed.
- Insertado en la BD existente con un `INSERT ... ON CONFLICT DO UPDATE`.
- Prompt actualizado (`PROMPT_VERSION` bumpeado a `v3`):

  > If none of the specific tags fit well, use 'other' (only if available
  > in the taxonomy) instead of forcing a poor match.

### B. Helper canónico de formato

Nuevo `frontend/src/lib/format.ts`:

- `formatDuration(seconds | null)` → `"M:SS"` o `"H:MM:SS"`, `"—"` para null. Redondea con `Math.round` antes de formatear.
- `formatTimestamp(seconds)` → `"MM:SS"` (zero-padded), redondea igual.

Reemplazos en las 4 pantallas (`DetailScreen`, `ListScreen`, `ClientDetailScreen`, helper local en `formatTime`).

Mapper del dashboard ahora pre-formatea valores y deltas:

- `Avg sentiment` → `value.toFixed(2)`, delta como `"+0.83"`.
- `Talk:Listen ratio` → `${Math.round(value * 100)}%`, delta como `"+12.3pp"` (puntos porcentuales).
- También invertí la semántica de color: cuando el rep habla más, no es buena señal en sales coaching (más como menos: el rep debe escuchar más que hablar).

## Implicaciones

- **Migración**: ninguna (los cambios son data-only en `tags`, todo el resto es presentación frontend).
- **Llamadas legacy**: las analizadas con `PROMPT_VERSION='v1'` o `'v2'` no usaron `other`; al reanalizar (cuando exista el endpoint, ver `docs/improvements.md` #8) podrán recibirlo.

## Deuda residual

- **Talk:Listen es agregado por dashboard, no por call**: el detalle de cada call no muestra su propio talk:listen ratio. Se calcula en `_compute_talk_ratios` durante el pipeline pero no se surface en el frontend. Mejora menor, no incluida.
- **El "rep" se infiere por dominancia**: el speaker que más tiempo habla se asume rep. En llamadas grupales (3+ speakers) o cuando es el cliente quien lidera, el cálculo es engañoso. Solución honesta requiere participants persistidos con `side='rep'/'client'` (commit `2776b74` ya lo permite) y cambiar `_compute_talk_ratios` para usar esa metadata si existe. No incluido.
