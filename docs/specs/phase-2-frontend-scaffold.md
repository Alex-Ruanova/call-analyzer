# Phase 2: Frontend Scaffold + TypeScript Port — Technical Specification

## Goal

Replace the Babel-standalone multi-file setup with a proper Vite + TypeScript + React 18 project. Port all existing screens and components preserving the visual design, set up React Router 6, wire TanStack Query, and create a typed API client (stubbed with mock data for this phase). The result must be deployable as a Docker multi-stage build.

## File Scope

- `frontend/`

## Existing Structure (to be preserved / migrated)

```
frontend/
  components/app.jsx        → src/components/App.tsx
  components/components.jsx → src/components/components.tsx  (Sidebar, Topbar, etc.)
  components/tweaks-panel.jsx → src/components/TweaksPanel.tsx
  screens/upload.jsx        → src/screens/UploadScreen.tsx
  screens/detail.jsx        → src/screens/DetailScreen.tsx
  screens/list.jsx          → src/screens/ListScreen.tsx
  screens/dashboard.jsx     → src/screens/DashboardScreen.tsx
  screens/clients.jsx       → src/screens/ClientsScreen.tsx
  stylesheets/styles.css    → src/styles.css (unchanged content)
  pages/index.html          → index.html (Vite root)
  scripts/data.js           → deleted in Phase 6; stubbed in Phase 2
```

## Target Directory Layout

```
frontend/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  Dockerfile
  src/
    main.tsx               # ReactDOM.createRoot entry
    App.tsx                # Router + QueryClient setup
    styles.css             # copied from stylesheets/styles.css
    types.ts               # shared domain types (mirrors backend Pydantic schemas)
    api/
      client.ts            # typed fetch wrapper
      hooks.ts             # TanStack Query hooks (mocked in this phase)
    components/
      components.tsx       # Sidebar, Topbar, Icons, badge components
      TweaksPanel.tsx
    screens/
      DashboardScreen.tsx
      ListScreen.tsx
      DetailScreen.tsx
      UploadScreen.tsx
      ClientsScreen.tsx
      ClientDetailScreen.tsx
```

## Key Types (`src/types.ts`)

All date/time fields use typed primitives (ISO strings and numeric seconds) — formatting is the view layer's job.

