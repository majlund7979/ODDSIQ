-- Prediction engine schema "pe" (steps 2 and 8). Source of truth: pe/sql/001_schema.sql and pe/sql/002_api.sql.
-- Lives in its own schema, so the site's tables in public are untouched. Prisma does not model these tables.

-- Prediction engine schema (step 2). PostgreSQL 16 / Neon.
--
-- Lives in its own schema "pe" so the site's Prisma tables (public) are untouched.
--
-- Point-in-time rule: every fact row carries `available_at`, the earliest moment
-- the engine could have known it. A feature for a match with cutoff T may only
-- read rows with available_at < T. Live ingest sets available_at = fetch time;
-- historical backfill sets a conservative estimate and marks `backfilled = true`.
--
-- Append-only tables (no UPDATE/DELETE in application code): raw_response,
-- odds_snapshot, injury_report, prediction, rating_history, match_feature.

CREATE SCHEMA IF NOT EXISTS pe;
SET search_path = pe;

-- ---------------------------------------------------------------- raw layer

-- Every API answer, stored verbatim, so any table can be rebuilt and any
-- prediction re-derived from what was actually fetched.
CREATE TABLE raw_response (
  id           bigserial PRIMARY KEY,
  source       text        NOT NULL,                 -- 'api-football' | 'the-odds-api' | 'football-data' | 'open-meteo'
  endpoint     text        NOT NULL,                 -- '/fixtures'
  params       jsonb       NOT NULL,
  fetched_at   timestamptz NOT NULL,
  http_status  int         NOT NULL,
  body         jsonb       NOT NULL,
  body_sha256  text        NOT NULL
);
CREATE INDEX raw_response_lookup ON raw_response (source, endpoint, fetched_at);
CREATE UNIQUE INDEX raw_response_dedupe ON raw_response (source, endpoint, body_sha256);

-- ---------------------------------------------------------------- reference data

CREATE TABLE competition (
  id           serial PRIMARY KEY,
  af_league_id int UNIQUE,                           -- API-Football league id
  odds_api_key text UNIQUE,                          -- The Odds API sport key
  fd_division  text UNIQUE,                          -- football-data.co.uk code, e.g. 'E0'
  name         text NOT NULL,
  country      text,
  kind         text NOT NULL CHECK (kind IN ('league', 'cup', 'continental', 'international')),
  tier         int
);

CREATE TABLE season (
  id             serial PRIMARY KEY,
  competition_id int  NOT NULL REFERENCES competition(id),
  year           int  NOT NULL,                      -- API-Football season year (start year)
  starts_on      date,
  ends_on        date,
  coverage       jsonb,                              -- /leagues coverage flags at the time
  UNIQUE (competition_id, year)
);

CREATE TABLE venue (
  id         serial PRIMARY KEY,
  af_id      int UNIQUE,
  name       text,
  city       text,
  country    text,
  capacity   int,
  surface    text,                                   -- 'grass' | 'artificial turf'
  lat        double precision,                       -- geocoded from city
  lon        double precision
);

CREATE TABLE team (
  id        serial PRIMARY KEY,
  af_id     int UNIQUE,
  name      text NOT NULL,
  country   text,
  national  boolean NOT NULL DEFAULT false,
  venue_id  int REFERENCES venue(id)
);

-- Every spelling a source uses for a team ('Man United', 'Manchester Utd').
CREATE TABLE team_alias (
  source  text NOT NULL,
  alias   text NOT NULL,
  team_id int  NOT NULL REFERENCES team(id),
  PRIMARY KEY (source, alias)
);

CREATE TABLE player (
  id         serial PRIMARY KEY,
  af_id      int UNIQUE,
  name       text NOT NULL,
  birth_date date,
  position   text                                    -- G | D | M | F (most frequent)
);

CREATE TABLE coach (
  id      serial PRIMARY KEY,
  af_id   int UNIQUE,
  name    text NOT NULL
);

