import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CallSummary, CallDetail, CallStatusResponse, Client, ClientDetail,
  Tag, DashboardOut, EmotionsMap, CallFilters,
} from "../types";
import { apiFetch, apiUpload } from "./client";
import {
  mapCallSummary,
  mapCallDetail,
  mapCallStatus,
  mapClient,
  mapClientDetail,
  mapDashboard,
  mapTag,
  mapEmotions,
} from "./mappers";
import type {
  BackendCallSummary,
  BackendCallDetail,
  BackendCallStatus,
  BackendClientOut,
  BackendClientDetail,
  BackendTagOut,
  BackendEmotion,
  BackendDashboardOut,
} from "./mappers";

// ---- URL builder ----

function buildUrl(base: string, params?: Record<string, unknown>): string {
  if (!params) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      if (Array.isArray(v)) {
        v.forEach((item) => qs.append(k, String(item)));
      } else {
        qs.set(k, String(v));
      }
    }
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

// ---- Query hooks ----

export function useCalls(filters?: CallFilters) {
  return useQuery({
    queryKey: ["calls", filters],
    queryFn: (): Promise<CallSummary[]> =>
      apiFetch<BackendCallSummary[]>(buildUrl("/api/calls", filters as Record<string, unknown>)).then((r) => r.map(mapCallSummary)),
  });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: ["call", id],
    queryFn: (): Promise<CallDetail> =>
      apiFetch<BackendCallDetail>("/api/calls/" + id).then(mapCallDetail),
    enabled: !!id,
  });
}

export function useCallStatus(id: string) {
  return useQuery({
    queryKey: ["call-status", id],
    queryFn: (): Promise<CallStatusResponse> =>
      apiFetch<BackendCallStatus>("/api/calls/" + id + "/status").then(mapCallStatus),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s && ["pending", "transcribing", "analyzing"].includes(s) ? 1500 : false;
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: (): Promise<Client[]> =>
      apiFetch<BackendClientOut[]>("/api/clients").then((r) => r.map(mapClient)),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: (): Promise<ClientDetail> =>
      apiFetch<BackendClientDetail>("/api/clients/" + id).then(mapClientDetail),
    enabled: !!id,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: (): Promise<Tag[]> =>
      apiFetch<BackendTagOut[]>("/api/tags").then((r) => r.map(mapTag)),
  });
}

export function useEmotions() {
  return useQuery({
    queryKey: ["emotions"],
    queryFn: (): Promise<EmotionsMap> =>
      apiFetch<BackendEmotion[]>("/api/taxonomy/emotions").then(mapEmotions),
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: (): Promise<DashboardOut> =>
      Promise.all([
        apiFetch<BackendDashboardOut>("/api/dashboard"),
        apiFetch<BackendCallSummary[]>(
          buildUrl("/api/calls", { limit: 5, sort: "date", order: "desc" })
        ).then((r) => r.map(mapCallSummary)),
      ]).then(([dash, recent]) => mapDashboard(dash, recent)),
  });
}

// ---- Mutation hooks ----

export function useCreateCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { formData: FormData; onProgress: (pct: number) => void }) =>
      apiUpload<{ call_id: number }>("/api/calls", vars.formData, vars.onProgress).then(
        (r) => ({ id: String(r.call_id) })
      ),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["calls"] }); },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; industry?: string }) =>
      apiFetch<{ id: number }>("/api/clients", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => ({ id: String(r.id) })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["clients"] }); },
  });
}

export function useUpdateTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { callId: string; tagNames: string[] }) =>
      apiFetch("/api/calls/" + args.callId + "/tags", {
        method: "PATCH",
        body: JSON.stringify({ tag_names: args.tagNames }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["call", vars.callId] });
      void qc.invalidateQueries({ queryKey: ["calls"] });
    },
  });
}

export function useAssignClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { callId: string; clientId: string }) =>
      apiFetch("/api/calls/" + args.callId, {
        method: "PATCH",
        body: JSON.stringify({ client_id: Number(args.clientId) }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["call", vars.callId] });
      void qc.invalidateQueries({ queryKey: ["calls"] });
    },
  });
}

export function useUpdateParticipants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      callId: string;
      participants: Array<{
        speaker_label: string;
        display_name: string | null;
        role: string | null;
        side: "rep" | "client" | null;
      }>;
    }) =>
      apiFetch("/api/calls/" + args.callId + "/participants", {
        method: "PUT",
        body: JSON.stringify({ participants: args.participants }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["call", vars.callId] });
    },
  });
}

export function useDeleteCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch("/api/calls/" + id, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["calls"] }); },
  });
}

export function useBulkDeleteCalls() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/calls/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: ids.map(Number) }),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["calls"] }); },
  });
}
