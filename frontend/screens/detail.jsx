/* global React, Icons, EmotionPill, EmotionDot, SentimentBar, TagEditor, ClientPicker */
const { useState, useEffect, useRef, useMemo } = React;

// ============== CALL DETAIL SCREEN ==============
function DetailScreen({ moodViz = 'ribbon' }) {
  const call = ALTUR.SAMPLE_CALL;
  const [title, setTitle] = useState(call.title);
  const [tags, setTags] = useState(call.tags);
  const [client, setClient] = useState(call.client);
  const [actions, setActions] = useState(call.actionItems);
  const [participants, setParticipants] = useState(call.participants);
  const [notes, setNotes] = useState(call.comments);
  const [newNote, setNewNote] = useState('');
  const [tab, setTab] = useState('summary'); // summary | insights | emotions | notes
  const [search, setSearch] = useState('');
  const [activeIdx, setActiveIdx] = useState(2);
  const [editingTitle, setEditingTitle] = useState(false);
  const [tagFilter, setTagFilter] = useState(null); // filter transcript by highlight tag
  const turnRefs = useRef({});
  const scrollerRef = useRef(null);

  const jumpTo = (idx, opts = {}) => {
    setActiveIdx(idx);
    if (opts.tab) setTab(opts.tab);
    // scroll within the transcript scroller, not the page
    requestAnimationFrame(() => {
      const el = turnRefs.current[idx];
      const scroller = scrollerRef.current;
      if (el && scroller) {
        const top = el.offsetTop - scroller.offsetTop - 12;
        scroller.scrollTo({ top, behavior: 'smooth' });
      }
    });
  };

  // simulated playback removed — audio is no longer stored.

  const transcript = ALTUR.SAMPLE_TRANSCRIPT;
  const filtered = transcript.filter((m) => {
    if (search && !m.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const tagCounts = useMemo(() => {
    const c = {};
    transcript.forEach((m) => (m.tags || []).forEach((t) => {c[t] = (c[t] || 0) + 1;}));
    return c;
  }, [transcript]);

  return (
    <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 530px) minmax(0, 1fr)', height: '100%', minHeight: 0 }}>
      {/* LEFT — TRANSCRIPT */}
      <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-1)' }}>
        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: "21px 22px 14px" }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Transcript</span>
          </div>

          {editingTitle ?
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setEditingTitle(false)} onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
          style={{ fontSize: 18, fontWeight: 600, background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 8px', margin: '-4px -8px', width: 'calc(100% + 16px)', color: 'var(--text)', outline: 'none' }} /> :

          <h1 onClick={() => setEditingTitle(true)} style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.01em', cursor: 'text', padding: '4px 8px', margin: '-4px -8px', borderRadius: 6 }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              {title}
            </h1>
          }

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <ClientPicker value={client} onChange={setClient} />
            <TagEditor tags={tags} allTags={ALTUR.ALL_TAGS} onChange={setTags} />
          </div>

          {!client && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.10)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: 'rgba(245, 158, 11, 0.18)', color: 'var(--warn)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <Icons.AlertTriangle size={13}/>
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 12.5, fontWeight: 600, color: 'var(--text)'}}>This call isn't assigned to a client</div>
                <div style={{fontSize: 11.5, color: 'var(--text-3)', marginTop: 1}}>Pick a client above so insights link to their record.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, fontSize: 11.5, color: 'var(--text-3)' }}>
            <span><Icons.Clock size={11} style={{ verticalAlign: '-2px', marginRight: 4 }} />{call.date} · {call.time}</span>
            <span>·</span>
            <span>{call.duration}</span>
            <span>·</span>
            <span>{call.language}</span>
          </div>

          {/* Audio removed — only the transcript is retained. */}

          {/* Mood ribbon */}
          {moodViz === 'ribbon' &&
          <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)' }}>Mood timeline</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(ALTUR.EMOTIONS).slice(0, 4).map(([k, e]) =>
                <span key={k} className="emo" style={{ fontSize: 9.5 }}>
                      <span className="dot" style={{ background: e.dot, width: 5, height: 5 }} />{e.label}
                    </span>
                )}
                </div>
              </div>
              <div style={{ display: 'flex', height: 14, gap: 1.5, borderRadius: 4, overflow: 'hidden' }}>
                {call.emotionTimeline.map((emo, i) =>
              <div key={i} style={{ flex: 1, background: ALTUR.EMOTIONS[emo].dot, opacity: 0.85 }} title={ALTUR.EMOTIONS[emo].label} />
              )}
              </div>
            </div>
          }

          {/* Search */}
          <div className="field" style={{ marginTop: 12 }}>
            <Icons.Search className="field__icon" />
            <input className="input input--search" placeholder="Search transcript…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Transcript body */}
        <div ref={scrollerRef} className="transcript-pane" style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 22px' }}>
          {filtered.map((m, i) => {
            const realIdx = transcript.indexOf(m);
            const p = call.participants.find((p) => p.name === m.name) || call.participants[0];
            const isClient = m.s === 'client';
            const turnTags = m.tags || [];
            return (
              <div key={i} ref={(el) => {if (el) turnRefs.current[realIdx] = el;}}
              className={realIdx === activeIdx ? 'fade-in' : ''} onClick={() => setActiveIdx(realIdx)}
              style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: realIdx === activeIdx ? 'rgba(16,185,129,0.04)' : 'transparent',
                margin: '0 -10px', paddingLeft: 10, paddingRight: 10, borderRadius: 6,
                scrollMarginTop: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div className="avatar avatar--xs" style={{ background: p.color, color: '#08080a' }}>{p.initials}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.name}</div>
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{p.role}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{m.t}</span>
                  <EmotionDot emo={m.emo} />
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: realIdx === activeIdx ? 'var(--text)' : 'var(--text-2)', paddingLeft: 26, textWrap: 'pretty' }}>
                  {search ? highlight(m.text, search) : m.text}
                </div>
              </div>);

          })}
        </div>
      </div>

      {/* RIGHT — ANALYSIS */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 22px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          {[
          { k: 'summary', label: 'Summary', icon: Icons.Sparkles },
          { k: 'insights', label: 'Insights', icon: Icons.Eye },
          { k: 'emotions', label: 'Emotions', icon: Icons.TrendingUp },
          { k: 'notes', label: 'Notes', icon: Icons.Edit, count: notes.length }].
          map((t) =>
          <button key={t.k} onClick={() => setTab(t.k)}
          style={{
            background: 'transparent', border: 'none', color: tab === t.k ? 'var(--text)' : 'var(--text-3)',
            fontSize: 12.5, fontWeight: tab === t.k ? 600 : 500, padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 6,
            borderBottom: `1.5px solid ${tab === t.k ? 'var(--accent)' : 'transparent'}`,
            marginBottom: -1
          }}>
              <t.icon size={13} />
              {t.label}
              {t.count != null && <span className="navitem__count" style={{ marginLeft: 2 }}>{t.count}</span>}
            </button>
          )}
        </div>

        <div className="analysis-pane" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '22px 26px', minWidth: 0 }}>
          {tab === 'summary' && <SummaryTab call={call} actions={actions} setActions={setActions} participants={participants} setParticipants={setParticipants} />}
          {tab === 'insights' && <InsightsTab call={call} jumpTo={jumpTo} />}
          {tab === 'emotions' && <EmotionsTab call={call} />}
          {tab === 'notes' && <NotesTab notes={notes} setNotes={setNotes} newNote={newNote} setNewNote={setNewNote} />}
        </div>
      </div>
    </div>);

}

