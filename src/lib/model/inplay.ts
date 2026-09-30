// In-play goals model. From the current score, each side's remaining goals are
// Poisson with the pre-match expected goals (Dixon-Coles λ and μ) scaled by the
// share of 90 minutes still to play. It ignores stoppage time, red cards and
// the low-score correction, and it is re-estimated only when the feed reports
// a new score or a new run, not every minute.

export const IN_PLAY_MODEL_ID = "football-inplay-poisson-v1.0";

export const IN_PLAY_NOTE =
  "In-play model: pre-match expected goals scaled to the time left, added to the current score. It knows only the score and the estimated minute; red cards, injuries and stoppage time are not in it.";

const MAX_GOALS = 10;

function pmf(l: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-l);
  for (let k = 0; k <= MAX_GOALS; k++) {
    out.push(p);
    p *= l / (k + 1);
  }
  return out;
}

export interface InPlayForecast {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
}

export function inPlayForecast(xg: { home: number; away: number }, minute: number, score: { home: number; away: number }): InPlayForecast {
  const left = Math.min(1, Math.max(0, (90 - minute) / 90));
  const h = pmf(xg.home * left);
  const a = pmf(xg.away * left);
  let home = 0;
  let draw = 0;
  let away = 0;
  let over = 0;
  let total = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      const p = h[x] * a[y];
      const fh = score.home + x;
      const fa = score.away + y;
      if (fh > fa) home += p;
      else if (fh === fa) draw += p;
      else away += p;
      if (fh + fa > 2.5) over += p;
      total += p;
    }
  }
  return { home: home / total, draw: draw / total, away: away / total, over25: over / total, under25: 1 - over / total };
}

/**
 * Match minute estimated from the wall clock: the feed gives no match clock.
 * Assumes a 15-minute half-time and no first-half stoppage; capped at 90.
 */
export function estimatedMinute(kickoff: number, at: number): number {
  const elapsed = Math.floor((at - kickoff) / 60_000);
  if (elapsed <= 45) return Math.max(0, elapsed);
  if (elapsed <= 60) return 45;
  return Math.min(90, elapsed - 15);
}
