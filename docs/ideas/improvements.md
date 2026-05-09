# Ideas para mejorar

Lista priorizada de mejoras razonables que **no son deuda técnica** (no hay un bug ni una decisión rota) sino features o refinamientos. Distinto de `docs/technical-debt/` que documenta lo roto/incompleto.

Cada entrada incluye: justificación, esfuerzo estimado, y dependencias. Esfuerzos en horas-persona aproximadas.

---

## Tags

### 1. Pantalla `/tags` para gestión del catálogo

**Por qué**: hoy se editan tags via SQL o creando inline en una call. Si el catálogo crece más allá de ~15 tags, conviene una pantalla con CRUD completo (nombre, color, count de uso, eliminar con cascade-warning).

**Cómo**:
- Backend: `POST /api/tags`, `PATCH /api/tags/{id}`, `DELETE /api/tags/{id}`. El último debe rechazar borrar `is_system=true` o pedir confirmación si está en uso.
- Frontend: nueva ruta `/tags` con tabla, color picker inline, modal de delete.

**Esfuerzo**: 1.5–2 h. **Dependencia**: ninguna.

### 2. `Tag.llm_visible: bool`

**Por qué**: hoy si quieres un tag que existe para asignar manualmente pero que el LLM nunca elija, no se puede sin borrarlo. Útil para tags muy específicos del cliente (`acme-corp-priority`) que el LLM no debería elegir en otras conversaciones.

**Cómo**: campo bool en `Tag`, migración Alembic, filtrar en `tag_stage` con `WHERE llm_visible = true`.

**Esfuerzo**: 30 min. **Dependencia**: vale la pena solo si llegan a haber muchos tags específicos.

### 3. Top-N taxonomy en el prompt

**Por qué**: si la BD crece a 50–100 tags, el prompt se hincha y la calidad de elección del LLM baja. Mandar solo los top-N por uso (joining con `call_tags`) mantiene el prompt manejable.

**Cómo**: cambiar el query de taxonomía por uno con `LEFT JOIN call_tags GROUP BY ... ORDER BY count DESC LIMIT 30`.

**Esfuerzo**: 20 min. **Dependencia**: solo aplica cuando el catálogo crezca.

---

## Métricas / Dashboard

### 4. Conversion rate (real)

**Por qué**: el KPI se eliminó porque no había definición de producto. Cuando haya, se puede reintroducir como KPI nuevo (no resucitar el viejo).

**Opciones de implementación** (ver `docs/technical-debt/03-conversion-rate-not-implemented.md`):
- Heurística por tag (`positive-outcome / total`).
- Deal status manual (campo editable + UI).
- Integración CRM.

**Esfuerzo**: 1 h (heurística) → 4+ h (CRM). **Dependencia**: decisión de producto.

### 5. Cost breakdown por modelo en DetailScreen

**Por qué**: `Analysis.cost_usd_breakdown` (JSONB) ya guarda el desglose STT vs LLM-synthesis vs LLM-mood vs LLM-tags. Hoy solo mostramos el total. Útil para entender qué fase domina el costo.

**Cómo**: en DetailScreen, expandir la pista de cost en una tabla pequeña con `Object.entries(breakdown)`.

**Esfuerzo**: 20 min. **Dependencia**: ninguna.

### 6. Cost agregado por cliente

**Por qué**: `ClientDetail` no muestra cost total del cliente. Útil para entender qué cuentas consumen más.

**Cómo**: en `_build_client_out` (o un endpoint separado), `SUM(Analysis.cost_usd_total) WHERE Call.client_id = X`.

**Esfuerzo**: 30 min.

---

## Procesamiento

### 7. Reanalizar una llamada existente (in-place, sin re-STT)

**Por qué**: cuando cambias el prompt de synthesis, el cost breakdown, o quieres aplicar `language detection` a llamadas pre-fix, hoy las opciones son:

- **Reupload con `force=true`** (commit `64c50be`): cada reanálisis crea **una fila nueva** en `calls` (id distinto), un transcript nuevo, un analysis nuevo, otro archivo de audio en disco, y vuelve a pagar STT. Si reprocesas el mismo audio 4 veces tienes 4 filas indistinguibles en la lista, 4× el costo de STT, y 4 archivos `.wav` físicos duplicados. **Es el patrón equivocado para iteración de prompts** — está pensado para "el usuario subió el archivo equivocado y lo quiere subir limpio".

- **Endpoint dedicado `POST /api/calls/{id}/reanalyze`** (esto): reusa el transcript+segments existentes, solo corre `tag_stage` + `analyze_stage` con el prompt nuevo. **Sobrescribe** el `Analysis` y los `CallTag(source='llm')` del mismo call. Mismo ID, sin duplicados, paga solo el LLM (centavos).

