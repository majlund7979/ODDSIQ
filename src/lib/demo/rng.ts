// Deterministic randomness for DEMO_MODE. Every generated value is a pure
// function of a string key, so the demo data is stable across requests and
// restarts, and new days are added without changing earlier ones.

/** 32-bit FNV-1a hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  }

  /** mulberry32 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((s, x) => s + x.weight, 0);
    let r = this.next() * total;
    for (const x of items) {
      r -= x.weight;
      if (r <= 0) return x.item;
    }
    return items[items.length - 1].item;
  }

  /** Two distinct items. */
  pair<T>(items: readonly T[]): [T, T] {
    const i = Math.floor(this.next() * items.length);
    let j = Math.floor(this.next() * (items.length - 1));
    if (j >= i) j++;
    return [items[i], items[j]];
  }

  poisson(lambda: number): number {
    const l = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > l);
    return k - 1;
  }
}

/** Smooth deterministic noise in [-1, 1] along a real axis (value noise). */
export function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = (hashString(`${seed}:${i}`) / 4294967295) * 2 - 1;
  const b = (hashString(`${seed}:${i + 1}`) / 4294967295) * 2 - 1;
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

export const logit = (p: number) => Math.log(p / (1 - p));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
