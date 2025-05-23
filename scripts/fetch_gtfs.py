#!/usr/bin/env python
"""
Download the latest Caltrain GTFS feed, unzip, and place it in
data/caltrain-ca-us
"""

import io
import pathlib
import shutil
import tempfile
import zipfile

import requests

GTFS_URL = "https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip"
TARGET_DIR = pathlib.Path(__file__).parent.parent / "data" / "caltrain-ca-us"


def main():
    print("Downloading GTFS…")
    r = requests.get(GTFS_URL, timeout=60)
    r.raise_for_status()

    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            zf.extractall(td)
        shutil.rmtree(TARGET_DIR, ignore_errors=True)
        shutil.move(td, TARGET_DIR)
    print(f"✅  GTFS refreshed in {TARGET_DIR}")


if __name__ == "__main__":
    main()
