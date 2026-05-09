/* global React, Icons, SentimentBar, ClientPicker, NewClientModal */
const { useState, useMemo, useRef, useEffect } = React;

// ============== CLIENTS LIST ==============
function ClientsScreen({ pinnedClients = [], onTogglePin = () => {}, onOpenClient = () => {}, onUploadForClient = () => {} }) {
  const [clients, setClients] = useState(ALTUR.CLIENTS);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', industry: '', owner: '' });
  const filtered = clients.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = () => {
    if (!newClient.name.trim()) return;
    const created = {
      id: `c-new-${Date.now()}`,
      name: newClient.name.trim(),
      industry: newClient.industry.trim() || '—',
      owner: newClient.owner.trim() || '—',
      calls: 0, lastCall: '—', sentiment: 0, stage: '—', arr: '—', health: 'on-track',
    };
    setClients([created, ...clients]);
    setShowNew(false);
    setNewClient({ name: '', industry: '', owner: '' });
  };

  return (
    <div style={{padding: 28, display: 'flex', flexDirection: 'column', gap: 18}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <h1 style={{fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em'}}>Clients</h1>
        <span style={{color: 'var(--text-4)', fontSize: 13}}>{filtered.length}</span>
        <div style={{flex: 1}}/>
        <button className="btn btn--primary" onClick={() => setShowNew(true)}><Icons.Plus size={13}/>New client</button>
      </div>

      <div className="field" style={{width: 280}}>
        <Icons.Search className="field__icon"/>
        <input className="input input--search" placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      <div className="clients-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14}}>
        {filtered.map(c => (
          <div key={c.id} className="card client-card" onClick={() => onOpenClient(c)}
            style={{padding: 18, cursor: 'pointer', position: 'relative', transition: 'border-color 140ms ease, transform 140ms ease'}}>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(c.id); }}
              title={pinnedClients.includes(c.id) ? 'Unpin from sidebar' : 'Pin to sidebar'}
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: 4, borderRadius: 4,
                color: pinnedClients.includes(c.id) ? 'var(--accent)' : 'var(--text-4)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {pinnedClients.includes(c.id)
                ? <Icons.StarFilled size={14}/>
                : <Icons.Star size={14}/>}
            </button>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, paddingRight: 28}}>
              <div className="avatar avatar--md" style={{background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border-2)'}}>
                {c.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{c.name}</div>
                <div style={{fontSize: 11.5, color: 'var(--text-3)'}}>{c.industry}</div>
              </div>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12, marginBottom: 12}}>
              <div>
                <div style={{fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2}}>Calls</div>
                <div style={{fontWeight: 500}}>{c.calls}</div>
              </div>
              <div>
                <div style={{fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2}}>Last call</div>
                <div style={{color: 'var(--text-2)'}}>{c.lastCall}</div>
              </div>
              <div>
                <div style={{fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2}}>Sentiment</div>
                <SentimentBar value={c.sentiment} width={50}/>
              </div>
            </div>
            <div style={{display: 'flex', gap: 6, paddingTop: 10, borderTop: '1px solid var(--border)'}}>
              <button className="btn btn--ghost btn--sm" style={{flex: 1, justifyContent: 'center'}}
                onClick={(e) => { e.stopPropagation(); onOpenClient(c); }}>
                Open
              </button>
              <button className="btn btn--sm" style={{flex: 1, justifyContent: 'center'}}
                onClick={(e) => { e.stopPropagation(); onUploadForClient(c); }}>
                <Icons.Upload size={11}/>Upload call
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <NewClientModal
          value={newClient}
          onChange={setNewClient}
          onCancel={() => { setShowNew(false); setNewClient({ name: '', industry: '', owner: '' }); }}
          onCreate={handleCreate}/>
      )}
    </div>
  );
}