-- Coach spells per team, from /coachs career (start/end dates).
CREATE TABLE coach_spell (
  coach_id  int  NOT NULL REFERENCES coach(id),
  team_id   int  NOT NULL REFERENCES team(id),
  starts_on date NOT NULL,
  ends_on   date,
  PRIMARY KEY (coach_id, team_id, starts_on)
);

CREATE TABLE referee (
  id       serial PRIMARY KEY,
  name     text NOT NULL,                            -- normalised: 'Peter Bankes'
  country  text,
  UNIQUE (name, country)
);

-- ---------------------------------------------------------------- matches

CREATE TABLE match (
  id              bigserial PRIMARY KEY,
  af_fixture_id   int UNIQUE,
  season_id       int  NOT NULL REFERENCES season(id),
  round           text,
  kickoff         timestamptz NOT NULL,
  home_team_id    int  NOT NULL REFERENCES team(id),
  away_team_id    int  NOT NULL REFERENCES team(id),
  venue_id        int REFERENCES venue(id),
  neutral         boolean NOT NULL DEFAULT false,
  referee_id      int REFERENCES referee(id),
  status          text NOT NULL CHECK (status IN ('scheduled', 'live', 'finished', 'postponed', 'cancelled', 'abandoned')),
  CHECK (home_team_id <> away_team_id)
);
CREATE INDEX match_kickoff ON match (kickoff);
CREATE INDEX match_team_home ON match (home_team_id, kickoff);
CREATE INDEX match_team_away ON match (away_team_id, kickoff);

-- Final result. Separate from match so "known at" is explicit.
CREATE TABLE result (
  match_id      bigint PRIMARY KEY REFERENCES match(id),
  home_goals    int NOT NULL,
  away_goals    int NOT NULL,
  ht_home_goals int,
  ht_away_goals int,
  went_to_extra boolean NOT NULL DEFAULT false,      -- 90-minute goals are home_goals/away_goals
  available_at  timestamptz NOT NULL,
  backfilled    boolean NOT NULL DEFAULT false
);

-- Team statistics per match (and per half). One row per team per period.
CREATE TABLE match_team_stats (
  match_id        bigint NOT NULL REFERENCES match(id),
  team_id         int    NOT NULL REFERENCES team(id),
  period          text   NOT NULL CHECK (period IN ('ft', '1h', '2h')),
  xg              real,
  goals_prevented real,
  shots           int,
  shots_on_target int,
  shots_inside    int,
  shots_outside   int,
  shots_blocked   int,
  corners         int,
  fouls           int,
  offsides        int,
  yellow_cards    int,
  red_cards       int,
  possession      real,                              -- 0..1
  passes          int,
  passes_accurate int,
  gk_saves        int,
  source          text NOT NULL,                     -- 'api-football' | 'football-data'
  available_at    timestamptz NOT NULL,
  backfilled      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, team_id, period, source)
);

CREATE TABLE match_event (
  id           bigserial PRIMARY KEY,
  match_id     bigint NOT NULL REFERENCES match(id),
  team_id      int    NOT NULL REFERENCES team(id),
  minute       int    NOT NULL,
  extra_minute int,
  kind         text   NOT NULL CHECK (kind IN ('goal', 'own_goal', 'penalty_goal', 'missed_penalty', 'yellow', 'second_yellow', 'red', 'sub', 'var')),
  player_id    int REFERENCES player(id),
  assist_id    int REFERENCES player(id),
  detail       text,
  available_at timestamptz NOT NULL
);
CREATE INDEX match_event_match ON match_event (match_id);

CREATE TABLE lineup (
  match_id     bigint NOT NULL REFERENCES match(id),
  team_id      int    NOT NULL REFERENCES team(id),
  formation    text,
  coach_id     int REFERENCES coach(id),
  available_at timestamptz NOT NULL,                 -- when the official lineup was first seen
  backfilled   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, team_id)
);