function highlight(text, q) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
  p.toLowerCase() === q.toLowerCase() ?
  <mark key={i} style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 2px', borderRadius: 2 }}>{p}</mark> :
  p
  );
}

// ----------- Summary Tab -----------
function SummaryTab({ call, actions, setActions, participants, setParticipants }) {
  const updateP = (i, patch) => setParticipants(ps => ps.map((p, idx) => idx === i ? { ...p, ...patch, initials: (patch.name || p.name).split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase() } : p));
  const removeP = (i) => setParticipants(ps => ps.filter((_, idx) => idx !== i));
  const addP = () => setParticipants(ps => [...ps, { name: 'New person', role: '', side: 'rep', color: '#a78bfa', initials: 'NP' }]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Section icon={Icons.Sparkles} title="Recap">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-2)', textWrap: 'pretty' }}>
          {call.summary}
        </p>
      </Section>

      <Section icon={Icons.Check} title="Action items" count={actions.length}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {actions.map((a, i) =>
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < actions.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <button onClick={() => setActions(actions.map((x, idx) => idx === i ? { ...x, done: !x.done } : x))}
            className={`checkbox ${a.done ? 'checkbox--on' : ''}`} style={{ marginTop: 2 }}>
                {a.done && <Icons.Check size={9} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: a.done ? 'var(--text-3)' : 'var(--text)', textDecoration: a.done ? 'line-through' : 'none', textWrap: 'pretty' }}>{a.text}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>Due {a.due}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      <div className="pair-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <Section icon={Icons.AlertTriangle} title="Pain points" tone="warn">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {call.painPoints.map((p, i) =>
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-2)', textWrap: 'pretty' }}>
                <span style={{ color: '#f59e0b', flex: 'none', marginTop: 1 }}>—</span>{p}
              </li>
            )}
          </ul>
        </Section>

        <Section icon={Icons.TrendingUp} title="Underlying needs">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {call.needs.map((p, i) =>
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-2)', textWrap: 'pretty' }}>
                <span style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }}>—</span>{p}
              </li>
            )}
          </ul>
        </Section>

        <Section icon={Icons.Sparkles} title="Feature requests">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {call.featureRequests.map((p, i) =>
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-2)', textWrap: 'pretty' }}>
                <span style={{ color: '#22d3ee', flex: 'none', marginTop: 1 }}>—</span>{p}
              </li>
            )}
          </ul>
        </Section>

        <Section icon={Icons.TrendingUp} title="Opportunities" tone="good">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {call.opportunities.map((p, i) =>
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-2)', textWrap: 'pretty' }}>
                <span style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }}>—</span>{p}
              </li>
            )}
          </ul>
        </Section>
      </div>

      {/* Transcript info */}
      <Section icon={Icons.File} title="Transcript information" defaultOpen={false} collapsible>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 12.5 }}>
          <span style={{ color: 'var(--text-3)' }}>Duration</span><span>{call.duration}</span>
          <span style={{ color: 'var(--text-3)' }}>Language</span><span>{call.language}</span>
          <span style={{ color: 'var(--text-3)' }}>Processed</span><span>{call.date} at {call.time}</span>
          <span style={{ color: 'var(--text-3)' }}>Audio</span><span style={{ color: 'var(--text-3)' }}>Not retained — transcript only</span>
          <span style={{ color: 'var(--text-3)' }}>Participants</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {participants.map((p, i) =>
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="avatar avatar--xs" style={{ background: p.color, color: '#08080a' }}>{p.initials}</div>
                <input className="input" value={p.name} onChange={e => updateP(i, { name: e.target.value })} placeholder="Name" style={{ height: 24, fontSize: 12, fontWeight: 500, width: 140, padding: '0 6px' }}/>
                <input className="input" value={p.role} onChange={e => updateP(i, { role: e.target.value })} placeholder="Role" style={{ height: 24, fontSize: 11.5, flex: 1, padding: '0 6px' }}/>
                <select value={p.side} onChange={e => updateP(i, { side: e.target.value })} className="input" style={{ height: 24, fontSize: 11, width: 90, padding: '0 4px' }}>
                  <option value="rep">Internal</option>
                  <option value="client">Customer</option>
                </select>
                <button className="iconbtn" title="Remove" onClick={() => removeP(i)} style={{ width: 24, height: 24 }}><Icons.Trash size={11}/></button>
              </div>
            )}
            <button className="btn btn--ghost btn--sm" onClick={addP} style={{ alignSelf: 'flex-start', height: 24, fontSize: 11 }}><Icons.Plus size={10}/>Add participant</button>
          </div>
        </div>
      </Section>
    </div>);

}

