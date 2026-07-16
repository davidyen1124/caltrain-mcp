from datetime import date

import pytest

from caltrain_mcp import gtfs


def test_find_station_abbreviation(fake_gtfs):
    assert gtfs.find_station("sf", fake_gtfs) == "100"  # abbreviation map
    assert gtfs.find_station("Palo Alto", fake_gtfs) == "200"  # regular match


def test_find_station_error_cases(fake_gtfs):
    """Test error handling in find_station function"""
    with pytest.raises(ValueError, match="Station not found: nonexistent"):
        gtfs.find_station("nonexistent", fake_gtfs)

    with pytest.raises(ValueError, match="Station not found: xyz123"):
        gtfs.find_station("xyz123", fake_gtfs)


def test_time_helpers():
    assert gtfs.time_to_seconds("01:02:03") == 3723
    assert gtfs.seconds_to_time(3723) == "01:02:03"


def test_time_helpers_edge_cases():
    """Test edge cases for time conversion functions"""
    # Test invalid time formats
    assert gtfs.time_to_seconds("") is None
    assert gtfs.time_to_seconds(None) is None
    assert gtfs.time_to_seconds("invalid") is None
    assert gtfs.time_to_seconds("1:2") is None  # not enough parts
    assert gtfs.time_to_seconds("a:b:c") is None  # non-numeric

    # Test boundary values
    assert gtfs.time_to_seconds("00:00:00") == 0
    assert gtfs.time_to_seconds("23:59:59") == 86399

    # Test seconds_to_time
    assert gtfs.seconds_to_time(0) == "00:00:00"
    assert gtfs.seconds_to_time(86399) == "23:59:59"


def test_get_station_name(fake_gtfs):
    """Test station name lookup"""
    assert gtfs.get_station_name("100", fake_gtfs) == "San Francisco Caltrain"
    assert gtfs.get_station_name("200", fake_gtfs) == "Palo Alto"
    # Test nonexistent station - should return the ID itself
    assert gtfs.get_station_name("999", fake_gtfs) == "999"


def test_get_platform_stops_for_station(fake_gtfs):
    """Test platform stop lookup"""
    assert gtfs.get_platform_stops_for_station("100", fake_gtfs) == ["101"]
    assert gtfs.get_platform_stops_for_station("200", fake_gtfs) == ["201"]
    # Test nonexistent station
    assert gtfs.get_platform_stops_for_station("999", fake_gtfs) == []


def test_get_active_service_ids(fake_gtfs):
    """Test service ID lookup for different dates"""
    # Normal Wednesday follows the weekly calendar.
    service_ids = gtfs.get_active_service_ids(date(2025, 1, 1), fake_gtfs)
    assert service_ids == ["WEEKDAY"]

    # A date-specific addition can activate a service absent from calendar.txt.
    service_ids = gtfs.get_active_service_ids(date(2025, 1, 4), fake_gtfs)
    assert service_ids == ["SATURDAY"]

    # Date-specific exceptions can replace regular weekday service.
    service_ids = gtfs.get_active_service_ids(date(2025, 1, 2), fake_gtfs)
    assert service_ids == ["SPECIAL"]

    # A date without regular service or an exception remains inactive.
    service_ids = gtfs.get_active_service_ids(date(2025, 1, 5), fake_gtfs)
    assert service_ids == []


def test_find_next_trains_edge_cases(fake_gtfs):
    """Test edge cases in find_next_trains function"""
    # No active service IDs (weekend)
    trains = gtfs.find_next_trains("100", "200", 0, date(2025, 1, 5), fake_gtfs)
    assert trains == []

    # Valid date but after all departures
    trains = gtfs.find_next_trains("100", "200", 32400, date(2025, 1, 1), fake_gtfs)  # 9 AM
    assert trains == []

    # Nonexistent stations (should return empty due to no platforms)
    trains = gtfs.find_next_trains("999", "200", 0, date(2025, 1, 1), fake_gtfs)
    assert trains == []