CREATE TABLE lineup_player (
  match_id  bigint NOT NULL,
  team_id   int    NOT NULL,
  player_id int    NOT NULL REFERENCES player(id),
  starter   boolean NOT NULL,
  position  text,
  grid      text,
  PRIMARY KEY (match_id, team_id, player_id),
  FOREIGN KEY (match_id, team_id) REFERENCES lineup(match_id, team_id)
);

CREATE TABLE player_match_stats (
  match_id        bigint NOT NULL REFERENCES match(id),
  player_id       int    NOT NULL REFERENCES player(id),
  team_id         int    NOT NULL REFERENCES team(id),
  minutes         int    NOT NULL,
  position        text,
  rating          real,
  shots           int, shots_on_target int,
  goals           int, assists int,
  key_passes      int, passes int, pass_accuracy real,
  tackles         int, interceptions int, blocks int,
  duels           int, duels_won int,
  saves           int, goals_conceded int,
  fouls_committed int, fouls_drawn int,
  yellow          int, red int,
  available_at    timestamptz NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX player_match_stats_team ON player_match_stats (team_id, match_id);

-- Every injury list we fetched, appended. first seen = earliest available_at.
CREATE TABLE injury_report (
  id           bigserial PRIMARY KEY,
  match_id     bigint NOT NULL REFERENCES match(id),
  team_id      int    NOT NULL REFERENCES team(id),
  player_id    int    NOT NULL REFERENCES player(id),
  status       text   NOT NULL CHECK (status IN ('out', 'doubtful')),
  reason       text,
  available_at timestamptz NOT NULL,
  backfilled   boolean NOT NULL DEFAULT false
);
CREATE INDEX injury_report_match ON injury_report (match_id, available_at);

-- Weather at kickoff (forecast before, observed after). Only used if step 3 shows value.
CREATE TABLE weather (
  match_id      bigint NOT NULL REFERENCES match(id),
  kind          text   NOT NULL CHECK (kind IN ('forecast', 'observed')),
  temperature_c real, precipitation_mm real, wind_kmh real, humidity real,
  available_at  timestamptz NOT NULL,
  PRIMARY KEY (match_id, kind, available_at)
);

-- ---------------------------------------------------------------- odds

CREATE TABLE bookmaker (
  id        serial PRIMARY KEY,
  key       text UNIQUE NOT NULL,                    -- 'pinnacle', 'bet365'
  sharp     boolean NOT NULL DEFAULT false
);

-- Market and selection use one vocabulary across sources:
-- market: '1x2' | 'dc' | 'dnb' | 'ah' | 'ou' | 'btts' | 'team_ou' | 'corners_ou' | 'cards_ou' | 'cs' | 'player_goal' | ...
-- selection: 'home' | 'draw' | 'away' | 'over' | 'under' | 'yes' | 'no' | '2-1' | player id ...
-- line: handicap / total (NULL when the market has none).
CREATE TABLE odds_snapshot (
  id           bigserial PRIMARY KEY,
  match_id     bigint NOT NULL REFERENCES match(id),
  bookmaker_id int    NOT NULL REFERENCES bookmaker(id),
  market       text   NOT NULL,
  period       text   NOT NULL DEFAULT 'ft',
  line         numeric(5,2),
  selection    text   NOT NULL,
  odds         numeric(8,3) NOT NULL CHECK (odds > 1),
  observed_at  timestamptz NOT NULL,                 -- = available_at
  kind         text   NOT NULL DEFAULT 'snapshot' CHECK (kind IN ('snapshot', 'opening', 'closing')),
  source       text   NOT NULL
);
CREATE INDEX odds_snapshot_lookup ON odds_snapshot (match_id, market, line, selection, observed_at);

-- Closing price per bookmaker: the last snapshot before kickoff, or an explicit closing row (football-data).
CREATE VIEW closing_odds AS
SELECT DISTINCT ON (o.match_id, o.bookmaker_id, o.market, o.period, o.line, o.selection)
       o.match_id, o.bookmaker_id, o.market, o.period, o.line, o.selection, o.odds, o.observed_at
FROM odds_snapshot o
JOIN match m ON m.id = o.match_id
WHERE o.kind = 'closing' OR (o.kind = 'snapshot' AND o.observed_at <= m.kickoff)
ORDER BY o.match_id, o.bookmaker_id, o.market, o.period, o.line, o.selection,
         (o.kind = 'closing') DESC, o.observed_at DESC;

-- ---------------------------------------------------------------- ratings and features

-- Rating after each match (append-only), so any rating "as of" a date is a lookup.
CREATE TABLE rating_history (
  team_id     int    NOT NULL REFERENCES team(id),
  system      text   NOT NULL,                       -- 'elo-v1' | 'attack-v1' | 'defence-v1' | ...
  match_id    bigint REFERENCES match(id),           -- the match that produced this value (NULL = initial)
  value       double precision NOT NULL,
  valid_from  timestamptz NOT NULL,                  -- = that match's result available_at
  PRIMARY KEY (team_id, system, valid_from)
);

-- Every feature the engine knows, and whether walk-forward testing accepted it.
CREATE TABLE feature_definition (
  name         text NOT NULL,
  version      int  NOT NULL,
  family       text NOT NULL,                        -- 'form' | 'rating' | 'fatigue' | 'context' | 'squad' | 'market' | 'h2h' | ...
  description  text NOT NULL,
  status       text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'accepted', 'rejected', 'retired')),
  evidence     jsonb,                                -- out-of-sample delta log loss with CI, from step 5
  PRIMARY KEY (name, version)
);

