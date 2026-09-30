# ODDSIQ

**See the numbers behind the odds.** An AI-powered sports market intelligence terminal: track market movement, compare model and market probabilities, understand model disagreement, and measure performance against a complete, tamper-evident prediction record.

ODDSIQ is an analytics product, not a sportsbook or tipster. It places no bets and never labels anything a "best bet".

## Quick start

```bash
npm install        # also generates the Prisma client
npm run dev        # http://localhost:3000
```

The app runs in **DEMO_MODE** by default: no database or API keys needed. Every page carries a **DEMO DATA** label while it is on.

With `DEMO_MODE=false` (and `DATABASE_URL` set) the terminal reads the odds feed and the real model from Postgres through `src/lib/terminal.ts`: Dashboard, Markets, market pages, Value Scanner, Matches, Overview, Heatmap, Ledger, Audit, Performance, CLV, Backtest, Error Analysis and Drift. Pages that need in-play, news or lineup data (Live, Market Replay, Efficiency, Alerts, AI Analyst, Weekly Report, Watchlist, My Bets, the demo Model Lab) say they are not available on live data yet.

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app |
| `npm test` | Unit tests (metrics, ledger integrity, demo universe) |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm run db:migrate` | Apply Postgres migrations (needs `DATABASE_URL`) |
| `npm run db:seed` | Load the demo universe into Postgres (empty database only) |
| `npm run ingest` | One odds ingestion run from The Odds API (needs `ODDS_API_KEY`, `DATABASE_URL`) |
| `npm run ingest:fixture` | Ingest recorded feed responses and check snapshots, closing line and settlement (no key needed) |

Keyboard: `⌘K` / `Ctrl+K` command palette, `/` search, `M` markets, `V` value scanner, `L` live, `A` AI analyst, `P` performance, `W` watchlist, `Esc` close.

## What is built (phases 0–1, plus the first slices of 2–4)

- **Market Terminal** (`/markets`): every open market with best and opening odds, margin-free market probability, model probability with uncertainty range, edge, EV, movement, estimated market pressure and confidence. Filters, sorting, search.
- **Market detail** (`/markets/[selection]`): odds chart with 1H/6H/12H/24H/7D, news markers, velocity and odds pressure, estimated Market Pressure Score with its components, Model vs Market bars, model consensus dot plot with uncertainty, "Why does the model differ?", "What changed?", data quality and source timestamps, per-bookmaker prices, sharp-movement detection worded without claims about who moved the market, and in-play probability movement with the event timeline for live matches.
- **Landing page** (`/`) with the accountability section (ledger size, chain check, CLV with sample size) and pricing. **Sign up / sign in** (`/signup`, `/login`) and **Account** (`/account`) when accounts are switched on.
- **Real Model** (`/model-lab/real-model`): the football model trained on real results (Dixon-Coles + Elo), its walk-forward backtest with calibration, and its live ledger record against real prices (CLV, Brier against the closing market).
- **Data Feed** (`/data-feed`): real bookmaker prices from The Odds API, the latest or closing consensus per event, and each ingestion run with credits left.
- **Dashboard** (`/dashboard`): market movement, model-market disagreement, opportunities grouped by characteristic (never a single "best bet"), live markets, calibration, and performance by model version. Every figure shows n, period and whether it is historical or simulated.
- **Prediction Ledger** (`/model-lab/ledger`) with CSV export (`/api/ledger.csv`), and **Model Audit** (`/model-lab/audit`).
- **Live Markets** (`/live`): three-pane in-play terminal. Live matches and matches starting soon on the left; score, minute, in-play probability and odds charts with goals and red cards pinned, probability movement since kickoff, live statistics and the event timeline in the centre; a templated Market Intelligence summary on the right.
- **Market Replay** (`/market-replay`): pick sport, league, date and a finished match, then scrub or play its main market from opening to full time with news, lineups, the ledgered prediction, match events, closing odds, result and CLV.
- **Matches** (`/matches`): fixtures, live matches and results with a "What changed?" summary per match.
- **AI Analyst** (`/ai-analyst`): ask about a team, a head-to-head comparison, price moves, model-market differences, your watchlist or the weekly report, plus market commentary on the largest current differences. Answers are rule-based from ODDSIQ's own data; no language model is connected yet.
- **Weekly Model Report** (`/model-lab/report`): performance, market accuracy, calibration, CLV, largest errors, strongest and weakest segments, drift, data quality and areas for investigation, phrased as "potential issue detected" with sample sizes.
- **Watchlist** (`/watchlist`) with **My Market Assistant**, and **My Bets** (`/my-bets`) for tracked prices with CLV and results. Watch buttons sit on every market page; `/watch Arsenal` works in the command bar. Signed out, this state lives in browser cookies; signed in, it is saved to the account (cookie state is merged in at sign-in).
- Roadmap pages for the remaining sections, labelled with their phase. See [docs/build-plan.md](docs/build-plan.md).

## Architecture

```
src/lib/metrics/   Pure, tested metric functions: de-vig, edge, EV, CLV, Brier, log loss,
                   calibration, velocity, volatility, market pressure, consensus, confidence,
                   data quality, flat-stake simulation. Aggregates carry n / period / source.
