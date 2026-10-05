// Poisson score model used by the demo generator to produce internally
// consistent "true" probabilities, results and in-play probabilities.

const MAX_GOALS = 10;

function poissonPmf(lambda: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  for (let k = 0; k <= MAX_GOALS; k++) {
    out.push(p);
    p *= lambda / (k + 1);
  }
  return out;
}

export interface FootballProbabilities {
  home: number;
  draw: number;
  away: number;
  over15: number;
  over25: number;
  btts: number;
}

/**
 * Probabilities for final outcomes given expected goals over the remaining
 * time and the current score (0-0 pre-match).
 */
export function footballProbabilities(lambdaHome: number, lambdaAway: number, score = { home: 0, away: 0 }): FootballProbabilities {
  const ph = poissonPmf(Math.max(lambdaHome, 1e-6));
  const pa = poissonPmf(Math.max(lambdaAway, 1e-6));
  const r = { home: 0, draw: 0, away: 0, over15: 0, over25: 0, btts: 0 };
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      const h = score.home + i;
      const a = score.away + j;
      if (h > a) r.home += p;
      else if (h === a) r.draw += p;
      else r.away += p;
      if (h + a > 1.5) r.over15 += p;
      if (h + a > 2.5) r.over25 += p;
      if (h > 0 && a > 0) r.btts += p;
    }
  }
  const total = r.home + r.draw + r.away;
  return { home: r.home / total, draw: r.draw / total, away: r.away / total, over15: r.over15 / total, over25: r.over25 / total, btts: r.btts / total };
}

export function expectedGoals(homeAttack: number, homeDefence: number, awayAttack: number, awayDefence: number) {
  const base = Math.log(1.35);
  const homeAdvantage = 0.12;
  return {
    home: Math.exp(base + homeAttack - awayDefence + homeAdvantage),
    away: Math.exp(base + awayAttack - homeDefence),
  };
}
