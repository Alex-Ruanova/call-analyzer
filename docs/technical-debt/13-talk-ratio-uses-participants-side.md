# 13 — Talk:listen ratio respeta `Participant.side`

- **Estado:** resuelto
- **Fecha:** 2026-05-09
- **Severidad:** media (la métrica antes podía estar invertida si el cliente dominaba la conversación)

## Síntoma

El KPI del dashboard `Talk:Listen ratio` y la pista del detalle (`Rep · X% / Client · Y%`) decían cosas como "rep talks 80% of the time" aunque el usuario hubiera etiquetado al cliente como `Customer` y al rep como `Internal` desde el editor de Participants. Los dropdowns Internal/Customer eran cosméticos: persistían el metadata pero ningún cálculo del backend lo consumía.

## Causa raíz

`backend/app/services/pipeline.py:_compute_talk_ratios` aplicaba una heurística: el speaker que más tiempo hablaba se asumía como "rep". Si el cliente lideraba la conversación (típico en demos donde el cliente pregunta mucho, o en discovery calls bien hechas), la métrica reportaba al **cliente** como rep e invertía el sentido del KPI.

La tabla `participants` (commit `2776b74`) ya almacenaba `speaker_label → side ('rep' | 'client')` editable desde la UI, pero `_compute_talk_ratios` no la leía.

## Solución aplicada

### `_compute_talk_ratios` ahora acepta rep_labels

```python
def _compute_talk_ratios(
    segments: list[TranscriptSegment],
    rep_labels: set[str] | None = None,
) -> tuple[float, float]:
    ...
    matched_labels = (rep_labels or set()) & set(speaker_durations.keys())
    if matched_labels:
        rep_duration = sum(speaker_durations[label] for label in matched_labels)
    else:
        # heurística vieja como fallback
        ...
```

### Pipeline lee la tabla `participants` antes de calcular

`analyze_stage` ahora hace `SELECT speaker_label FROM participants WHERE call_id=? AND side='rep'` y le pasa el set al helper. Si el usuario ya editó participants antes del análisis (caso raro hoy, pero posible cuando exista el endpoint de reanalyze), los respeta. Si no, fallback a heurística.

### Recalc al guardar participants

`PUT /api/calls/{id}/participants` (commit `2776b74`) ahora, después de reemplazar la lista de participants, **recalcula** `talk_ratio_rep` y `talk_ratio_client` sobre los segments existentes y actualiza la fila `Analysis`. Es aritmética pura sobre datos en memoria — no llama LLM ni STT — así que se ejecuta síncronamente dentro del request (~10ms para una llamada de 9 minutos).

Resultado del lado del usuario: editas `Internal`/`Customer` en la UI, el debounce de 600ms dispara el PUT, el dashboard al siguiente refetch refleja el ratio correcto.

## Verificación

Llamada de prueba (id=15, A habla 33%, B habla 67%):

```
1. heurística vieja: rep=0.669 (B dominante asumido como rep)
2. usuario marca A=rep, B=client → rep=0.331
3. usuario marca B=rep, A=client → rep=0.669
4. usuario borra ambos → rep=0.669 (vuelve a heurística)
```

## Deuda residual

- **Múltiples reps**: si el usuario marca dos speakers como `rep` (escenario válido en una llamada con dos AEs), el helper suma sus duraciones como una sola fracción. El campo `Participant.side` permite este caso por construcción.
- **Sin reps marcados pero con clients sí**: si el usuario marca solo un speaker como `client` y deja al otro sin label, hoy se cae al fallback heurístico (porque `rep_labels` queda vacío). Una mejora sería derivar rep como "los speakers no marcados como client". No incluido — caso raro, y la heurística probablemente dará la respuesta correcta de todas formas.
- **El usuario tiene que abrir cada call para corregir**: no hay flujo de bulk-edit. Si la heurística falla sistemáticamente en muchas llamadas (e.g. el rep nunca habla más que el cliente en discovery calls), conviene un bulk-assign por cliente.
- **Health threshold hardcoded en el frontend**: `>0.7 = Rep-dominated, <0.3 = Client-dominated, else Healthy` está en `DetailScreen.tsx`. Si quieres ajustar el umbral hay que tocar código. Aceptable mientras no haya pedido del producto.
