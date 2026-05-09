import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useClients, useCreateCall, useCreateClient } from "../api/hooks";
import { Icons } from "../components/components";
import { NewClientModal } from "./ClientsScreen";
import type { Client } from "../types";

interface FileInfo {
  name: string;
  size: string;
}

interface NewClientState {
  name: string;
  industry: string;
  owner: string;
}

export default function UploadScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetClientId = searchParams.get("clientId");

  const { data: clientsData } = useClients();

  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<FileInfo | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientState>({ name: "", industry: "", owner: "" });
  const [processing, setProcessing] = useState(false);
  const [pct, setPct] = useState(0);
  const [step, setStep] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const allClients: Client[] = clientsData ?? [];

  // Pre-set client from URL param
  useEffect(() => {
    if (presetClientId && allClients.length > 0 && !client) {
      const found = allClients.find((c) => c.id === presetClientId);
      if (found) setClient(found);
    }
  }, [presetClientId, allClients, client]);

  // Close picker on outside click
  useEffect(() => {
    if (!showClientPicker) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowClientPicker(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showClientPicker]);

  const accept = (f: File | null) => {
    if (!f) return;
    setRawFile(f);
    setFile({
      name: f.name || "northwind-discovery-mar15.mp3",
      size: f.size ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : "8.4 MB",
    });
  };

  const filteredClients = allClients.filter(
    (c) => !clientFilter || c.name.toLowerCase().includes(clientFilter.toLowerCase())
  );
  const canCreate =
    clientFilter.trim() &&
    !allClients.some((c) => c.name.toLowerCase() === clientFilter.trim().toLowerCase());

  const createClientMutation = useCreateClient();

  const handleCreateClient = () => {
    if (!newClient.name.trim()) return;
    createClientMutation.mutate(
      { name: newClient.name.trim(), industry: newClient.industry.trim() || undefined },
      {
        onSuccess: (result) => {
          // query invalidation will refresh allClients; set the selected client directly
          setClient({
            id: result.id,
            name: newClient.name.trim(),
            industry: newClient.industry.trim() || null,
            owner: newClient.owner.trim() || null,
            calls: 0,
            last_call: null,
            sentiment: null,
            sentiment_score: null,
            health: "on-track",
            arr: null,
          });
        },
      }
    );
    setShowNewClient(false);
    setShowClientPicker(false);
    setNewClient({ name: "", industry: "", owner: "" });
    setClientFilter("");
  };

  const ready = !!file && !!rawFile && !!client;
  const createCall = useCreateCall();

  const handleAnalyze = () => {
    if (!ready || !rawFile) return;
    setProcessing(true);
    setPct(0);
    setStep(0);

    const formData = new FormData();
    formData.append("file", rawFile);
    if (client) formData.append("client_id", String(client.id));

    createCall.mutate(
      {
        formData,
        onProgress: (p) => {
          setPct(p);
          setStep(Math.min(4, Math.floor((p / 100) * 5)));
        },
      },
      {
        onSuccess: (result) => {
          navigate("/calls/" + result.id);
        },
        onError: () => {
          setProcessing(false);
        },
      }
    );
  };

  if (processing) {
    return <ProcessingScreen pct={pct} step={step} client={client} />;
  }

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>New analysis</h1>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: "6px 0 0" }}>
            Upload a sales call recording. Altur will transcribe, identify participants and analyze sentiment.
          </p>
        </div>
        {presetClientId && (
          <button className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
            <Icons.X size={12} />
            Cancel
          </button>
        )}
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 12 }}>
        <StepIndicator n={1} label="Audio" done={!!file} active={!file} />
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <StepIndicator n={2} label="Client" done={!!client} active={!!file && !client} />
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <StepIndicator n={3} label="Analyze" done={false} active={ready} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files[0] ?? null); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? "var(--accent)" : "var(--border-2)"}`,
          background: drag ? "var(--accent-soft)" : "var(--bg-1)",
          borderRadius: 14,
          padding: file ? "24px 32px" : "56px 32px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 160ms ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,audio/*"
          hidden
          onChange={(e) => accept(e.target.files?.[0] ?? null)}
        />
        {!file && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--border)", margin: "0 auto 16px", display: "grid", placeItems: "center", color: "var(--accent)" }}>
              <Icons.Upload size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop your audio here, or click to browse</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>MP3 or WAV · up to 500 MB · max 4 hours</div>
          </>
        )}
        {file && (
          <div className="fade-in" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
                <Icons.File size={16} />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{file.size}</div>
              </div>
            </div>
            <button
              className="btn btn--ghost btn--sm"
              onClick={(e) => { e.stopPropagation(); setFile(null); setRawFile(null); }}
            >
              <Icons.X size={11} />
              Replace
            </button>
          </div>
        )}
      </div>

      {/* Client picker (shown after file) */}
      {file && (
        <div style={{ marginTop: 16 }} className="fade-in">
          <div
            style={{
              padding: 16,
              border: `1px solid ${client ? "var(--border-2)" : "var(--accent)"}`,
              background: client ? "var(--bg-1)" : "var(--accent-soft)",
              borderRadius: 14,
              transition: "all 160ms ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: client ? "var(--bg-2)" : "var(--bg-1)", border: "1px solid var(--border-2)", display: "grid", placeItems: "center", color: client ? "var(--accent)" : "var(--text-3)" }}>
                  <Icons.Building size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {client ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{client.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                        {client.industry ?? "No industry"}
                        {client.owner && <> · {client.owner}</>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        Assign to a client <span style={{ color: "var(--accent)", fontWeight: 500 }}>·</span>{" "}
                        <span style={{ color: "var(--text-3)", fontWeight: 400, fontSize: 11.5 }}>required</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                        Pick an existing client or create a new one to continue.
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div ref={pickerRef} style={{ position: "relative" }}>
                <button
                  className={client ? "btn btn--sm" : "btn btn--primary btn--sm"}
                  onClick={(e) => { e.stopPropagation(); setShowClientPicker(!showClientPicker); }}
                  disabled={!!presetClientId}
                  style={presetClientId ? { opacity: 0.5, pointerEvents: "none" } : undefined}
                >
                  {client ? "Change" : "Choose client"}
                  <Icons.ChevronDown size={11} />
                </button>
                {showClientPicker && (
                  <div className="menu" style={{ top: "calc(100% + 6px)", right: 0, minWidth: 280, zIndex: 50 }}>
                    <div style={{ padding: 6 }}>
                      <input
                        autoFocus
                        className="input"
                        placeholder="Search clients…"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        style={{ height: 28, fontSize: 12.5 }}
                      />
                    </div>
                    <div className="menu__divider" />
                    <div style={{ maxHeight: 240, overflowY: "auto" }}>
                      {filteredClients.map((c) => (
                        <button
                          key={c.id}
                          className="menu__item"
                          onClick={() => { setClient(c); setShowClientPicker(false); setClientFilter(""); }}
                        >
                          <div className="avatar avatar--sm" style={{ background: "var(--bg-3)", color: "var(--text-2)", fontSize: 10 }}>
                            {c.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{c.industry ?? "No industry"}</div>
                          </div>
                          {client?.id === c.id && <Icons.Check size={11} style={{ color: "var(--accent)" }} />}
                        </button>
                      ))}
                      {filteredClients.length === 0 && !canCreate && (
                        <div style={{ padding: 16, fontSize: 12, color: "var(--text-4)", textAlign: "center" }}>No matches</div>
                      )}
                    </div>
                    <div className="menu__divider" />
                    <button
                      className="menu__item"
                      onClick={() => canCreate ? (setNewClient({ name: clientFilter.trim(), industry: "", owner: "" }), setShowNewClient(true)) : (setShowNewClient(true), setShowClientPicker(false))}
                    >
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
                        <Icons.Plus size={11} />
                      </div>
                      <span style={{ flex: 1, textAlign: "left" }}>
                        {canCreate ? <>Create "<strong>{clientFilter.trim()}</strong>"</> : "New client…"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
        <div style={{ flex: 1, fontSize: 12, color: "var(--text-3)" }}>
          {!file && "Step 1 — choose an audio file."}
          {file && !client && <span style={{ color: "var(--accent)" }}>Step 2 — assign a client to continue.</span>}
          {ready && "Ready to analyze."}
        </div>
        <button
          className="btn btn--primary"
          disabled={!ready}
          onClick={handleAnalyze}
          style={!ready ? { opacity: 0.45, pointerEvents: "none" } : undefined}
        >
          Analyze <Icons.ChevronRight size={13} />
        </button>
      </div>

      {showNewClient && (
        <NewClientModal
          value={newClient}
          onChange={setNewClient}
          onCancel={() => { setShowNewClient(false); setNewClient({ name: "", industry: "", owner: "" }); }}
          onCreate={handleCreateClient}
        />
      )}
    </div>
  );
}

function StepIndicator({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  const color = done ? "var(--accent)" : active ? "var(--text)" : "var(--text-4)";
  const bg = done ? "var(--accent)" : active ? "var(--bg-2)" : "transparent";
  const border = done ? "var(--accent)" : active ? "var(--border-2)" : "var(--border)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: bg, border: `1px solid ${border}`, display: "grid", placeItems: "center", color: done ? "var(--accent-fg)" : color, fontSize: 11, fontWeight: 600, transition: "all 160ms ease" }}>
        {done ? <Icons.Check size={11} /> : n}
      </div>
      <span style={{ color, fontWeight: active || done ? 500 : 400, fontSize: 12.5 }}>{label}</span>
    </div>
  );
}

function ProcessingScreen({ pct, step, client }: { pct: number; step: number; client: Client | null }) {
  const steps = [
    "Decoding audio",
    "Transcribing speech",
    "Identifying participants",
    "Analyzing sentiment",
    "Extracting insights",
  ];

  return (
    <div style={{ maxWidth: 560, margin: "80px auto", padding: "0 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ display: "inline-grid", placeItems: "center", position: "relative", marginBottom: 18 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" stroke="var(--bg-3)" strokeWidth="3" fill="none" />
            <circle
              cx="40" cy="40" r="34"
              stroke="var(--accent)" strokeWidth="3" fill="none"
              strokeDasharray={2 * Math.PI * 34}
              strokeDashoffset={2 * Math.PI * 34 * (1 - pct / 100)}
              transform="rotate(-90 40 40)"
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 60ms linear" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {Math.floor(pct)}%
          </div>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Analyzing your call</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: "6px 0 0" }}>
          {client ? <>Linking to <strong style={{ color: "var(--text-2)" }}>{client.name}</strong>. </> : null}
          This usually takes about 30 seconds for a 5-minute call.
        </p>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => {
            const state = i < step ? "done" : i === step ? "active" : "pending";
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, opacity: state === "pending" ? 0.4 : 1, transition: "opacity 200ms" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", background: state === "done" ? "var(--accent)" : "var(--bg-3)", border: state === "active" ? "1.5px solid var(--accent)" : "1px solid var(--border)" }}>
                  {state === "done" && <Icons.Check size={11} style={{ color: "var(--accent-fg)" }} />}
                  {state === "active" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse-soft 1.2s infinite" }} />}
                </div>
                <div style={{ fontSize: 13, color: state === "pending" ? "var(--text-3)" : "var(--text)", fontWeight: state === "active" ? 500 : 400 }}>
                  {s}
                </div>
                {state === "done" && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>
                    0.{i + 1}s
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
