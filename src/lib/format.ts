export function fmtDate(t: number | null | undefined): string {
  if (t == null) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
