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
| `sql/003_live.sql` | link to the site's events, `job_run` log, value bets of shadow models hidden (migration `0018_pe_live`) |
| `engine/live/` | daily shadow run: read the site's tables (`site.py`), map team names (`names.py`, `team_aliases.csv`), train and predict (`predict.py`), write to schema pe (`write.py`) |
| `scripts/run_daily.py` | the daily run, scheduled by `.github/workflows/pe-predict.yml` |

```
pip install -r pe/requirements.txt
cd pe && python -m pytest -q tests                       # unit, leakage, model, backtest, value, risk tests
PE_TEST_DSN="postgresql://…" python -m pytest -q tests   # also the database tests (scratch database)
```

## Daily shadow run

`PE predict` (GitHub Actions, 05:30 and 14:30 UTC, or by hand) runs `scripts/run_daily.py`:

1. Loads football-data history (the xgabora mirror, seasons from 2019) and the site's newer results.
2. Reads the site's upcoming matches (next 7 days) and their 1X2 and O/U 2.5 prices from Neon, in the
   16 divisions the engine has history for. Team names are mapped to football-data spelling with
   `engine/live/team_aliases.csv` (learned from 2020-2026 API-Football fixtures), then fuzzy matching;
   names it cannot place are left out and listed in `pe.job_run.summary`.
3. Trains the step-5 model (train: the three seasons before last; weights, calibration and market blend on
   last season) and predicts with features cut off at the moment of the run.
4. Writes matches, the prices it used, features, predictions and the value table (with the reason each
   selection is rejected) to schema pe. The model is stored with status `shadow`, so `latest_prediction`
   and `latest_value_bet` (what the site reads) show nothing until a model is promoted.

It reads the site's tables and never writes them. Its database login comes from the site: before each run the
workflow calls `POST /api/cron/pe-credentials` (with the existing `CRON_SECRET`), which keeps a role `pe_writer`
that may only read the site's fixture and odds tables and insert into schema pe (plus moving a match's kickoff),
and gives it a new random password each time, so a login works only until the next run. The login is masked in
the Actions log. A repository secret `PE_DATABASE_URL` overrides this, for a role created by hand with the same
grants (`src/lib/pe/credentials.ts`).

Promoting a model (`UPDATE pe.model SET status = 'live'`) is a separate decision (step 10, part 4).