function Section({ icon: I, title, count, tone, children, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const tones = {
    warn: '#f59e0b',
    good: 'var(--accent)'
  };
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: collapsible ? 'pointer' : 'default' }} onClick={() => collapsible && setOpen((o) => !o)}>
        {I && <I size={13} style={{ color: tones[tone] || 'var(--text-3)' }} />}
        <h3 style={{ fontSize: 12, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-2)' }}>{title}</h3>
        {count != null && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{count}</span>}
        {collapsible && <Icons.ChevronDown size={12} style={{ marginLeft: 'auto', color: 'var(--text-3)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }} />}
      </div>
      {open && children}
    </section>);

}

// ----------- Insights Tab -----------
function InsightsTab({ call, jumpTo }) {
  const meta = {
    'buying-signal': { icon: Icons.TrendingUp, color: 'var(--accent)', label: 'Buying signal' },
    'objection': { icon: Icons.AlertTriangle, color: '#f59e0b', label: 'Objection' },
    'risk': { icon: Icons.AlertTriangle, color: '#f43f5e', label: 'Risk' },
    'highlight': { icon: Icons.Bookmark, color: '#a78bfa', label: 'Highlight' }
  };
  const transcript = ALTUR.SAMPLE_TRANSCRIPT;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Section icon={Icons.Eye} title="Key insights" count={call.insights.length}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {call.insights.map((ins, i) => {
            const m = meta[ins.kind];
            const turn = ins.jumpTo != null ? transcript[ins.jumpTo] : null;
            const clickable = !!turn && jumpTo;
            return (
              <div key={i} className="card" onClick={clickable ? () => jumpTo(ins.jumpTo) : undefined}
              style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `2px solid ${m.color}`, cursor: clickable ? 'pointer' : 'default', transition: 'background 120ms' }}
              onMouseEnter={(e) => clickable && (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => clickable && (e.currentTarget.style.background = '')}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg-3)', display: 'grid', placeItems: 'center', color: m.color, flex: 'none' }}>
                  <m.icon size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: m.color, fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, textWrap: 'pretty' }}>{ins.text}</div>
                  {turn &&
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
                      <Icons.Play size={9} style={{ color: m.color }} />
                      <span style={{ fontFamily: 'var(--font-mono)', color: m.color, fontVariantNumeric: 'tabular-nums' }}>{turn.t}</span>
                      <span style={{ color: 'var(--text-4)' }}>·</span>
                      <span style={{ color: 'var(--text-3)' }}>{turn.name}</span>
                      <span style={{ color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{turn.text.slice(0, 60)}{turn.text.length > 60 ? '…' : ''}"</span>
                    </div>
                  }
                </div>
                {clickable && <Icons.ChevronDown size={12} style={{ color: 'var(--text-4)', transform: 'rotate(-90deg)', flex: 'none', marginTop: 4 }} />}
              </div>);

          })}
        </div>
      </Section>

      <Section icon={Icons.Mic} title="Talk ratio">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '8px 0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: `${call.talkRatio.rep}%`, background: 'var(--accent)' }} title={`Rep: ${call.talkRatio.rep}%`} />
              <div style={{ width: `${call.talkRatio.client}%`, background: '#22d3ee' }} title={`Client: ${call.talkRatio.client}%`} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
              <span><span className="dot" style={{ background: 'var(--accent)', marginRight: 6 }} />Rep · {call.talkRatio.rep}%</span>
              <span><span className="dot" style={{ background: '#22d3ee', marginRight: 6 }} />Client · {call.talkRatio.client}%</span>
            </div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Health</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginTop: 2 }}>Healthy</div>
          </div>
        </div>
      </Section>

    </div>);

}

