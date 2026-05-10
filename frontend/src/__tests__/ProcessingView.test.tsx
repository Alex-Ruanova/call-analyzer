/**
 * DetailScreen — processing state and status-to-detail transition tests.
 * Verifies that ProcessingView renders while a call is in flight and that
 * the detail view appears once status transitions to "done".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DetailScreen from "../screens/DetailScreen";
import { ToastProvider } from "../components/Toast";
import type { CallStatusResponse, CallDetail } from "../types";

// ---- Minimal mock data ----

const baseStatus = (status: CallStatusResponse["status"]): CallStatusResponse => ({
  status,
  progress_step: 0,
  error_message: null,
  size_bytes: 5 * 1024 * 1024,
  duration_seconds: 300,
  transcription_ratio: null,
});

const doneCallDetail: Partial<CallDetail> = {
  id: "42",
  title: "Discovery Call — Acme",
  status: "done",
  client_id: null,
  client_name: null,
  deal_status: null,
  duration_seconds: 600,
  created_at: new Date().toISOString(),
  tags: [],
  overall_sentiment: "0.6",
  owner: null,
  filename: "test.mp3",
  size_bytes: 1000,
  language: "en",
  segments: [],
  insights: [],
  analysis: null,
  participants: [],
  pain_points: [],
  objections: [],
  buying_signals: [],
  next_steps: [],
  emotion_distribution: {},
  emotion_timeline: [],
};

// ---- Mock hooks ----

// We need to control what each hook returns per test, so use a factory approach.
let mockStatusData: CallStatusResponse | undefined;
let mockCallData: CallDetail | undefined;

vi.mock("../api/hooks", () => ({
  useCallStatus: () => ({ data: mockStatusData }),
  useCall: () => ({ data: mockCallData, isLoading: !mockCallData, isError: false }),
  useTags: () => ({ data: [] }),
  useClients: () => ({ data: [] }),
  useUpdateParticipants: () => ({ mutate: () => {} }),
  useUpdateTags: () => ({ mutate: () => {} }),
  useAssignClient: () => ({ mutate: () => {} }),
  useCreateClient: () => ({ mutate: () => {} }),
  useCallNotes: () => ({ data: [] }),
  useCreateNote: () => ({ mutate: () => {}, isPending: false }),
  useUpdateNote: () => ({ mutate: () => {}, isPending: false }),
  useDeleteNote: () => ({ mutate: () => {} }),
  useUpdateSegment: () => ({ mutate: () => {}, isPending: false }),
}));

vi.mock("../App", () => ({
  useSetCrumbOverride: vi.fn(),
}));

// ---- Helpers ----

function renderDetail(id = "42") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><ToastProvider>
      <MemoryRouter initialEntries={[`/calls/${id}`]}>
        <Routes>
          <Route path="/calls/:id" element={<DetailScreen />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider></QueryClientProvider>
  );
}

// ---- Tests ----

describe("DetailScreen — processing states", () => {
  it("shows processing UI when status is transcribing", async () => {
    mockStatusData = baseStatus("transcribing");
    mockCallData = undefined;

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/analyzing your call/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/transcribing speech/i)).toBeInTheDocument();
  });

  it("shows processing UI when status is pending", async () => {
    mockStatusData = baseStatus("pending");
    mockCallData = undefined;

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/analyzing your call/i)).toBeInTheDocument();
    });
  });

  it("shows error card when status is failed", async () => {
    mockStatusData = { status: "failed", progress_step: 0, error_message: "STT provider returned 500", size_bytes: 1024, duration_seconds: null, transcription_ratio: null };
    mockCallData = undefined;

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      expect(screen.getByText(/STT provider returned 500/i)).toBeInTheDocument();
    });
  });

  it("shows call detail when status is done and call data is loaded", async () => {
    mockStatusData = baseStatus("done");
    mockCallData = doneCallDetail as CallDetail;

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("Discovery Call — Acme")).toBeInTheDocument();
    });
    // Processing UI must NOT be present
    expect(screen.queryByText(/analyzing your call/i)).not.toBeInTheDocument();
  });

  it("shows loading state when status is unknown and call is fetching", async () => {
    mockStatusData = undefined;
    mockCallData = undefined;

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/loading call/i)).toBeInTheDocument();
    });
  });
});
