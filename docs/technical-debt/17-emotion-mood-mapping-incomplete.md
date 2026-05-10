# 17 — Distribución de emociones muestra "Neutral" duplicado

- **Estado:** pendiente
- **Fecha:** 2026-05-09
- **Severidad:** baja (cosmético, pero confunde)

## Síntoma

En la tab Emotions, la card "Emotion distribution" muestra varias filas
con el mismo nombre:

```
Neutral    71%
Confused    4%
Positive   16%
Neutral     3%
Neutral     4%
Negative    1%
Frustrated  1%
```

Tres filas "Neutral" para tres llaves distintas.

## Causa raíz

El LLM emite siete moods válidos (`backend/app/llm/schemas/mood.py`):
`positive, neutral, negative, frustrated, enthusiastic, confused, concerned`.

El mapa de UI (`frontend/src/components/components.tsx:217`) sólo conoce:
`positive, excited, neutral, hesitant, confused, frustrated, negative`.

`enthusiastic` y `concerned` no existen en el mapa, así que `getEmotion`
les devuelve el fallback `EMOTIONS["neutral"]` (label "Neutral"). Las
llaves siguen siendo distintas en el `Object.entries(emotion_distribution)`,
pero las tres filas se renderean con la misma etiqueta "Neutral".

`excited` y `hesitant` están en el mapa de UI pero no son moods válidos
del LLM — están muertos.

## Acción para limpiar

- Agregar `enthusiastic` y `concerned` al mapa `EMOTIONS` con label/color
  propios.
- Quitar `excited` y `hesitant` del mapa (o mapearlos como aliases si se
  decide cambiar la taxonomía del LLM).
- Considerar deduplicar la distribución por `label` en lugar de por
  `key`, como defensa adicional.

## Riesgo

Cero. El cambio es puramente de presentación.
