# 19 — Overall sentiment puede ser "+1.00 Positive" con 71% de moods neutrales

- **Estado:** pendiente (decisión de producto requerida)
- **Fecha:** 2026-05-09
- **Severidad:** media (parece bug aunque es by-design)

## Síntoma

En una llamada, "Overall sentiment" reporta `+1.00 Net Positive` mientras
que la "Emotion distribution" muestra 71% Neutral, 16% Positive, ~10%
otros. La discrepancia es legítima a nivel de modelado pero engaña al
usuario, que asume que un número y los porcentajes están conectados.

## Causa raíz

Son dos llamadas al LLM independientes y desconectadas:

1. **`mood_stage`** (`backend/app/llm/prompts/mood.py`): clasifica cada
   segmento del transcript con uno de los 7 moods. Alimenta
   `emotion_distribution` y `emotion_timeline`.

2. **`synthesis_stage`** (`backend/app/llm/prompts/synthesis.py`):
   produce **una** etiqueta global `positive | neutral | negative` para
   toda la llamada, basada en su lectura holística del cierre, los
   momentos clave y el outcome implícito. Esa etiqueta se mapea a `+1
   / 0 / -1` vía `sentiment_to_score`.

El LLM puede decidir, correctamente, que una llamada con muchos turnos
de logística rutinaria (neutral) cierra con compromiso del cliente
(positive global). Pero el copy actual ("+1.00 Net Positive · Trended
positive in 4 of 5 segments") trata a ambas señales como si fueran la
misma — y la frase "4 of 5 segments" además **está hardcodeada** (ver
deuda 06).

## Opciones para limpiar

1. **Reemplazar el copy** para que el bloque de Overall sentiment sea
   honesto: el número viene de la lectura global del LLM, distinta de la
   distribución por segmento. Ej: `Net Positive · 16% positive · 71%
   neutral · 13% negative` derivado de la distribución real, sin
   inventar el "4 of 5".
2. **Recalcular `overall_sentiment` desde los moods** (promedio
   ponderado, valencia por mood). Más coherente, pero pierde el juicio
   global del LLM. Cambia el contrato y rompe el dashboard.
3. **Mostrar las dos métricas explícitamente como independientes**
   (LLM-global vs distribución por segmento) con texto que lo aclare.
   Lo más honesto, lo más feo en la UI.

Recomendado: opción 1 a corto plazo + considerar mover a "sentiment
score continuo" (improvements roadmap #9) a mediano plazo, lo cual
también cambia la conversación porque ya no sería etiqueta categórica.

## Riesgo

Sólo de copy. Si se elige opción 2, requiere migración y cambio de
contrato del LLM — riesgo medio.