// ============== CLIENT DETAIL ==============
function ClientDetailScreen({ client, onBack, onOpenCall, onUploadForClient, onTogglePin, isPinned }) {
  const clientCalls = ALTUR.CALLS.filter(c => c.client === client.name);
  const avgSentiment = clientCalls.length
    ? clientCalls.reduce((a, c) => a + c.sentiment, 0) / clientCalls.length
    : 0;

  return (
    <div style={{padding: 28, display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1100, margin: '0 auto', width: '100%'}}>
      {/* Header */}
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          <span style={{fontSize: 12}}>←</span>Clients
        </button>
      </div>

      <div style={{display: 'flex', alignItems: 'flex-start', gap: 16}}>
        <div className="avatar avatar--lg" style={{
          width: 60, height: 60, borderRadius: 12, fontSize: 18, fontWeight: 600,
          background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border-2)',
          display: 'grid', placeItems: 'center',
        }}>
          {client.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
        </div>
        <div style={{flex: 1, minWidth: 0}}>
          <h1 style={{fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em'}}>{client.name}</h1>
          <div style={{display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-3)'}}>
            <span>{client.industry || '—'}</span>
            {client.owner && client.owner !== '—' && <><span style={{color: 'var(--text-4)'}}>·</span><span>Owner: <span style={{color: 'var(--text-2)'}}>{client.owner}</span></span></>}
            {client.arr && client.arr !== '—' && client.arr !== '$0' && <><span style={{color: 'var(--text-4)'}}>·</span><span>ARR: <span style={{color: 'var(--text-2)'}}>{client.arr}</span></span></>}
            {client.stage && client.stage !== '—' && <><span style={{color: 'var(--text-4)'}}>·</span><span className="tag tag--soft" style={{height: 20, fontSize: 10.5}}>{client.stage}</span></>}
          </div>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <button className="btn btn--ghost btn--sm" onClick={() => onTogglePin(client.id)}
            style={{color: isPinned ? 'var(--accent)' : undefined}}>
            {isPinned ? <Icons.StarFilled size={12}/> : <Icons.Star size={12}/>}
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
          <button className="btn btn--primary" onClick={() => onUploadForClient(client)}>
            <Icons.Upload size={12}/>Upload call
          </button>
        </div>
      </div>

      {/* Stat row */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14}}>
        <Stat label="Calls" value={clientCalls.length}/>
        <Stat label="Last call" value={client.lastCall || '—'}/>
        <Stat label="Avg sentiment" valueEl={<SentimentBar value={avgSentiment} width={70}/>}/>
      </div>

      {/* Calls table */}
      <div style={{marginTop: 4}}>
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10}}>
          <h2 style={{fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: '-0.005em'}}>Calls</h2>
          <span style={{fontSize: 12, color: 'var(--text-4)'}}>{clientCalls.length} total</span>
        </div>
        {clientCalls.length === 0 ? (
          <div className="card" style={{padding: 40, textAlign: 'center'}}>
            <div style={{width: 44, height: 44, borderRadius: 10, background: 'var(--bg-2)', display: 'grid', placeItems: 'center', margin: '0 auto 12px', color: 'var(--text-3)'}}>
              <Icons.Mic size={18}/>
            </div>
            <div style={{fontSize: 13, fontWeight: 500, marginBottom: 4}}>No calls yet</div>
            <div style={{fontSize: 12, color: 'var(--text-3)', marginBottom: 14}}>Upload a recording to get your first analysis for {client.name}.</div>
            <button className="btn btn--primary" onClick={() => onUploadForClient(client)}>
              <Icons.Upload size={12}/>Upload first call
            </button>
          </div>
        ) : (
          <div className="card" style={{overflow: 'hidden'}}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{paddingLeft: 16}}>Title</th>
                  <th>Sentiment</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th style={{width: 30}}></th>
                </tr>
              </thead>
              <tbody>
                {clientCalls.map(c => (
                  <tr key={c.id} onClick={() => onOpenCall(c.id)}>
                    <td style={{paddingLeft: 16}}>
                      <div style={{fontWeight: 500}}>{c.title}</div>
                      <div style={{display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap'}}>
                        {c.tags.slice(0, 3).map(t => (
                          <span key={t} className="tag tag--soft" style={{height: 18, fontSize: 10, padding: '0 6px'}}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td><SentimentBar value={c.sentiment}/></td>
                    <td style={{color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums'}}>{c.date}</td>
                    <td style={{color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums'}}>{c.duration}</td>
                    <td><Icons.ChevronRight size={12} style={{color: 'var(--text-4)'}}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueEl }) {
  return (
    <div className="card" style={{padding: 16}}>
      <div style={{fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6}}>{label}</div>
      <div style={{fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums'}}>
        {valueEl || value}
      </div>
    </div>
  );
}

window.ClientsScreen = ClientsScreen;
window.ClientDetailScreen = ClientDetailScreen;
