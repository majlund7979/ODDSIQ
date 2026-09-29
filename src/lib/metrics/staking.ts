// Simulated flat-stake results. Always labelled "simulated" in the UI: nobody
// placed these stakes.

export interface StakeResult {
  at: number;
  odds: number;
  won: boolean;
}

export interface StakingSummary {
  stakes: number;
  profit: number;
  roi: number;
  winRate: number;
  maxDrawdown: number; // in units, positive number
  profitFactor: number; // gross wins / gross losses
  equity: { at: number; value: number }[];
}

export function simulateFlatStakes(rows: StakeResult[]): StakingSummary {
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  const curve: { at: number; value: number }[] = [];
  for (const r of sorted) {
    const pnl = r.won ? r.odds - 1 : -1;
    if (r.won) {
      wins++;
      grossWin += pnl;
    } else {
      grossLoss += 1;
    }
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    curve.push({ at: r.at, value: equity });
  }
  const n = sorted.length;
  return {
    stakes: n,
    profit: equity,
    roi: n ? equity / n : NaN,
    winRate: n ? wins / n : NaN,
    maxDrawdown: maxDd,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : NaN,
    equity: curve,
  };
}