-- A frozen list of feature (name, version) pairs. Models reference a feature set.
CREATE TABLE feature_set (
  version     text PRIMARY KEY,                      -- 'fs-2026.10.1'
  features    jsonb NOT NULL,                        -- [["elo_diff", 1], ...]
  code_sha    text  NOT NULL,                        -- git commit of the feature code
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Feature vector of one match at one cutoff (append-only; recompute = new row).
CREATE TABLE match_feature (
  match_id     bigint NOT NULL REFERENCES match(id),
  feature_set  text   NOT NULL REFERENCES feature_set(version),
  stage        text   NOT NULL CHECK (stage IN ('early', 'pre_lineup', 'post_lineup')),
  cutoff       timestamptz NOT NULL,                 -- only data with available_at < cutoff was read
  values       jsonb  NOT NULL,                      -- {"elo_diff": 112.4, "home_rest_days": 6, ...} (null = missing)
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, feature_set, stage, cutoff)
);

-- ---------------------------------------------------------------- models and predictions

CREATE TABLE model (
  version        text PRIMARY KEY,                   -- 'dc-2026.10.1'
  family         text NOT NULL,                      -- 'poisson' | 'dixon-coles' | 'elo' | 'logreg' | 'rf' | 'lgbm' | 'nn' | 'ensemble'
  feature_set    text REFERENCES feature_set(version),
  params         jsonb NOT NULL,
  trained_from   date,
  trained_to     date,
  code_sha       text NOT NULL,
  artifact_uri   text,                               -- where the fitted model file is stored
  status         text NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow', 'live', 'retired', 'rejected')),
  promoted_at    timestamptz,
  evaluation     jsonb,                              -- out-of-sample metrics that justified promotion
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Append-only: one row per (model, match, market, line, selection, stage, time).
CREATE TABLE prediction (
  id               bigserial PRIMARY KEY,
  match_id         bigint NOT NULL REFERENCES match(id),
  model_version    text   NOT NULL REFERENCES model(version),
  feature_set      text   REFERENCES feature_set(version),
  stage            text   NOT NULL CHECK (stage IN ('early', 'pre_lineup', 'post_lineup', 'live')),
  market           text   NOT NULL,
  period           text   NOT NULL DEFAULT 'ft',
  line             numeric(5,2),
  selection        text   NOT NULL,
  probability      double precision NOT NULL CHECK (probability >= 0 AND probability <= 1),
  raw_probability  double precision,                 -- before calibration
  calibrator       text,                             -- 'isotonic-1x2-2026.10.1'
  market_probability double precision,              -- de-vigged consensus at prediction time
  best_odds        numeric(8,3),
  best_bookmaker_id int REFERENCES bookmaker(id),
  confidence       int CHECK (confidence BETWEEN 0 AND 100),
  explanation      jsonb,                            -- top feature contributions
  data_as_of       timestamptz NOT NULL,             -- the feature cutoff
  created_at       timestamptz NOT NULL DEFAULT now(),
  is_backtest      boolean NOT NULL DEFAULT false,
  backtest_id      bigint
);
CREATE INDEX prediction_match ON prediction (match_id, market, created_at);

-- ---------------------------------------------------------------- backtests and bets

CREATE TABLE backtest (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  config        jsonb NOT NULL,                      -- folds, models, thresholds, staking
  code_sha      text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  summary       jsonb                                -- per fold / market / league metrics
);
ALTER TABLE prediction ADD CONSTRAINT prediction_backtest FOREIGN KEY (backtest_id) REFERENCES backtest(id);

-- A bet the strategy placed (paper, backtest or real).
CREATE TABLE bet (
  id             bigserial PRIMARY KEY,
  prediction_id  bigint NOT NULL REFERENCES prediction(id),
  backtest_id    bigint REFERENCES backtest(id),
  mode           text   NOT NULL CHECK (mode IN ('backtest', 'paper', 'real')),
  bookmaker_id   int    NOT NULL REFERENCES bookmaker(id),
  odds           numeric(8,3) NOT NULL,
  stake          numeric(10,2) NOT NULL CHECK (stake > 0),
  bankroll_before numeric(12,2),
  kelly_fraction real,
  placed_at      timestamptz NOT NULL,
  correlation_group text                             -- same match / same outcome cluster
);

-- Settlement of a bet, plus closing line for CLV.
CREATE TABLE bet_result (
  bet_id         bigint PRIMARY KEY REFERENCES bet(id),
  outcome        text NOT NULL CHECK (outcome IN ('won', 'lost', 'void', 'half_won', 'half_lost')),
  profit         numeric(10,2) NOT NULL,
  closing_odds   numeric(8,3),
  closing_fair_probability double precision,         -- de-vigged sharp close
  clv            double precision,                   -- odds / closing_odds - 1
  settled_at     timestamptz NOT NULL
);

-- Prediction engine API layer (step 8). Run after 001_schema.sql.
--
-- The Python jobs write; the site (Next.js on Vercel) only reads these views through
-- its own route handlers (/api/pe/...), behind the site's login. Views keep the SQL in
-- one place so the endpoints stay thin and every number on the dashboard has one source.

SET search_path = pe;

-- ---------------------------------------------------------------- append-only guard

-- The ledger rule from the site applies here too: predictions, value bets, bets,
-- odds and features are never edited or deleted. Corrections are new rows.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% refused)', TG_TABLE_NAME, TG_OP;
END $$;

