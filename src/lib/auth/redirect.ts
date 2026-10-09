/**
 * A path on this site: one leading slash, then printable ASCII without spaces or
 * backslashes. Browsers drop tabs and line breaks and read "\" as "/", so
 * "/\t/evil.example" would become "//evil.example"; such paths are refused.
 */
const SAME_SITE_PATH = /^\/(?!\/)[\x21-\x5b\x5d-\x7e]*$/;

/** Post-login destination: only same-site paths, never protocol-relative URLs. */
export function safeNext(v: unknown, fallback = "/picks"): string {
  return typeof v === "string" && SAME_SITE_PATH.test(v) ? v : fallback;
}
