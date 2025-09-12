"""GTFS data loading and helper functions for Caltrain MCP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass
class GTFSData:
    """Container for all loaded GTFS tables."""

    all_stops: pd.DataFrame
    stations: pd.DataFrame
    trips: pd.DataFrame
    stop_times: pd.DataFrame
    calendar: pd.DataFrame
    station_to_platform_stops: dict[str, list[str]]


def get_gtfs_folder() -> Path:
    """Get the path to the GTFS data folder."""
    # Look for data bundled with the package
    package_dir = Path(__file__).parent
    bundled_data = package_dir / "data" / "caltrain-ca-us"

    if bundled_data.exists():
        return bundled_data

    raise FileNotFoundError(
        f"GTFS data not found at {bundled_data}. Run 'uv run python scripts/fetch_gtfs.py' to download data."
    )


def load_gtfs_data() -> GTFSData:
    """Load and prepare GTFS data and return a :class:`GTFSData` instance."""

    gtfs_folder = get_gtfs_folder()
    if not gtfs_folder.exists():
        raise FileNotFoundError(f"GTFS folder '{gtfs_folder}' not found.")

    # Load GTFS files
    all_stops_df = pd.read_csv(gtfs_folder / "stops.txt")
    trips_df = pd.read_csv(gtfs_folder / "trips.txt")
    stop_times_df = pd.read_csv(gtfs_folder / "stop_times.txt")
    calendar_df = pd.read_csv(gtfs_folder / "calendar.txt")

    # Ensure consistent data types for stop_id columns
    all_stops_df["stop_id"] = all_stops_df["stop_id"].astype(str)
    stop_times_df["stop_id"] = stop_times_df["stop_id"].astype(str)

    # Filter stops to only include station stops (location_type == 1)
    stations_df = all_stops_df[all_stops_df["location_type"] == 1].copy()

    # Create normalized station names for searching
    stations_df["normalized_name"] = (
        stations_df["stop_name"]
        .str.lower()
        .str.replace(" station", "")
        .str.replace(" caltrain", "")
    )

    # Precompute mapping of station ID -> platform stop IDs
    def convert_parent_station(value: Any) -> str | None:
        if pd.isna(value):
            return None
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    all_stops_df["parent_station_str"] = all_stops_df["parent_station"].apply(
        convert_parent_station
    )
    grouped = (
        all_stops_df.dropna(subset=["parent_station_str"])
        .groupby("parent_station_str")["stop_id"]
        .apply(lambda s: s.astype(str).tolist())
    )
    station_to_platform = grouped.to_dict()

    return GTFSData(
        all_stops=all_stops_df,
        stations=stations_df,
        trips=trips_df,
        stop_times=stop_times_df,
        calendar=calendar_df,
        station_to_platform_stops=station_to_platform,
    )


@lru_cache(maxsize=1)
def get_default_data() -> GTFSData:
    """Load GTFS data on first use and cache the result."""
    return load_gtfs_data()


def get_active_service_ids(target_date: date, data: GTFSData) -> list[str]:
    """Get service IDs that are active on the given date."""
    calendar_df = data.calendar

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
    active_services = calendar_df[
        (calendar_df[day_name] == 1)
        & (calendar_df["start_date"] <= int(date_str))
        & (calendar_df["end_date"] >= int(date_str))
    ]

    return active_services["service_id"].tolist()


def find_station(name: str, data: GTFSData) -> str:
    """Find a station ID by name (fuzzy matching)."""
    stations_df = data.stations

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

    # 1) Exact match on normalized name (most precise)
    exact_eq = stations_df[stations_df["normalized_name"] == name_norm]
    if not exact_eq.empty:
        return str(exact_eq.iloc[0]["stop_id"])

    # 2) Prefix match on normalized name (e.g., "san" -> "san francisco")
    starts_with = stations_df[
        stations_df["normalized_name"].str.startswith(name_norm, na=False)
    ]
    if not starts_with.empty:
        return str(starts_with.iloc[0]["stop_id"])

    # 3) Fallback: substring match on full station name (least precise)
    partial_match = stations_df[
        stations_df["stop_name"].str.lower().str.contains(name_norm, na=False)
    ]
    if not partial_match.empty:
        return str(partial_match.iloc[0]["stop_id"])

    raise ValueError(f"Station not found: {name}")


def get_station_name(stop_id: str, data: GTFSData) -> str:
    """Get the display name for a station."""
    stations_df = data.stations

    station = stations_df[stations_df["stop_id"] == stop_id]
    if station.empty:
        return stop_id
    return str(station.iloc[0]["stop_name"])


def get_platform_stops_for_station(station_id: str, data: GTFSData) -> list[str]:
    """Get all platform stop IDs that belong to a station."""
    return data.station_to_platform_stops.get(station_id, [])


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
    data: GTFSData,
    limit: int = 5,
) -> list[tuple[str, str, str, str]]:
    """Find the next trains from origin to destination."""

    trips_df = data.trips
    stop_times_df = data.stop_times

    # Get active service IDs for the target date
    service_ids = get_active_service_ids(target_date, data)
    if not service_ids:
        return []

    # Filter trips to only those running today
    active_trips = trips_df[trips_df["service_id"].isin(service_ids)]

    if active_trips.empty:
        return []

    # Get platform stops for both stations
    origin_platforms = get_platform_stops_for_station(origin_station_id, data)
    dest_platforms = get_platform_stops_for_station(destination_station_id, data)

    if not origin_platforms or not dest_platforms:
        return []

    # Get stop times for origin platforms
    origin_times = stop_times_df[stop_times_df["stop_id"].isin(origin_platforms)].copy()

    # Get stop times for destination platforms
    dest_times = stop_times_df[stop_times_df["stop_id"].isin(dest_platforms)].copy()

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


def list_all_stations(data: GTFSData) -> list[str]:
    """Get a list of all available Caltrain stations."""
    return data.stations["stop_name"].sort_values().tolist()
