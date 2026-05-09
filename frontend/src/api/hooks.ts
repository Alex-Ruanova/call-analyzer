// Phase 6 replaces all queryFn implementations with real apiFetch calls.
// Mock data lives in __fixtures__/index.ts — delete that file in Phase 6.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CallSummary, CallDetail, CallStatusResponse, Client, ClientDetail,
  Tag, DashboardOut, EmotionsMap, CallFilters,
} from "../types";
import {
  MOCK_CALLS, MOCK_CALL_DETAIL, MOCK_CLIENTS, MOCK_TAGS,
  MOCK_DASHBOARD, MOCK_EMOTIONS,
} from "./__fixtures__";

// ---- Query hooks ----

export function useCalls(filters?: CallFilters) {
  return useQuery({
    queryKey: ["calls", filters],
    queryFn: (): Promise<CallSummary[]> => Promise.resolve(MOCK_CALLS),
  });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: ["call", id],
    queryFn: (): Promise<CallDetail> => Promise.resolve(MOCK_CALL_DETAIL),
    enabled: !!id,
  });
}

export function useCallStatus(id: string) {
  return useQuery({
    queryKey: ["call-status", id],
    queryFn: (): Promise<CallStatusResponse> =>
      Promise.resolve({ status: "done", progress_step: null, error_message: null }),
    enabled: !!id,
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: (): Promise<Client[]> => Promise.resolve(MOCK_CLIENTS),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: (): Promise<ClientDetail> => {
      const found = MOCK_CLIENTS.find((c) => c.id === id) ?? MOCK_CLIENTS[0];
      return Promise.resolve({ ...found, recent_calls: MOCK_CALLS.filter((c) => c.client_id === id) });
    },
    enabled: !!id,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: (): Promise<Tag[]> => Promise.resolve(MOCK_TAGS),
  });
}

export function useEmotions() {
  return useQuery({
    queryKey: ["emotions"],
    queryFn: (): Promise<EmotionsMap> => Promise.resolve(MOCK_EMOTIONS),
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: (): Promise<DashboardOut> => Promise.resolve(MOCK_DASHBOARD),
  });
}

// ---- Mutation hooks ----

export function useCreateCall() {
  return useMutation({
    mutationFn: async (_data: FormData) => ({ id: "mock-call-1" }),
  });
}

export function useCreateClient() {
  return useMutation({
    mutationFn: async (_data: { name: string; industry?: string }) => ({ id: "mock-client-1" }),
  });
}

export function useUpdateTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_args: { callId: string; tagIds: string[] }) => {},
    onSuccess: (_data, vars) => { void qc.invalidateQueries({ queryKey: ["call", vars.callId] }); },
  });
}

export function useAssignClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_args: { callId: string; clientId: string }) => {},
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["calls"] }); },
  });
}

export function useDeleteCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_id: string) => {},
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["calls"] }); },
  });
}

export function useBulkDeleteCalls() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_ids: string[]) => {},
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["calls"] }); },
  });
}
