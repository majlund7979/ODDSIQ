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
