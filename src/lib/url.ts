// Reading search parameters from the URL. Next gives each one as a string, as
// an array when it is repeated (?q=a&q=b), or undefined, and anyone can type them.

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The parameter when it appears once; undefined when it is missing or repeated. */
export function one(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** table[key] for the table's own keys only, so "__proto__" or "constructor" from a URL finds nothing. */
export function lookup<T>(table: Record<string, T>, key: string | undefined): T | undefined {
  return key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;
}
