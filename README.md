# Oddsanalyse

**Dagens bedste bets** for football, in Danish, for Mads and his friends (oddsanalyse.dk). The site suggests bets for today's matches, shows every recorded pick's result on an open results board, and lets friends compare the bets they play. It places no bets.

The analytics terminal that this repository started as (ODDSIQ) was retired on 2026-10-02 and its pages were deleted; their old URLs redirect to `/picks` (`next.config.ts`).

## Pages

| Page | What it shows |
| --- | --- |
| `/picks` | Dagens bedste bets: the main list, plus one tab per bet type (`?type=` vinder, dobbelt, maal15, maal, btts, resultat, halvleg, skud, hjorne, kort, frispark, straffe), the daily coupons and "I gang nu" with live scores |
| `/picks/resultater` | Vores resultater: how every recorded pick did over the last 7 days, per bet type |
| `/picks/liga` | Vennerligaen: the bets friends saved with "Gem bet" or "Spil kupon", ranked by profit, and the tipping standings |
| `/picks/spillere` | Holdsøgning: a team's players with shots on target, goals, assists and form |
| `/tips` | Dagens tips: friends tip 1, X or 2; a correct tip scores its odds in points |
| `/nyheder` | Injury and transfer headlines from Google News RSS (`src/lib/news`) |
| `/venner` | The owner invites friends; used only with `INVITE_ONLY=true` |
| `/admin`, `/admin/modelpanel` | Owner only: sign-ups, and the prediction engine's shadow runs |
| `/account` | Min konto: the account, its plan when billing is on, and sign-out |
| `/login`, `/signup`, `/login/glemt`, `/login/ny-kode` | Sign in, sign up and password reset by e-mail |

Once `OWNER_EMAIL` is set, every page asks for login. `/api/ledger.csv` exports the full prediction ledger as CSV, for signed-in users only when login is on; no page links to it.

## Quick start

```bash
npm install        # also generates the Prisma client
npm run dev        # http://localhost:3000
```

The app runs in **DEMO_MODE** by default: no database or API keys needed, and every page carries a **DEMO DATA** label while it is on. Left unset, `DEMO_MODE` switches off by itself once `DATABASE_URL` and `ODDS_API_KEY` are set; `DEMO_MODE=false` forces live data. On live data the picks pages, the coupon and tips actions and the cron routes read the odds feeds and the real model from Postgres through `src/lib/terminal.ts`.

Environment variables (names only; the values live on Vercel):

