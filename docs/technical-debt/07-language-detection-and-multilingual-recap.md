# 07 — Detección de idioma + recap multilingüe

- **Estado:** resuelto para llamadas nuevas; recap de llamadas existentes sigue en inglés
- **Fecha:** 2026-05-09
- **Severidad:** alta (bug visible — UI mostraba "English" en una llamada en español, recap se generaba en inglés siempre)

## Síntomas

1. Una llamada en español mostraba `English` en el header del detalle.
2. El RECAP generado por el LLM aparecía siempre en inglés (`"Luisillo discussed complications in Reforma..."`) aunque el transcript era en español.

## Causas raíz

### Idioma no detectado

El provider `OpenAISTT` (`backend/app/providers/openai_stt.py`) usa `response_format="diarized_json"`. Verificado contra el raw payload almacenado en BD: esa variante de la respuesta de OpenAI **no devuelve un campo `language`** ni a nivel raíz ni en los segments. La línea `language=getattr(response, "language", None)` siempre retornaba `None`.

Como `Call.language` y `Transcript.language` quedaban `NULL`, el frontend hacía:

```tsx
<span>{call.language ?? "English"}</span>
```

Es decir: si no hay idioma → asumir inglés. Mentira sistemática.

### Recap en inglés

`backend/app/llm/prompts/synthesis.py` instruía al LLM en inglés sin pedirle que detectara el idioma del transcript ni que respondiera en él. El modelo respondía en el idioma del prompt (inglés) por default.

## Solución aplicada

### Detección de idioma vía LLM

Se añadió un campo `language: str` al schema `Synthesis` (`backend/app/llm/schemas/synthesis.py`) que pide ISO 639-1 (`en`, `es`, `pt`, ...). El prompt (`backend/app/llm/prompts/synthesis.py`) ahora le indica al LLM:

> Detect the dominant language of the transcript first.

En `backend/app/services/pipeline.py`, después de la síntesis, se persisten `call.language` y `transcript.language` con el código detectado. No requiere migración de schema (ambas columnas ya eran `String NULL`).

Se bumpeó `SYNTHESIS_VERSION` de `v1` a `v2` y `PROMPT_VERSION` de `v1` a `v2` para auditar qué llamadas usaron el nuevo prompt.

### Recap en idioma de la llamada

El mismo prompt ahora instruye explícitamente:

> Write `headline` and `summary` in that same language as the transcript. Field names and enum values stay in English.

Mantener nombres de campos (`headline`, `summary`, `overall_sentiment`) y valores enum (`positive`/`neutral`/`negative`) en inglés es **necesario** para que el structured output siga validando contra el schema Pydantic.

### Frontend

`DetailScreen.tsx` ya no defaultea a "English". Se añadió un mapa `LANGUAGE_NAMES` (en/es/pt/fr/de/it/ja/zh/ko/ru/ar/nl) y un helper `formatLanguage(code)`:

- `null` → `—`
- `"es"` → `"Spanish"`
- `"xx"` desconocido → `"XX"` (uppercase del código)

## Costo / impacto

- **Tokens**: el campo `language` añade ~5 tokens al output structured. Despreciable.
- **Calidad del recap**: depende de la capacidad multilingüe del modelo (`LLM_MODEL_SYNTHESIS`). GPT-4o family es nativamente multilingüe.

## Deuda residual

- **Llamadas legadas**: las 2 calls existentes (`prueba`, `PruebaMultiple`) tienen analysis con `summary`/`headline` en inglés (generadas con prompt v1) y `language=NULL`. **No se reprocesan automáticamente** — habría que reanalizar manualmente vía worker o script. Si se prioriza, sería un script `scripts/reanalyze_call.py` que invoca `analyze_stage` para call IDs específicos.
- **Lista limitada de idiomas en `LANGUAGE_NAMES`**: 12 idiomas. Si el LLM devuelve un código que no está en la lista (e.g. `eu` para euskera), se muestra el código en uppercase como fallback. Aceptable.
- **No hay validación de que el idioma devuelto por LLM sea ISO 639-1 real** (e.g. el LLM podría devolver `english` en vez de `en`). El prompt es claro al respecto y Pydantic acepta cualquier `str`. Si fuera problema, añadir un `Literal[...]` o un validador.
- **El campo string `language` se guarda en `Call.language` y `Transcript.language`**. Originalmente se usaba como hint para STT (`stt_provider.transcribe(audio_path, call.language)`). Ahora también se sobrescribe post-síntesis. En un re-procesamiento, esto podría dar mejor STT — desventaja: si el LLM detectó mal, el siguiente STT usaría el idioma equivocado.
