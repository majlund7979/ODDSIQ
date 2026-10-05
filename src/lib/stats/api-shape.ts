// Describes the shape of an API response without its values: every field path
// with its type, how often it is filled, and one short example. Used by the
// API probe to document which data points API-Football actually returns.

export interface FieldShape {
  /** Types seen at this path, e.g. "number" or "string|null". */
  type: string;
  /** Share of occurrences where the value was not null. */
  filled: number;
  /** One short example value. */
  example?: string;
}

/** Field paths (array indexes collapsed to []) → shape. */
export function describeShape(value: unknown, maxExample = 40): Record<string, FieldShape> {
  const seen = new Map<string, { types: Set<string>; total: number; filled: number; example?: string }>();
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      if (v.length === 0) note(path, "[]", false);
      for (const item of v) walk(item, `${path}[]`);
      return;
    }
    if (v !== null && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k);
      return;
    }
    note(path, v === null ? "null" : typeof v, v !== null && v !== "", v === null ? undefined : String(v).slice(0, maxExample));
  };
  const note = (path: string, type: string, filled: boolean, example?: string) => {
    const s = seen.get(path) ?? { types: new Set<string>(), total: 0, filled: 0 };
    s.types.add(type);
    s.total += 1;
    if (filled) s.filled += 1;
    if (s.example === undefined && example !== undefined) s.example = example;
    seen.set(path, s);
  };
  walk(value, "");
  const out: Record<string, FieldShape> = {};
  for (const [path, s] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
    out[path || "(root)"] = { type: [...s.types].sort().join("|"), filled: Math.round((s.filled / s.total) * 100) / 100, ...(s.example !== undefined ? { example: s.example } : {}) };
  }
  return out;
}
