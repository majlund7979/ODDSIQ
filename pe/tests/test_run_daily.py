import importlib.util
from pathlib import Path

import psycopg
import pytest

spec = importlib.util.spec_from_file_location("run_daily", Path(__file__).resolve().parents[1] / "scripts" / "run_daily.py")
run_daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_daily)


def test_connect_retries_a_dropped_connection_and_then_gives_up(monkeypatch):
    calls = []

    def fake_connect(dsn, autocommit):
        calls.append(dsn)
        if len(calls) < 2:
            raise psycopg.OperationalError("terminating connection due to administrator command")
        return "conn"

    monkeypatch.setattr(psycopg, "connect", fake_connect)
    monkeypatch.setattr(run_daily.time, "sleep", lambda s: None)
    assert run_daily.connect("dsn") == "conn" and len(calls) == 2

    calls.clear()
    monkeypatch.setattr(psycopg, "connect", lambda dsn, autocommit: calls.append(dsn) or (_ for _ in ()).throw(psycopg.OperationalError("down")))
    with pytest.raises(psycopg.OperationalError):
        run_daily.connect("dsn", attempts=3)
    assert len(calls) == 3
