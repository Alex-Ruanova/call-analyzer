import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useCall, useTags, useClients } from "../api/hooks";
import { useSetCrumbOverride } from "../App";
import { Icons, EmotionDot, TagEditor, ClientPicker, getEmotion } from "../components/components";
import type { ActionItem, Participant, Tag } from "../types";

interface DetailScreenProps {
  moodViz?: "ribbon" | "off";
}

export default function DetailScreen({ moodViz = "ribbon" }: DetailScreenProps) {
  const { id = "call-001" } = useParams<{ id: string }>();
  const { data: call, isLoading } = useCall(id);
  useSetCrumbOverride(call?.title ?? null);
  const { data: allTagsData } = useTags();
  const { data: clientsData } = useClients();

  const [title, setTitle] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [clientName, setClientName] = useState<string | null | undefined>(undefined);
  const [actions, setActions] = useState<ActionItem[] | null>(null);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [notes, setNotes] = useState<Array<{ when: string; text: string }>>([
    { when: "Yesterday, 4:12 pm", text: "Nice handle on the Spanish objection. Worth turning into an enablement clip." },
    { when: "Yesterday, 3:48 pm", text: "Daniel's \"managers spend 4 hours\" line is gold for the case study." },
  ]);
  const [newNote, setNewNote] = useState("");
  const [tab, setTab] = useState<"summary" | "insights" | "emotions" | "notes">("summary");
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(2);
  const [editingTitle, setEditingTitle] = useState(false);
  const turnRefs = useRef<Record<number, HTMLDivElement>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);

  const allTags = allTagsData ?? [];
  const allClients = clientsData ?? [];

  if (isLoading || !call) {
    return <div style={{ padding: 28, color: "var(--text-3)" }}>Loading call…</div>;
  }

  const currentTitle = title ?? call.title;
  const currentTags = tags ?? call.tags;
  const currentClient = clientName !== undefined ? clientName : call.client_name;
  const currentActions = actions ?? call.action_items;
  const currentParticipants = participants ?? call.participants;

  const jumpTo = (idx: number, opts: { tab?: typeof tab } = {}) => {
    setActiveIdx(idx);
    if (opts.tab) setTab(opts.tab);
    requestAnimationFrame(() => {
      const el = turnRefs.current[idx];
      const scroller = scrollerRef.current;
      if (el && scroller) {
        const top = el.offsetTop - scroller.offsetTop - 12;
        scroller.scrollTo({ top, behavior: "smooth" });
      }
    });
  };

  const segments = call.segments;
  const filtered = segments.filter((m) => {
    if (search && !m.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const durationMin = call.duration_seconds != null ? Math.floor(call.duration_seconds / 60) : 0;
  const durationSec = call.duration_seconds != null ? call.duration_seconds % 60 : 0;
  const durationStr = call.duration_seconds != null
    ? `${durationMin}:${durationSec.toString().padStart(2, "0")}`
    : "—";

  return (
    <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(380px, 530px) minmax(0, 1fr)", height: "100%", minHeight: 0 }}>
      {/* LEFT — TRANSCRIPT */}
      <div style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
        <div style={{ borderBottom: "1px solid var(--border)", padding: "21px 22px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Transcript</span>
          </div>

          {editingTitle ? (
            <input
              autoFocus
              value={currentTitle}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              style={{ fontSize: 18, fontWeight: 600, background: "transparent", border: "1px solid var(--accent)", borderRadius: 6, padding: "4px 8px", margin: "-4px -8px", width: "calc(100% + 16px)", color: "var(--text)", outline: "none" }}
            />
          ) : (
            <h1
              onClick={() => setEditingTitle(true)}
              style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.01em", cursor: "text", padding: "4px 8px", borderRadius: 6 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {currentTitle}
            </h1>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <ClientPicker value={currentClient ?? null} allClients={allClients} onChange={setClientName} />
            <TagEditor tags={currentTags} allTags={allTags} onChange={setTags} />
          </div>

          {!currentClient && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(245, 158, 11, 0.10)", border: "1px solid rgba(245, 158, 11, 0.35)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(245, 158, 11, 0.18)", color: "var(--warn)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Icons.AlertTriangle size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>This call isn't assigned to a client</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>
                  Pick a client above so insights link to their record.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, fontSize: 11.5, color: "var(--text-3)" }}>
            <span>
              <Icons.Clock size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              {new Date(call.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
              {new Date(call.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
            <span>·</span>
            <span>{durationStr}</span>
            <span>·</span>
            <span>{call.language ?? "English"}</span>
          </div>

          {/* Mood ribbon */}
          {moodViz === "ribbon" && call.emotion_timeline.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-4)" }}>
                  Mood timeline
                </span>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  {["positive", "excited", "neutral", "hesitant"].map((k) => {
                    const e = getEmotion(k);
                    return (
                      <span key={k} className="emo" style={{ fontSize: 9.5 }}>
                        <span className="dot" style={{ background: e.dot, width: 5, height: 5 }} />
                        {e.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", height: 14, gap: 1.5, borderRadius: 4, overflow: "hidden" }}>
                {call.emotion_timeline.map((emo, i) => {
                  const e = getEmotion(emo);
                  return <div key={i} style={{ flex: 1, background: e.dot, opacity: 0.85 }} title={e.label} />;
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="field" style={{ marginTop: 12 }}>
            <Icons.Search className="field__icon" />
            <input
              className="input input--search"
              placeholder="Search transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Transcript body */}
        <div ref={scrollerRef} className="transcript-pane" style={{ flex: 1, overflowY: "auto", padding: "8px 22px 22px" }}>
          {filtered.map((m, i) => {
            const realIdx = segments.indexOf(m);
            const p = currentParticipants.find((pp) => pp.name === m.speaker_label) ?? currentParticipants[0];
            return (
              <div
                key={i}
                ref={(el) => { if (el) turnRefs.current[realIdx] = el; }}
                className={realIdx === activeIdx ? "fade-in" : ""}
                onClick={() => setActiveIdx(realIdx)}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  background: realIdx === activeIdx ? "rgba(16,185,129,0.04)" : "transparent",
                  margin: "0 -10px",
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 6,
                  scrollMarginTop: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div className="avatar avatar--xs" style={{ background: p?.color ?? "#6b7280", color: "#08080a" }}>
                    {p?.initials ?? "?"}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.speaker_label}</div>
                  <span style={{ fontSize: 11, color: "var(--text-4)" }}>{m.speaker_role}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                    {formatTime(m.start_seconds)}
                  </span>
                  <EmotionDot emo={m.mood ?? "neutral"} />
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: realIdx === activeIdx ? "var(--text)" : "var(--text-2)", paddingLeft: 26 }}>
                  {search ? highlight(m.text, search) : m.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT — ANALYSIS */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 22px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
          {[
            { k: "summary" as const, label: "Summary", icon: Icons.Sparkles },
            { k: "insights" as const, label: "Insights", icon: Icons.Eye },
            { k: "emotions" as const, label: "Emotions", icon: Icons.TrendingUp },
            { k: "notes" as const, label: "Notes", icon: Icons.Edit, count: notes.length },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                background: "transparent",
                border: "none",
                color: tab === t.k ? "var(--text)" : "var(--text-3)",
                fontSize: 12.5,
                fontWeight: tab === t.k ? 600 : 500,
                padding: "14px 12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderBottom: `1.5px solid ${tab === t.k ? "var(--accent)" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              <t.icon size={13} />
              {t.label}
              {t.count != null && (
                <span className="navitem__count" style={{ marginLeft: 2 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="analysis-pane" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "22px 26px", minWidth: 0 }}>
          {tab === "summary" && (
            <SummaryTab
              call={call}
              actions={currentActions}
              setActions={setActions}
              participants={currentParticipants}
              setParticipants={setParticipants}
            />
          )}
          {tab === "insights" && <InsightsTab call={call} jumpTo={jumpTo} />}
          {tab === "emotions" && <EmotionsTab call={call} />}
          {tab === "notes" && (
            <NotesTab
              notes={notes}
              setNotes={setNotes}
              newNote={newNote}
              setNewNote={setNewNote}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "1px 2px", borderRadius: 2 }}>
        {p}
      </mark>
    ) : (
      p
    )
  );
}

// ---- Section ----

interface SectionProps {
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  count?: number;
  tone?: "warn" | "good";
  children?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

function Section({ icon: I, title, count, tone, children, collapsible, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const tones: Record<string, string> = { warn: "#f59e0b", good: "var(--accent)" };
  return (
    <section>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: collapsible ? "pointer" : "default" }}
        onClick={() => collapsible && setOpen((o) => !o)}
      >
        {I && <I size={13} style={{ color: tones[tone ?? ""] || "var(--text-3)" }} />}
        <h3 style={{ fontSize: 12, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-2)" }}>
          {title}
        </h3>
        {count != null && <span style={{ fontSize: 11, color: "var(--text-4)" }}>{count}</span>}
        {collapsible && (
          <Icons.ChevronDown
            size={12}
            style={{ marginLeft: "auto", color: "var(--text-3)", transform: open ? "none" : "rotate(-90deg)", transition: "transform 150ms" }}
          />
        )}
      </div>
      {open && children}
    </section>
  );
}

// ---- Summary Tab ----

interface SummaryTabProps {
  call: ReturnType<typeof useCall>["data"] & object;
  actions: ActionItem[];
  setActions: (a: ActionItem[] | null) => void;
  participants: Participant[];
  setParticipants: (p: Participant[] | null) => void;
}

function SummaryTab({ call, actions, setActions, participants, setParticipants }: SummaryTabProps) {
  if (!call) return null;

  const updateP = (i: number, patch: Partial<Participant>) =>
    setParticipants(
      participants.map((p, idx) =>
        idx === i
          ? {
              ...p,
              ...patch,
              initials: (patch.name ?? p.name)
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase(),
            }
          : p
      )
    );
  const removeP = (i: number) => setParticipants(participants.filter((_, idx) => idx !== i));
  const addP = () =>
    setParticipants([...participants, { name: "New person", role: "", side: "rep", color: "#a78bfa", initials: "NP" }]);

  const summary = call.analysis?.summary ?? "";
  const painPoints = call.pain_points.map((p) => p.text);
  const featureRequests = call.insights.filter((i) => i.kind === "feature-req").map((i) => i.text);
  const opportunities = call.buying_signals.map((b) => b.text);
  const needs = call.next_steps.map((n) => n.text);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Section icon={Icons.Sparkles} title="Recap">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: "var(--text-2)" }}>{summary}</p>
      </Section>

      <Section icon={Icons.Check} title="Action items" count={actions.length}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {actions.map((a, i) => (
            <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: i < actions.length - 1 ? "1px solid var(--border)" : "none" }}>
              <button
                onClick={() => setActions(actions.map((x, idx) => (idx === i ? { ...x, done: !x.done } : x)))}
                className={`checkbox ${a.done ? "checkbox--on" : ""}`}
                style={{ marginTop: 2 }}
              >
                {a.done && <Icons.Check size={9} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: a.done ? "var(--text-3)" : "var(--text)", textDecoration: a.done ? "line-through" : "none" }}>
                  {a.text}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>Due {a.due_date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="pair-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {painPoints.length > 0 && (
          <Section icon={Icons.AlertTriangle} title="Pain points" tone="warn">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {painPoints.map((p, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
                  <span style={{ color: "#f59e0b", flex: "none", marginTop: 1 }}>—</span>
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {needs.length > 0 && (
          <Section icon={Icons.TrendingUp} title="Next steps">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {needs.map((p, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--accent)", flex: "none", marginTop: 1 }}>—</span>
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {featureRequests.length > 0 && (
          <Section icon={Icons.Sparkles} title="Feature requests">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {featureRequests.map((p, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
                  <span style={{ color: "#22d3ee", flex: "none", marginTop: 1 }}>—</span>
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {opportunities.length > 0 && (
          <Section icon={Icons.TrendingUp} title="Buying signals" tone="good">
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {opportunities.map((p, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--accent)", flex: "none", marginTop: 1 }}>—</span>
                  {p}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <Section icon={Icons.File} title="Transcript information" defaultOpen={false} collapsible>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 12.5 }}>
          <span style={{ color: "var(--text-3)" }}>Language</span>
          <span>{call.language ?? "English"}</span>
          <span style={{ color: "var(--text-3)" }}>File</span>
          <span>{call.filename}</span>
          <span style={{ color: "var(--text-3)" }}>Audio</span>
          <span style={{ color: "var(--text-3)" }}>Not retained — transcript only</span>
          <span style={{ color: "var(--text-3)" }}>Participants</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {participants.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div className="avatar avatar--xs" style={{ background: p.color, color: "#08080a" }}>{p.initials}</div>
                <input className="input" value={p.name} onChange={(e) => updateP(i, { name: e.target.value })} placeholder="Name" style={{ height: 24, fontSize: 12, fontWeight: 500, width: 140, padding: "0 6px" }} />
                <input className="input" value={p.role ?? ""} onChange={(e) => updateP(i, { role: e.target.value })} placeholder="Role" style={{ height: 24, fontSize: 11.5, flex: 1, padding: "0 6px" }} />
                <select value={p.side} onChange={(e) => updateP(i, { side: e.target.value as "rep" | "client" })} className="input" style={{ height: 24, fontSize: 11, width: 90, padding: "0 4px" }}>
                  <option value="rep">Internal</option>
                  <option value="client">Customer</option>
                </select>
                <button className="iconbtn" title="Remove" onClick={() => removeP(i)} style={{ width: 24, height: 24 }}>
                  <Icons.Trash size={11} />
                </button>
              </div>
            ))}
            <button className="btn btn--ghost btn--sm" onClick={addP} style={{ alignSelf: "flex-start", height: 24, fontSize: 11 }}>
              <Icons.Plus size={10} />
              Add participant
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ---- Insights Tab ----

interface InsightsTabProps {
  call: NonNullable<ReturnType<typeof useCall>["data"]>;
  jumpTo: (idx: number) => void;
}

function InsightsTab({ call, jumpTo }: InsightsTabProps) {
  const meta: Record<string, { icon: React.ComponentType<{ size?: number }>; color: string; label: string }> = {
    "buying-signal": { icon: Icons.TrendingUp, color: "var(--accent)", label: "Buying signal" },
    objection: { icon: Icons.AlertTriangle, color: "#f59e0b", label: "Objection" },
    risk: { icon: Icons.AlertTriangle, color: "#f43f5e", label: "Risk" },
    highlight: { icon: Icons.Bookmark, color: "#a78bfa", label: "Highlight" },
  };

  const talkRatio = call.analysis?.talk_ratio ?? { rep: 50, client: 50 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Section icon={Icons.Eye} title="Key insights" count={call.insights.length}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {call.insights.map((ins) => {
            const m = meta[ins.kind] ?? meta["highlight"];
            const seg = ins.segment_idx != null ? call.segments[ins.segment_idx] : null;
            const clickable = seg != null;
            return (
              <div
                key={ins.id}
                className="card"
                onClick={clickable ? () => jumpTo(ins.segment_idx!) : undefined}
                style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start", borderLeft: `2px solid ${m.color}`, cursor: clickable ? "pointer" : "default", transition: "background 120ms" }}
                onMouseEnter={(e) => clickable && (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => clickable && (e.currentTarget.style.background = "")}
              >
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "var(--bg-3)", display: "grid", placeItems: "center", color: m.color, flex: "none" }}>
                  <m.icon size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: m.color, fontWeight: 600, marginBottom: 4 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{ins.text}</div>
                  {seg && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-3)" }}>
                      <Icons.Play size={9} style={{ color: m.color }} />
                      <span style={{ fontFamily: "var(--font-mono)", color: m.color, fontVariantNumeric: "tabular-nums" }}>
                        {formatTime(seg.start_seconds)}
                      </span>
                      <span style={{ color: "var(--text-4)" }}>·</span>
                      <span style={{ color: "var(--text-3)" }}>{seg.speaker_label}</span>
                      <span style={{ color: "var(--text-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        "{seg.text.slice(0, 60)}{seg.text.length > 60 ? "…" : ""}"
                      </span>
                    </div>
                  )}
                </div>
                {clickable && (
                  <Icons.ChevronDown size={12} style={{ color: "var(--text-4)", transform: "rotate(-90deg)", flex: "none", marginTop: 4 }} />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section icon={Icons.Mic} title="Talk ratio">
        <div style={{ display: "flex", gap: 16, alignItems: "center", padding: "8px 0" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${talkRatio.rep}%`, background: "var(--accent)" }} title={`Rep: ${talkRatio.rep}%`} />
              <div style={{ width: `${talkRatio.client}%`, background: "#22d3ee" }} title={`Client: ${talkRatio.client}%`} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span>
                <span className="dot" style={{ background: "var(--accent)", marginRight: 6 }} />
                Rep · {talkRatio.rep}%
              </span>
              <span>
                <span className="dot" style={{ background: "#22d3ee", marginRight: 6 }} />
                Client · {talkRatio.client}%
              </span>
            </div>
          </div>
          <div style={{ padding: "10px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Health</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)", marginTop: 2 }}>Healthy</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ---- Emotions Tab ----

function EmotionsTab({ call }: { call: NonNullable<ReturnType<typeof useCall>["data"]> }) {
  const total = Object.values(call.emotion_distribution).reduce((a, b) => a + b, 0) || 1;
  const overallSentiment = call.overall_sentiment != null ? parseFloat(call.overall_sentiment) : 0;

  const durationMin = call.duration_seconds != null ? Math.floor(call.duration_seconds / 60) : 0;
  const durationSec = call.duration_seconds != null ? call.duration_seconds % 60 : 0;
  const durationStr = call.duration_seconds != null
    ? `${durationMin}:${durationSec.toString().padStart(2, "0")}`
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Overall sentiment
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", lineHeight: 1 }}>
            {overallSentiment > 0 ? "+" : ""}
            {overallSentiment.toFixed(2)}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Net Positive</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Trended positive in 4 of 5 segments</div>
          </div>
        </div>
        <div style={{ display: "flex", height: 24, borderRadius: 4, overflow: "hidden", gap: 1 }}>
          {call.emotion_timeline.map((emo, i) => {
            const e = getEmotion(emo);
            return <div key={i} style={{ flex: 1, background: e.dot, opacity: 0.85 }} title={`${e.label} · segment ${i + 1}`} />;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-4)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
          <span>00:00</span>
          <span>{durationStr}</span>
        </div>
      </div>

      <Section icon={Icons.TrendingUp} title="Emotion distribution">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(call.emotion_distribution).map(([k, v]) => {
            const e = getEmotion(k);
            const pct = Math.round((v / total) * 100);
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 80, fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="dot" style={{ background: e.dot }} />
                  {e.label}
                </div>
                <div style={{ flex: 1, height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: e.dot, transition: "width 400ms" }} />
                </div>
                <span style={{ width: 36, textAlign: "right", fontSize: 11.5, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ---- Notes Tab ----

interface Note {
  when: string;
  text: string;
}

interface NotesTabProps {
  notes: Note[];
  setNotes: (n: Note[]) => void;
  newNote: string;
  setNewNote: (v: string) => void;
}

function NotesTab({ notes, setNotes, newNote, setNewNote }: NotesTabProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const submit = () => {
    if (!newNote.trim()) return;
    setNotes([...notes, { when: "Just now", text: newNote.trim() }]);
    setNewNote("");
  };
  const startEdit = (i: number) => { setEditingIdx(i); setEditText(notes[i].text); };
  const saveEdit = () => {
    if (!editText.trim() || editingIdx === null) return;
    setNotes(notes.map((n, idx) => (idx === editingIdx ? { ...n, text: editText.trim() } : n)));
    setEditingIdx(null);
  };
  const removeNote = (i: number) => setNotes(notes.filter((_, idx) => idx !== i));

  return (
    <div style={{ maxWidth: 720 }}>
      <Section icon={Icons.Edit} title="My notes" count={notes.length}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 12.5, border: "1px dashed var(--border)", borderRadius: 10 }}>
              No notes yet. Add a private note about this call below.
            </div>
          )}
          {notes.map((n, i) => (
            <div key={i} className="card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>{n.when}</span>
                <div style={{ flex: 1 }} />
                {editingIdx !== i && (
                  <>
                    <button className="iconbtn" title="Edit" onClick={() => startEdit(i)} style={{ width: 22, height: 22 }}>
                      <Icons.Edit size={11} />
                    </button>
                    <button className="iconbtn" title="Delete" onClick={() => removeNote(i)} style={{ width: 22, height: 22 }}>
                      <Icons.Trash size={11} />
                    </button>
                  </>
                )}
              </div>
              {editingIdx === i ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, color: "var(--text)", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical" }}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(); if (e.key === "Escape") setEditingIdx(null); }}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn btn--sm btn--ghost" onClick={() => setEditingIdx(null)}>Cancel</button>
                    <button className="btn btn--sm btn--primary" onClick={saveEdit}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{n.text}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write a note for yourself about this call…"
            rows={3}
            style={{ background: "transparent", border: "none", width: "100%", resize: "none", color: "var(--text)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>
              Only you can see your notes · <span className="kbd">⌘</span> <span className="kbd">↵</span> to save
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn btn--sm btn--primary" onClick={submit} disabled={!newNote.trim()}>
              <Icons.Plus size={11} />
              Add note
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