// ----------- Emotions Tab -----------
function EmotionsTab({ call }) {
  const total = Object.values(call.emotionDistribution).reduce((a, b) => a + b, 0);
  const clientEmotions = { positive: 22, excited: 14, neutral: 12, hesitant: 16, confused: 5, frustrated: 5, negative: 0 };
  const repEmotions = { positive: 28, excited: 0, neutral: 10, hesitant: 0, confused: 0, frustrated: 0, negative: 0 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* HERO — overall sentiment */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Overall sentiment</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1 }}>+0.62</div>
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Net Positive</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Trended positive in 4 of 5 segments</div>
          </div>
        </div>
        <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          {call.emotionTimeline.map((emo, i) =>
          <div key={i} style={{ flex: 1, background: ALTUR.EMOTIONS[emo].dot, opacity: 0.85 }} title={`${ALTUR.EMOTIONS[emo].label} · segment ${i + 1}`} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-4)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          <span>00:00</span><span>{call.duration}</span>
        </div>
      </div>

      {/* Distribution */}
      <Section icon={Icons.TrendingUp} title="Emotion distribution">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(call.emotionDistribution).map(([k, v]) => {
            const e = ALTUR.EMOTIONS[k];
            const pct = Math.round(v / total * 100);
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 80, fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="dot" style={{ background: e.dot }} />{e.label}
                </div>
                <div style={{ flex: 1, height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: e.dot, transition: 'width 400ms' }} />
                </div>
                <span style={{ width: 36, textAlign: 'right', fontSize: 11.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
              </div>);

          })}
        </div>
      </Section>

      {/* By side — client vs rep */}
      <div className="pair-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <Section icon={Icons.Users} title="Client side" tone="good">
          <EmotionMini emotions={clientEmotions} />
        </Section>
        <Section icon={Icons.Mic} title="Rep side">
          <EmotionMini emotions={repEmotions} />
        </Section>
      </div>

      {/* Dips */}
      <Section icon={Icons.AlertTriangle} title="Sentiment dips" count={2} tone="warn">
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}>Both dips were resolved positively.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DipItem time="00:39" speaker="Daniel" emotion="frustrated" text="Managers spend 4 hrs/week scrubbing recordings…" recovery="Resolved at 01:02 by Maya" />
          <DipItem time="01:24" speaker="Daniel" emotion="hesitant" text="What about Spanish-language calls?" recovery="Resolved at 01:41 by Maya" />
        </div>
      </Section>
    </div>);

}
function EmotionMini({ emotions }) {
  const total = Object.values(emotions).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Object.entries(emotions).filter(([, v]) => v > 0).map(([k, v]) => {
        const e = ALTUR.EMOTIONS[k];
        const pct = Math.round(v / total * 100);
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="dot" style={{ background: e.dot }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-2)', flex: 1 }}>{e.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
          </div>);

      })}
    </div>);

}
function DipItem({ time, speaker, emotion, text, recovery }) {
  const e = ALTUR.EMOTIONS[emotion];
  return (
    <div style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{time}</span>
        <span style={{ fontSize: 11.5, fontWeight: 500 }}>{speaker}</span>
        <span className="dot" style={{ background: e.dot }} />
        <span style={{ fontSize: 11, color: e.dot }}>{e.label}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>"{text}"</div>
      <div style={{ fontSize: 10.5, color: 'var(--accent)' }}>↳ {recovery}</div>
    </div>);

}

