import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCalls, useClients, useTags } from "../api/hooks";
import { Icons, SentimentBar, TagEditor, useOutsideClick } from "../components/components";
import type { CallSummary, Tag, Client } from "../types";

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export default function ListScreen() {
  const navigate = useNavigate();
  const { data: callsData } = useCalls();
  const { data: clientsData } = useClients();
  const { data: tagsData } = useTags();

  const [localCalls, setLocalCalls] = useState<CallSummary[] | null>(null);
  const calls = localCalls ?? callsData ?? [];
  const allTags = tagsData ?? [];
  const allClients = clientsData ?? [];

  const [search, setSearch] = useState("");
  const [assignFilter, setAssignFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);

  // Sync callsData into localCalls when it first loads
  useEffect(() => {
    if (callsData && localCalls === null) {
      setLocalCalls(callsData);
    }
  }, [callsData, localCalls]);

  const updateTags = (callId: string, nextTags: Tag[]) => {
    setLocalCalls((cs) => (cs ?? []).map((c) => (c.id === callId ? { ...c, tags: nextTags } : c)));
  };

  const assignClient = (callId: string, clientName: string) => {
    const client = allClients.find((c) => c.name === clientName);
    setLocalCalls((cs) =>
      (cs ?? []).map((c) =>
        c.id === callId
          ? { ...c, client_name: clientName, client_id: client?.id ?? null }
          : c
      )
    );
    setAssignFor(null);
  };

  const filtered = useMemo(() => {
    let r = calls.filter((c) => {
      const matchSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.client_name ?? "").toLowerCase().includes(search.toLowerCase());
      const isUnassigned = !c.client_id;
      const matchAssign =
        assignFilter === "all" ||
        (assignFilter === "unassigned" && isUnassigned) ||
        (assignFilter === "assigned" && !isUnassigned);
      return matchSearch && matchAssign;
    });
    r = [...r].sort((a, b) => {
      if (sort.key === "date") {
        const av = a.created_at;
        const bv = b.created_at;
        return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (sort.key === "title") {
        return sort.dir === "asc"
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      if (sort.key === "client") {
        const av = a.client_name ?? "";
        const bv = b.client_name ?? "";
        return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (sort.key === "sentiment") {
        const av = a.overall_sentiment != null ? parseFloat(a.overall_sentiment) : -1;
        const bv = b.overall_sentiment != null ? parseFloat(b.overall_sentiment) : -1;
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      if (sort.key === "duration") {
        const av = a.duration_seconds ?? 0;
        const bv = b.duration_seconds ?? 0;
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      return 0;
    });
    return r;
  }, [calls, search, assignFilter, sort]);

  const toggleSort = (k: string) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const deleteSelected = () => {
    setLocalCalls((cs) => (cs ?? []).filter((c) => !selected.has(c.id)));
    setSelected(new Set());
  };
  const deleteOne = (id: string) => {
    setLocalCalls((cs) => (cs ?? []).filter((c) => c.id !== id));
    setOpenMenu(null);
  };

  const unassignedCount = calls.filter((c) => !c.client_id).length;

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Calls</h1>
        <span style={{ color: "var(--text-4)", fontSize: 13 }}>
          {filtered.length} of {calls.length}
        </span>
        {unassignedCount > 0 && assignFilter !== "unassigned" && (
          <button
            onClick={() => setAssignFilter("unassigned")}
            className="tag"
            style={{ height: 22, fontSize: 11, gap: 6, cursor: "pointer", background: "rgba(245, 158, 11, 0.10)", border: "1px solid rgba(245, 158, 11, 0.35)", color: "var(--warn)" }}
          >
            <Icons.AlertTriangle size={10} />
            {unassignedCount} unassigned
          </button>
        )}
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>{selected.size} selected</span>
            <button className="btn btn--danger btn--sm" onClick={deleteSelected}>
              <Icons.Trash size={11} />
              Delete
            </button>
          </>
        )}
        <button className="btn btn--primary" onClick={() => navigate("/upload")}>
          <Icons.Plus size={13} />
          New analysis
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div className="field" style={{ width: 280 }}>
          <Icons.Search className="field__icon" />
          <input
            className="input input--search"
            placeholder="Search calls or clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterPill
          label="Status"
          value={assignFilter}
          options={["all", "assigned", "unassigned"]}
          onChange={(v) => setAssignFilter(v as "all" | "assigned" | "unassigned")}
        />
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm" onClick={() => toggleSort("date")}>
          <Icons.Sort size={11} />
          Sort: {sort.key} {sort.dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 28, paddingLeft: 16 }}>
                <button
                  className={`checkbox ${selected.size === filtered.length && filtered.length > 0 ? "checkbox--on" : ""}`}
                  onClick={() =>
                    setSelected(
                      selected.size === filtered.length
                        ? new Set()
                        : new Set(filtered.map((c) => c.id))
                    )
                  }
                >
                  {selected.size === filtered.length && filtered.length > 0 && <Icons.Check size={9} />}
                </button>
              </th>
              <Th label="Title" k="title" sort={sort} onSort={toggleSort} />
              <Th label="Client" k="client" sort={sort} onSort={toggleSort} />
              <Th label="Sentiment" k="sentiment" sort={sort} onSort={toggleSort} />
              <Th label="Date" k="date" sort={sort} onSort={toggleSort} />
              <Th label="Duration" k="duration" sort={sort} onSort={toggleSort} />
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const sentiment = c.overall_sentiment != null ? parseFloat(c.overall_sentiment) : 0;
              const isUnassigned = !c.client_id;
              const durationMin = c.duration_seconds != null ? Math.floor(c.duration_seconds / 60) : 0;
              const durationSec = c.duration_seconds != null ? c.duration_seconds % 60 : 0;
              const durationStr = c.duration_seconds != null
                ? `${durationMin}:${durationSec.toString().padStart(2, "0")}`
                : "—";
              const dateStr = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

              return (
                <tr key={c.id} onClick={() => navigate(`/calls/${c.id}`)}>
                  <td style={{ paddingLeft: 16 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`checkbox ${selected.has(c.id) ? "checkbox--on" : ""}`}
                      onClick={() => toggleSel(c.id)}
                    >
                      {selected.has(c.id) && <Icons.Check size={9} />}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 500 }}>{c.title}</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
                      <TagEditor
                        tags={c.tags}
                        allTags={allTags}
                        onChange={(next) => updateTags(c.id, next)}
                      />
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {isUnassigned ? (
                      <UnassignedBadge
                        open={assignFor === c.id}
                        onOpen={() => setAssignFor(assignFor === c.id ? null : c.id)}
                        onAssign={(name) => assignClient(c.id, name)}
                        clients={allClients}
                        onCreateClient={(name) => {
                          const created: Client = {
                            id: `c-new-${Date.now()}`,
                            name,
                            industry: null,
                            owner: null,
                            calls: 0,
                            last_call: null,
                            sentiment: null,
                            health: "on-track",
                            arr: null,
                          };
                          assignClient(c.id, created.name);
                        }}
                      />
                    ) : (
                      <span style={{ color: "var(--text-2)" }}>{c.client_name ?? "—"}</span>
                    )}
                  </td>
                  <td>
                    <SentimentBar value={sentiment} />
                  </td>
                  <td style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{dateStr}</td>
                  <td style={{ color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{durationStr}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
                    <button
                      className="iconbtn"
                      onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}
                    >
                      <Icons.More size={13} />
                    </button>
                    {openMenu === c.id && (
                      <div className="menu" style={{ right: 8, top: 32 }}>
                        <button
                          className="menu__item"
                          onClick={() => {
                            setOpenMenu(null);
                            navigate(`/calls/${c.id}`);
                          }}
                        >
                          <Icons.Eye size={12} />
                          Open
                        </button>
                        <div className="menu__divider" />
                        <button className="menu__item menu__item--danger" onClick={() => deleteOne(c.id)}>
                          <Icons.Trash size={12} />
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
                  No calls match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- UnassignedBadge ----

interface UnassignedBadgeProps {
  open: boolean;
  onOpen: () => void;
  onAssign: (name: string) => void;
  clients: Client[];
  onCreateClient: (name: string) => void;
}

function UnassignedBadge({ open, onOpen, onAssign, clients, onCreateClient }: UnassignedBadgeProps) {
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpen();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onOpen]);

  const filtered = clients.filter((c) => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
  const canCreate = filter.trim() && !clients.some((c) => c.name.toLowerCase() === filter.trim().toLowerCase());

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={onOpen}
        className="tag"
        style={{ height: 22, fontSize: 11, gap: 6, background: "rgba(245, 158, 11, 0.10)", border: "1px solid rgba(245, 158, 11, 0.35)", color: "var(--warn)" }}
      >
        <Icons.AlertTriangle size={10} />
        Unassigned
        <Icons.ChevronDown size={9} />
      </button>
      {open && (
        <div className="menu" style={{ top: "calc(100% + 4px)", left: 0, minWidth: 240, zIndex: 50 }}>
          <div style={{ padding: 6, fontSize: 11, color: "var(--text-3)" }}>Assign to client</div>
          <div style={{ padding: "0 6px 6px" }}>
            <input
              autoFocus
              className="input"
              placeholder="Search or create…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ height: 26, fontSize: 12 }}
            />
          </div>
          <div className="menu__divider" />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.map((c) => (
              <button key={c.id} className="menu__item" onClick={() => onAssign(c.name)}>
                <Icons.Building size={11} />
                {c.name}
              </button>
            ))}
            {canCreate && (
              <button className="menu__item" onClick={() => onCreateClient(filter.trim())}>
                <Icons.Plus size={11} />
                Create "<strong>{filter.trim()}</strong>"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: 10, fontSize: 11.5, color: "var(--text-4)", textAlign: "center" }}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Th ----

function Th({ label, k, sort, onSort }: { label: string; k: string; sort: SortState; onSort: (k: string) => void }) {
  const active = sort.key === k;
  return (
    <th onClick={() => onSort(k)} style={{ cursor: "pointer" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: active ? "var(--text)" : undefined }}>
        {label}
        {active && <span style={{ fontSize: 9 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

// ---- FilterPill ----

function FilterPill({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn--sm" onClick={() => setOpen(!open)}>
        <span style={{ color: "var(--text-3)" }}>{label}:</span>
        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{value === "all" ? "All" : value}</span>
        <Icons.ChevronDown size={10} />
      </button>
      {open && (
        <div className="menu" style={{ top: "calc(100% + 4px)", left: 0, maxHeight: 280, overflowY: "auto" }}>
          {options.map((o) => (
            <button
              key={o}
              className="menu__item"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              <span style={{ textTransform: "capitalize" }}>{o === "all" ? "All" : o}</span>
              {value === o && <Icons.Check size={11} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
