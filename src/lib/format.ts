// Danish numbers and dates in Copenhagen time. Pure, so client components can
// use it too.

export const TZ = "Europe/Copenhagen";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** The Copenhagen calendar day, e.g. "2026-10-08". */
export const dayKey = (t: number) => DAY_KEY.format(t);
/** "17.30" */
export const clock = (t: number) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
/** "8. okt." */
export const shortDate = (t: number) => new Date(t).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ });
/** "8. okt. 2026" */
export const dateDa = (t: number) => new Date(t).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });

/** "1,50" */
export const dec = (x: number, d = 2) => x.toFixed(d).replace(".", ",");
/** "57 %" */
export const pct = (x: number) => `${Math.round(x * 100)} %`;
/** "57 %", or "—" when there is nothing to divide by. */
export const pctOrDash = (x: number) => (Number.isFinite(x) ? pct(x) : "—");
/** "57%": big headline numbers read better without the space. */
export const pctTight = (x: number) => `${Math.round(x * 100)}%`;
/** "+3,4 %" or "−3,4 %" */
export const signedPct = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${dec(Math.abs(x) * 100, d)} %`;
/** Profit in units at 100 kr a bet: "+50 kr" or "−100 kr". */
export const krFromUnits = (units: number) => `${units >= 0 ? "+" : "−"}${Math.round(Math.abs(units) * 100)} kr`;

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
