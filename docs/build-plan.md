# ODDSIQ — build plan (from scratch)

Audience: serious football/sports fans who want to understand markets, not tipsters.
Positioning: accountability + transparency. Every number carries sample size, period, source and model version.

## Decisions to confirm

| Area | Default I'll use | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind, dark "terminal" design system | One codebase for UI + API routes, fast to ship, easy to host |
| Database | Postgres + Prisma. Odds snapshots in a plain time-indexed table (TimescaleDB later if volume demands) | Relational fits ledger/markets; append-only tables are easy to enforce |
| Charts | Lightweight Charts (TradingView's open-source lib) for odds; Recharts for stats | Gives the TradingView feel without licensing |
| Models | TypeScript Poisson + Elo in-app for demo; Python (FastAPI) model service later for XGBoost/neural | Keeps phase 1 in one language |
| AI analyst | Claude API, prompted only with the structured data on screen | Meets "AI must only use supplied data" |
| Odds data | DEMO_MODE seed first. Real feed: a licensed aggregator that carries bet365 prices (e.g. OpticOdds or OddsJam API; The Odds API as a cheaper starter) | bet365 has no public API and scraping breaks their terms |
| Stats / events | API-Football (API-Sports) as default candidate | Broad league coverage, fixtures, lineups, live events |
| Hosting | Vercel + a managed Postgres (Neon/Supabase) | Cheap, zero ops |

"All leagues bet365 has" is the target coverage; the schema is sport/league-agnostic so coverage is purely a data-feed question. Demo seed covers ~8 leagues across football, basketball, tennis, NFL and ice hockey.

## Phases

**Phase 0 — Foundations**
Repo, lint/typecheck/test CI, design tokens (dark terminal look, no casino styling), app shell with the new navigation (Dashboard, Markets, Matches, Value Scanner, Live Markets, AI Analyst, Model Lab, Performance, My Bets), `DEMO_MODE` flag and a global "DEMO DATA" badge.

**Phase 1 — Data layer + DEMO_MODE seed** (spec §52–53)
Schema: sports, leagues, teams, events, markets, selections, bookmakers, odds_snapshots, data_sources + freshness, model_versions (name, version, training period, features), predictions, closing_lines, results, live_events, watchlists.
Deterministic seed generator: 120+ matches, 8+ leagues, 10 bookmakers, odds snapshots at open/24h/12h/6h/3h/1h/30m/15m/5m/close, 4 models + ensemble with uncertainty intervals, 600+ ledger predictions with results and closing odds, a few in-play matches with event timelines.

**Phase 2 — Metrics engine** (§41–42)
Pure, unit-tested functions: de-vigged implied probability, edge (pp), EV, CLV, Brier, log loss, calibration error + curve, odds velocity, estimated market pressure (labelled "estimated"), volatility, model agreement/disagreement, data-quality score, drawdown, profit factor. Every result returns `{value, n, period, modelVersion, source}` so the UI can't show a bare number.

**Phase 3 — Prediction ledger** (§43–45)
Append-only predictions table: DB trigger blocks UPDATE/DELETE on prediction fields; each row stores a hash of its content plus the previous row's hash (tamper-evident chain). Closing odds and results are written to separate tables, not into the prediction. `/model-lab/ledger` with CSV export, `/model-lab/audit` showing counts, gaps and chain verification.

**Phase 4 — Market Terminal** (§2–9, 29–33)
`/markets` table (all spec columns, sortable, live-refresh indicator, data-quality %), market detail drawer: odds chart with 1H/6H/12H/24H/7D, velocity + pressure, Model vs Market bar, model consensus distribution with ensemble uncertainty, confidence interval, "Why?" factors, source/timestamp for every data point. New Dashboard built from the same components.

**Phase 5 — Model Lab + Performance + CLV** (§10–18, 46–47)
Models/versions comparison, calibration chart, backtests (labelled historical/simulated), `/performance`, `/performance/clv`, `/model-lab/errors` (known facts vs possible explanations), error patterns with minimum sample sizes, drift monitoring.

**Phase 6 — Scanner and market analytics** (§19–21, 23–25, 6–7)
`/value-scanner` with all filters and characteristic-based rankings (no "best bet"), sharp-movement and reverse-line-movement detectors with neutral wording, alerts engine, `/markets/heatmap`, `/markets/overview`, `/markets/efficiency` with a documented score definition.

**Phase 7 — Live and replay** (§26–28, 34–35, 48)
Three-pane live terminal, probability movement (model vs market), event timeline pinned on the chart, `/market-replay`, "What changed?" timeline, experimental regime label.

**Phase 8 — AI and personal terminal** (§22, 36–39, 46)
Market Intelligence commentary, AI Analyst, weekly model report, watchlists + `/watchlist`, My Market Assistant, keyboard shortcuts, Cmd+K command palette.

**Phase 9 — Real data**
Plug in the licensed odds feed and stats API behind the same provider interface the seed uses, scheduled snapshot ingestion, closing-line capture, landing page and accounts/billing.

**Phase 10 — Real model**
Football model trained on public-domain results (openfootball): Dixon-Coles + Elo ensemble, walk-forward backtest with calibration, predictions written to the ledger before kickoff for feed markets, closing lines and settlement, `/model-lab/real-model`.

**Phase 11 — Terminal on real data**
Point the Market Terminal, Value Scanner, Dashboard and Performance pages at feed data and the real model, so `DEMO_MODE=false` becomes usable. Done: `src/lib/terminal.ts` serves either the demo universe or the live read model (`src/lib/real/store.ts`); pages that need in-play, news or lineup data show a "not available on live data yet" notice in live mode.

**Phase 12 — Lineups, injuries and xG**
Add a football statistics provider (API-Football to start; Sportmonks for deeper xG) for confirmed lineups, injuries and match xG, and feed them into data quality, the match pages and the model.

## Guardrails built in from day one
- "DEMO DATA" label whenever `DEMO_MODE=true`.
- Historical numbers always labelled historical/backtested/simulated; no guarantees language anywhere.
- Pressure is "Estimated market pressure" unless real volume data exists.
- Movement detectors never attribute cause; possible explanations are listed separately.
- Responsible-gambling footer and 18+ notice, since the audience is fans who may bet.
