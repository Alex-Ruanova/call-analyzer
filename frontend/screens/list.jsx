/* global React, Icons, SentimentBar, Sparkline, TagEditor */
const { useState, useMemo, useRef, useEffect } = React;

// ============== CALLS LIST ==============
function ListScreen({ onOpenCall, onUploadNew }) {
  const [calls, setCalls] = useState(ALTUR.CALLS);
  const [allTags, setAllTags] = useState(ALTUR.ALL_TAGS);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('all');
  const [assignFilter, setAssignFilter] = useState('all'); // all | assigned | unassigned
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [selected, setSelected] = useState(new Set());
  const [openMenu, setOpenMenu] = useState(null);
  const [assignFor, setAssignFor] = useState(null); // call id to assign
  const [allClients, setAllClients] = useState(ALTUR.CLIENTS);

  const updateTags = (id, nextTags) => {
    setCalls(cs => cs.map(c => c.id === id ? { ...c, tags: nextTags } : c));
    setAllTags(prev => {
      const merged = [...prev];
      nextTags.forEach(t => { if (!merged.includes(t)) merged.push(t); });
      return merged;
    });
  };

  const assignClient = (callId, clientName) => {
    setCalls(cs => cs.map(c => c.id === callId ? { ...c, client: clientName, unassigned: false } : c));
    setAssignFor(null);
  };

  const filtered = useMemo(() => {
    let r = calls.filter(c => {
      const matchSearch = !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.client || '').toLowerCase().includes(search.toLowerCase());
      const matchTag = tag === 'all' || c.tags.includes(tag);
      const matchAssign = assignFilter === 'all' ||
        (assignFilter === 'unassigned' && c.unassigned) ||
        (assignFilter === 'assigned' && !c.unassigned);
      return matchSearch && matchTag && matchAssign;
    });
    r = [...r].sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return r;
  }, [calls, search, tag, assignFilter, sort]);

  const toggleSort = (k) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' });
  const toggleSel = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deleteSelected = () => { setCalls(calls.filter(c => !selected.has(c.id))); setSelected(new Set()); };
  const deleteOne = (id) => { setCalls(calls.filter(c => c.id !== id)); setOpenMenu(null); };

  const tags = ['all', ...allTags];
  const unassignedCount = calls.filter(c => c.unassigned).length;

  return (
    <div style={{padding: 28, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <h1 style={{fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em'}}>Calls</h1>
        <span style={{color: 'var(--text-4)', fontSize: 13}}>{filtered.length} of {calls.length}</span>
        {unassignedCount > 0 && assignFilter !== 'unassigned' && (
          <button
            onClick={() => setAssignFilter('unassigned')}
            className="tag"
            style={{
              height: 22, fontSize: 11, gap: 6, cursor: 'pointer',
              background: 'rgba(245, 158, 11, 0.10)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: 'var(--warn)',
            }}>
            <Icons.AlertTriangle size={10}/>{unassignedCount} unassigned
          </button>
        )}
        <div style={{flex: 1}}/>
        {selected.size > 0 && (
          <>
            <span style={{fontSize: 12, color: 'var(--text-3)'}}>{selected.size} selected</span>
            <button className="btn btn--danger btn--sm" onClick={deleteSelected}><Icons.Trash size={11}/>Delete</button>
          </>
        )}
        <button className="btn btn--primary" onClick={onUploadNew}><Icons.Plus size={13}/>New analysis</button>
      </div>

      {/* Filters */}
      <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
        <div className="field" style={{width: 280}}>
          <Icons.Search className="field__icon"/>
          <input className="input input--search" placeholder="Search calls or clients…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <FilterPill label="Status" value={assignFilter} options={['all', 'assigned', 'unassigned']} onChange={setAssignFilter}/>
        <div style={{flex: 1}}/>
        <button className="btn btn--ghost btn--sm" onClick={() => toggleSort('date')}>
          <Icons.Sort size={11}/>Sort: {sort.key} {sort.dir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{display: 'flex', flexDirection: 'column', minHeight: 0}}>
        <div>
          <table className="table">
            <thead>
              <tr>
                <th style={{width: 28, paddingLeft: 16}}>
                  <button className={`checkbox ${selected.size === filtered.length && filtered.length > 0 ? 'checkbox--on' : ''}`}
                    onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)))}>
                    {selected.size === filtered.length && filtered.length > 0 && <Icons.Check size={9}/>}
                  </button>
                </th>
                <Th label="Title" k="title" sort={sort} onSort={toggleSort}/>
                <Th label="Client" k="client" sort={sort} onSort={toggleSort}/>
                <Th label="Sentiment" k="sentiment" sort={sort} onSort={toggleSort}/>
                <Th label="Date" k="date" sort={sort} onSort={toggleSort}/>
                <Th label="Duration" k="duration" sort={sort} onSort={toggleSort}/>
                <th style={{width: 30}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => onOpenCall(c.id)}>
                  <td style={{paddingLeft: 16}} onClick={e => e.stopPropagation()}>
                    <button className={`checkbox ${selected.has(c.id) ? 'checkbox--on' : ''}`} onClick={() => toggleSel(c.id)}>
                      {selected.has(c.id) && <Icons.Check size={9}/>}
                    </button>
                  </td>
                  <td>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <span style={{fontWeight: 500}}>{c.title}</span>
                    </div>
                    <div onClick={e => e.stopPropagation()} style={{marginTop: 6}}>
                      <TagEditor tags={c.tags} allTags={allTags} onChange={(next) => updateTags(c.id, next)}/>
                    </div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {c.unassigned ? (
                      <UnassignedBadge
                        open={assignFor === c.id}
                        onOpen={() => setAssignFor(assignFor === c.id ? null : c.id)}
                        onAssign={(name) => assignClient(c.id, name)}
                        clients={allClients}
                        onCreateClient={(name) => {
                          const created = { id: `c-new-${Date.now()}`, name, industry: '—', owner: '—', calls: 0, lastCall: '—', sentiment: 0, stage: '—', arr: '—', health: 'on-track' };
                          setAllClients([created, ...allClients]);
                          assignClient(c.id, name);
                        }}/>
                    ) : (
                      <span style={{color: 'var(--text-2)'}}>{c.client}</span>
                    )}
                  </td>
                  <td><SentimentBar value={c.sentiment}/></td>
                  <td style={{color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums'}}>{c.date}</td>
                  <td style={{color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums'}}>{c.duration}</td>
                  <td onClick={e => e.stopPropagation()} style={{position: 'relative'}}>
                    <button className="iconbtn" onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}><Icons.More size={13}/></button>
                    {openMenu === c.id && (
                      <div className="menu" style={{right: 8, top: 32}}>
                        <button className="menu__item" onClick={() => onOpenCall(c.id)}><Icons.Eye size={12}/>Open</button>
                        <div className="menu__divider"/>
                        <button className="menu__item menu__item--danger" onClick={() => deleteOne(c.id)}><Icons.Trash size={12}/>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="9" style={{textAlign: 'center', padding: 60, color: 'var(--text-3)'}}>No calls match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---- Inline unassigned badge with assign popover ----
function UnassignedBadge({ open, onOpen, onAssign, clients, onCreateClient }) {
  const [filter, setFilter] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onOpen(); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  const filtered = clients.filter(c => !filter || c.name.toLowerCase().includes(filter.toLowerCase()));
  const canCreate = filter.trim() && !clients.some(c => c.name.toLowerCase() === filter.trim().toLowerCase());

  return (
    <div ref={ref} style={{position: 'relative', display: 'inline-block'}}>
      <button onClick={onOpen} className="tag"
        style={{
          height: 22, fontSize: 11, gap: 6,
          background: 'rgba(245, 158, 11, 0.10)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          color: 'var(--warn)',
        }}>
        <Icons.AlertTriangle size={10}/>Unassigned
        <Icons.ChevronDown size={9}/>
      </button>
      {open && (
        <div className="menu" style={{top: 'calc(100% + 4px)', left: 0, minWidth: 240, zIndex: 50}}>
          <div style={{padding: 6, fontSize: 11, color: 'var(--text-3)'}}>Assign to client</div>
          <div style={{padding: '0 6px 6px'}}>
            <input autoFocus className="input" placeholder="Search or create…"
              value={filter} onChange={e => setFilter(e.target.value)}
              style={{height: 26, fontSize: 12}}/>
          </div>
          <div className="menu__divider"/>
          <div style={{maxHeight: 200, overflowY: 'auto'}}>
            {filtered.map(c => (
              <button key={c.id} className="menu__item" onClick={() => onAssign(c.name)}>
                <Icons.Building size={11}/>{c.name}
              </button>
            ))}
            {canCreate && (
              <button className="menu__item" onClick={() => onCreateClient(filter.trim())}>
                <Icons.Plus size={11}/>Create "<strong>{filter.trim()}</strong>"
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div style={{padding: 10, fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center'}}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ label, k, sort, onSort }) {
  const active = sort.key === k;
  return (
    <th onClick={() => onSort(k)} style={{cursor: 'pointer'}}>
      <span style={{display: 'inline-flex', alignItems: 'center', gap: 4, color: active ? 'var(--text)' : undefined}}>
        {label}
        {active && <span style={{fontSize: 9}}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function FilterPill({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{position: 'relative'}}>
      <button className="btn btn--sm" onClick={() => setOpen(!open)}>
        <span style={{color: 'var(--text-3)'}}>{label}:</span>
        <span style={{fontWeight: 500, textTransform: 'capitalize'}}>{value === 'all' ? 'All' : value}</span>
        <Icons.ChevronDown size={10}/>
      </button>
      {open && (
        <>
          <div style={{position: 'fixed', inset: 0, zIndex: 70}} onClick={() => setOpen(false)}/>
          <div className="menu" style={{top: 'calc(100% + 4px)', left: 0, maxHeight: 280, overflowY: 'auto'}}>
            {options.map(o => (
              <button key={o} className="menu__item" onClick={() => { onChange(o); setOpen(false); }}>
                <span style={{textTransform: 'capitalize'}}>{o === 'all' ? 'All' : o}</span>
                {value === o && <Icons.Check size={11} style={{marginLeft: 'auto', color: 'var(--accent)'}}/>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

window.ListScreen = ListScreen;
