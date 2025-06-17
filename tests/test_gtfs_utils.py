import runpy
from functools import lru_cache
from pathlib import Path

import pytest

from caltrain_mcp import gtfs
from caltrain_mcp import server


def test_get_gtfs_folder_exists():
    folder = gtfs.get_gtfs_folder()
    assert folder.exists()
    assert folder.name == "caltrain-ca-us"


def test_get_gtfs_folder_missing(monkeypatch):
    monkeypatch.setattr(Path, "exists", lambda self: False)
    with pytest.raises(FileNotFoundError):
        gtfs.get_gtfs_folder()


def test_load_gtfs_data(monkeypatch):
    folder = gtfs.get_gtfs_folder()
    monkeypatch.setattr(gtfs, "get_gtfs_folder", lambda: folder)
    data = gtfs.load_gtfs_data()
    assert not data.stations.empty
    assert "stop_id" in data.all_stops.columns


def test_get_default_data_cached(monkeypatch):
    import importlib

    mod = importlib.reload(gtfs)

    calls = []

    def fake_load():
        calls.append(1)
        return "DATA"

    monkeypatch.setattr(mod, "load_gtfs_data", fake_load)
    mod.get_default_data.cache_clear()
    assert mod.get_default_data() == "DATA"
    assert mod.get_default_data() == "DATA"
    assert len(calls) == 1


def test_list_all_stations(fake_gtfs):
    stations = gtfs.list_all_stations(fake_gtfs)
    assert stations == sorted(stations)
    assert "Palo Alto" in stations


def test_main_entrypoint(monkeypatch):
    called = {}

    def fake_main():
        called["ok"] = True

    monkeypatch.setattr(server, "main", fake_main)
    runpy.run_module("caltrain_mcp.__main__", run_name="__main__")
    assert called.get("ok")
