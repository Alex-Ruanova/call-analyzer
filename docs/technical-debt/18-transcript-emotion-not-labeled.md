# 18 — Transcript: el dot de emoción por turno no es identificable

- **Estado:** pendiente
- **Fecha:** 2026-05-09
- **Severidad:** baja (UX)

## Síntoma

Cada turno del transcript muestra un puntito de color al lado del
timestamp (ver `frontend/src/screens/DetailScreen.tsx`). El color se
calcula desde `seg.mood` pero no hay tooltip ni label que diga **qué
emoción** representa. El usuario tiene que cruzar mentalmente el color
con la leyenda de la card "Emotion distribution".

## Acción para limpiar

- Mostrar tooltip nativo (`title="..."`) o la pill `EmotionPill` reusable
  ya existe en `components.tsx`. Mostrar al menos el label corto al
  pasar el cursor.
- Opcional: pequeño label inline para los moods no neutrales
  (`positive`, `negative`, `frustrated`...) y omitir cuando sea
  `neutral` para no saturar.

## Riesgo

Cero, sólo render.
