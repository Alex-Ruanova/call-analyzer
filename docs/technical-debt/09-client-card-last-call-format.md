# 09 — "Last call" en client cards: formato ISO crudo

- **Estado:** resuelto
- **Fecha:** 2026-05-09
- **Severidad:** baja (cosmético)

## Síntoma

La card de cliente en `/clients` mostraba `LAST CALL: 2026-05-09T17:59:29.713656` — ISO crudo con microsegundos. Inservible para humanos.

## Causa raíz

`frontend/src/screens/ClientsScreen.tsx:169` hacía `{c.last_call ?? "—"}` directo, sin formatear. El backend devuelve un timestamp ISO porque `Client.last_call` es `MAX(Call.created_at)` calculado en `_build_client_out`.

## Solución aplicada

Helper `formatLastCall(value: string | null)` en `ClientsScreen.tsx`:

- `null` → `—`
- Hoy → `Today`
- Ayer → `Yesterday`
- Últimos 7 días → `N days ago`
- Últimas 4 semanas → `Nw ago`
- Más viejo o futuro → fecha localizada (`May 9, 2026`)

Mismo lugar de render: `<div>{formatLastCall(c.last_call)}</div>`.

## Deuda residual

- El formato es en inglés (`Today`, `Yesterday`). Si en algún momento se i18n-iza la UI, este helper debe migrar a `Intl.RelativeTimeFormat`.
- No se muestra el ARR ni el "next" call (campos que existen en `Client.health` pero no se exponen). Fuera del alcance de este fix.