- Data: `DEMO_MODE`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ODDS_API_KEY`, `ODDS_SPORTS`, `ODDS_REGIONS`, `ODDS_MARKETS`, `ODDS_MIN_HOURS`, `ODDS_LIVE`, `ODDS_LIVE_INTERVAL_MINUTES`, `ODDS_LIVE_RESERVE`, `STATS_API_KEY`, `STATS_MAX_REQUESTS_PER_RUN`, `STATS_ODDS`, `STATS_ODDS_LEAGUES`
- Scheduling: `CRON_SECRET`, `APP_URL`
- Login: `OWNER_EMAIL`, `INVITE_ONLY`, `ALLOWED_EMAILS`, `ACCOUNTS_ENABLED`
- Mail: `RESEND_API_KEY`, `MAIL_FROM`, `MORNING_EMAIL_TO`
- Billing: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET`, `PRO_PRICE_LABEL`

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app |
| `npm test` | Unit tests (picks, metrics, ledger integrity, feeds, demo universe) |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm run db:migrate` | Apply Postgres migrations (needs `DATABASE_URL`) |
| `npm run db:seed` | Load the demo universe into Postgres (empty database only) |
| `npm run ingest` | One odds run from The Odds API, then the model's work (needs `ODDS_API_KEY`, `DATABASE_URL`). A manual run: it skips the odds credit plan and records no picks. Production runs `GET /api/cron/ingest` instead (below) |
| `npm run ingest:fixture` | Ingest recorded feed responses and check snapshots, closing line, ledger predictions, settlement and team news (no key needed) |

Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.

## Data runs

Every cron route needs `Authorization: Bearer $CRON_SECRET`.

| Route | Called by | What it does |
| --- | --- | --- |
| `/api/cron/ingest` | `vercel.json` daily, `schedule.yml` every six hours | Odds, team news and statistics, the model run (results, ledger predictions, closing lines, settlement, backtest), then records the day's picks for the results board |
| `/api/cron/lineups` | `schedule.yml` every ten minutes | Lineups for matches close to kickoff; free when none is near |
| `/api/cron/live` | `schedule.yml` every ten minutes when `ODDS_LIVE` is `on` | In-play odds and scores, closing lines and settlement |
| `/api/cron/morning` | `schedule.yml` daily | The morning e-mail with today's top 5 |
| `/api/cron/diagnose` | `diagnose.yml`, by hand | Speed and data check for the live site |
| `/api/cron/api-probe` | `api-probe.yml`, by hand | Survey of what API-Football returns on this plan |
| `/api/cron/pe-export` | `pe-export.yml`, by hand | Finished matches from API-Football for the prediction engine's backfill |
| `/api/cron/pe-credentials` | `pe-predict.yml` | A fresh database login for the prediction engine's daily run |

`pe/` is the prediction engine (Python): models, walk-forward backtests and a daily shadow run (`pe-predict.yml`) that writes to the Postgres schema `pe`. Nothing from it shows on Dagens bedste bets; the owner sees it on `/admin/modelpanel`. See `pe/README.md`.

CI (`.github/workflows/ci.yml`) runs three jobs on every pull request and push to main: `check` (lint, typecheck, test, build), `ledger-db` (migrate, seed, `npm run ingest:fixture` and a check that the database rejects edits and deletes of predictions) and `prediction-engine` (the `pe/` tests).

## Architecture

```
src/app/            Pages (route groups (terminal) and (site)), server actions, API and cron routes.
src/lib/terminal.ts The one data entry point: demo universe or live feeds, same shapes.
src/lib/picks*.ts   Dagens bedste bets: probabilities, bet types, coupons, advice, self-learning.
src/lib/sharp.ts    The price comparison behind the main list (Pinnacle's fair price vs bet365 and bwin).
src/lib/real/       Postgres read models: snapshot, recorded picks, friends' bets, tips.
src/lib/providers/  Odds feeds (The Odds API, API-Football), ingestion, closing lines, settlement.
src/lib/stats/      Team news, lineups, xG, ClubElo and API-Football predictions.
src/lib/model/      The results model (Dixon-Coles + Elo), count models, backtest, pipeline.
src/lib/metrics/    Pure, tested metric functions (de-vig, edge, EV, CLV, Brier, calibration).
                    Aggregates carry n / period / source / model version (metric.ts).
src/lib/ledger/     Hash-chained, append-only prediction ledger + verification.
src/lib/demo/       DEMO_MODE universe and the demo picks.
prisma/             Postgres schema, migrations (incl. ledger immutability triggers), seed.
pe/                 Prediction engine (Python), see above.
```

### DEMO_MODE universe

Events are generated per UTC day from 5 Jan 2026, each seeded by its own id, so the data is identical on every request and restart, and new days never change old ones. The demo behaves like a live system: scheduled matches go live, finish and settle as real time passes, and predictions join the ledger when their timestamp is reached. A rolling in-play showcase keeps live football matches going at any hour.

As of late September 2026 it contains ~2,900 events across 12 leagues in 5 sports, 10 fictional bookmakers, ~13,000 ledger predictions from 6 model versions, closing prices, results, CLV, news-driven price moves, and minute-by-minute live matches. Team names are real clubs; every rating, price and result is synthetic.

The demo models overestimate draws in football 1X2 markets on purpose (v1.4's recalibration shrinks the error in the generator but does not remove it), and v1.4 scores better (lower Brier score) than v1.2.

### Prediction ledger integrity

- Every prediction stores `seq`, timestamp, odds, probability, uncertainty range, confidence and `modelVersion`, plus a SHA-256 hash over those fields and the previous entry's hash.
- In Postgres, triggers reject `UPDATE`, `DELETE` and `TRUNCATE` on `Prediction`, and reject any insert that does not extend the chain. Closing odds and results live in `PredictionOutcome`, which can be filled in once but never rewritten.
- Markets the model failed to predict are recorded in `MissingPrediction` with the reason.
- The ledger records pre-match predictions only. In-play estimates are never ledgered.

### Methodology notes

- **Market probability**: median bookmaker price per selection, margin removed proportionally.
- **CLV** = odds at prediction × de-vigged closing probability − 1.
- Every aggregate figure must show its sample size, period, source and model version (`Metric` in `src/lib/metrics/metric.ts`), and say whether it is historical, simulated, live or estimated.
- No text may claim who or what moved a price; possible explanations are listed apart from the facts.

## Real data, accounts and billing (phase 9)

Everything here is off until its settings are present; without them the app behaves exactly as the demo.

**Odds feed: The Odds API.** bet365 has no public API, and The Odds API does not carry bet365 in the UK or EU regions; it covers around 45 other UK/EU bookmakers. OpticOdds is the upgrade path if bet365 prices are required.

| Setting | Meaning |
| --- | --- |
| `ODDS_API_KEY` | Key from the-odds-api.com (the free plan gives 500 credits a month) |
| `ODDS_SPORTS` | Comma-separated competition keys, default `soccer_epl` (list: `GET /v4/sports`) |
| `ODDS_REGIONS` | Default `eu`; `uk,eu` doubles the cost |
| `ODDS_MARKETS` | `h2h` (default) and/or `totals` |
| `CRON_SECRET` | Protects the cron routes (send `Authorization: Bearer <CRON_SECRET>`) |
| `ODDS_LIVE` | `on` to poll in-play odds and scores through `GET /api/cron/live` (default off) |
| `ODDS_LIVE_INTERVAL_MINUTES` | Minimum minutes between live runs, default 10 |
| `ODDS_LIVE_RESERVE` | Live runs stop when fewer credits than this are left, default 100 |

**Scheduling.** Call `/api/cron/ingest` every six hours. `vercel.json` runs it once a day, because Vercel's Hobby plan rejects cron jobs that run more often ([Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)). The GitHub workflow `.github/workflows/schedule.yml` covers the rest: set the repository variable `SITE_URL` and the secret `CRON_SECRET`, and it calls the ingest every six hours, the lineups every ten minutes, the morning e-mail once a day (and `/api/cron/live` every ten minutes when the variable `ODDS_LIVE` is `on`); its "Run workflow" button starts a run by hand. On Vercel Pro you can instead change the `vercel.json` schedule to `0 */6 * * *`.

**Deploying on Vercel.** Import the repository, add a Postgres database from the Vercel Marketplace (Neon sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`), and set the environment variables above plus `DEMO_MODE=false`. The build command `npm run vercel-build` applies pending migrations before building whenever `DATABASE_URL` is set. Do not run `db:seed` against production: demo predictions would share the ledger chain.

