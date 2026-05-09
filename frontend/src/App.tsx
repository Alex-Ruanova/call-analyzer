import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import "./styles.css";
import { RouterSidebar, Topbar } from "./components/components";
import { TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, useTweaks } from "./components/TweaksPanel";
import DashboardScreen from "./screens/DashboardScreen";
import ListScreen from "./screens/ListScreen";
import DetailScreen from "./screens/DetailScreen";
import UploadScreen from "./screens/UploadScreen";
import ClientsScreen from "./screens/ClientsScreen";
import ClientDetailScreen from "./screens/ClientDetailScreen";
import { useClients, useCalls } from "./api/hooks";

// ---- Breadcrumb override context ----
// Screens call useSetCrumbOverride to push a dynamic last breadcrumb segment.

interface CrumbContextValue {
  override: string | null;
  setOverride: (v: string | null) => void;
}
const CrumbContext = createContext<CrumbContextValue>({ override: null, setOverride: () => {} });
export function useSetCrumbOverride(text: string | null) {
  const { setOverride } = useContext(CrumbContext);
  // Run unconditionally — text may be null while loading
  useEffect(() => {
    setOverride(text);
    return () => setOverride(null);
  }, [text, setOverride]);
}

const queryClient = new QueryClient();

const TWEAK_DEFAULTS = {
  accent: "#10b981",
  density: "cozy" as const,
  moodViz: "ribbon" as const,
  sidebarCollapsed: false,
};

function AppShell() {
  const location = useLocation();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [crumbOverride, setCrumbOverride] = useState<string | null>(null);
  const setOverride = useCallback((v: string | null) => setCrumbOverride(v), []);
  const [pinnedClients, setPinnedClients] = useState<string[]>(() => {
    try {
      return (JSON.parse(localStorage.getItem("altur:pinnedClients") ?? "null") as string[] | null) ?? ["c1", "c3"];
    } catch {
      return ["c1", "c3"];
    }
  });

  const { data: clientsData } = useClients();
  const { data: callsData } = useCalls();

  const allClients = clientsData ?? [];
  const callsCount = callsData?.length ?? 0;
  const clientsCount = allClients.length;

  useEffect(() => {
    try {
      localStorage.setItem("altur:pinnedClients", JSON.stringify(pinnedClients));
    } catch {
      // ignore
    }
  }, [pinnedClients]);

  const togglePin = (id: string) =>
    setPinnedClients((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Apply tweaks
  useEffect(() => {
    const accent = t.accent;
    document.documentElement.style.setProperty("--accent", accent);
    const hex = accent.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    document.documentElement.style.setProperty("--accent-soft", `rgba(${r},${g},${b},0.14)`);
    document.documentElement.style.setProperty("--accent-glow", `rgba(${r},${g},${b},0.45)`);
    document.documentElement.dataset["density"] = t.density;
  }, [t.accent, t.density]);

  // Collapse sidebar on mobile — ref avoids re-registering the listener on every tweak change
  const sidebarCollapsedRef = useRef(t.sidebarCollapsed);
  sidebarCollapsedRef.current = t.sidebarCollapsed;

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.matchMedia("(max-width: 980px)").matches;
      if (isMobile && !sidebarCollapsedRef.current) setTweak("sidebarCollapsed", true);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setTweak]);

  // Build breadcrumbs from pathname, applying dynamic override for detail screens
  const crumbs = buildCrumbs(location.pathname, crumbOverride);

  return (
    <CrumbContext.Provider value={{ override: crumbOverride, setOverride }}>
    <div className="app" data-sidebar={t.sidebarCollapsed ? "collapsed" : "expanded"}>
      <RouterSidebar
        sidebarCollapsed={t.sidebarCollapsed}
        setSidebarCollapsed={(v) => setTweak("sidebarCollapsed", v)}
        pinnedClients={pinnedClients}
        allClients={allClients}
        callsCount={callsCount}
        clientsCount={clientsCount}
      />
      <main className="main">
        <Topbar
          crumbs={crumbs}
          onToggleSidebar={() => setTweak("sidebarCollapsed", !t.sidebarCollapsed)}
        />
        <div className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/calls" element={<ListScreen />} />
            <Route path="/calls/:id" element={<DetailScreen moodViz={t.moodViz} />} />
            <Route path="/upload" element={<UploadScreen />} />
            <Route
              path="/clients"
              element={
                <ClientsScreen pinnedClients={pinnedClients} onTogglePin={togglePin} />
              }
            />
            <Route
              path="/clients/:id"
              element={
                <ClientDetailScreen pinnedClients={pinnedClients} onTogglePin={togglePin} />
              }
            />
          </Routes>
        </div>
      </main>

      <TweaksPanel title="Tweaks">

        <TweakSection label="Theme" />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={["#10b981", "#22d3ee", "#a78bfa", "#f59e0b", "#f43f5e"]}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["cozy", "compact"]}
          onChange={(v) => setTweak("density", v as "cozy" | "compact")}
        />
        <TweakSection label="Layout" />
        <TweakRadio
          label="Mood viz"
          value={t.moodViz}
          options={["ribbon", "off"]}
          onChange={(v) => setTweak("moodViz", v as "ribbon" | "off")}
        />
        <TweakToggle
          label="Sidebar collapsed"
          value={t.sidebarCollapsed}
          onChange={(v) => setTweak("sidebarCollapsed", v)}
        />
      </TweaksPanel>
    </div>
    </CrumbContext.Provider>
  );
}

function buildCrumbs(pathname: string, override: string | null = null): string[] {
  if (pathname === "/" || pathname === "/dashboard") return ["Dashboard"];
  if (pathname === "/upload") return ["New analysis"];
  if (pathname === "/calls") return ["Calls"];
  if (pathname.startsWith("/calls/")) return ["Calls", override ?? "Call detail"];
  if (pathname === "/clients") return ["Clients"];
  if (pathname.startsWith("/clients/")) return ["Clients", override ?? "Client detail"];
  return ["Dashboard"];
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
