import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useCreateClient } from "../api/hooks";
import { Icons, SentimentBar } from "../components/components";
import { useToast } from "../components/Toast";
import type { Client } from "../types";

interface NewClientState {
  name: string;
  industry: string;
  owner: string;
}

function formatLastCall(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ClientsScreenProps {
  pinnedClients: string[];
  onTogglePin: (id: string) => void;
}

export default function ClientsScreen({ pinnedClients, onTogglePin }: ClientsScreenProps) {
  const navigate = useNavigate();
  const { data: clientsData } = useClients();
  const createClient = useCreateClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newClient, setNewClient] = useState<NewClientState>({ name: "", industry: "", owner: "" });

  const allClients = clientsData ?? [];
  const filtered = allClients.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    const name = newClient.name.trim();
    if (!name || createClient.isPending) return;
    createClient.mutate(
      {
        name,
        industry: newClient.industry.trim() || null,
        owner: newClient.owner.trim() || null,
      },
      {
        onSuccess: () => {
          setShowNew(false);
          setNewClient({ name: "", industry: "", owner: "" });
        },
        onError: (err) => {
          toast.show(err instanceof Error ? err.message : "Failed to create client", "error");
        },
      }
    );
  };

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Clients</h1>
        <span style={{ color: "var(--text-4)", fontSize: 13 }}>{filtered.length}</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn--primary" onClick={() => setShowNew(true)}>
          <Icons.Plus size={13} />
          New client
        </button>
      </div>

      <div className="field" style={{ width: 280 }}>
        <Icons.Search className="field__icon" />
        <input
          className="input input--search"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div
        className="clients-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}
      >
        {filtered.map((c) => (
          <ClientCard
            key={c.id}
            client={c}
            isPinned={pinnedClients.includes(c.id)}
            onTogglePin={onTogglePin}
            onOpen={() => navigate(`/clients/${c.id}`)}
            onUpload={() => navigate(`/upload?clientId=${c.id}`)}
          />
        ))}
      </div>

      {showNew && (
        <NewClientModal
          value={newClient}
          onChange={setNewClient}
          onCancel={() => {
            if (createClient.isPending) return;
            setShowNew(false);
            setNewClient({ name: "", industry: "", owner: "" });
          }}
          onCreate={handleCreate}
          pending={createClient.isPending}
        />
      )}
    </div>
  );
}

interface ClientCardProps {
  client: Client;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onOpen: () => void;
  onUpload: () => void;
}

function ClientCard({ client: c, isPinned, onTogglePin, onOpen, onUpload }: ClientCardProps) {
  const sentiment = c.sentiment_score;

  return (
    <div
      className="card client-card"
      onClick={onOpen}
      style={{ padding: 18, cursor: "pointer", position: "relative", transition: "border-color 140ms ease, transform 140ms ease" }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(c.id);
        }}
        title={isPinned ? "Unpin from sidebar" : "Pin to sidebar"}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          color: isPinned ? "var(--accent)" : "var(--text-4)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isPinned ? <Icons.StarFilled size={14} /> : <Icons.Star size={14} />}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingRight: 28 }}>
        <div className="avatar avatar--md" style={{ background: "var(--bg-3)", color: "var(--text-2)", border: "1px solid var(--border-2)" }}>
          {c.name
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.industry ?? "—"}</div>
          {c.owner && (
            <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Owner · <span style={{ color: "var(--text-3)" }}>{c.owner}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
            Calls
          </div>
          <div style={{ fontWeight: 500 }}>{c.calls}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
            Last call
          </div>
          <div style={{ color: "var(--text-2)" }}>{formatLastCall(c.last_call)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
            Sentiment
          </div>
          {sentiment != null ? (
            <SentimentBar value={sentiment} width={50} />
          ) : (
            <span style={{ color: "var(--text-4)", fontSize: 11 }}>—</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <button
          className="btn btn--ghost btn--sm"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Open
        </button>
        <button
          className="btn btn--sm"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={(e) => {
            e.stopPropagation();
            onUpload();
          }}
        >
          <Icons.Upload size={11} />
          Upload call
        </button>
      </div>
    </div>
  );
}

interface NewClientModalProps {
  value: NewClientState;
  onChange: (v: NewClientState) => void;
  onCancel: () => void;
  onCreate: () => void;
  pending?: boolean;
}

export function NewClientModal({ value, onChange, onCancel, onCreate, pending = false }: NewClientModalProps) {
  const set = (k: keyof NewClientState, v: string) => onChange({ ...value, [k]: v });
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}
      onClick={onCancel}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ padding: 22, width: "100%", maxWidth: 420, background: "var(--bg-0)" }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>New client</h3>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0" }}>
            Only the name is required. You can fill in the rest later.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FormField label="Client name" required>
            <input
              autoFocus
              className="input"
              placeholder="e.g. Acme Corp"
              value={value.name}
              onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.name.trim()) onCreate();
              }}
            />
          </FormField>
          <FormField label="Industry" optional>
            <input
              className="input"
              placeholder="e.g. Healthcare"
              value={value.industry}
              onChange={(e) => set("industry", e.target.value)}
            />
          </FormField>
          <FormField label="Owner" optional>
            <input
              className="input"
              placeholder="e.g. Maya Chen"
              value={value.owner}
              onChange={(e) => set("owner", e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!value.name.trim() || pending}
            style={!value.name.trim() || pending ? { opacity: 0.45, pointerEvents: "none" } : undefined}
            onClick={onCreate}
          >
            {pending ? "Creating…" : "Create client"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: "var(--accent)", marginLeft: 4 }}>*</span>}
        {optional && <span style={{ color: "var(--text-4)", marginLeft: 4, fontWeight: 400 }}>optional</span>}
      </span>
      {children}
    </label>
  );
}
