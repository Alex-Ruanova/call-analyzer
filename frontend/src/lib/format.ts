// Single canonical formatters for time/duration strings shown in the UI.
// Centralized so float noise from STT timestamps (e.g. 8.297999999999998)
// never leaks to the user.

/** "M:SS" or "H:MM:SS" for a non-null number of seconds; "—" for null. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** "MM:SS" — always zero-padded — for segment timestamps in the transcript. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
