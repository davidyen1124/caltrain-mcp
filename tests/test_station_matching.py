import pandas as pd

from caltrain_mcp import gtfs


def _make_data():
    stations = pd.DataFrame(
        [
            {"stop_id": "100", "stop_name": "San Francisco Caltrain", "location_type": 1},
            {
                "stop_id": "110",
                "stop_name": "South San Francisco Caltrain",
                "location_type": 1,
            },
        ]
    )
    # Add normalized_name the same way as the loader does
    stations["normalized_name"] = (
        stations["stop_name"]
        .str.lower()
        .str.replace(" station", "", regex=False)
        .str.replace(" caltrain", "", regex=False)
    )

    # Minimal placeholders for unused GTFS tables
    all_stops = stations.copy()
    trips = pd.DataFrame(columns=["trip_id"])  # unused here
    stop_times = pd.DataFrame(columns=["trip_id"])  # unused here
    calendar = pd.DataFrame(columns=[
        "service_id",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "start_date",
        "end_date",
    ])

    return gtfs.GTFSData(
        all_stops=all_stops,
        stations=stations,
        trips=trips,
        stop_times=stop_times,
        calendar=calendar,
        station_to_platform_stops={},
    )


def test_exact_match_beats_substring():
    data = _make_data()
    # Should resolve to San Francisco, not South San Francisco
    assert gtfs.find_station("San Francisco", data) == "100"


def test_prefix_match_preferred_over_substring():
    data = _make_data()
    # "San" prefixes "San Francisco" but not "South San Francisco"
    assert gtfs.find_station("San", data) == "100"


def test_prefix_south_san_resolves_south_sf():
    data = _make_data()
    assert gtfs.find_station("South San", data) == "110"


def test_abbreviation_ssf_points_to_south_sf():
    data = _make_data()
    assert gtfs.find_station("ssf", data) == "110"

