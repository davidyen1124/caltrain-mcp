"""GTFS data loading and helper functions for Caltrain MCP."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

# Global data frames - will be loaded once at startup
ALL_STOPS_DF = None
STATIONS_DF = None
TRIPS_DF = None
STOP_TIMES_DF = None
CALENDAR_DF = None


def get_gtfs_folder() -> Path:
    """Get the path to the GTFS data folder."""
    # From the package location, go up to workspace root, then to data
    package_dir = Path(__file__).parent
    workspace_root = package_dir.parent.parent
    return workspace_root / "data" / "caltrain-ca-us"


def load_gtfs_data() -> None:
    """Load and prepare GTFS data at startup."""
    global ALL_STOPS_DF, STATIONS_DF, TRIPS_DF, STOP_TIMES_DF, CALENDAR_DF

    gtfs_folder = get_gtfs_folder()
    if not gtfs_folder.exists():
        raise FileNotFoundError(f"GTFS folder '{gtfs_folder}' not found.")

    # Load GTFS files
    ALL_STOPS_DF = pd.read_csv(gtfs_folder / "stops.txt")
    TRIPS_DF = pd.read_csv(gtfs_folder / "trips.txt")
    STOP_TIMES_DF = pd.read_csv(gtfs_folder / "stop_times.txt")
    CALENDAR_DF = pd.read_csv(gtfs_folder / "calendar.txt")

    # Ensure consistent data types for stop_id columns
    ALL_STOPS_DF["stop_id"] = ALL_STOPS_DF["stop_id"].astype(str)
    STOP_TIMES_DF["stop_id"] = STOP_TIMES_DF["stop_id"].astype(str)

    # Filter stops to only include station stops (location_type == 1)
    STATIONS_DF = ALL_STOPS_DF[ALL_STOPS_DF["location_type"] == 1].copy()

    # Create normalized station names for searching
    STATIONS_DF["normalized_name"] = (
        STATIONS_DF["stop_name"]
        .str.lower()
        .str.replace(" station", "")
        .str.replace(" caltrain", "")
    )


def get_active_service_ids(target_date: date) -> list[str]:
    """Get service IDs that are active on the given date."""
    if CALENDAR_DF is None:
        raise RuntimeError("GTFS data not loaded. Call load_gtfs_data() first.")

    weekday_map = {
        0: "monday",
        1: "tuesday",
        2: "wednesday",
        3: "thursday",
        4: "friday",
        5: "saturday",
        6: "sunday",
    }

    day_name = weekday_map[target_date.weekday()]
    date_str = target_date.strftime("%Y%m%d")

    # Find services that run on this day of week and are within date range
    active_services = CALENDAR_DF[
        (CALENDAR_DF[day_name] == 1)
        & (CALENDAR_DF["start_date"] <= int(date_str))
        & (CALENDAR_DF["end_date"] >= int(date_str))
    ]

    return active_services["service_id"].tolist()


def find_station(name: str) -> str:
    """Find a station ID by name (fuzzy matching)."""
    if STATIONS_DF is None:
        raise RuntimeError("GTFS data not loaded. Call load_gtfs_data() first.")

    name_norm = name.lower().strip()

    # Handle common abbreviations and variations
    abbreviations = {
        "sf": "san francisco",
        "sj": "san jose",
        "diridon": "san jose diridon",
        "sjd": "san jose diridon",
        "pa": "palo alto",
        "mv": "mountain view",
        "rc": "redwood city",
        "mp": "menlo park",
        "sfo": "san francisco",
        "ssf": "south san francisco",
        "22nd": "22nd street",
        "cal ave": "california avenue",
        "california ave": "california avenue",
        "cal avenue": "california avenue",
        "ca": "california avenue",
        "san antonio": "san antonio",
        "sa": "san antonio",
        "college park": "college park",
        "cp": "college park",
        "morgan hill": "morgan hill",
        "mh": "morgan hill",
        "san bruno": "san bruno",
        "sb": "san bruno",
        "san carlos": "san carlos",
        "sc": "san carlos",
        "broadway": "broadway",
        "bway": "broadway",
    }

    if name_norm in abbreviations:
        name_norm = abbreviations[name_norm]

    # Try exact match first on normalized names
    exact_match = STATIONS_DF[
        STATIONS_DF["normalized_name"].str.contains(name_norm, na=False, regex=False)
    ]
    if not exact_match.empty:
        return str(exact_match.iloc[0]["stop_id"])

    # Try partial match on full station names
    partial_match = STATIONS_DF[
        STATIONS_DF["stop_name"]
        .str.lower()
        .str.contains(name_norm, na=False, regex=False)
    ]
    if not partial_match.empty:
        return str(partial_match.iloc[0]["stop_id"])

    # Try starts with matching for partial names
    starts_with = STATIONS_DF[
        STATIONS_DF["stop_name"].str.lower().str.startswith(name_norm, na=False)
    ]
    if not starts_with.empty:
        return str(starts_with.iloc[0]["stop_id"])

    raise ValueError(f"Station not found: {name}")


def get_station_name(stop_id: str) -> str:
    """Get the display name for a station."""
    if STATIONS_DF is None:
        raise RuntimeError("GTFS data not loaded. Call load_gtfs_data() first.")

    station = STATIONS_DF[STATIONS_DF["stop_id"] == stop_id]
    if station.empty:
        return stop_id
    return str(station.iloc[0]["stop_name"])


def get_platform_stops_for_station(station_id: str) -> list[str]:
    """Get all platform stop IDs that belong to a station."""
    if ALL_STOPS_DF is None:
        raise RuntimeError("GTFS data not loaded. Call load_gtfs_data() first.")

    # Find all stops that have this station as their parent
    # Handle both string and numeric parent_station values, excluding NaN
    # Convert float values to int first to avoid "100.0" vs "100" mismatch
    def convert_parent_station(value: Any) -> str | None:
        if pd.isna(value):
            return None
        # If it's a float and has no decimal part, convert to int then string
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    parent_station_str = ALL_STOPS_DF["parent_station"].apply(convert_parent_station)
    mask = parent_station_str == station_id
    platform_stops = ALL_STOPS_DF[mask]
    return platform_stops["stop_id"].tolist()


def time_to_seconds(time_str: str | None) -> int | None:
    """Convert HH:MM:SS to seconds since midnight."""
    if pd.isna(time_str) or not time_str:
        return None

    parts = str(time_str).split(":")
    if len(parts) != 3:
        return None

    try:
        hours, minutes, seconds = map(int, parts)
        return hours * 3600 + minutes * 60 + seconds
    except ValueError:
        return None


def seconds_to_time(seconds: int) -> str:
    """Convert seconds since midnight to HH:MM:SS format."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    seconds = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def find_next_trains(
    origin_station_id: str,
    destination_station_id: str,
    after_seconds: int,
    target_date: date,
    limit: int = 5,
) -> list[tuple[str, str, str, str]]:
    """Find the next trains from origin to destination."""
    if TRIPS_DF is None or STOP_TIMES_DF is None:
        raise RuntimeError("GTFS data not loaded. Call load_gtfs_data() first.")

    # Get active service IDs for the target date
    service_ids = get_active_service_ids(target_date)
    if not service_ids:
        return []

    # Filter trips to only those running today
    active_trips = TRIPS_DF[TRIPS_DF["service_id"].isin(service_ids)]

    if active_trips.empty:
        return []

    # Get platform stops for both stations
    origin_platforms = get_platform_stops_for_station(origin_station_id)
    dest_platforms = get_platform_stops_for_station(destination_station_id)

    if not origin_platforms or not dest_platforms:
        return []

    # Get stop times for origin platforms
    origin_times = STOP_TIMES_DF[STOP_TIMES_DF["stop_id"].isin(origin_platforms)].copy()

    # Get stop times for destination platforms
    dest_times = STOP_TIMES_DF[STOP_TIMES_DF["stop_id"].isin(dest_platforms)].copy()

    # Join on trip_id to get trips that serve both stations
    combined = origin_times.merge(
        dest_times, on="trip_id", suffixes=("_origin", "_dest")
    )

    # Only keep trips where destination comes after origin (higher stop_sequence)
    combined = combined[
        combined["stop_sequence_dest"] > combined["stop_sequence_origin"]
    ]

    # Only keep trips that are active today
    combined = combined[combined["trip_id"].isin(active_trips["trip_id"])]

    if combined.empty:
        return []

    # Convert departure times to seconds
    combined["dep_seconds"] = combined["departure_time_origin"].apply(time_to_seconds)
    combined = combined.dropna(subset=["dep_seconds"])

    # Filter to departures after the specified time
    upcoming = combined[combined["dep_seconds"] >= after_seconds]

    if upcoming.empty:
        return []

    # Sort by departure time and limit results
    upcoming = upcoming.sort_values("dep_seconds").head(limit)

    # Join with trips to get trip information
    upcoming = upcoming.merge(
        active_trips[["trip_id", "trip_headsign", "trip_short_name"]], on="trip_id"
    )

    results = []
    for _, row in upcoming.iterrows():
        dep_time = row["departure_time_origin"]
        arr_time = row["arrival_time_dest"]
        train_name = row["trip_short_name"] or row["trip_id"]
        headsign = row["trip_headsign"] or ""

        results.append((dep_time, arr_time, train_name, headsign))

    return results


def list_all_stations() -> list[str]:
    """Get a list of all available Caltrain stations."""
    if STATIONS_DF is None:
        raise RuntimeError("GTFS data not loaded. Call load_gtfs_data() first.")

    return STATIONS_DF["stop_name"].sort_values().tolist()