src/lib/ledger/    Hash-chained, append-only prediction ledger + verification.
src/lib/demo/      DEMO_MODE universe: deterministic per-day schedule, price paths per
                   bookmaker, model ensemble, match simulation, results, read model,
                   and ledger analytics (segments, error scan, drift, backtests, CLV).
src/lib/data.ts    Data entry point (DEMO_MODE switch).
prisma/            Postgres schema, migrations (incl. ledger immutability triggers), seed.
```

### DEMO_MODE universe

Events are generated per UTC day from 5 Jan 2026, each seeded by its own id, so the data is identical on every request and restart, and new days never change old ones. The demo behaves like a live system: scheduled matches go live, finish and settle as real time passes, and predictions join the ledger when their timestamp is reached. A rolling in-play showcase guarantees live football matches at any hour.

As of late September 2026 it contains ~2,900 events across 12 leagues in 5 sports, 10 fictional bookmakers, ~13,000 ledger predictions from 6 model versions, closing prices, results, CLV, news-driven price moves, and minute-by-minute live matches. Team names are real clubs; every rating, price and result is synthetic.

Built in on purpose, so the Model Lab has something real to find: the model overestimates draws in football 1X2 markets (v1.4's recalibration shrinks the error in the generator but does not remove it), and v1.4 scores better (lower Brier score) than v1.2. The Error Analysis page finds the draw pattern, and its mirror image in home wins, without being told where to look.

### Prediction ledger integrity

- Every prediction stores `seq`, timestamp, odds, probability, uncertainty range, confidence and `modelVersion`, plus a SHA-256 hash over those fields and the previous entry's hash.
- In Postgres, triggers reject `UPDATE`, `DELETE` and `TRUNCATE` on `Prediction`, and reject any insert that does not extend the chain. Closing odds and results live in `PredictionOutcome`, which can be filled in once but never rewritten.
- Markets the model failed to predict are recorded in `MissingPrediction` and shown in the audit.
- The ledger records pre-match predictions only. In-play estimates are shown in the terminal but never ledgered.

### Methodology notes

- **Market probability**: median bookmaker price per selection, margin removed proportionally.
- **CLV** = odds at prediction × de-vigged closing probability − 1.
- **Estimated market pressure**: size of move (30%), velocity (25%), bookmaker breadth (25%), relative volatility (10%), time to kickoff (10%). No volume data is used unless a feed supplies it.
- **Confidence**: reduced by the ensemble's uncertainty width, disagreement between component models and data-quality gaps. It is not a win probability.
- **Error patterns**: fixed segment combinations (selection type, league, odds range, market, confidence) are tested only with n ≥ 200 settled predictions, and reported only when the gap between observed and predicted win rate clears a Bonferroni-corrected z threshold (5% family-wise error).
- **Drift**: the last 28 days of settled predictions against the 84 days before: Brier gap to the closing market, calibration bias on favourites, CLV (z-tests) and the prediction distribution (PSI).
- **Backtests** replay the ledger with the model version that was live at the time; only the published rule (EV ≥ 3%, confidence ≥ 50) was fixed in advance. All staking figures are simulated.
- **Sharp movement**: consensus price moved ≥ 8% since opening with ≥ 60% of quoting bookmakers moving the same way. **Reverse line movement**: the opening favourite drifted ≥ 5% with the same breadth; in DEMO_MODE favourite status is the only public indicator, since no betting-percentage data exists. Neither detector claims a cause; possible explanations are listed separately.
- **Market efficiency score** (an ODDSIQ definition, not an objective truth): 60% closing accuracy (Brier skill of the closing price over each selection type's base rate, ÷ 0.15, capped) + 40% late stability (1 − average 6-hour pre-kickoff probability change ÷ 3 pp).
- **Alerts** are derived from price paths, news items, ledgered predictions and live match events over the last 24 hours; each rule is listed on `/markets/alerts`.
- **Market regime** (experimental): the first matching rule of live event → post-news movement (news ≤ 60 min ago and price moved ≥ 2%) → late lineup period (lineups confirmed, kickoff ≤ 75 min) → high volatility (≥ 3× the median) → low liquidity (< 70% of bookmakers quoting) → normal. It describes conditions and predicts nothing.
- **Market Intelligence** on `/live` is written by fixed templates from the figures on the page; no language model is used. It reports timing (for example, a price change in the same minute as a goal), never causes.
- **Market commentary** and the **"What changed?" summary** are fixed templates filled only with the figures on the page (prices, bookmaker counts, model outputs, model attributions, news items). Timing is reported, causes are not.
- **My Bets CLV** uses the same formula as the ledger; before kickoff it is provisional, against the current margin-free price.
- Definitions are also shown in the UI next to each metric.

## Real data, accounts and billing (phase 9)

Everything here is off until its settings are present; without them the app behaves exactly as the demo.

**Odds feed: The Odds API.** bet365 has no public API, and The Odds API does not carry bet365 in the UK or EU regions; it covers around 45 other UK/EU bookmakers. OpticOdds is the upgrade path if bet365 prices are required.

| Setting | Meaning |
| --- | --- |
| `ODDS_API_KEY` | Key from the-odds-api.com (the free plan gives 500 credits a month) |
| `ODDS_SPORTS` | Comma-separated competition keys, default `soccer_epl` (list: `GET /v4/sports`) |
| `ODDS_REGIONS` | Default `eu`; `uk,eu` doubles the cost |
| `ODDS_MARKETS` | `h2h` (default) and/or `totals` |
| `CRON_SECRET` | Protects `GET /api/cron/ingest` and `GET /api/cron/live` (send `Authorization: Bearer <CRON_SECRET>`) |
| `ODDS_LIVE` | `on` to poll in-play odds and scores through `GET /api/cron/live` (default off) |
| `ODDS_LIVE_INTERVAL_MINUTES` | Minimum minutes between live runs, default 10 |
| `ODDS_LIVE_RESERVE` | Live runs stop when fewer credits than this are left, default 100 |

**Scheduling.** Call `/api/cron/ingest` every six hours. `vercel.json` runs it once a day, because Vercel's Hobby plan rejects cron jobs that run more often ([Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)). The GitHub workflow `.github/workflows/schedule.yml` covers the rest: set the repository variable `SITE_URL` and the secret `CRON_SECRET`, and it calls the ingest every six hours (and `/api/cron/live` every ten minutes when the variable `ODDS_LIVE` is `on`); its "Run workflow" button starts a run by hand. On Vercel Pro you can instead change the `vercel.json` schedule to `0 */6 * * *`.

**Deploying on Vercel.** Import the repository, add a Postgres database from the Vercel Marketplace (Neon sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`), and set the environment variables above plus `DEMO_MODE=false`. The build command `npm run vercel-build` applies pending migrations before building whenever `DATABASE_URL` is set. Do not run `db:seed` against production: demo predictions would share the ledger chain.