One run costs competitions × regions × markets credits, plus 2 per competition when finished games need results. The defaults (one league, every six hours) use about 120–240 credits a month. Each run stores one snapshot per bookmaker price for games not yet started; the **closing line** is each bookmaker's last price at or before kickoff (no older than six hours), de-vigged and averaged. Feed data uses its own ids (`toa-…`) and never mixes with DEMO DATA.

**Real model (phase 10).** Results come from [openfootball/football.json](https://github.com/openfootball/football.json) (CC0, public domain, updated daily; no key). The model is an equal-weight blend of a Dixon-Coles goals model (time-decayed, shrunk towards the league average) and Elo with an ordered-logit outcome mapping; over/under 2.5 and both-teams-to-score come from Dixon-Coles. Each cron run, after ingesting odds, it refreshes results, records one ledger prediction per feed market in the 24 hours before kickoff (with the best price at that moment), attaches the closing line after kickoff, settles from the result, and re-runs a walk-forward backtest once a day. Supported leagues: Premier League, Championship, Bundesliga, La Liga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Belgian First Division, Austrian Bundesliga; team names are matched across sources and any market it cannot match is listed with the reason. It uses results only (no lineups, injuries or xG). Do not seed demo data into a production database: real predictions share the ledger chain.

**Team news (phase 12, optional).** With `STATS_API_KEY` set to an [API-Football](https://www.api-football.com) key, each cron run refreshes the fixture list for every covered league, matches fixtures to feed events (same teams, kickoff within three hours), then spends at most `STATS_MAX_REQUESTS_PER_RUN` requests (default 20) in this order: lineups for matches kicking off within 90 minutes, injury and suspension lists for matches in the next two days (refreshed every six hours), and team statistics with xG for matches finished in the last three days. Lineups set the event's lineup confirmation. Absences, lineups and each team's xG form over its last five matches adjust the expected goals behind the bet-type tabs on `/picks` and show in each bet's analysis. API-Football reports errors such as a plan that does not cover the current season in the response; the run stores that message. Match xG exists only where API-Football publishes it. The same key also brings API-Football odds for internationals and more European leagues (`STATS_ODDS=off` turns that off, `STATS_ODDS_LEAGUES` picks the competitions).

**In play (phase 14, optional).** With `ODDS_LIVE=on`, call `GET /api/cron/live` every few minutes from a scheduler. It returns at once, spending nothing, unless a stored match kicked off in the last 150 minutes and has no result; then it fetches odds and scores for those leagues only (regions × markets + 2 credits per league), stores in-play prices apart from the pre-match snapshots so closing lines are unaffected, records the score, and settles finished matches. It skips runs closer together than `ODDS_LIVE_INTERVAL_MINUTES` and stops when the feed reports fewer credits left than `ODDS_LIVE_RESERVE`. At the defaults one Premier League match costs about 45 credits, so a full weekend needs a paid The Odds API plan.

**Login** (`OWNER_EMAIL=<your email>`, needs `DATABASE_URL`): every page asks for login and anyone can create an account. With `INVITE_ONLY=true` only the owner, `ALLOWED_EMAILS` and the friends the owner invites on `/venner` can; removing a friend there ends their sessions at once and stops their morning e-mail.

**Accounts** (`ACCOUNTS_ENABLED=true` or `OWNER_EMAIL`, needs `DATABASE_URL`): email and password, scrypt hashes, 30-day http-only session cookies with only a SHA-256 of the token stored, 10 attempts per 15 minutes per IP and per email. A forgotten password is reset with a link by e-mail (`/login/glemt`, needs `RESEND_API_KEY`).

**Mail** (Resend): `RESEND_API_KEY` switches on the password reset and the morning e-mail; `MAIL_FROM` sets the sender (Resend's test sender until a domain is verified), and `MORNING_EMAIL_TO` adds addresses to the morning e-mail beside the friends who have it on. Reset and invite links use `APP_URL`, else the request's host; set `APP_URL` wherever the server answers any host name (`next start` or self-hosting), or a forged host could end up in a reset link.

**Billing** (Stripe, via its REST API): set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` (a recurring price id), `STRIPE_WEBHOOK_SECRET` and optionally `PRO_PRICE_LABEL` and `APP_URL`. Point a Stripe webhook at `/api/stripe/webhook` with `checkout.session.completed` and `customer.subscription.created/updated/deleted`. Plans change only from signed webhooks.

## Responsible use

Oddsanalyse suggests bets but places none and takes no stakes. Its percentages are estimates, and historical figures are labelled historical or simulated and never imply future results. 18+. Gambling involves risk of loss. Help: StopSpillet.dk.
