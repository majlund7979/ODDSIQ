"""Daily shadow run (step 10, part 2): the site's upcoming matches → predictions and value bets in schema pe.

    PE_DATABASE_URL=postgresql://… python3 scripts/run_daily.py --history Matches.csv
    python3 scripts/run_daily.py --history Matches.csv --dry-run --out /tmp/run   # reads only, writes CSVs

Reads the site's tables (Event, Team, Market, Selection, OddsSnapshot, StatsFixture), never writes them.
Writes only to schema pe, with the model in status 'shadow', so nothing appears on the site.
Every run first settles finished matches and scores the earlier runs (engine/live/evaluate.py, pe.evaluation).
Every run, also a failed one, is logged in pe.job_run.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
import warnings
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
warnings.filterwarnings("ignore")

from engine.live import evaluate, predict, site, write  # noqa: E402
from engine.sources import gabora  # noqa: E402


def connect(dsn: str, attempts: int = 3):
    """A new connection, retried a few times. The run reads first, then trains for several minutes without a query, and
    Neon can close a connection that sits idle that long ("AdminShutdown", 8 October twice), so every write uses a new
    connection instead of the one the run started with."""
    import psycopg

    for i in range(attempts):
        try:
            return psycopg.connect(dsn, autocommit=True)
        except psycopg.OperationalError:
            if i == attempts - 1:
                raise
            time.sleep(10 * (i + 1))


def notice(summary: dict) -> None:
    """One GitHub annotation with the run's headline numbers (annotations are readable without the log)."""
    keys = ["upcoming_events", "upcoming_mapped", "results_added", "blend_1x2", "blend_ou25", "matches", "predictions",
            "value_rows", "approved_bets", "odds_rows", "seconds", "why", "results_settled", "closing_rows", "eval_matches", "eligible"]
    short = {k: (round(summary[k], 3) if isinstance(summary[k], float) else summary[k]) for k in keys if k in summary}
    if "validation" in summary:
        short["val_logloss_model_market"] = [round(summary["validation"]["log_loss_model_1x2"], 4),
                                             round(summary["validation"]["log_loss_market_1x2"], 4)]
    if summary.get("unmapped_names"):
        short["unmapped"] = summary["unmapped_names"][:20]
    print("::notice title=PE predict::" + json.dumps(short, ensure_ascii=False, default=str))


def daily_evaluation(conn, now, write: bool) -> dict:
    """Settles finished matches and scores the shadow runs (pe.evaluation). A failure here is reported
    but does not stop the day's predictions."""
    try:
        settled = evaluate.settle(conn, now) if write else {}
        s = evaluate.evaluate(conn, now, write=write)
        m = s["markets"].get("1x2", {})
        print(f"evaluation: {s['matches']} settled matches; 1x2 log loss final/model/market "
              f"{m.get('log_loss_final')}/{m.get('log_loss_model')}/{m.get('log_loss_market')}; eligible={s['eligible']}")
        return {**settled, "eval_matches": s["matches"], "eligible": s["eligible"]}
    except Exception as e:  # noqa: BLE001
        print(f"::warning title=PE evaluation::{type(e).__name__}: {str(e)[:500]}")
        return {"eval_error": f"{type(e).__name__}: {e}"[:500]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", required=True, help="xgabora Matches.csv (football-data history)")
    ap.add_argument("--first-season", type=int, default=2019, help="history before this season is not loaded")
    ap.add_argument("--days", type=int, default=7, help="predict matches up to this many days ahead")
    ap.add_argument("--dry-run", action="store_true", help="read the database, write nothing to it")
    ap.add_argument("--out", help="also write the run as CSV/JSON here")
    ap.add_argument("--now", help="pretend it is this UTC time (testing)")
    args = ap.parse_args()
    dsn = os.environ.get("PE_DATABASE_URL")
    if not dsn:
        print("::error::PE_DATABASE_URL is not set (the workflow gets it from the site, see pe/README.md, 'Daily shadow run').")
        sys.exit(1)

    sha = os.environ.get("GITHUB_SHA")
    now = pd.Timestamp(args.now, tz="UTC") if args.now else pd.Timestamp.now(tz="UTC").floor("s")
    t0 = time.time()
    with connect(dsn) as conn:
        ev = daily_evaluation(conn, now, write=not args.dry_run)
        try:
            history = gabora.to_frames(pd.read_csv(args.history, low_memory=False), first_season=args.first_season)
            last = history["matches"]["kickoff"].max()
            events = site.events(conn, last - pd.Timedelta(days=3), now + pd.Timedelta(days=args.days + 1))
            res = site.stats_results(conn, last - pd.Timedelta(days=3))
            print(f"history to {last:%Y-%m-%d}: {len(history['matches'])} matches; site: {len(events)} events, {len(res)} stats results")
            frames, upcoming, report = predict.assemble(history, events, res, now, horizon_days=args.days)
            report = {**report, **ev}
            print(json.dumps(report, ensure_ascii=False, default=str))
            if upcoming.empty:
                if not args.dry_run:
                    write.log_run(conn, now, "skipped", {**report, "why": "no upcoming matches in covered leagues"}, sha)
                print("no upcoming matches in the covered leagues; nothing to predict")
                notice({**report, "why": "no upcoming matches"})
                return
            run = predict.predict(frames, upcoming, site.odds(conn, upcoming["event_id"]), now)
            summary = {**report, "blend_1x2": run.model["blend_1x2"], "blend_ou25": run.model["blend_ou25"],
                       "validation": run.model["validation"], "seconds": round(time.time() - t0)}
            if args.out:
                out = Path(args.out)
                out.mkdir(parents=True, exist_ok=True)
                run.preds.to_csv(out / "predictions.csv", index=False)
                run.value.to_csv(out / "value.csv", index=False)
                run.matches.to_csv(out / "matches.csv", index=False)
                (out / "summary.json").write_text(json.dumps({**summary, "model": run.model}, indent=1, default=str))
            if args.dry_run:
                print(json.dumps(summary, default=str))
                notice({**summary, "why": "dry run, nothing written"})
                return
            with connect(dsn) as out_conn:
                counts = write.write(out_conn, run, sha)
                summary.update(counts, seconds=round(time.time() - t0))
                write.log_run(out_conn, now, "ok", summary, sha, counts["model_version"])
            print(json.dumps(summary, default=str))
            notice(summary)
        except Exception as e:  # logged, then the job fails visibly
            print(f"::error title=PE predict::{type(e).__name__}: {str(e)[:500]}")
            if not args.dry_run:
                try:
                    with connect(dsn) as log_conn:
                        write.log_run(log_conn, now, "failed", {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-3000:]}, sha)
                except Exception as log_error:  # noqa: BLE001 - the run's own error is the one to report
                    print(f"::warning title=PE predict::the failed run could not be logged: {type(log_error).__name__}: {str(log_error)[:300]}")
            raise


if __name__ == "__main__":
    main()
