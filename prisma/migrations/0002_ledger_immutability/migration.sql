-- The prediction ledger is append-only. Once a prediction row exists, no
-- statement may change or remove it, whatever application code does.
-- Closing odds and results go to "PredictionOutcome"; an outcome may be
-- filled in (closing price, then result) but never rewritten once set.

CREATE OR REPLACE FUNCTION oddsiq_reject_prediction_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Prediction ledger is append-only: % on "Prediction" is not allowed (id=%)', TG_OP, OLD.id
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prediction_no_update
  BEFORE UPDATE ON "Prediction"
  FOR EACH ROW EXECUTE FUNCTION oddsiq_reject_prediction_change();

CREATE TRIGGER prediction_no_delete
  BEFORE DELETE ON "Prediction"
  FOR EACH ROW EXECUTE FUNCTION oddsiq_reject_prediction_change();

-- TRUNCATE bypasses row triggers, so block it separately.
CREATE OR REPLACE FUNCTION oddsiq_reject_prediction_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Prediction ledger is append-only: TRUNCATE on "Prediction" is not allowed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prediction_no_truncate
  BEFORE TRUNCATE ON "Prediction"
  FOR EACH STATEMENT EXECUTE FUNCTION oddsiq_reject_prediction_truncate();

-- Each new prediction must extend the chain: consecutive sequence number and
-- prevHash equal to the previous row's hash.
CREATE OR REPLACE FUNCTION oddsiq_check_prediction_chain() RETURNS trigger AS $$
DECLARE
  last_seq INT;
  last_hash TEXT;
BEGIN
  SELECT seq, hash INTO last_seq, last_hash FROM "Prediction" ORDER BY seq DESC LIMIT 1;
  IF last_seq IS NULL THEN
    IF NEW.seq <> 1 OR NEW."prevHash" <> repeat('0', 64) THEN
      RAISE EXCEPTION 'First ledger entry must have seq 1 and the genesis prevHash';
    END IF;
  ELSIF NEW.seq <> last_seq + 1 OR NEW."prevHash" <> last_hash THEN
    RAISE EXCEPTION 'Ledger entry % does not extend the chain (expected seq %, prevHash %)', NEW.seq, last_seq + 1, last_hash;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prediction_extends_chain
  BEFORE INSERT ON "Prediction"
  FOR EACH ROW EXECUTE FUNCTION oddsiq_check_prediction_chain();

-- Outcomes: closing odds are fixed once written; a result may be set once.
CREATE OR REPLACE FUNCTION oddsiq_guard_outcome() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Prediction outcomes cannot be deleted (prediction=%)', OLD."predictionId";
  END IF;
  IF NEW."closingOdds" IS DISTINCT FROM OLD."closingOdds"
     OR NEW."closingFairProbability" IS DISTINCT FROM OLD."closingFairProbability"
     OR NEW."predictionId" IS DISTINCT FROM OLD."predictionId" THEN
    RAISE EXCEPTION 'Closing price for prediction % is already recorded', OLD."predictionId";
  END IF;
  IF OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN
    RAISE EXCEPTION 'Result for prediction % is already settled', OLD."predictionId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outcome_guard
  BEFORE UPDATE OR DELETE ON "PredictionOutcome"
  FOR EACH ROW EXECUTE FUNCTION oddsiq_guard_outcome();