One run costs competitions × regions × markets credits, plus 2 per competition when finished games need results. The defaults (one league, every six hours) use about 120–240 credits a month. Each run stores one snapshot per bookmaker price for games not yet started; the **closing line** is each bookmaker's last price at or before kickoff (no older than six hours), de-vigged and averaged. Feed data uses its own ids (`toa-…`) and never mixes with DEMO DATA.

**Real model (phase 10).** Results come from [openfootball/football.json](https://github.com/openfootball/football.json) (CC0, public domain, updated daily; no key). The model is an equal-weight blend of a Dixon-Coles goals model (time-decayed, shrunk towards the league average) and Elo with an ordered-logit outcome mapping; over/under 2.5 and both-teams-to-score come from Dixon-Coles. Each cron run, after ingesting odds, it refreshes results, records one ledger prediction per feed market in the 24 hours before kickoff (with the best price at that moment), attaches the closing line after kickoff, settles from the result, and re-runs a walk-forward backtest once a day. Supported leagues: Premier League, Championship, Bundesliga, La Liga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Belgian First Division, Austrian Bundesliga; team names are matched across sources and any market it cannot match is listed with the reason. It uses results only (no lineups, injuries or xG). Do not seed demo data into a production database: real predictions share the ledger chain.

**Team news (phase 12, optional).** With `STATS_API_KEY` set to an [API-Football](https://www.api-football.com) key, each cron run refreshes the fixture list for every covered league, matches fixtures to feed events (same teams, kickoff within three hours), then spends at most `STATS_MAX_REQUESTS_PER_RUN` requests (default 20) in this order: lineups for matches kicking off within 90 minutes, injury and suspension lists for matches in the next two days (refreshed every six hours), and team statistics with xG for matches finished in the last three days. Lineups set the event's lineup confirmation; lineups, absences, match xG and each team's xG form over its last five matches show in a Team news panel on market pages, on Matches and on Data Feed, and feed data quality. The model does not use them yet. API-Football reports errors such as a plan that does not cover the current season in the response; the run stores that message and the Data Feed page shows it. Match xG exists only where API-Football publishes it.

**Live pages (phase 13).** With `DEMO_MODE=false`, Market Alerts, Market Efficiency, the Weekly Model Report, Watchlist, My Bets and the AI Analyst read the feeds and the real model's ledger. Alerts cover odds moves, lineups, injuries and model-market differences (stale-odds and suspension alerts need a faster feed). Market Efficiency uses finished feed matches with closing lines from the last year. My Bets keeps positions for matches up to seven days after kickoff. The Model Lab overview, built on the demo model families, still says so.

**In play (phase 14, optional).** With `ODDS_LIVE=on`, call `GET /api/cron/live` every few minutes from a scheduler. It returns at once, spending nothing, unless a stored match kicked off in the last 150 minutes and has no result; then it fetches odds and scores for those leagues only (regions × markets + 2 credits per league), stores in-play prices apart from the pre-match snapshots so closing lines are unaffected, records the score, and settles finished matches. It skips runs closer together than `ODDS_LIVE_INTERVAL_MINUTES` and stops when the feed reports fewer credits left than `ODDS_LIVE_RESERVE`. At the defaults one Premier League match costs about 45 credits, so a full weekend needs a paid The Odds API plan. Live Markets then shows the score as last reported, an estimated minute (the feed has no match clock), in-play consensus odds and an in-play goals model (the pre-match Dixon-Coles expected goals scaled to the time left); goals are placed between the two runs that saw the score change, and cards and other match events are not available. Market Replay covers finished feed matches from the last seven days, with the in-play model fitted on results before kickoff.

**Accounts** (`ACCOUNTS_ENABLED=true`, needs `DATABASE_URL`): email and password, scrypt hashes, 30-day http-only session cookies with only a SHA-256 of the token stored, 10 attempts per 15 minutes per IP and per email.

**Billing** (Stripe, via its REST API): set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` (a recurring price id), `STRIPE_WEBHOOK_SECRET` and optionally `PRO_PRICE_LABEL` and `APP_URL`. Point a Stripe webhook at `/api/stripe/webhook` with `checkout.session.completed` and `customer.subscription.created/updated/deleted`. Plans change only from signed webhooks.

## Responsible use

Analytics only. Historical figures are labelled historical or simulated and never imply future results. 18+. Gambling involves risk of loss.
