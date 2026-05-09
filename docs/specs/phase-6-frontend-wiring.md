# Phase 6 — Frontend ↔ Backend Wiring

## Goal

Replace every stub in `src/api/hooks.ts` with real `apiFetch()` calls. Wire the upload
flow to poll real status. Delete `src/api/__fixtures__/index.ts`. No component JSX changes
are needed — all mapping happens at the hooks/client layer.

---

## File Scope

`frontend/src/` only.

---

## Files to Create or Modify

| File | Action |
|---|---|
| `src/api/mappers.ts` | **Create** — pure functions mapping raw backend JSON → frontend types |
| `src/api/client.ts` | **Modify** — add `apiUpload()` XHR helper with progress callback |
| `src/api/hooks.ts` | **Rewrite** — replace all stubs with real `apiFetch` + `apiUpload` calls |
| `src/components/ErrorBoundary.tsx` | **Create** — class `ErrorBoundary` (render errors only) |
| `src/components/Toast.tsx` | **Create** — `ToastContext` + `ToastProvider` + `useToast` hook |
| `src/App.tsx` | **Modify** — wrap router in `ErrorBoundary` + `ToastProvider`; wire both `QueryCache` and `MutationCache` `onError` |
| `src/screens/DetailScreen.tsx` | **Modify** — add `isError` guard for 404 (returns "Call not found" message) |
| `src/api/__fixtures__/index.ts` | **Delete** |

---

## Type Mismatch Inventory

The backend was built independently and several types diverge from `src/types.ts`. All
normalization happens inside `mappers.ts` — no changes to `types.ts` or any screen/component.

### IDs
Backend uses `number` (PostgreSQL serial). Frontend types declare `string`. Mappers
stringify all IDs with `String(raw.id)`.

### CallSummary
Backend is missing `overall_sentiment`, `deal_status`, `owner` — set to `null`.
Backend has an extra `cost_usd_total` — carried through as-is on the frontend type
(already defined in the type as optional).

### CallDetail
Backend provides flat `insights[]`, `original_filename`, `analysis.talk_ratio_rep/client`.
Frontend type expects:
- `pain_points`, `objections`, `buying_signals`, `next_steps` → derived by filtering `insights`
- `emotion_distribution` → `{[mood]: count}` map derived from segment moods
- `emotion_timeline` → `segments.map(s => s.mood ?? "neutral")`
- `participants` → unique `(speaker_label, speaker_role)` pairs from segments, enriched
  with placeholder `initials`, `color`, `side`
- `filename` → mapped from `original_filename`
- `overall_sentiment` → from `analysis?.overall_sentiment ?? null`
- `Analysis.talk_ratio` → `{ rep: talk_ratio_rep, client: talk_ratio_client }`

### CallStatusResponse
Backend `progress_step: number` (0–5 per `_PROGRESS_MAP`). Frontend expects
`progress_step: string | null`. Confirmed backend status strings (verified against
`backend/app/tasks/process_call.py`): `pending | transcribing | analyzing | done | failed`
— no other states. Map:

```
{ 0: "Decoding", 1: "Transcribing", 2: "Transcribing", 3: "Analyzing",
  4: "Analyzing", 5: "Done", [-1]: "Failed" }
```

`useCallStatus` polls (`refetchInterval: 1500`) while status ∈ `{pending, transcribing, analyzing}`,
stops (`refetchInterval: false`) for `done` and `failed`.

### DashboardOut (full remap)
Backend shape is very different from the frontend `DashboardOut` type. The mapper:
- Converts `calls_this_week`, `avg_sentiment`, `conversion_rate`, `talk_listen_ratio`
  KPIItems → `kpis: Kpi[]` array (label + value + delta; `spark: []` since backend has
  no sparkline data)
- Converts `SentimentPoint[]` (`{week, positive, neutral, negative}`) →
  `sentiment_trend: {week, score}[]` where `score = total > 0 ? positive / total : 0`
  (guard against divide-by-zero for empty weeks)
