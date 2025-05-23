import importlib.util
import io
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

# Import fetch_gtfs module directly
_fetch_gtfs_path = Path(__file__).parent.parent / "scripts" / "fetch_gtfs.py"
_spec = importlib.util.spec_from_file_location("fetch_gtfs", _fetch_gtfs_path)
fetch_gtfs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fetch_gtfs)


def _make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("stops.txt", "stop_id,stop_name\n1,Foo\n")
    return buf.getvalue()


def test_download_and_extract(monkeypatch, tmp_path):
    """main() should download, unzip, and move contents into TARGET_DIR."""
    fake_zip = _make_zip()

    # --- stub requests.get ---------------------------------
    def fake_get(url, timeout):
        assert url == fetch_gtfs.GTFS_URL
        assert timeout == 60
        return SimpleNamespace(
            content=fake_zip, status_code=200, raise_for_status=lambda: None
        )

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)

    # --- redirect TARGET_DIR into a temp dir ---------------
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", tmp_path / "data")

    # run it
    fetch_gtfs.main()

    target = fetch_gtfs.TARGET_DIR
    assert target.exists()
    assert (target / "stops.txt").read_text().startswith("stop_id")


def test_network_failure(monkeypatch, tmp_path):
    """main() should raise an exception when network request fails."""

    def fake_get(url, timeout):
        raise requests.exceptions.ConnectionError("Network error")

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", tmp_path / "data")

    with pytest.raises(requests.exceptions.ConnectionError):
        fetch_gtfs.main()


def test_http_error_status(monkeypatch, tmp_path):
    """main() should raise an exception when HTTP status indicates error."""

    def fake_get(url, timeout):
        def raise_for_status():
            raise requests.exceptions.HTTPError("404 Not Found")

        return SimpleNamespace(
            content=b"", status_code=404, raise_for_status=raise_for_status
        )

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", tmp_path / "data")

    with pytest.raises(requests.exceptions.HTTPError):
        fetch_gtfs.main()


def test_invalid_zip_file(monkeypatch, tmp_path):
    """main() should raise an exception when downloaded content is not a valid ZIP."""

    def fake_get(url, timeout):
        return SimpleNamespace(
            content=b"invalid zip content",
            status_code=200,
            raise_for_status=lambda: None,
        )

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", tmp_path / "data")

    with pytest.raises(zipfile.BadZipFile):
        fetch_gtfs.main()


def test_cleanup_existing_target_dir(monkeypatch, tmp_path):
    """main() should remove existing TARGET_DIR before extracting new content."""
    fake_zip = _make_zip()

    # Create existing target directory with old content
    target_dir = tmp_path / "data"
    target_dir.mkdir(parents=True)
    old_file = target_dir / "old_file.txt"
    old_file.write_text("old content")

    def fake_get(url, timeout):
        return SimpleNamespace(
            content=fake_zip, status_code=200, raise_for_status=lambda: None
        )

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", target_dir)

    # run it
    fetch_gtfs.main()

    # Verify old content is gone and new content is present
    assert not old_file.exists()
    assert (target_dir / "stops.txt").exists()
    assert (target_dir / "stops.txt").read_text().startswith("stop_id")


def test_empty_zip_file(monkeypatch, tmp_path):
    """main() should handle empty ZIP files gracefully."""
    # Create an empty but valid ZIP file
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as _:
        pass  # Empty ZIP
    empty_zip = buf.getvalue()

    def fake_get(url, timeout):
        return SimpleNamespace(
            content=empty_zip, status_code=200, raise_for_status=lambda: None
        )

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", tmp_path / "data")

    # Should not raise an exception
    fetch_gtfs.main()

    target = fetch_gtfs.TARGET_DIR
    assert target.exists()
    # Directory should be empty (no files)
    assert list(target.iterdir()) == []


def test_zip_with_multiple_files(monkeypatch, tmp_path):
    """main() should extract all files from ZIP archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("stops.txt", "stop_id,stop_name\n1,Station A\n")
        z.writestr("routes.txt", "route_id,route_name\n1,Local\n")
        z.writestr("trips.txt", "trip_id,route_id\n1,1\n")
    multi_file_zip = buf.getvalue()

    def fake_get(url, timeout):
        return SimpleNamespace(
            content=multi_file_zip, status_code=200, raise_for_status=lambda: None
        )

    monkeypatch.setattr(fetch_gtfs.requests, "get", fake_get)
    monkeypatch.setattr(fetch_gtfs, "TARGET_DIR", tmp_path / "data")

    fetch_gtfs.main()

    target = fetch_gtfs.TARGET_DIR
    assert target.exists()
    assert (target / "stops.txt").exists()
    assert (target / "routes.txt").exists()
    assert (target / "trips.txt").exists()

    # Verify content
    assert (target / "stops.txt").read_text().startswith("stop_id")
    assert (target / "routes.txt").read_text().startswith("route_id")
    assert (target / "trips.txt").read_text().startswith("trip_id")