// ----------- Notes Tab -----------
function NotesTab({ notes, setNotes, newNote, setNewNote }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [editText, setEditText] = useState('');
  const submit = () => {
    if (!newNote.trim()) return;
    const now = new Date();
    const when = 'Just now';
    setNotes([...notes, { when, text: newNote.trim() }]);
    setNewNote('');
  };
  const startEdit = (i) => { setEditingIdx(i); setEditText(notes[i].text); };
  const saveEdit = () => {
    if (!editText.trim()) return;
    setNotes(notes.map((n, idx) => idx === editingIdx ? { ...n, text: editText.trim() } : n));
    setEditingIdx(null);
  };
  const removeNote = (i) => setNotes(notes.filter((_, idx) => idx !== i));
  return (
    <div style={{ maxWidth: 720 }}>
      <Section icon={Icons.Edit} title="My notes" count={notes.length}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.length === 0 &&
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12.5, border: '1px dashed var(--border)', borderRadius: 10 }}>
              No notes yet. Add a private note about this call below.
            </div>
          }
          {notes.map((n, i) =>
          <div key={i} className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>{n.when}</span>
                <div style={{ flex: 1 }} />
                {editingIdx !== i && <>
                  <button className="iconbtn" title="Edit" onClick={() => startEdit(i)} style={{ width: 22, height: 22 }}><Icons.Edit size={11}/></button>
                  <button className="iconbtn" title="Delete" onClick={() => removeNote(i)} style={{ width: 22, height: 22 }}><Icons.Trash size={11}/></button>
                </>}
              </div>
              {editingIdx === i ?
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows="3"
                    style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(); if (e.key === 'Escape') setEditingIdx(null); }} autoFocus />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn--sm btn--ghost" onClick={() => setEditingIdx(null)}>Cancel</button>
                    <button className="btn btn--sm btn--primary" onClick={saveEdit}>Save</button>
                  </div>
                </div>
              :
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, textWrap: 'pretty', whiteSpace: 'pre-wrap' }}>{n.text}</div>
              }
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Write a note for yourself about this call…" rows="3"
            style={{ background: 'transparent', border: 'none', width: '100%', resize: 'none', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Only you can see your notes · <span className="kbd">⌘</span> <span className="kbd">↵</span> to save</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn--sm btn--primary" onClick={submit} disabled={!newNote.trim()}>
              <Icons.Plus size={11} />Add note
            </button>
          </div>
        </div>
      </Section>
    </div>);

}

window.DetailScreen = DetailScreen;