/* global React, Icons, EmotionPill, EmotionDot */
const { useState, useEffect, useRef } = React;

// ============== UPLOAD SCREEN ==============
function UploadScreen({ onAnalyze, presetClient = null, onCancel }) {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const [client, setClient] = useState(presetClient);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientFilter, setClientFilter] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', industry: '', owner: '' });
  const [allClients, setAllClients] = useState(ALTUR.CLIENTS);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showClientPicker) return;
    const onClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowClientPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showClientPicker]);

  const accept = (f) => {
    if (!f) return;
    setFile({ name: f.name || 'northwind-discovery-mar15.mp3', size: f.size ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : '8.4 MB' });
  };

  const filteredClients = allClients.filter((c) =>
  !clientFilter || c.name.toLowerCase().includes(clientFilter.toLowerCase())
  );
  const canCreate = clientFilter.trim() && !allClients.some((c) => c.name.toLowerCase() === clientFilter.trim().toLowerCase());

  const handleCreateClient = () => {
    if (!newClient.name.trim()) return;
    const created = {
      id: `c-new-${Date.now()}`,
      name: newClient.name.trim(),
      industry: newClient.industry.trim() || '—',
      owner: newClient.owner.trim() || '—',
      calls: 0, lastCall: '—', sentiment: 0, stage: '—', arr: '—', health: 'on-track'
    };
    setAllClients([created, ...allClients]);
    setClient(created);
    setShowNewClient(false);
    setShowClientPicker(false);
    setNewClient({ name: '', industry: '', owner: '' });
    setClientFilter('');
  };

  const quickCreateFromFilter = () => {
    setNewClient({ name: clientFilter.trim(), industry: '', owner: '' });
    setShowNewClient(true);
  };

  const ready = !!file && !!client;

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>New analysis</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '6px 0 0' }}>Upload a sales call recording. Altur will transcribe, identify participants and analyze sentiment.</p>
        </div>
        {onCancel &&
        <button className="btn btn--ghost btn--sm" onClick={onCancel}><Icons.X size={12} />Cancel</button>
        }
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 12 }}>
        <Step n={1} label="Audio" done={!!file} active={!file} />
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <Step n={2} label="Client" done={!!client} active={!!file && !client} />
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <Step n={3} label="Analyze" done={false} active={ready} />
      </div>

      {/* Step 1: Audio */}
      <div
        onDragOver={(e) => {e.preventDefault();setDrag(true);}}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {e.preventDefault();setDrag(false);accept(e.dataTransfer.files[0]);}}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--border-2)'}`,
          background: drag ? 'var(--accent-soft)' : 'var(--bg-1)',
          borderRadius: 14,
          padding: file ? '24px 32px' : '56px 32px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 160ms ease'
        }}>
        <input ref={inputRef} type="file" accept=".mp3,.wav,audio/*" hidden onChange={(e) => accept(e.target.files[0])} />
        {!file &&
        <>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', margin: '0 auto 16px', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
              <Icons.Upload size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Drop your audio here, or click to browse</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>MP3 or WAV · up to 500 MB · max 4 hours</div>
          </>
        }
        {file &&
        <div className="fade-in" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
                <Icons.File size={16} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{file.size}</div>
              </div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={(e) => {e.stopPropagation();setFile(null);}}>
              <Icons.X size={11} />Replace
            </button>
          </div>
        }
      </div>

      {/* Step 2: Client (required) — only after file is uploaded */}
      {file &&
      <div style={{ marginTop: 16 }} className="fade-in">
        <div style={{
          padding: 16,
          border: `1px solid ${client ? 'var(--border-2)' : 'var(--accent)'}`,
          background: client ? 'var(--bg-1)' : 'var(--accent-soft)',
          borderRadius: 14,
          transition: 'all 160ms ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: client ? 'var(--bg-2)' : 'var(--bg-1)', border: '1px solid var(--border-2)', display: 'grid', placeItems: 'center', color: client ? 'var(--accent)' : 'var(--text-3)' }}>
                <Icons.Building size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {client ?
                <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{client.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                      {client.industry !== '—' ? client.industry : 'No industry'}
                      {client.owner && client.owner !== '—' && <> · {client.owner}</>}
                    </div>
                  </> :

                <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Assign to a client <span style={{ color: 'var(--accent)', fontWeight: 500 }}>·</span> <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 11.5 }}>required</span></div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Pick an existing client or create a new one to continue.</div>
                  </>
                }
              </div>
            </div>
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <button
                className={client ? 'btn btn--sm' : 'btn btn--primary btn--sm'}
                onClick={(e) => {e.stopPropagation();setShowClientPicker(!showClientPicker);}}
                disabled={!presetClient ? false : true}
                style={presetClient ? { opacity: 0.5, pointerEvents: 'none' } : null}>
                {client ? 'Change' : 'Choose client'}
                <Icons.ChevronDown size={11} />
              </button>
              {showClientPicker &&
              <div className="menu" style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 280, zIndex: 50, opacity: "6" }}>
                  <div style={{ padding: 6 }}>
                    <input autoFocus className="input" placeholder="Search clients…"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  style={{ height: 28, fontSize: 12.5 }} />
                  </div>
                  <div className="menu__divider" />
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {filteredClients.map((c) =>
                  <button key={c.id} className="menu__item"
                  onClick={() => {setClient(c);setShowClientPicker(false);setClientFilter('');}}>
                        <div className="avatar avatar--sm" style={{ background: 'var(--bg-3)', color: 'var(--text-2)', fontSize: 10 }}>
                          {c.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{c.industry !== '—' ? c.industry : 'No industry'}</div>
                        </div>
                        {client?.id === c.id && <Icons.Check size={11} style={{ color: 'var(--accent)' }} />}
                      </button>
                  )}
                    {filteredClients.length === 0 && !canCreate &&
                  <div style={{ padding: 16, fontSize: 12, color: 'var(--text-4)', textAlign: 'center' }}>No matches</div>
                  }
                  </div>
                  <div className="menu__divider" />
                  <button className="menu__item" onClick={() => canCreate ? quickCreateFromFilter() : (setShowNewClient(true), setShowClientPicker(false))}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
                      <Icons.Plus size={11} />
                    </div>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      {canCreate ? <>Create "<strong>{clientFilter.trim()}</strong>"</> : 'New client…'}
                    </span>
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
      }

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-3)' }}>
          {!file && 'Step 1 — choose an audio file.'}
          {file && !client && <span style={{ color: 'var(--accent)' }}>Step 2 — assign a client to continue.</span>}
          {ready && 'Ready to analyze.'}
        </div>
        {!file &&
        <button className="btn" onClick={(e) => {e.stopPropagation();accept({ name: 'northwind-discovery-mar15.mp3' });}}>Use sample</button>
        }
        <button className="btn btn--primary" disabled={!ready} onClick={() => onAnalyze(client)} style={!ready ? { opacity: 0.45, pointerEvents: 'none' } : null}>
          Analyze <Icons.ChevronRight size={13} />
        </button>
      </div>

      {/* New client modal */}
      {showNewClient &&
      <NewClientModal
        value={newClient}
        onChange={setNewClient}
        onCancel={() => {setShowNewClient(false);setNewClient({ name: '', industry: '', owner: '' });}}
        onCreate={handleCreateClient} />
      }
    </div>);

}

