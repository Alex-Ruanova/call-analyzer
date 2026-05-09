# 06 — DetailScreen: copy hardcodeado en sección de sentiment

- **Estado:** pendiente
- **Fecha:** 2026-05-09
- **Severidad:** baja (sólo cosmético; el número sí es real)

## Síntoma

En `DetailScreen.tsx` (tab Emotions), la card de "Overall sentiment" muestra:

- El número (`sentiment_score`) — **correcto**, ya conectado.
- "Net Positive" como título — **hardcodeado**, no refleja el sentiment real.
- "Trended positive in 4 of 5 segments" — **hardcodeado**, número y dirección inventados.

## Localización

`frontend/src/screens/DetailScreen.tsx:729-731`:

```tsx
<div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Net Positive</div>
<div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Trended positive in 4 of 5 segments</div>
```

## Acción para limpiar

- "Net Positive / Net Neutral / Net Negative" puede derivarse de `sentiment_score` (>0.3, [-0.3, 0.3], <-0.3).
- "Trended positive in N of M segments" requiere contar segmentos con `mood == "positive"` sobre el total. La data ya está en `call.emotion_distribution` y `call.emotion_timeline`.

No es un bug funcional pero es deuda de honestidad — el copy parece dato derivado y no lo es. Marcar como deuda hasta que se conecte.
