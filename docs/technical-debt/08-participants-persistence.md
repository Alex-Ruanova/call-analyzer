# 08 — Persistencia de configuración de participants

- **Estado:** resuelto (incluye migración Alembic 0002)
- **Fecha:** 2026-05-09
- **Severidad:** alta (los cambios del usuario se perdían al recargar)

## Síntoma

En `Transcript information → Participants`, el usuario podía editar nombre, role e Internal/Customer. Al recargar la página, la configuración se reseteaba a los valores derivados de los segmentos del transcript.

## Causa raíz

`DetailScreen.tsx` solo guardaba el estado en `useState<Participant[]>`. Nunca había una mutación al backend. Y en backend no existía nada para persistir esa información:

- `TranscriptSegment.speaker_label` y `TranscriptSegment.speaker_role` son campos por segmento, no por participante. Modificarlos rompería la asociación con el audio.
- No había concepto de "side" (`rep` vs `client`) en BD — el frontend lo derivaba con `index === 0 ? "rep" : "client"`.
- `display_name` (nombre visible distinto del speaker_label crudo) tampoco existía.

## Solución aplicada

### Backend

Nueva tabla `participants` (`backend/app/models/participant.py` + migración `backend/alembic/versions/0002_add_participants.py`):

```sql
CREATE TABLE participants (
    id SERIAL PRIMARY KEY,
    call_id INT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    speaker_label VARCHAR(100) NOT NULL,
    display_name VARCHAR(200),
    role VARCHAR(200),
    side VARCHAR(20),  -- 'rep' | 'client'
    UNIQUE (call_id, speaker_label)
);
CREATE INDEX ix_participants_call_id ON participants(call_id);
```

Endpoint nuevo: `PUT /api/calls/{call_id}/participants` (`backend/app/api/calls.py`). Reemplaza por completo la lista de participants para esa llamada (delete + insert en una transacción). Body: `{ "participants": [{ speaker_label, display_name, role, side }, ...] }`.

`CallDetail` ahora incluye `participants: list[ParticipantOut]`. `_load_call_detail` carga la relación con `selectinload(Call.participants)`.

### Frontend

- `BackendCallDetail.participants: BackendParticipantOut[]` (`frontend/src/api/mappers.ts`).
- `mapCallDetail` ahora overlay-ea la config persistida sobre los participants derivados de los segmentos: si el backend tiene `display_name`/`role`/`side` para un `speaker_label`, se usan; si no, se cae al default (label crudo, role del segmento, side por índice).
- `useUpdateParticipants` en `frontend/src/api/hooks.ts` (PUT al endpoint nuevo, invalida `["call", id]` en éxito).
- `DetailScreen.tsx` añade un `useEffect` con debounce de 600ms: cuando `participants` local cambia, se persiste al backend tras la pausa.

## Decisiones de diseño

- **PUT en vez de PATCH**: la operación reemplaza toda la lista. Más simple que diff por participant individual; el caso de uso es "el usuario editó el panel completo", no edición fina concurrente.
- **`side` como string en vez de enum DB**: pragmático. Aceptamos `"rep" | "client"` por convención; si hubiera más sides en el futuro (e.g. `"observer"`), sólo cambia el frontend.
- **No tocar `TranscriptSegment.speaker_role`**: es la inferencia inicial del LLM (anchor). Mantenerlo separado de la configuración manual del usuario evita conflictos cuando se reanaliza una llamada.

## Deuda residual

- **Reset on reanalysis**: si una llamada se reprocesa desde STT, los segmentos se regeneran y los `speaker_label` pueden cambiar (e.g. `A`/`B` → `SPEAKER_00`/`SPEAKER_01`). En ese caso los participants persistidos quedarán huérfanos hasta que el usuario los reconfigure. Por ahora aceptable (no hay flujo de reanalysis exposed); si se añade, hay que decidir si se reusan los rows existentes haciendo match por nombre, o se borran.
- **No hay validación server-side de que `side` sea uno de `"rep"|"client"`**: el endpoint acepta cualquier string (limitado a 20 chars). Si fuera problema, añadir un `Literal` en `ParticipantIn` o un check.
- **No hay UI de "discard changes"**: como el save es debounced, no hay botón explícito de Save/Cancel. Si el usuario cierra la pestaña antes de los 600ms se pierde el último cambio. Aceptable para edición casual; si fuera problema añadir flush en `beforeunload`.
- **Concurrencia**: si dos pestañas editan al mismo call, gana la última escritura. Sin lock optimista. Aceptable para uso single-user.

## Init from scratch

La migración `0002_add_participants` corre automáticamente en `alembic upgrade head` durante el bootstrap del proyecto. No requiere backfill — para llamadas existentes, `participants` arranca vacío (lista vacía → frontend cae al default derivado de segments).