```typescript
// ---- Pipeline status (backend processing state) ----
export type CallStatus = "pending" | "transcribing" | "analyzing" | "done" | "failed";

// Maps 4 backend states → 5 visible UI steps in ProcessingScreen
export const STATUS_STEP_MAP: Record<CallStatus, string> = {
  pending:      "Decoding",
  transcribing: "Transcribing",
  analyzing:    "Analyzing",   // covers Identifying + Analyzing + Extracting — progress_step refines it
  done:         "Done",
  failed:       "Failed",
};

// ---- Deal/pipeline status (CRM stage) — distinct from CallStatus ----
export type DealStatus = "open" | "at-risk" | "lost" | "won";

// ---- Taxonomy ----
export type InsightKind =
  | "pain-point" | "objection" | "buying-signal" | "feature-req"
  | "competitor" | "pricing" | "next-step" | "quote" | "risk" | "highlight";

export interface Emotion {
  label: string;
  color: string;
  dot: string;
}
export type EmotionsMap = Record<string, Emotion>;

export interface HighlightType {
  label: string;
  color: string;
}
export type HighlightTypesMap = Record<InsightKind, HighlightType>;

// ---- Participants ----
export interface Participant {
  name: string;
  role: string | null;
  initials: string;
  side: "rep" | "client";
  color: string;
}

// ---- Transcript ----
export interface TranscriptSegment {
  id: string;
  idx: number;
  start_seconds: number;   // numeric — view layer formats to "m:ss"
  end_seconds: number;
  speaker_label: string;
  speaker_role: string | null;
  text: string;
  mood: string | null;
}

// ---- Tags ----
export interface Tag {
  id: string;
  name: string;
  color: string;
  is_system: boolean;
  source?: "llm" | "user";
}

// ---- Insights ----
export interface Insight {
  id: string;
  kind: InsightKind;
  text: string;
  segment_idx: number | null;
  weight: number;
}

// ---- Action items ----
export interface ActionItem {
  id: string;
  text: string;
  owner: string | null;
  due_date: string | null;  // ISO date string, not formatted
  done: boolean;
}

// ---- Analysis ----
export interface TalkRatio {
  rep: number;
  client: number;
}

export interface Analysis {
  summary: string;
  headline: string;
  overall_sentiment: string;
  talk_ratio: TalkRatio;
  llm_model_used: string;
  prompt_version: string;
  cost_usd_total: number;
  cost_usd_breakdown: Record<string, number>;
}

// ---- Calls ----
export interface CallSummary {
  id: string;
  title: string;
  client_id: string | null;
  client_name: string | null;
  status: CallStatus;
  deal_status: DealStatus | null;   // renamed from data.js "stage" to avoid collision with CallStatus
  duration_seconds: number | null;  // numeric — view layer formats to "m:ss"
  created_at: string;               // ISO timestamp
  tags: Tag[];
  overall_sentiment: string | null;
  owner: string | null;
}

export interface CallDetail extends CallSummary {
  filename: string;
  size_bytes: number;
  language: string | null;
  segments: TranscriptSegment[];
  insights: Insight[];
  action_items: ActionItem[];
  analysis: Analysis | null;
  participants: Participant[];
  // Derived views — backend returns pre-grouped for UI convenience:
  pain_points: Insight[];       // insights filtered by kind="pain-point"
  objections: Insight[];        // kind="objection"
  buying_signals: Insight[];    // kind="buying-signal"
  next_steps: Insight[];        // kind="next-step"
  emotion_distribution: Record<string, number>;
  emotion_timeline: string[];
}

export interface CallStatusResponse {
  status: CallStatus;
  progress_step: string | null;   // fine-grained step label for ProcessingScreen
  error_message: string | null;
}

// ---- Clients ----
export interface Client {
  id: string;
  name: string;
  industry: string | null;
  owner: string | null;
  calls: number;
  last_call: string | null;       // ISO timestamp
  sentiment: string | null;
  health: string | null;
  arr: number | null;
}

export interface ClientDetail extends Client {
  recent_calls: CallSummary[];
}

// ---- Dashboard ----
export interface Kpi {
  label: string;
  value: string | number;
  delta: number | null;
  positive: boolean;
  spark: number[];
}

export interface PipelineStage {
  label: string;
  count: number;
  pct: number;
}

export interface TopPainPoint {
  text: string;
  count: number;
  weight: number;
}

export interface TopPerformer {
  name: string;
  calls: number;
  sentiment: number;
}

export interface DashboardOut {
  kpis: Kpi[];
  sentiment_trend: Array<{ week: string; score: number }>;
  calls_per_day: Array<{ date: string; count: number }>;
  pipeline: PipelineStage[];
  top_pain_points: TopPainPoint[];
  top_performers: TopPerformer[];
  recent_calls: CallSummary[];
}
```

## API Client (`src/api/client.ts`)

```typescript
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.message ?? res.statusText, body?.error?.code);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
```

## TanStack Query Hooks (`src/api/hooks.ts`) — Phase 2 stubs

All hooks return mock data inline. Stubs must return data in the **exact shape** of `src/types.ts` so Phase 6 can replace the implementation without touching call sites.

```typescript
export function useCalls(filters?: CallFilters) {
  return useQuery({ queryKey: ["calls", filters], queryFn: () => MOCK_CALLS });
}
export function useCall(id: string) {
  return useQuery({ queryKey: ["call", id], queryFn: () => MOCK_CALL_DETAIL });
}
export function useCallStatus(id: string) {
  return useQuery({ queryKey: ["call-status", id], queryFn: () => ({ status: "done", progress_step: null, error_message: null }) });
}
// ... one stub per endpoint listed in Phase 5
```

## React Router Routes (`src/App.tsx`)