- `pipeline: PipelineStage[]`: backend `{stage, count}` → frontend `{label, count, pct}`.
  `label = stage` (capitalised); `pct = count / total * 100`
- `top_performers: []` — backend has no performer data; return empty array
- `recent_calls` — **not in the dashboard endpoint**; the `useDashboard` hook makes a second
  request to `GET /api/calls?limit=5&sort=date&order=desc` and appends the result

### EmotionsMap
Backend `GET /api/taxonomy/emotions` returns `{name, color}[]`. Frontend needs
`Record<string, {label, color, dot}>`. Mapper: key by `name`, set `label = name`, `dot = color`.

### TranscriptSegment
Backend `TranscriptSegmentOut` has no `id` field. Use `String(seg.idx)` as `id`.

### TagOut
`TagOut.id` is `number` → stringify. `source` field is already present.

### ClientOut
Backend missing `health` and `arr` → `null`. `calls`, `last_call`, `sentiment` are present.

---

## Implementation Plan

### 1. `src/api/mappers.ts`

Export one function per entity:

```typescript
export function mapCallSummary(raw: BackendCallSummary): CallSummary
export function mapCallDetail(raw: BackendCallDetail): CallDetail
export function mapCallStatus(raw: BackendCallStatus): CallStatusResponse
export function mapClient(raw: BackendClientOut): Client
export function mapClientDetail(raw: BackendClientDetail): ClientDetail
export function mapDashboard(raw: BackendDashboardOut, recentCalls: CallSummary[]): DashboardOut
export function mapTag(raw: BackendTagOut): Tag
export function mapEmotions(raw: BackendEmotion[]): EmotionsMap
```

Define raw backend types in the same file (prefix `Backend*`) — these are the actual JSON
shapes, not imported from `types.ts`.

`mapCallDetail` computes derived fields inline:
- `participants`: group segments by `speaker_label`, pick first `speaker_role`, assign a
  color from a small deterministic palette (index into `SPEAKER_COLORS` array), set
  `side = "rep"` if index 0 else `"client"`, compute `initials` from first 2 chars of label.
- `emotion_distribution`: one-pass reduce over segments.
- `emotion_timeline`: `segments.map(s => s.mood ?? "neutral")`.

### 2. `src/api/client.ts` — add `apiUpload`

```typescript
export function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<T>
```

Uses `XMLHttpRequest` (not `fetch`) so `upload.onprogress` is available.
Rejects with `ApiError` on non-2xx status, parsing `{error: {code, message}}` body.
JSON parse failure (proxy HTML, empty body) must fall back to
`new ApiError(xhr.status, xhr.statusText)` — never let a parse error mask the HTTP status.

### 3. `src/api/hooks.ts` — real implementations

**Query hooks** — replace `Promise.resolve(MOCK_*)` with `apiFetch`:

| Hook | Endpoint | Notes |
|---|---|---|
| `useCalls(filters?)` | `GET /api/calls` | Serialize `filters` to `URLSearchParams`; skip undefined keys |
| `useCall(id)` | `GET /api/calls/{id}` | `enabled: !!id` |
| `useCallStatus(id)` | `GET /api/calls/{id}/status` | `refetchInterval`: `1500` while status ∈ `{pending, transcribing, analyzing}`, else `false` |
| `useClients()` | `GET /api/clients` | — |
| `useClient(id)` | `GET /api/clients/{id}` | — |
| `useTags()` | `GET /api/tags` | — |
| `useEmotions()` | `GET /api/taxonomy/emotions` | Map with `mapEmotions` |
| `useDashboard()` | `GET /api/dashboard` + `GET /api/calls?limit=5&sort=date&order=desc` | Parallel with `Promise.all` |

**Mutation hooks** — replace no-ops with real API calls:

| Hook | Endpoint | Body |
|---|---|---|
| `useCreateCall` | `POST /api/calls` (multipart) | `FormData` via `apiUpload`; return `{ id: String(raw.call_id) }` |
| `useCreateClient` | `POST /api/clients` | JSON `{name, industry}` |
| `useUpdateTags` | `PATCH /api/calls/{callId}/tags` | `{tag_ids: tagIds.map(Number)}` — stringify back to int |
| `useAssignClient` | `PATCH /api/calls/{callId}` | `{client_id: Number(clientId)}` |
| `useDeleteCall` | `DELETE /api/calls/{id}` | — |
| `useBulkDeleteCalls` | `POST /api/calls/bulk-delete` | `{ids: ids.map(Number)}` |

For `useCreateCall`, the hook signature changes to accept a progress callback:
```typescript
useCreateCall(): UseMutationResult<{id: string}, ApiError, {formData: FormData; onProgress: (pct: number) => void}>
```

### 4. `src/components/ErrorBoundary.tsx`

Standard React class `ErrorBoundary` — catches unhandled render errors, shows a simple
fallback UI. No toast logic here (separate concern).

### 5. `src/components/Toast.tsx`

`ToastContext` + `ToastProvider` + `useToast` hook:
- State: `{message: string; type: "error"|"info"} | null`
- `show(message, type)` displays a toast div (CSS class `toast`) that auto-dismisses after 3 s
- No external library

### 6. `src/App.tsx`

Wrap router with `<ToastProvider>` and `<ErrorBoundary>`. Create `QueryClient` with:
```typescript
new QueryClient({
  queryCache: new QueryCache({ onError: (err) => toast.show(err.message, "error") }),
  mutationCache: new MutationCache({ onError: (err) => toast.show(err.message, "error") }),
})
```
Both caches must be wired — `QueryClient.defaultOptions` `onError` does not fire for
mutations in TanStack Query v5.

### 7. `src/screens/DetailScreen.tsx` — add `isError` guard

After `const { data: call, isLoading, isError } = useCall(id)`:
```tsx
if (isError) return <div className="empty-state">Call not found.</div>;
```
This handles 404 locally without letting it bubble to ErrorBoundary (which would show a
whole-app fallback for a missing record — wrong UX).

### 8. Delete `src/api/__fixtures__/index.ts`

After hooks are rewritten, remove the import from hooks.ts and delete the file.

---

## Edge Cases

- **`useCallStatus` infinite polling prevention**: only pass `refetchInterval` when status
  is an active state; set to `false` (not 0) when done/failed to stop polling.
- **Filter serialization in `useCalls`**: skip `undefined` and empty-string values so the
  URL stays clean and the query key is stable.
- **Dashboard empty state**: when DB is empty all aggregations return zeros — mapper must
  not divide by zero (guard `total > 0` before pct calculations).
- **Tag ID round-trip**: tags have `string` IDs in the frontend but the `PATCH /api/calls/{id}/tags`
  endpoint expects `tag_ids: number[]`. Always `map(Number)` before sending.
- **XHR upload vs fetch**: `apiUpload` must set `Content-Type` by letting the browser set
  it from `FormData` (do NOT set manually — it breaks the boundary).
- **404 on useCall**: handled locally in `DetailScreen` via `isError` (see §7 above). Not
  delegated to `ErrorBoundary` — wrong UX for a single missing record.

---

## Definition of Done Checklist

- [ ] `grep -r "ALTUR" frontend/src` returns nothing
- [ ] `grep -r "__fixtures__" frontend/src` returns nothing
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `useDashboard` fetches real data (no mock import)
- [ ] `useCallStatus` stops polling when status is `done` or `failed`
- [ ] Upload flow: `useCreateCall` sends `FormData` via XHR, progress bar advances, on
  success navigates to `/calls/:realId` (not mock-call-1)
- [ ] DetailScreen cost footer renders when `analysis.cost_usd_total > 0`
- [ ] Mutation failures surface as toasts (not silent)
- [ ] `npm run build` exits 0 (no TypeScript errors, no dead imports)
- [ ] `mappers.test.ts` has ≥6 cases covering: `mapCallSummary` ID stringification,
  `mapCallDetail` derived fields (`pain_points`, `participants`, `emotion_distribution`),
  `mapDashboard` divide-by-zero guard, `mapCallStatus` step mapping, `mapEmotions` shape