CREATE TRIGGER prediction_append_only BEFORE UPDATE OR DELETE ON prediction
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER odds_snapshot_append_only BEFORE UPDATE OR DELETE ON odds_snapshot
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER match_feature_append_only BEFORE UPDATE OR DELETE ON match_feature
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER bet_append_only BEFORE UPDATE OR DELETE ON bet
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------------------------------------------------------------- value bets (step 6 + 7 output)

-- One row per evaluated selection per run, approved or not, so "why not" is always answerable.
CREATE TABLE value_bet (
  id               bigserial PRIMARY KEY,
  prediction_id    bigint NOT NULL REFERENCES prediction(id),
  run_at           timestamptz NOT NULL,              -- the evaluation run (one per stage per match)
  odds             numeric(8,3) NOT NULL,
  bookmaker_id     int REFERENCES bookmaker(id),
  implied_probability double precision NOT NULL,      -- 1 / odds
  fair_probability double precision NOT NULL,         -- de-vigged consensus
  edge             double precision NOT NULL,         -- probability - fair_probability
  ev               double precision NOT NULL,         -- probability * odds - 1
  ev_low           double precision NOT NULL,         -- EV at the lower bound of the shrunk probability
  confidence       int NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  is_bet           boolean NOT NULL,
  rank             int,                               -- among approved bets in this run
  rejected_because text,                              -- '' when approved
  stake_share      double precision,                  -- step 7: share of bankroll (0 when not a bet)
  capped_by        text,
  uncertainty      jsonb NOT NULL                     -- {"tau":..,"scale":..,"sigma":..,"spread":..}
);
CREATE INDEX value_bet_run ON value_bet (run_at);
CREATE TRIGGER value_bet_append_only BEFORE UPDATE OR DELETE ON value_bet
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------------------------------------------------------------- read views