```
/                   → redirect to /dashboard
/dashboard          → DashboardScreen
/calls              → ListScreen
/calls/:id          → DetailScreen
/calls/:id          → (if status pending|transcribing|analyzing → ProcessingScreen overlay)
/upload             → UploadScreen
/clients            → ClientsScreen
/clients/:id        → ClientDetailScreen
```

QueryClient is created once at app root and passed via `QueryClientProvider`. DevTools included in development mode only.

The existing tweak state (`accent`, `density`, `moodViz`, `sidebarCollapsed`) is kept in context or a small Zustand slice — no Redux.

## Vite Config (`vite.config.ts`)

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

## Dockerfile (multi-stage)

```dockerfile
# Stage 1: build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf`: serve `index.html` for all routes (`try_files $uri /index.html`), proxy `/api` to `http://api:8000`.

## Implementation Steps

1. Scaffold Vite TS project in `frontend/` preserving the existing directory. Delete `pages/index.html`, `scripts/data.js` entry points (the mock data stub in `hooks.ts` replaces `data.js`).
2. Install deps: `react-router-dom@6`, `@tanstack/react-query@5`, `@tanstack/react-query-devtools`. Dev: `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `@testing-library/react`, `jsdom`, `eslint`, `prettier`.
3. Write `src/types.ts` with all shared types (enumerated above).
4. Write `src/api/client.ts` (typed fetch wrapper + `ApiError`).
5. Convert `.jsx` → `.tsx` one file at a time. Fix typing as you go — no `any` in component props. `window.ALTUR` calls become hooks calls returning mock data (so `grep -r "ALTUR" frontend/src` returns nothing after Phase 6).
6. Replace `useState`-based routing in `App.jsx` with React Router.
7. Write stub `src/api/hooks.ts` — all hooks return mocked inline data matching `src/types.ts`.
8. Write `Dockerfile` and `nginx.conf`.
9. Update `docker-compose.yml` `frontend` service (or add it if Phase 1 left a placeholder).
10. `npm run build` must succeed. `tsc --noEmit` must pass with zero errors.

## Edge Cases

- The existing `styles.css` references CSS variables (`--accent`, `--accent-soft`, etc.) set by the tweaks system. The `useEffect` that calls `document.documentElement.style.setProperty` must be preserved in the App component.
- `data-density` and `data-sidebar` attributes on `.app` div drive CSS. Preserve them.
- React Router's `<Link>` replaces `setRoute` calls — breadcrumb `crumbs` map becomes a `useLocation`-based derivation.
- `localStorage` pinned clients must stay as-is (PRD explicitly says keep it client-side).
- `ProcessingScreen` is currently shown as a route state (`route === 'processing'`). In the Vite version, navigate to `/calls/:id` and show ProcessingScreen overlay when status ∈ `{pending, transcribing, analyzing}`. The status comes from `useCallStatus` hook (stub in Phase 2, real polling in Phase 6).
- **Anti-drift mechanism:** Phase 6 task 6.0 (added to PRD) will regenerate `frontend/src/types.ts` from backend OpenAPI via `openapi-typescript` as a validation step, catching any drift between Phase 2's hand-written types and Phase 3/5's actual Pydantic schemas.
- **Phase 2 does NOT touch `docker-compose.yml`** — Phase 1 owns it. Phase 2 only creates `frontend/Dockerfile` and `frontend/nginx.conf`.
- **Phase 2 does NOT touch `.env.example`** — Phase 1 owns it (including `VITE_API_BASE_URL`).
- The existing `scripts/data.js` is NOT deleted in Phase 2; it is deleted in Phase 6 (`grep -r "ALTUR" frontend/src` clean DoD).

## Testing Plan

Phase 2 has no unit tests — DoD is verified by:
1. `npm run dev` serves at `localhost:5173`; every existing screen renders.
2. `tsc --noEmit` exits 0.
3. Navigating between routes changes the URL bar (React Router working).
4. `docker compose up frontend` builds and serves the bundle.

The two vitest tests (UploadScreen, ProcessingScreen) are written in Phase 7 once real hooks exist.
