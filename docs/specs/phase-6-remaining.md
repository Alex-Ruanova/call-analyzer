# Phase 6 — Remaining DoD Items

## Goal

Two DoD items from Phase 6 remain unchecked. All task code is already committed.
This spec covers the targeted fixes needed to meet those two criteria.

---

## Outstanding DoD Items

### DoD 1 — List filters round-trip to backend
**Current state:** `ListScreen` calls `useCalls()` with no args, receives the full list,
then filters/sorts in-memory via `useMemo`. The backend filter params (`search`, `assigned`,
`sort`, `order`) are never sent.

**Fix:**
- Pass the current filter state directly into `useCalls(filters)`.
- Remove the `useMemo` client-side filter.
- Replace optimistic local-state mutations (tag update, assign client, delete) with the
  already-implemented mutation hooks (`useUpdateTags`, `useAssignClient`,
  `useDeleteCall`, `useBulkDeleteCalls`) so query invalidation refreshes the list.
- Remove the `localCalls` / `setLocalCalls` state entirely.

**Files:** `frontend/src/screens/ListScreen.tsx`

### DoD 2 — Upload → detail screen renders real data
**Current state:** `DetailScreen` calls `useCall(id)` which returns an empty/partial `Call`
object while the Celery worker is still processing. There is no processing state in
`DetailScreen`; it shows whatever sparse data exists (empty segments, no analysis) with no
indication the call is still being worked on.

**Fix:**
- Add `useCallStatus(id)` to `DetailScreen`.
- While `status ∈ {pending, transcribing, analyzing}`, render an inline `ProcessingView`
  (not a full-screen redirect — the URL stays at `/calls/:id`).
- `ProcessingView` mirrors the 5-step UI from `UploadScreen.ProcessingScreen` but drives
  step state from real backend status instead of XHR progress.
- Enable `useCall(id)` only when `status === "done"` so TanStack Query fetches fresh detail
  data at the moment the call completes.
- When `status === "failed"`, show an error card with `statusData.error_message`.

**Files:** `frontend/src/screens/DetailScreen.tsx`, `frontend/src/api/hooks.ts`

---

## Status → Step Mapping (ProcessingView)

| Backend status | Step index | Label shown |
|---|---|---|
| `pending` | 0 | Decoding audio |
| `transcribing` | 1 | Transcribing speech |
| `analyzing` | 3 | Analyzing sentiment |
| `done` | 5 | Done |
| `failed` | — | Error state |

---

## Key Constraints

- No new files — changes are contained in `ListScreen.tsx` and `DetailScreen.tsx`.
- The `useCalls` query key already includes filters (`["calls", filters]`), so changing
  the filters object automatically triggers a fresh fetch.
- Backend sort field names: `date`, `title`, `duration`, `status` — match ListScreen's
  `sort.key` values exactly, no mapping needed.
- `assigned` filter maps: `"all"` → omit param, `"assigned"` → `"assigned"`,
  `"unassigned"` → `"unassigned"`.
- `order` param maps: ListScreen's `sort.dir` ("asc"/"desc") → backend's `order` param directly.

---

## Definition of Done

- `useCalls` is called with `{ search, assigned, sort, order }` in ListScreen.
- Changing the search input triggers a new `GET /api/calls?search=...` request (visible in
  network tab).
- Uploading a call and navigating to `/calls/:id` shows the processing steps progressing
  in real time, then transitions to the full detail screen when done.
- `status === "failed"` shows an error card rather than an empty detail view.
