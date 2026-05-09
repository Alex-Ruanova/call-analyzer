/* global React, ReactDOM, Sidebar, Topbar, UploadScreen, ProcessingScreen, DetailScreen, ListScreen, DashboardScreen, ClientsScreen, ClientDetailScreen, useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, Icons */
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#10b981",
  "density": "cozy",
  "moodViz": "ribbon",
  "sidebarCollapsed": false
}/*EDITMODE-END*/;

function App() {
  const [route, setRoute] = useState('dashboard');
  const [activeClient, setActiveClient] = useState(null); // for client detail
  const [uploadPresetClient, setUploadPresetClient] = useState(null); // pre-fills upload step 2
  const [uploadedClient, setUploadedClient] = useState(null); // last uploaded client (for processing screen)
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [pinnedClients, setPinnedClients] = useState(() => {
    try { return JSON.parse(localStorage.getItem('altur:pinnedClients')) || ['client-1', 'client-3']; }
    catch (e) { return ['client-1', 'client-3']; }
  });
  useEffect(() => {
    try { localStorage.setItem('altur:pinnedClients', JSON.stringify(pinnedClients)); } catch (e) {}
  }, [pinnedClients]);
  const togglePin = (id) => setPinnedClients(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // Apply tweaks
  useEffect(() => {
    const accent = t.accent;
    document.documentElement.style.setProperty('--accent', accent);
    const hex = accent.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.14)`);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.45)`);
    document.documentElement.dataset.density = t.density;
  }, [t.accent, t.density]);

  // Navigation helpers
  const goUpload = (presetClient = null) => {
    setUploadPresetClient(presetClient);
    setRoute('upload');
  };
  const goClientDetail = (client) => {
    setActiveClient(client);
    setRoute('client-detail');
  };

  const crumbs = {
    dashboard: ['Dashboard'],
    upload: ['New analysis'],
    processing: ['New analysis', 'Analyzing'],
    detail: ['Calls', 'Discovery — Northwind × Altur'],
    list: ['Calls'],
    clients: ['Clients'],
    'client-detail': ['Clients', activeClient?.name || 'Client'],
  }[route];

  const actions = null;

  // Default-collapse sidebar on mobile
  useEffect(() => {
    const onResize = () => {
      const isMobile = window.matchMedia('(max-width: 980px)').matches;
      if (isMobile && !t.sidebarCollapsed) setTweak('sidebarCollapsed', true);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line
  }, []);

  // map route -> sidebar selection (clients-related routes both highlight Clients)
  const sidebarRoute = route === 'processing' ? 'upload'
                     : route === 'client-detail' ? 'clients'
                     : route;

  return (
    <div className="app" data-sidebar={t.sidebarCollapsed ? 'collapsed' : 'expanded'}>
      <div className="sidebar__backdrop" onClick={() => setTweak('sidebarCollapsed', true)}/>
      <Sidebar route={sidebarRoute}
        setRoute={(r) => {
          if (r === 'upload') { setUploadPresetClient(null); }
          setRoute(r);
          if (window.matchMedia('(max-width: 980px)').matches) setTweak('sidebarCollapsed', true);
        }}
        calls={ALTUR.CALLS} pinnedClients={pinnedClients}
        onOpenClient={(c) => {
          goClientDetail(c);
          if (window.matchMedia('(max-width: 980px)').matches) setTweak('sidebarCollapsed', true);
        }}/>
      <main className="main">
        <Topbar crumbs={crumbs} actions={actions} onToggleSidebar={() => setTweak('sidebarCollapsed', !t.sidebarCollapsed)}/>
        <div className="content">
          {route === 'dashboard'  && <DashboardScreen onOpenCall={() => setRoute('detail')}/>}
          {route === 'upload'     && (
            <UploadScreen
              presetClient={uploadPresetClient}
              onCancel={uploadPresetClient ? () => goClientDetail(uploadPresetClient) : null}
              onAnalyze={(client) => { setUploadedClient(client); setRoute('processing'); }}/>
          )}
          {route === 'processing' && <ProcessingScreen client={uploadedClient} onDone={() => setRoute('detail')}/>}
          {route === 'detail'     && <DetailScreen moodViz={t.moodViz}/>}
          {route === 'list'       && <ListScreen onOpenCall={() => setRoute('detail')} onUploadNew={() => goUpload(null)}/>}
          {route === 'clients'    && (
            <ClientsScreen
              pinnedClients={pinnedClients}
              onTogglePin={togglePin}
              onOpenClient={goClientDetail}
              onUploadForClient={(c) => goUpload(c)}/>
          )}
          {route === 'client-detail' && activeClient && (
            <ClientDetailScreen
              client={activeClient}
              isPinned={pinnedClients.includes(activeClient.id)}
              onTogglePin={togglePin}
              onBack={() => setRoute('clients')}
              onOpenCall={() => setRoute('detail')}
              onUploadForClient={(c) => goUpload(c)}/>
          )}
        </div>
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme"/>
        <TweakColor label="Accent" value={t.accent}
          options={['#10b981', '#22d3ee', '#a78bfa', '#f59e0b', '#f43f5e']}
          onChange={(v) => setTweak('accent', v)}/>
        <TweakRadio label="Density" value={t.density}
          options={['cozy', 'compact']}
          onChange={(v) => setTweak('density', v)}/>
        <TweakSection label="Layout"/>
        <TweakRadio label="Mood viz" value={t.moodViz}
          options={['ribbon', 'off']}
          onChange={(v) => setTweak('moodViz', v)}/>
        <TweakToggle label="Sidebar collapsed" value={t.sidebarCollapsed}
          onChange={(v) => setTweak('sidebarCollapsed', v)}/>
      </TweaksPanel>
    </div>
  );
}

const _rootEl = document.getElementById('root');
if (_rootEl) {
  if (!_rootEl._reactRoot) _rootEl._reactRoot = ReactDOM.createRoot(_rootEl);
  _rootEl._reactRoot.render(<App/>);
}
