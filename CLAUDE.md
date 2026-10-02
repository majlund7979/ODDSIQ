@AGENTS.md

## ODDSIQ conventions

- Positioning: the home page after login is the simple daily list "Dagens bedste bets" (/picks, Danish), ranked by model win probability; the analytics terminal sits behind "Avancerede værktøjer". Mads asked for this on 2026-10-02. Never say "lock" or "guaranteed"; no casino styling or flashing odds.
- Every aggregate statistic must carry sample size, period, source and model version (`Metric` in `src/lib/metrics/metric.ts`), and say whether it is historical, simulated, live or estimated.
- Never claim who or what caused a price move; list possible explanations separately from facts.
- The prediction ledger is append-only. Never add code paths that edit or delete predictions; outcomes go in `PredictionOutcome`.
- Demo data must stay deterministic (seeded by id via `src/lib/demo/rng.ts`) and labelled DEMO DATA.
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.
