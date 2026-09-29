export const fmtOdds = (o: number | null | undefined) => (o == null || Number.isNaN(o) ? "—" : o.toFixed(2));

export const fmtPct = (x: number | null | undefined, digits = 1) =>
  x == null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(digits)}%`;

export const fmtSignedPct = (x: number | null | undefined, digits = 1) =>
  x == null || Number.isNaN(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(digits)}%`;

export const fmtPp = (x: number | null | undefined, digits = 1) =>
  x == null || Number.isNaN(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)} pp`;

export const fmtInt = (n: number) => n.toLocaleString("en-GB");

export function fmtDate(t: number | null | undefined): string {
  if (t == null) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtMonth(t: number | null | undefined): string {
  if (t == null) return "—";
  return new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(t: number): string {
  return new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC";
}

export function fmtTime(t: number, seconds = false): string {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, timeZone: "UTC", hour12: false });
}

export function fmtPeriod(from: number | null, to: number | null): string {
  if (from == null || to == null) return "—";
  return `${fmtMonth(from)} – ${fmtMonth(to)}`;
}

export function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return "started";
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtShortDateTime(t: number): string {
  return new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
}