**Cómo**:
1. Endpoint `POST /api/calls/{id}/reanalyze` valida que `status='done'` y que existe transcript.
2. Encola un Celery task con un parámetro `from_stage='analyze'` (o configurable).
3. El task borra `Analysis` previo + `CallTag` con `source='llm'` y vuelve a correr `analyze_stage` y `tag_stage` reusando el `transcript_id`.
4. Frontend: botón "Re-run analysis" en `DetailScreen` (icono refresh) que dispara la mutation y pollea status hasta `done`.

**Esfuerzo**: 30–45 min.

**Dependencia**: ninguna. Es la opción correcta para el workflow de "cambié el prompt, quiero ver el resultado nuevo en las llamadas existentes". También resuelve el problema de las llamadas legacy (`prueba`, `PruebaMultiple`) cuyo recap sigue en inglés porque fueron procesadas con `PROMPT_VERSION='v1'` antes del fix multilingüe.

**Trade-off vs reupload-force**: ambos coexisten porque sirven a casos distintos. Hoy solo está el primero; falta el segundo, que es el de mayor uso en práctica.

### 8. Score continuo de sentiment (-1.0 a +1.0)

**Por qué**: hoy el LLM emite categórico (`positive`/`neutral`/`negative`) y mapeamos discreto a `+1/0/-1`. Eso pierde matiz: dos calls "positive" se ven idénticas aunque una sea "el cliente firmó" y otra "el cliente sonó interesado".

**Cómo**: cambiar `Synthesis.overall_sentiment` a `Synthesis.sentiment_score: float = Field(ge=-1, le=1)`. Persistir como `Float` en `Analysis` (migración). Bumpear `SYNTHESIS_VERSION`.

**Esfuerzo**: 1 h. **Dependencia**: el LLM debe cooperar con números — gpt-4o lo hace bien.

### 9. Duración real con ffprobe

**Por qué**: hoy el fallback de duration es `max(seg.end)` de los segmentos. Es ~99% correcto pero ignora el silencio final. Para ser exactos, llamar a ffprobe sobre el archivo (ya está en uso para `_build_chunk_intervals`).

**Cómo**: en `transcribe_stage`, después de la STT, si `duration_seconds is None`, hacer `ffprobe -show_format` y leer `format.duration`.

**Esfuerzo**: 30 min. **Dependencia**: ninguna.

---

## UI / UX

### 10. Reemplazar copy hardcoded en DetailScreen

**Por qué**: la card de Overall sentiment muestra "Net Positive / Trended positive in 4 of 5 segments" — ambos hardcoded. Es deuda 06 en `docs/technical-debt/`.

**Cómo**: derivar del `sentiment_score` y de `emotion_distribution` real.

**Esfuerzo**: 30 min.

### 11. Selector de rango temporal en dashboard

**Por qué**: el botón "Last 14 days" se eliminó porque era decorativo. Si se quiere de verdad, implementar `?days=N` en el endpoint del dashboard y un dropdown de selección.

**Cómo**: `GET /api/dashboard?days=30` con default 14. Frontend con dropdown que dispara refetch.

**Esfuerzo**: 45 min.

---

## Seguridad / deploy

### 12. Configurar `MAX_DAILY_COST_USD` antes de deploy

**Por qué**: el middleware `check_budget` ya existe en `backend/app/api/middleware.py`. Solo falta poner un valor razonable en `.env` antes de exponer la app.

**Esfuerzo**: 5 min.

### 13. Rate limit por IP

**Por qué**: protege contra abuso indiscriminado en deploy público sin requerir auth.

**Cómo**: middleware en FastAPI o configurar en nginx delante.

**Esfuerzo**: 30–60 min.

### 14. Pantalla de settings con API key per-user

**Por qué**: permite que cada usuario use su propia key de OpenAI en lugar de la del deploy.

**Cuidado**: implica refactor invasivo (Celery worker, logging, sessionStorage con TTL, sin persistencia en BD/Redis sin cifrar). Detallado en la conversación de revisión 2026-05-09.

**Esfuerzo**: 4–6 h. **Recomendación**: no implementar a menos que el deploy público sea prioridad y el budget cap (#12) no baste.

---

## Frontend dev experience

### 15. Hot-reload del frontend en docker

**Por qué**: hoy cualquier cambio en `frontend/src/` requiere `docker compose build frontend && up -d frontend`. Es lento.

**Cómo**: agregar perfil `dev` en docker-compose con `npm run dev` montando `./frontend/src` en bind mount.

**Esfuerzo**: 30 min.

---

## Priorización sugerida

Si quedaran ~2 horas más de budget para invertir, en orden:

1. #12 (5 min) — protección básica.
2. #10 (30 min) — quita una mentira visible en la UI.
3. #5 (20 min) — sumar cost breakdown en detail (alta visibilidad).
4. #1 (1.5–2 h) — pantalla de tags (si se prioriza CMS-like UX).

Lo demás queda como roadmap.
