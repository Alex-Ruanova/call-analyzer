import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Tag, Client, EmotionsMap } from "../types";

// ---- Icon primitive ----

interface IconProps {
  d?: string;
  size?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  children?: React.ReactNode;
  viewBox?: string;
  style?: React.CSSProperties;
  className?: string;
}

const Icon = ({ d, size = 16, fill = "none", stroke = "currentColor", sw = 1.6, children, viewBox = "0 0 24 24", ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

// ---- Icons ----

type IconComponentProps = Omit<IconProps, "children">;

export const Icons = {
  Upload: (p: IconComponentProps) => <Icon {...p}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 21h14" /></Icon>,
  Mic: (p: IconComponentProps) => <Icon {...p}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>,
  Home: (p: IconComponentProps) => <Icon {...p}><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" /></Icon>,
  Calls: (p: IconComponentProps) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M8 13h2M8 16h6" /></Icon>,
  Users: (p: IconComponentProps) => <Icon {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M21.5 19a4.5 4.5 0 0 0-7-3.7" /></Icon>,
  Chart: (p: IconComponentProps) => <Icon {...p}><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></Icon>,
  Search: (p: IconComponentProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>,
  Plus: (p: IconComponentProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>,
  Star: (p: IconComponentProps) => <Icon {...p}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></Icon>,
  StarFilled: (p: IconComponentProps) => <Icon {...p} fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></Icon>,
  X: (p: IconComponentProps) => <Icon {...p} sw={2}><path d="M6 6l12 12M18 6L6 18" /></Icon>,
  Check: (p: IconComponentProps) => <Icon {...p} sw={2.5}><path d="M5 13l4 4L19 7" /></Icon>,
  ChevronDown: (p: IconComponentProps) => <Icon {...p} sw={2}><path d="M6 9l6 6 6-6" /></Icon>,
  ChevronRight: (p: IconComponentProps) => <Icon {...p} sw={2}><path d="M9 6l6 6-6 6" /></Icon>,
  Filter: (p: IconComponentProps) => <Icon {...p}><path d="M3 5h18M6 12h12M10 19h4" /></Icon>,
  Sort: (p: IconComponentProps) => <Icon {...p}><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></Icon>,
  Trash: (p: IconComponentProps) => <Icon {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></Icon>,
  Edit: (p: IconComponentProps) => <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>,
  More: (p: IconComponentProps) => <Icon {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Icon>,
  Play: (p: IconComponentProps) => <Icon {...p} fill="currentColor" stroke="none"><path d="M7 4v16l13-8z" /></Icon>,
  Pause: (p: IconComponentProps) => <Icon {...p} fill="currentColor" stroke="none"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></Icon>,
  File: (p: IconComponentProps) => <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></Icon>,
  Sparkles: (p: IconComponentProps) => <Icon {...p}><path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z" /><path d="M19 15l.9 2.2 2.1.8-2.1.8L19 21l-.9-2.2-2.1-.8 2.1-.8z" /></Icon>,
  Comment: (p: IconComponentProps) => <Icon {...p}><path d="M21 15a4 4 0 0 1-4 4H8l-5 4V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></Icon>,
  Clock: (p: IconComponentProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  Tag: (p: IconComponentProps) => <Icon {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" /></Icon>,
  Building: (p: IconComponentProps) => <Icon {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M9 9h2M9 13h2M9 17h2" /></Icon>,
  AlertTriangle: (p: IconComponentProps) => <Icon {...p}><path d="M12 3l10 18H2zM12 10v5M12 18h.01" /></Icon>,
  TrendingUp: (p: IconComponentProps) => <Icon {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></Icon>,
  TrendingDown: (p: IconComponentProps) => <Icon {...p}><path d="M3 7l6 6 4-4 8 8" /><path d="M14 17h7v-7" /></Icon>,
  Bookmark: (p: IconComponentProps) => <Icon {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Icon>,
  Settings: (p: IconComponentProps) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>,
  SidebarIcon: (p: IconComponentProps) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Icon>,
  Bell: (p: IconComponentProps) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" /></Icon>,
  Download: (p: IconComponentProps) => <Icon {...p}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></Icon>,
  Share: (p: IconComponentProps) => <Icon {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></Icon>,
  Eye: (p: IconComponentProps) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>,
  Send: (p: IconComponentProps) => <Icon {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></Icon>,
  Light: (p: IconComponentProps) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Icon>,
  Globe: (p: IconComponentProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>,
};

// ---- Sidebar ----

export interface SidebarProps {
  route: string;
  setRoute: (r: string) => void;
  callsCount: number;
  clientsCount: number;
  pinnedClients: string[];
  allClients: Client[];
  onOpenClient: (c: Client) => void;
}

export function Sidebar({
  route,
  setRoute,
  callsCount,
  clientsCount,
  pinnedClients,
  allClients,
  onOpenClient,
}: SidebarProps) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Icons.Home },
    { key: "upload", label: "New analysis", icon: Icons.Upload },
    { key: "list", label: "Calls", icon: Icons.Calls, count: callsCount },
    { key: "clients", label: "Clients", icon: Icons.Building, count: clientsCount },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 12 L12 3 L21 12 L12 21 Z" opacity="0.4" />
            <path d="M7 12 L12 7 L17 12 L12 17 Z" />
          </svg>
        </div>
        <div className="sidebar__name">
          Altur <em>· sales intel</em>
        </div>
      </div>
      <nav className="sidebar__nav">
        <div className="sidebar__section">Workspace</div>
        {items.map((it) => (
          <button
            key={it.key}
            className="navitem"
            aria-current={route === it.key ? "page" : undefined}
            onClick={() => setRoute(it.key)}
          >
            <it.icon size={14} />
            <span className="navitem__label">{it.label}</span>
            {it.count != null && <span className="navitem__count">{it.count}</span>}
          </button>
        ))}
        <div className="sidebar__section">Pinned clients</div>
        {(() => {
          const pinned = allClients.filter((c) => pinnedClients.includes(c.id));
          if (pinned.length === 0) {
            return (
              <div style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-4)", lineHeight: 1.45 }}>
                Pin clients with the <Icons.Star size={10} style={{ verticalAlign: "-1px" }} /> on their card to see
                them here.
              </div>
            );
          }
          return pinned.map((c) => {
            const initials = c.name
              .split(/\s+/)
              .map((s) => s[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <button key={c.id} className="navitem" onClick={() => onOpenClient(c)} title={c.name}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    flexShrink: 0,
                    background: "var(--bg-3)",
                    color: "var(--text-2)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {initials}
                </span>
                <span
                  className="navitem__label"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {c.name}
                </span>
              </button>
            );
          });
        })()}
      </nav>
      <div className="sidebar__bottom">
        <div className="avatar avatar--md">EM</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            Elena Marín
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Sales Lead</div>
        </div>
        <button className="iconbtn" title="Settings">
          <Icons.Settings size={14} />
        </button>
      </div>
    </aside>
  );
}

// ---- Topbar ----

export interface TopbarProps {
  crumbs: string[];
  actions?: React.ReactNode;
  onToggleSidebar: () => void;
}

export function Topbar({ crumbs, actions, onToggleSidebar }: TopbarProps) {
  return (
    <header className="topbar">
      <button className="iconbtn" onClick={onToggleSidebar} title="Toggle sidebar">
        <Icons.SidebarIcon size={15} />
      </button>
      <div className="topbar__crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span>/</span>}
            <span
              style={{
                color: i === crumbs.length - 1 ? "var(--text)" : undefined,
                fontWeight: i === crumbs.length - 1 ? 600 : 400,
              }}
            >
              {c}
            </span>
          </span>
        ))}
      </div>
      <div className="topbar__spacer" />
      {actions}
    </header>
  );
}

// ---- Emotion bits ----

const EMOTIONS: EmotionsMap = {
  positive: { label: "Positive", color: "#10b981", dot: "#10b981" },
  excited: { label: "Excited", color: "#22d3ee", dot: "#22d3ee" },
  neutral: { label: "Neutral", color: "#6b7280", dot: "#9ca3af" },
  hesitant: { label: "Hesitant", color: "#f59e0b", dot: "#f59e0b" },
  confused: { label: "Confused", color: "#a78bfa", dot: "#a78bfa" },
  frustrated: { label: "Frustrated", color: "#f43f5e", dot: "#f43f5e" },
  negative: { label: "Negative", color: "#ef4444", dot: "#ef4444" },
};

export function getEmotion(emo: string) {
  return EMOTIONS[emo] ?? EMOTIONS["neutral"];
}

export function EmotionDot({ emo }: { emo: string }) {
  const e = getEmotion(emo);
  return <span className="dot" style={{ background: e.dot }} />;
}

export function EmotionPill({ emo }: { emo: string }) {
  const e = getEmotion(emo);
  return (
    <span className="emo">
      <span className="dot" style={{ background: e.dot }} />
      {e.label}
    </span>
  );
}

// ---- Sentiment bar ----

export function SentimentBar({ value, width = 60 }: { value: number; width?: number }) {
  const pct = Math.round(((value + 1) / 2) * 100);
  const color = value > 0.4 ? "#10b981" : value > 0 ? "#a3e635" : value > -0.3 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ width, height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums", minWidth: 30 }}>
        {value > 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ---- Sparkline ----

export function Sparkline({
  data,
  color = "var(--accent)",
  width = 100,
  height = 28,
  fill = true,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => [pad + i * stepX, height - pad - ((v - min) / range) * (height - pad * 2)]);
  const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(" ");
  const area = `${path} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---- useOutsideClick ----

export function useOutsideClick(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  const cb = useCallback(onOutside, [onOutside]);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, cb]);
}

// ---- Tag color helper ----

const TAG_COLORS: Record<string, string> = {
  Discovery: "#22d3ee",
  Demo: "#10b981",
  Pricing: "#f59e0b",
  Renewal: "#a78bfa",
  Closing: "#a3e635",
  "Follow-up": "#64748b",
  Enterprise: "#6366f1",
  "Mid-Market": "#14b8a6",
  SMB: "#94a3b8",
  LATAM: "#ec4899",
  Healthcare: "#0ea5e9",
  Finance: "#eab308",
};

export function tagColor(tag: string): string {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = ((h * 31 + tag.charCodeAt(i)) >>> 0);
  return `hsl(${h % 360} 65% 60%)`;
}

// ---- TagEditor ----

export interface TagEditorProps {
  tags: Tag[];
  allTags: Tag[];
  onChange: (tags: Tag[]) => void;
}

export function TagEditor({ tags, allTags, onChange }: TagEditorProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  const tagNames = tags.map((t) => t.name);
  const filtered = allTags.filter(
    (t) => t.name.toLowerCase().includes(filter.toLowerCase()) && !tagNames.includes(t.name)
  );
  const canCreate =
    filter.trim() && !allTags.some((t) => t.name.toLowerCase() === filter.trim().toLowerCase());

  const addTag = (t: Tag) => {
    onChange([...tags, t]);
  };

  const removeTag = (name: string) => {
    onChange(tags.filter((t) => t.name !== name));
  };

  const createTag = () => {
    const name = filter.trim();
    const newTag: Tag = { id: `tag-new-${Date.now()}`, name, color: tagColor(name), is_system: false, source: "user" };
    onChange([...tags, newTag]);
    setFilter("");
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {tags.map((t) => (
        <span key={t.id} className="tag tag--remove">
          <span className="dot" style={{ background: t.color }} />
          {t.name}
          <span className="tag__x" onClick={() => removeTag(t.name)}>
            <Icons.X size={10} />
          </span>
        </span>
      ))}
      <button
        className="tag"
        style={{ background: "transparent", border: "1px dashed var(--border-2)", color: "var(--text-3)" }}
        onClick={() => setOpen(!open)}
      >
        <Icons.Plus size={11} />
        Add tag
      </button>
      {open && (
        <div className="menu" style={{ top: "calc(100% + 4px)", left: 0, minWidth: 220 }}>
          <div style={{ padding: 4 }}>
            <input
              autoFocus
              className="input"
              placeholder="Search or create…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) createTag();
              }}
              style={{ height: 26, fontSize: 12 }}
            />
          </div>
          <div className="menu__divider" />
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {filtered.map((t) => (
              <button
                key={t.id}
                className="menu__item"
                onClick={() => {
                  addTag(t);
                  setOpen(false);
                  setFilter("");
                }}
              >
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
            {canCreate && (
              <button className="menu__item" onClick={createTag}>
                <Icons.Plus size={12} />
                Create "<strong>{filter.trim()}</strong>"
              </button>
            )}
            {!canCreate && filtered.length === 0 && (
              <div style={{ padding: 10, color: "var(--text-4)", fontSize: 11.5, textAlign: "center" }}>
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- ClientPicker ----

export interface ClientPickerProps {
  value: string | null;
  allClients: Client[];
  onChange: (clientName: string) => void;
}

export function ClientPicker({ value, allClients, onChange }: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  const filtered = allClients.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
  const canCreate =
    filter.trim() && !allClients.some((c) => c.name.toLowerCase() === filter.trim().toLowerCase());

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button className="tag" onClick={() => setOpen(!open)} style={{ height: 24, gap: 6 }}>
        <Icons.Building size={11} />
        {value ?? "No client"}
        <Icons.ChevronDown size={10} />
      </button>
      {open && (
        <div className="menu" style={{ top: "calc(100% + 4px)", left: 0, minWidth: 240 }}>
          <div style={{ padding: 4 }}>
            <input
              autoFocus
              className="input"
              placeholder="Find or create client…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ height: 26, fontSize: 12 }}
            />
          </div>
          <div className="menu__divider" />
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.map((c) => (
              <button
                key={c.id}
                className="menu__item"
                onClick={() => {
                  onChange(c.name);
                  setOpen(false);
                }}
              >
                <Icons.Building size={12} />
                {c.name}
                {value === c.name && (
                  <Icons.Check size={11} style={{ marginLeft: "auto", color: "var(--accent)" }} />
                )}
              </button>
            ))}
            {canCreate && (
              <button
                className="menu__item"
                onClick={() => {
                  onChange(filter.trim());
                  setOpen(false);
                }}
              >
                <Icons.Plus size={12} />
                Create "<strong>{filter.trim()}</strong>"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- RouterSidebar (wraps Sidebar, uses React Router) ----

export interface RouterSidebarProps {
  sidebarCollapsed?: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  pinnedClients: string[];
  allClients: Client[];
  callsCount: number;
  clientsCount: number;
}

export function RouterSidebar({
  setSidebarCollapsed,
  pinnedClients,
  allClients,
  callsCount,
  clientsCount,
}: RouterSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentRoute = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith("/clients/")) return "clients";
    if (p.startsWith("/clients")) return "clients";
    if (p.startsWith("/calls/")) return "list";
    if (p.startsWith("/calls")) return "list";
    if (p.startsWith("/upload")) return "upload";
    if (p.startsWith("/dashboard")) return "dashboard";
    return "dashboard";
  }, [location.pathname]);

  const handleSetRoute = (r: string) => {
    const pathMap: Record<string, string> = {
      dashboard: "/dashboard",
      upload: "/upload",
      list: "/calls",
      clients: "/clients",
    };
    navigate(pathMap[r] ?? "/dashboard");
    if (window.matchMedia("(max-width: 980px)").matches) {
      setSidebarCollapsed(true);
    }
  };

  const handleOpenClient = (c: Client) => {
    navigate(`/clients/${c.id}`);
    if (window.matchMedia("(max-width: 980px)").matches) {
      setSidebarCollapsed(true);
    }
  };

  return (
    <>
      <div
        className="sidebar__backdrop"
        onClick={() => setSidebarCollapsed(true)}
      />
      <Sidebar
        route={currentRoute}
        setRoute={handleSetRoute}
        callsCount={callsCount}
        clientsCount={clientsCount}
        pinnedClients={pinnedClients}
        allClients={allClients}
        onOpenClient={handleOpenClient}
      />
    </>
  );
}
