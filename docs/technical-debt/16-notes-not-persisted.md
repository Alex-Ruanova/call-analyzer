# 16 — Notes: no se persisten, arrancan con seed hardcodeado

- **Estado:** pendiente (implementación en curso)
- **Fecha:** 2026-05-09
- **Severidad:** media (UX engaña — el usuario cree que sus notas se
  guardan)

## Síntoma

La sección "Notes" del detalle de llamada acepta texto, lo agrega a la
lista, lo edita y lo borra. Todo es estado local de React: nada se
persiste. Al recargar la página las notas desaparecen.

Además, al abrir cualquier llamada aparecen dos notas hardcodeadas:

```tsx
// frontend/src/screens/DetailScreen.tsx:164-167
const [notes, setNotes] = useState<Array<{ when: string; text: string }>>([
  { when: "Yesterday, 4:12 pm", text: "Nice handle on the Spanish objection. Worth turning into an enablement clip." },
  { when: "Yesterday, 3:48 pm", text: "Daniel's \"managers spend 4 hours\" line is gold for the case study." },
]);
```

Esas dos notas eran seed UI para el demo inicial — no las genera el LLM,
pero parecen reales y se muestran en TODAS las llamadas.

## Acción para limpiar

1. Modelo `Note` en backend (call_id, text, created_at, updated_at).
2. Endpoints REST: `GET /api/calls/{id}/notes`, `POST`, `PATCH/{note_id}`,
   `DELETE/{note_id}`.
3. Migración Alembic que crea la tabla `notes` con FK a `calls`.
4. Hooks de TanStack Query en frontend (`useCallNotes`, `useCreateNote`,
   etc.) con invalidación en éxito.
5. Eliminar el seed local; el `useState` arranca vacío y se hidrata
   desde el servidor.
6. Mostrar `created_at` real en lugar del string mock (`"Yesterday, 4:12 pm"`).

## Decisión

Las notas son del usuario que mira la llamada, no del LLM. Hasta que
exista auth, todas las notas son globales por llamada (sin owner). Cuando
auth aterrice (deuda separada), agregar `Note.user_id` y filtrar por
sesión.