function Step({ n, label, done, active }) {
  const color = done ? 'var(--accent)' : active ? 'var(--text)' : 'var(--text-4)';
  const bg = done ? 'var(--accent)' : active ? 'var(--bg-2)' : 'transparent';
  const border = done ? 'var(--accent)' : active ? 'var(--border-2)' : 'var(--border)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: bg, border: `1px solid ${border}`,
        display: 'grid', placeItems: 'center',
        color: done ? 'var(--accent-fg)' : color,
        fontSize: 11, fontWeight: 600,
        transition: 'all 160ms ease'
      }}>
        {done ? <Icons.Check size={11} /> : n}
      </div>
      <span style={{ color, fontWeight: active || done ? 500 : 400, fontSize: 12.5 }}>{label}</span>
    </div>);

}

function NewClientModal({ value, onChange, onCancel, onCreate }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'grid', placeItems: 'center', zIndex: 200, padding: 20
    }} onClick={onCancel}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ padding: 22, width: '100%', maxWidth: 420, background: 'var(--bg-0)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>New client</h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>Only the name is required. You can fill in the rest later.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Client name" required>
            <input autoFocus className="input" placeholder="e.g. Acme Corp"
            value={value.name} onChange={(e) => set('name', e.target.value)}
            onKeyDown={(e) => {if (e.key === 'Enter' && value.name.trim()) onCreate();}} />
          </Field>
          <Field label="Industry" optional>
            <input className="input" placeholder="e.g. Healthcare"
            value={value.industry} onChange={(e) => set('industry', e.target.value)} />
          </Field>
          <Field label="Owner" optional>
            <input className="input" placeholder="e.g. Maya Chen"
            value={value.owner} onChange={(e) => set('owner', e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn--primary" disabled={!value.name.trim()}
          style={!value.name.trim() ? { opacity: 0.45, pointerEvents: 'none' } : null}
          onClick={onCreate}>Create client</button>
        </div>
      </div>
    </div>);

}

