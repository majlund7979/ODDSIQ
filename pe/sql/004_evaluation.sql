-- Prediction engine, daily evaluation of the shadow runs (step 10, part 4). Run after 003_live.sql.

SET search_path = pe;

-- One row per evaluation: log loss against the market, CLV, ROI and the go-live verdict.
-- Results and closing prices it uses are copied from the site into result and odds_snapshot.
CREATE TABLE evaluation (
  id           bigserial PRIMARY KEY,
  evaluated_at timestamptz NOT NULL,
  period_from  timestamptz,                         -- first and last kickoff scored
  period_to    timestamptz,
  matches      int         NOT NULL,
  eligible     boolean     NOT NULL,                -- the go-live rule passed (the owner still decides)
  summary      jsonb       NOT NULL                 -- per market log loss, CLV, ROI, 90 % intervals, rule text
);
CREATE INDEX evaluation_at ON evaluation (evaluated_at);
CREATE TRIGGER evaluation_append_only BEFORE UPDATE OR DELETE ON evaluation
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

RESET search_path;
