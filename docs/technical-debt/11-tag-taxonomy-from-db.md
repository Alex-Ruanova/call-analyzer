# 11 — Tag taxonomy: ahora viene de la BD, no de un constante hardcoded

- **Estado:** resuelto
- **Fecha:** 2026-05-09
- **Severidad:** media (causaba duplicados semánticos en la BD y un catálogo no controlable por el usuario)

## Síntoma

Dos catálogos de tags vivían en paralelo y no estaban alineados:

- **`backend/app/llm/prompts/tags.py:TAG_TAXONOMY`** — lista hardcoded de 15 tags que el LLM podía elegir.
- **`scripts/seed.py:TAGS_DATA`** — lista de 5 tags marcados como `is_system=true`.

Las dos listas se solapaban con nombres distintos para conceptos iguales:

| Seed | LLM hardcoded |
|---|---|
| `objection` | `objection-handling` |
| `follow-up` | `follow-up-agreed` |
| `pricing` | `pricing-discussion` |

El pipeline `tag_stage` insertaba en BD cualquier tag de la lista del LLM aunque no estuviera en seed (`is_system=false`). Resultado: la BD acumulaba duplicados semánticos (`objection` *y* `objection-handling`), el usuario no podía controlar el catálogo, y agregar tags al LLM requería modificar código fuente.

## Solución aplicada

### Pipeline lee la taxonomía de la BD

`backend/app/services/pipeline.py:tag_stage` ahora hace `SELECT name FROM tags ORDER BY name` y pasa esa lista al prompt builder. El LLM se constriñe a los tags que el usuario ha curado. El filtro de validación post-respuesta (`tag for tag in suggested if tag in valid_taxonomy`) se mantiene como defensa contra alucinaciones.

### Prompt builder ahora recibe la taxonomía como parámetro

`backend/app/llm/prompts/tags.py:build_prompt(transcript_text, taxonomy)`. La constante `TAG_TAXONOMY` se reemplazó por `FALLBACK_TAXONOMY` (9 tags) que solo se usa si la BD viene vacía — caso edge de un install nuevo antes de correr `make seed`.

`PROMPT_VERSION` bumpeado a `v2`.

### Seed alineado con los nombres canónicos

`scripts/seed.py:TAGS_DATA` ahora siembra 9 tags `is_system=true` que matchean los nombres "buenos":

```python
discovery, demo, objection-handling, pricing-discussion,
follow-up-agreed, positive-outcome, feature-request,
onboarding, renewal
```

### Limpieza de la BD existente

Se ejecutó SQL one-off para:
1. Re-rutear `call_tags` que apuntaban a `objection`/`follow-up`/`pricing` hacia los canónicos.
2. Borrar los duplicados huérfanos.
3. Promover los tags existentes a `is_system=true`.

No requiere migración Alembic (es data, no schema). Para un install nuevo, el seed inserta directamente el catálogo bueno.

## Implicaciones

- **El usuario auto-cura el catálogo**: cuando crea un tag manualmente desde `TagEditor` (commit `2a85d44` permite hacerlo por nombre), futuras llamadas tendrán ese tag disponible para que el LLM lo elija. El sistema se vuelve self-healing.
- **No hay forma de "ocultar" un tag del LLM sin borrarlo**: si quieres que un tag exista para asignar manual pero el LLM nunca lo elija, hoy no se puede. Posible mejora: añadir `Tag.llm_visible: bool` para excluirlos del prompt sin borrarlos.

## Deuda residual

- **Sin pantalla de tag management**: agregar/editar/borrar tags hoy requiere SQL o usar el `TagEditor` inline en una call. Mientras el catálogo se mantenga estable (~10 tags) eso basta. Si crece, conviene una pantalla `/tags` (tracked en `docs/improvements.md` #1).
- **El prompt se hincha si la BD tiene 100+ tags**: con la taxonomía actual de 8-15 tags el prompt es de ~200 tokens. A 100 tags serían ~1500 tokens — el LLM empieza a elegir peor. Mitigaciones futuras: filtrar por `usage_count` en la query de taxonomía y mandar solo los top-N más usados.