function Field({ label, required, optional, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>*</span>}
        {optional && <span style={{ color: 'var(--text-4)', marginLeft: 4, fontWeight: 400 }}>optional</span>}
      </span>
      {children}
    </label>);

}

// ============== PROCESSING SCREEN ==============
function ProcessingScreen({ onDone, client }) {
  const [pct, setPct] = useState(0);
  const [step, setStep] = useState(0);
  const steps = [
  'Decoding audio',
  'Transcribing speech',
  'Identifying participants',
  'Analyzing sentiment',
  'Extracting insights'];

  useEffect(() => {
    const start = Date.now();
    const total = 4200;
    const i = setInterval(() => {
      const e = Date.now() - start;
      const p = Math.min(100, e / total * 100);
      setPct(p);
      setStep(Math.min(steps.length - 1, Math.floor(p / 100 * steps.length)));
      if (p >= 100) {
        clearInterval(i);
        setTimeout(onDone, 380);
      }
    }, 60);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ display: 'inline-grid', placeItems: 'center', position: 'relative', marginBottom: 18 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" stroke="var(--bg-3)" strokeWidth="3" fill="none" />
            <circle cx="40" cy="40" r="34" stroke="var(--accent)" strokeWidth="3" fill="none"
            strokeDasharray={2 * Math.PI * 34}
            strokeDashoffset={2 * Math.PI * 34 * (1 - pct / 100)}
            transform="rotate(-90 40 40)"
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 60ms linear' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {Math.floor(pct)}%
          </div>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Analyzing your call</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '6px 0 0' }}>
          {client ? <>Linking to <strong style={{ color: 'var(--text-2)' }}>{client.name}</strong>. </> : null}
          This usually takes about 30 seconds for a 5-minute call.
        </p>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending';
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: state === 'pending' ? 0.4 : 1, transition: 'opacity 200ms' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: state === 'done' ? 'var(--accent)' : 'var(--bg-3)', border: state === 'active' ? '1.5px solid var(--accent)' : '1px solid var(--border)' }}>
                  {state === 'done' && <Icons.Check size={11} style={{ color: 'var(--accent-fg)' }} />}
                  {state === 'active' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-soft 1.2s infinite' }} />}
                </div>
                <div style={{ fontSize: 13, color: state === 'pending' ? 'var(--text-3)' : 'var(--text)', fontWeight: state === 'active' ? 500 : 400 }}>{s}</div>
                {state === 'done' && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>0.{i + 1}s</span>}
              </div>);

          })}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 12, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
        <span className="dot" style={{ background: 'var(--accent)', marginRight: 6, verticalAlign: 'middle' }} />
        northwind-discovery-mar15.mp3 · 8.4 MB
      </div>
    </div>);

}

window.UploadScreen = UploadScreen;
window.ProcessingScreen = ProcessingScreen;
window.NewClientModal = NewClientModal;