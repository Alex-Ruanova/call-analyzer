# Technical debt

Esta carpeta documenta deuda técnica conocida del proyecto: bugs corregidos con su contexto, hacks pendientes, decisiones provisionales y métricas no implementadas. Cada entrada incluye el motivo, la solución temporal aplicada y lo que falta para considerarla "limpia".

## Índice

- [01 — Sentiment string→numérico (resuelto, parcial)](./01-sentiment-string-to-score.md)
- [02 — Duración de llamada NULL (resuelto, requiere backfill)](./02-call-duration-fallback.md)
- [03 — Conversion rate eliminado, reemplazado por Total cost (resuelto)](./03-conversion-rate-not-implemented.md)
- [04 — Etiquetas de comparación del dashboard (resuelto)](./04-dashboard-compare-labels.md)
- [05 — Costo por llamada en la UI (resuelto, parcial)](./05-cost-per-call-ui.md)
- [06 — Hardcodes residuales en DetailScreen (pendiente)](./06-detailscreen-hardcoded-copy.md)
- [07 — Detección de idioma + recap multilingüe (resuelto, llamadas nuevas)](./07-language-detection-and-multilingual-recap.md)
- [08 — Persistencia de participants (resuelto, incluye migración)](./08-participants-persistence.md)
- [09 — Last call: formato relativo en client cards (resuelto)](./09-client-card-last-call-format.md)
- [10 — Auto-migrate al arrancar la API (resuelto)](./10-auto-migrate-on-bootstrap.md)

## Convenciones

- Cada archivo arranca con un bloque de metadatos (estado, fecha, archivos tocados).
- "Resuelto" significa que el bug se arregló pero puede haber follow-ups (backfill, refactor, métrica más rica).
- "Pendiente" significa decisión de producto o trabajo no priorizado.
