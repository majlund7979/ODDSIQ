# Prediction engine

Statistical prediction engine for Oddsanalyse: data model, point-in-time features, prediction
models, walk-forward backtest, EV/value engine and staking/risk. Design notes per step live in the
project files (`prediction-engine/trin-1…9`). Nothing here changes what the site shows: the site's
"Dagens bedste bets" keeps its own logic until a backtest shows an edge and Mads says yes.

| Path | What |
|---|---|
| `sql/001_schema.sql`, `sql/002_api.sql` | Postgres schema `pe` (applied by Prisma migration `0017_pe_schema`): core tables with `available_at`, predictions, value bets, bets, append-only triggers and the read views behind `/api/pe/*` |
| `engine/pit.py`, `engine/data.py` | point-in-time rules (stages, cutoffs, as-of joins) and the frames features work on |
| `engine/features/` | ratings, form, fatigue, context, h2h, squad, market, referee; `build.py` |
| `engine/models/` | Poisson, Dixon-Coles, feature Poisson, Elo/logreg/RF/LightGBM/MLP, ensemble, calibration, Monte Carlo, walk-forward |
| `engine/backtest/` | walk-forward predictions, market blend, betting simulation, reports |
| `engine/value/` | market quotes, confidence (fitted shrinkage of the edge), filters and ranking |
| `engine/risk/` | payoff per score, joint Kelly per match, exposure limits |
| `engine/sources/` | football-data.co.uk, the xgabora mirror, the API-Football export (`PE export` workflow) |
| `engine/store.py` | writes predictions and value bets; the SELECTs behind each endpoint |
| `scripts/run_backtest.py` | full walk-forward backtest |

```
pip install -r pe/requirements.txt
cd pe && python -m pytest -q tests                       # unit, leakage, model, backtest, value, risk tests
PE_TEST_DSN="postgresql://…" python -m pytest -q tests   # also the database tests (scratch database)
```