-- Newest live prediction per match, market, line and selection (shadow models excluded).
CREATE VIEW latest_prediction AS
SELECT DISTINCT ON (p.match_id, p.market, p.period, p.line, p.selection)
       p.*, mo.family AS model_family
FROM prediction p
JOIN model mo ON mo.version = p.model_version
WHERE NOT p.is_backtest AND mo.status = 'live'
ORDER BY p.match_id, p.market, p.period, p.line, p.selection, p.created_at DESC;

-- One row per match with the headline probabilities (point 41). GET /matches/*, /match/{id}
CREATE VIEW match_card AS
SELECT m.id AS match_id, m.kickoff, m.status, c.name AS competition, ht.name AS home, at.name AS away,
       r.home_goals, r.away_goals,
       max(lp.probability) FILTER (WHERE lp.market = '1x2' AND lp.selection = 'home') AS p_home,
       max(lp.probability) FILTER (WHERE lp.market = '1x2' AND lp.selection = 'draw') AS p_draw,
       max(lp.probability) FILTER (WHERE lp.market = '1x2' AND lp.selection = 'away') AS p_away,
       max(lp.probability) FILTER (WHERE lp.market = 'ou' AND lp.line = 2.5 AND lp.selection = 'over') AS p_over25,
       max(lp.probability) FILTER (WHERE lp.market = 'btts' AND lp.selection = 'yes') AS p_btts,
       max(lp.stage) AS stage, max(lp.model_version) AS model_version, max(lp.data_as_of) AS data_as_of
FROM match m
JOIN season s ON s.id = m.season_id
JOIN competition c ON c.id = s.competition_id
JOIN team ht ON ht.id = m.home_team_id
JOIN team at ON at.id = m.away_team_id
LEFT JOIN result r ON r.match_id = m.id
LEFT JOIN latest_prediction lp ON lp.match_id = m.id
GROUP BY m.id, c.name, ht.name, at.name, r.home_goals, r.away_goals;

-- Latest evaluation run per match, all selections (approved or not). GET /value-bets
CREATE VIEW latest_value_bet AS
SELECT v.*, p.match_id, p.market, p.line, p.selection, p.probability, p.model_version, p.stage
FROM value_bet v
JOIN prediction p ON p.id = v.prediction_id
WHERE v.run_at = (SELECT max(v2.run_at) FROM value_bet v2 JOIN prediction p2 ON p2.id = v2.prediction_id
                  WHERE p2.match_id = p.match_id);

-- Market view per match (point 17): current, opening and best price per selection. GET /market/{match_id}
CREATE VIEW market_quote AS
WITH cur AS (
  SELECT DISTINCT ON (o.match_id, o.bookmaker_id, o.market, o.line, o.selection)
         o.match_id, o.bookmaker_id, o.market, o.line, o.selection, o.odds, o.observed_at
  FROM odds_snapshot o JOIN match m ON m.id = o.match_id
  WHERE o.kind <> 'closing' AND o.observed_at < m.kickoff
  ORDER BY o.match_id, o.bookmaker_id, o.market, o.line, o.selection, o.observed_at DESC
), opn AS (
  SELECT DISTINCT ON (o.match_id, o.bookmaker_id, o.market, o.line, o.selection)
         o.match_id, o.bookmaker_id, o.market, o.line, o.selection, o.odds
  FROM odds_snapshot o
  ORDER BY o.match_id, o.bookmaker_id, o.market, o.line, o.selection, o.observed_at
)
SELECT cur.match_id, cur.market, cur.line, cur.selection,
       count(*) AS books,
       avg(cur.odds) AS odds_avg,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY cur.odds) AS odds_median,
       max(cur.odds) AS odds_best,
       (array_agg(b.key ORDER BY cur.odds DESC))[1] AS best_book,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY opn.odds) AS odds_open_median,
       max(cur.observed_at) AS updated_at
FROM cur
JOIN bookmaker b ON b.id = cur.bookmaker_id
LEFT JOIN opn ON opn.match_id = cur.match_id AND opn.bookmaker_id = cur.bookmaker_id AND opn.market = cur.market
             AND opn.line IS NOT DISTINCT FROM cur.line AND opn.selection = cur.selection
GROUP BY cur.match_id, cur.market, cur.line, cur.selection;

-- Prediction quality on settled matches (points 22, 32). GET /model/performance
CREATE VIEW prediction_score AS
SELECT p.id AS prediction_id, p.match_id, p.model_version, p.market, p.line, p.selection, p.stage,
       p.probability, p.is_backtest, p.backtest_id, c.name AS competition, m.kickoff,
       CASE p.market
         WHEN '1x2' THEN (p.selection = 'home' AND r.home_goals > r.away_goals)
                      OR (p.selection = 'draw' AND r.home_goals = r.away_goals)
                      OR (p.selection = 'away' AND r.home_goals < r.away_goals)
         WHEN 'ou' THEN (p.selection = 'over' AND r.home_goals + r.away_goals > p.line)
                     OR (p.selection = 'under' AND r.home_goals + r.away_goals < p.line)
         WHEN 'btts' THEN (p.selection = 'yes') = (r.home_goals > 0 AND r.away_goals > 0)
       END AS happened
FROM prediction p
JOIN match m ON m.id = p.match_id
JOIN season s ON s.id = m.season_id
JOIN competition c ON c.id = s.competition_id
JOIN result r ON r.match_id = p.match_id
WHERE p.market IN ('1x2', 'ou', 'btts');

-- Log loss = mean of -ln p(the outcome that happened), one row per match and market.
-- Brier = sum over the market's selections of (p - outcome)^2, averaged per match.
CREATE VIEW model_performance AS
SELECT model_version, competition, market, date_trunc('month', kickoff) AS month, is_backtest,
       count(DISTINCT match_id) AS matches,
       avg(-ln(greatest(probability, 1e-6))) FILTER (WHERE happened) AS log_loss,
       sum((probability - happened::int) ^ 2) / count(DISTINCT match_id) AS brier,
       avg(happened::int) FILTER (WHERE probability >= 0.5) AS hit_rate_when_favoured,
       min(kickoff) AS first_kickoff, max(kickoff) AS last_kickoff
FROM prediction_score
WHERE happened IS NOT NULL
GROUP BY model_version, competition, market, date_trunc('month', kickoff), is_backtest;

-- Bets with settlement (point 32-33): ROI, CLV, drawdown are computed in the endpoint from this.
CREATE VIEW bet_ledger AS
SELECT b.id AS bet_id, b.mode, b.backtest_id, b.placed_at, b.odds, b.stake, b.bankroll_before, b.kelly_fraction,
       bk.key AS bookmaker, p.match_id, p.market, p.line, p.selection, p.probability, p.model_version,
       c.name AS competition, m.kickoff,
       br.outcome, br.profit, br.closing_odds, br.clv, br.settled_at
FROM bet b
JOIN prediction p ON p.id = b.prediction_id
JOIN bookmaker bk ON bk.id = b.bookmaker_id
JOIN match m ON m.id = p.match_id
JOIN season s ON s.id = m.season_id
JOIN competition c ON c.id = s.competition_id
LEFT JOIN bet_result br ON br.bet_id = b.id;

RESET search_path;
