/** Post-login destination: only same-site paths, never protocol-relative URLs. */
export function safeNext(v: unknown, fallback = "/dashboard"): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
