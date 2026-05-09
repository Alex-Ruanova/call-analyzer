/* global React, Icons, Sparkline */
const { useMemo } = React;

// ============== DASHBOARD ==============
function DashboardScreen({ onOpenCall }) {
  const d = ALTUR.DASHBOARD;
  return (
    <div style={{padding: 28, display: 'flex', flexDirection: 'column', gap: 22}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <div>
          <h1 style={{fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.02em'}}>Dashboard</h1>
          <p style={{margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-3)'}}>An overview of your team's sales conversations.</p>
        </div>
        <div style={{flex: 1}}/>
        <button className="btn btn--sm"><Icons.Clock size={11}/>Last 14 days</button>
        <button className="btn btn--primary"><Icons.Plus size={13}/>New analysis</button>
      </div>

      {/* KPIs */}
      <div className="dash-kpis" style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14}}>
        {d.kpis.map((k, i) => (
          <div key={k.label} className="card" style={{padding: 18}}>
            <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'}}>
              <div>
                <div style={{fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6}}>{k.label}</div>
                <div style={{fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums'}}>{k.value}</div>
                <div style={{fontSize: 11.5, color: k.positive ? 'var(--accent)' : '#f43f5e', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4}}>
                  {k.positive ? <Icons.TrendingUp size={11}/> : <Icons.TrendingDown size={11}/>}
                  {k.delta} <span style={{color: 'var(--text-4)'}}>vs last week</span>
                </div>
              </div>
              <Sparkline data={k.spark} width={70} height={32} color={k.positive ? '#10b981' : '#f43f5e'}/>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 — sentiment trend + calls per day */}
      <div className="dash-row" style={{display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14}}>
        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Average sentiment trend</div>
              <div className="card__subtitle">Last 12 weeks · across all calls</div>
            </div>
            <div style={{flex: 1}}/>
            <span className="pill" style={{background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', borderColor: 'transparent'}}>+0.23</span>
          </div>
          <div className="card__body">
            <BigSparkline data={d.sentimentTrend} height={170}/>
          </div>
        </div>
        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Calls per day</div>
              <div className="card__subtitle">Last 14 days</div>
            </div>
          </div>
          <div className="card__body">
            <BarChart data={d.callsPerDay} height={170}/>
          </div>
        </div>
      </div>

      {/* Row 3 — recent calls */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">Recent calls</div>
          <div style={{flex: 1}}/>
          <button className="btn btn--ghost btn--sm">View all <Icons.ChevronRight size={11}/></button>
        </div>
        <table className="table">
          <thead><tr><th style={{paddingLeft: 16}}>Title</th><th>Client</th><th>Sentiment</th><th>Date</th></tr></thead>
          <tbody>
            {ALTUR.CALLS.slice(0, 5).map(c => (
              <tr key={c.id} onClick={() => onOpenCall(c.id)}>
                <td style={{paddingLeft: 16, fontWeight: 500}}>{c.title}</td>
                <td style={{color: 'var(--text-2)'}}>{c.client}</td>
                <td>{<Spark sentiment={c.sentiment}/>}</td>
                <td style={{color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums'}}>{c.date}</td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Spark({ sentiment }) {
  const pct = Math.round(((sentiment + 1) / 2) * 100);
  const color = sentiment > 0.4 ? '#10b981' : sentiment > 0 ? '#a3e635' : sentiment > -0.3 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
      <div style={{width: 50, height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden'}}>
        <div style={{width: `${pct}%`, height: '100%', background: color}}/>
      </div>
      <span style={{fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums'}}>{sentiment > 0 ? '+' : ''}{sentiment.toFixed(2)}</span>
    </div>
  );
}

function BigSparkline({ data, height = 160 }) {
  const w = 600;
  const pad = 24;
  const min = Math.min(...data) - 0.05;
  const max = Math.max(...data) + 0.05;
  const range = max - min;
  const stepX = (w - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => [pad + i * stepX, height - pad - ((v - min) / range) * (height - pad * 2)]);
  const path = points.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  const area = `${path} L ${points[points.length-1][0]} ${height - pad} L ${points[0][0]} ${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = pad + t * (height - pad * 2);
        return <line key={t} x1={pad} y1={y} x2={w - pad} y2={y} stroke="var(--border)" strokeWidth="1"/>;
      })}
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkfill)"/>
      <path d={path} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#10b981" stroke="var(--bg)" strokeWidth="1.5"/>
      ))}
    </svg>
  );
}

function BarChart({ data, height = 160 }) {
  const max = Math.max(...data);
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 4, height}}>
      {data.map((v, i) => (
        <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%'}}>
          <div style={{flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end'}}>
            <div style={{width: '100%', height: `${(v / max) * 100}%`, background: i === data.length - 1 ? 'var(--accent)' : 'rgba(16,185,129,0.4)', borderRadius: '3px 3px 0 0', transition: 'height 300ms'}} title={`${v} calls`}/>
          </div>
          <span style={{fontSize: 9, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums'}}>{14 - i}</span>
        </div>
      ))}
    </div>
  );
}

function Pipeline({ data }) {
  const totalValue = data.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div style={{display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 14}}>
        {data.map(p => (
          <div key={p.stage} style={{flex: p.value || 0.1, background: p.color, opacity: 0.85}} title={`${p.stage}: $${(p.value/1000).toFixed(0)}k`}/>
        ))}
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {data.map(p => {
          const pct = totalValue > 0 ? Math.round((p.value / totalValue) * 100) : 0;
          return (
            <div key={p.stage} style={{display: 'flex', alignItems: 'center', gap: 10}}>
              <span className="dot" style={{background: p.color, width: 8, height: 8}}/>
              <span style={{fontSize: 12.5, flex: 1, color: 'var(--text-2)'}}>{p.stage}</span>
              <span style={{fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', width: 32, textAlign: 'right'}}>{p.count}</span>
              <span style={{fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', width: 70, textAlign: 'right'}}>${(p.value/1000).toFixed(0)}k</span>
              <span style={{fontSize: 10.5, color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right'}}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
