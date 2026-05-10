import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClient, useUpdateClient } from "../api/hooks";
import { useSetCrumbOverride } from "../App";
import { Icons, SentimentBar } from "../components/components";
import { useToast } from "../components/Toast";
import { formatDuration } from "../lib/format";
import type { CallSummary } from "../types";

function formatLastCall(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays >= 7 && diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ClientDetailScreenProps {
  pinnedClients: string[];
  onTogglePin: (id: string) => void;
}

export default function ClientDetailScreen({ pinnedClients, onTogglePin }: ClientDetailScreenProps) {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: clientDetail, isLoading } = useClient(id);
  useSetCrumbOverride(clientDetail?.name ?? null);

  if (isLoading || !clientDetail) {
    return <div style={{ padding: 28, color: "var(--text-3)" }}>Loading client…</div>;
  }

  const c = clientDetail;
  const recentCalls: CallSummary[] = clientDetail.recent_calls;
  const sentimentValues = recentCalls
    .map((rc) => rc.sentiment_score)
    .filter((v): v is number => v != null);
  const avgSentiment = sentimentValues.length
    ? sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length
    : 0;
  const isPinned = pinnedClients.includes(c.id);

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 22, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      {/* Back */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => navigate("/clients")}>
          <span style={{ fontSize: 12 }}>←</span>
          Clients
        </button>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div
          className="avatar avatar--lg"
          style={{ width: 60, height: 60, borderRadius: 12, fontSize: 18, fontWeight: 600, background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border-2)", display: "grid", placeItems: "center" }}
        >
          {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>{c.name}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap", fontSize: 12.5, color: "var(--text-3)" }}>
            <span>{c.industry ?? "—"}</span>
            <span style={{ color: "var(--text-4)" }}>·</span>
            <OwnerEditor clientId={c.id} owner={c.owner} />
            {c.arr != null && c.arr > 0 && (
              <>
                <span style={{ color: "var(--text-4)" }}>·</span>
                <span>
                  ARR: <span style={{ color: "var(--text-2)" }}>${(c.arr / 1000).toFixed(0)}k</span>
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => onTogglePin(c.id)}
            style={{ color: isPinned ? "var(--accent)" : undefined }}
          >
            {isPinned ? <Icons.StarFilled size={12} /> : <Icons.Star size={12} />}
            {isPinned ? "Pinned" : "Pin"}
          </button>
          <button className="btn btn--primary" onClick={() => navigate(`/upload?clientId=${c.id}`)}>
            <Icons.Upload size={12} />
            Upload call
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Calls" value={c.calls} />
        <StatCard label="Last call" value={formatLastCall(c.last_call)} />
        <StatCard label="Avg sentiment" valueEl={<SentimentBar value={avgSentiment} width={70} />} />
      </div>

      {/* Calls table */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: "-0.005em" }}>Calls</h2>
          <span style={{ fontSize: 12, color: "var(--text-4)" }}>{recentCalls.length} total</span>
        </div>
        {recentCalls.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--bg-2)", display: "grid", placeItems: "center", margin: "0 auto 12px", color: "var(--text-3)" }}>
              <Icons.Mic size={18} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No calls yet</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>
              Upload a recording to get your first analysis for {c.name}.
            </div>
            <button className="btn btn--primary" onClick={() => navigate(`/upload?clientId=${c.id}`)}>
              <Icons.Upload size={12} />
              Upload first call
            </button>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Title</th>
                  <th>Sentiment</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((rc) => {
                  const sentiment = rc.sentiment_score;
                  const durationStr = formatDuration(rc.duration_seconds);
                  return (
                    <tr key={rc.id} onClick={() => navigate(`/calls/${rc.id}`)}>
                      <td style={{ paddingLeft: 16 }}>
                        <div style={{ fontWeight: 500 }}>{rc.title}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          {rc.tags.slice(0, 3).map((t) => (
                            <span key={t.id} className="tag tag--soft" style={{ height: 18, fontSize: 10, padding: "0 6px" }}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {sentiment != null ? (
                          <SentimentBar value={sentiment} />
                        ) : (
                          <span style={{ color: "var(--text-4)" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                        {new Date(rc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{durationStr}</td>
                      <td>
                        <Icons.ChevronRight size={12} style={{ color: "var(--text-4)" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OwnerEditor({ clientId, owner }: { clientId: string; owner: string | null }) {
  const updateClient = useUpdateClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(owner ?? "");

  const startEdit = () => {
    setDraft(owner ?? "");
    setEditing(true);
  };

  const commit = (next: string | null) => {
    const normalized = next === null ? null : next.trim() || null;
    if (normalized === (owner ?? null)) {
      setEditing(false);
      return;
    }
    updateClient.mutate(
      { clientId, patch: { owner: normalized } },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => {
          toast.show(err instanceof Error ? err.message : "Failed to update owner", "error");
        },
      }
    );
  };

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span>Owner:</span>
        <input
          autoFocus
          className="input"
          placeholder="e.g. Maya Chen"
          value={draft}
          disabled={updateClient.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft);
            else if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => commit(draft)}
          style={{ height: 24, fontSize: 12, padding: "0 8px", width: 160 }}
        />
      </span>
    );
  }

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      onClick={startEdit}
      title="Click to edit owner"
    >
      <span>Owner:</span>
      {owner ? (
        <>
          <span style={{ color: "var(--text-2)" }}>{owner}</span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              commit(null);
            }}
            disabled={updateClient.isPending}
            title="Remove owner"
            style={{ height: 20, padding: "0 6px", fontSize: 11 }}
          >
            <Icons.X size={11} />
          </button>
        </>
      ) : (
        <span style={{ color: "var(--text-4)", fontStyle: "italic" }}>add</span>
      )}
    </span>
  );
}

function StatCard({ label, value, valueEl }: { label: string; value?: string | number; valueEl?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{valueEl ?? value}</div>
    </div>
  );
}
