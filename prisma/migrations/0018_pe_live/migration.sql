-- Prediction engine daily shadow runs (step 10, part 2). Source of truth: pe/sql/003_live.sql.

-- Prediction engine, daily shadow runs (step 10, part 2). Run after 002_api.sql.

SET search_path = pe;

-- Link to the site's event (public."Event".id), so a match is created once and found again.
ALTER TABLE match ADD COLUMN site_event_id text UNIQUE;

-- One row per job run: what it read, what it wrote, and why it skipped things.
CREATE TABLE job_run (
  id           bigserial PRIMARY KEY,
  job          text        NOT NULL,                 -- 'pe-predict'
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  status       text        NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  code_sha     text,
  model_version text,
  summary      jsonb       NOT NULL                  -- counts, unmapped team names, blend weights, error text
);
CREATE INDEX job_run_started ON job_run (job, started_at);

-- Value bets follow the same rule as predictions: a model in shadow mode is never shown.
CREATE OR REPLACE VIEW latest_value_bet AS
SELECT v.*, p.match_id, p.market, p.line, p.selection, p.probability, p.model_version, p.stage
FROM value_bet v
JOIN prediction p ON p.id = v.prediction_id
JOIN model mo ON mo.version = p.model_version
WHERE mo.status = 'live'
  AND v.run_at = (SELECT max(v2.run_at) FROM value_bet v2 JOIN prediction p2 ON p2.id = v2.prediction_id
                  JOIN model mo2 ON mo2.version = p2.model_version
                  WHERE p2.match_id = p.match_id AND mo2.status = 'live');

-- The writer role (created by hand in Neon, see pe/README.md) needs no rights beyond these tables;
-- grants live in the README so the migration runs without the role existing.
RESET search_path;
