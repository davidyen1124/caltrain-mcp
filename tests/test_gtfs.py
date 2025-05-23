import pytest
from datetime import date

from caltrain_mcp import gtfs


def test_find_station_abbreviation():
    assert gtfs.find_station("sf") == "100"  # abbreviation map
    assert gtfs.find_station("Palo Alto") == "200"  # regular match


def test_find_station_error_cases():
    """Test error handling in find_station function"""
    with pytest.raises(ValueError, match="Station not found: nonexistent"):
        gtfs.find_station("nonexistent")

    with pytest.raises(ValueError, match="Station not found: xyz123"):
        gtfs.find_station("xyz123")


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


def test_get_station_name():
    """Test station name lookup"""
    assert gtfs.get_station_name("100") == "San Francisco Caltrain"
    assert gtfs.get_station_name("200") == "Palo Alto"
    # Test nonexistent station - should return the ID itself
    assert gtfs.get_station_name("999") == "999"


def test_get_platform_stops_for_station():
    """Test platform stop lookup"""
    assert gtfs.get_platform_stops_for_station("100") == ["101"]
    assert gtfs.get_platform_stops_for_station("200") == ["201"]
    # Test nonexistent station
    assert gtfs.get_platform_stops_for_station("999") == []


def test_get_active_service_ids():
    """Test service ID lookup for different dates"""
    # Wednesday (should have WEEKDAY service)
    service_ids = gtfs.get_active_service_ids(date(2025, 1, 1))
    assert service_ids == ["WEEKDAY"]

    # Saturday (should have no service based on our test data)
    service_ids = gtfs.get_active_service_ids(date(2025, 1, 4))
    assert service_ids == []


def test_find_next_trains_edge_cases():
    """Test edge cases in find_next_trains function"""
    # No active service IDs (weekend)
    trains = gtfs.find_next_trains("100", "200", 0, date(2025, 1, 4))
    assert trains == []

    # Valid date but after all departures
    trains = gtfs.find_next_trains("100", "200", 32400, date(2025, 1, 1))  # 9 AM
    assert trains == []

    # Nonexistent stations (should return empty due to no platforms)
    trains = gtfs.find_next_trains("999", "200", 0, date(2025, 1, 1))
    assert trains == []
