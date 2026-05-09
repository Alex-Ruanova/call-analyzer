import { createContext, useContext, useState, useCallback, useRef } from "react";

interface ToastState {
  message: string;
  type: "error" | "info";
}

interface ToastContextValue {
  show: (message: string, type: "error" | "info") => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: "error" | "info") => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    setToast({ message, type });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          className={`toast toast--${toast.type}`}
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 500,
            maxWidth: 380,
            background: toast.type === "error" ? "#f43f5e" : "var(--bg-2)",
            color: toast.type === "error" ? "#fff" : "var(--text)",
            border: toast.type === "error" ? "none" : "1px solid var(--border)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
