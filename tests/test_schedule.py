"""Tests for the timetable engine (caltrain_mcp.schedule)."""

from datetime import date, datetime
from io import StringIO

import pandas as pd
import pytest

from caltrain_mcp import gtfs, schedule
from caltrain_mcp.schedule import PACIFIC

STOPS = """stop_id,stop_name,stop_lat,location_type,parent_station,zone_id
sf,San Francisco Caltrain Station,37.77,1,,1
sf_n,San Francisco Northbound,37.77,0,sf,1
mb,Millbrae,37.60,1,,2
mb_s,Millbrae Southbound,37.60,0,mb,2
pa,Palo Alto Station,37.44,1,,3
pa_s,Palo Alto Southbound,37.44,0,pa,3
sj,San Jose Diridon Station,37.33,1,,4
sj_s,San Jose Diridon Southbound,37.33,0,sj,4
gil,Gilroy Station,37.00,1,,6
gil_s,Gilroy Southbound,37.00,0,gil,6
"""

ROUTES = """route_id,route_short_name,route_color,route_text_color
L,Local Weekday,dcddde,000000
X,Express,ce202f,ffffff
S,South County,fae4a7,000000
"""

CALENDAR = """service_id,service_name,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WK,Year Round (Weekday),1,1,1,1,1,0,0,20260101,20261231
WE,Year Round (Weekend),0,0,0,0,0,1,1,20260101,20261231
"""

CALENDAR_DATES = """service_id,date,holiday_name,exception_type
WK,20261126,Thanksgiving Day,2
WE,20261126,Thanksgiving Day,1
"""

TRIPS = """route_id,service_id,trip_id,trip_short_name,trip_headsign,direction_id
L,WK,101,101,San Jose,1
X,WK,501,501,San Jose,1
L,WK,191,191,San Jose,1
L,WE,601,601,San Jose,1
S,WK,801,801,Gilroy,1
"""

STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
101,07:00:00,07:00:00,sf_n,1
101,07:20:00,07:21:00,mb_s,2
101,07:50:00,07:50:00,pa_s,3
101,08:20:00,08:20:00,sj_s,4
501,07:30:00,07:30:00,sf_n,1
501,08:05:00,08:05:00,pa_s,2
501,08:30:00,08:30:00,sj_s,3
191,23:40:00,23:40:00,sf_n,1
191,24:05:00,24:05:00,mb_s,2
191,24:35:00,24:35:00,pa_s,3
601,09:00:00,09:00:00,sf_n,1
601,09:50:00,09:50:00,pa_s,2
801,08:40:00,08:40:00,sj_s,1
801,09:30:00,09:30:00,gil_s,2
"""


def _csv(text: str) -> pd.DataFrame:
    return pd.read_csv(StringIO(text))


@pytest.fixture
def data() -> gtfs.GTFSData:
    all_stops = _csv(STOPS)
    all_stops["stop_id"] = all_stops["stop_id"].astype(str)
    stations = all_stops[all_stops["location_type"] == 1].copy()
    stations["normalized_name"] = (
        stations["stop_name"]
        .str.lower()
        .str.replace(" station", "")
        .str.replace(" caltrain", "")
    )
    platforms = all_stops.dropna(subset=["parent_station"])
    station_to_platform = (
        platforms.groupby("parent_station")["stop_id"].apply(list).to_dict()
    )
    stop_times = _csv(STOP_TIMES)
    stop_times["stop_id"] = stop_times["stop_id"].astype(str)
    return gtfs.GTFSData(
        all_stops=all_stops,
        stations=stations,
        trips=_csv(TRIPS),
        stop_times=stop_times,
        calendar=_csv(CALENDAR),
        calendar_dates=_csv(CALENDAR_DATES),
        station_to_platform_stops=station_to_platform,
        routes=_csv(ROUTES),
    )


def at(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=PACIFIC)


def numbers(trains) -> list[str]:
    return [t.number for t in trains]


def test_parse_when_handles_zones_and_dates():
    assert schedule.parse_when("2026-09-28T08:00:00") == at("2026-09-28T08:00:00")
    # 16:00 UTC is 09:00 PDT
    assert schedule.parse_when("2026-09-28T16:00:00Z") == at("2026-09-28T09:00:00")
    assert schedule.parse_when("2026-09-28") == at("2026-09-28T00:00:00")
    with pytest.raises(schedule.ScheduleError):
        schedule.parse_when("tomorrow-ish")


def test_service_time_crosses_midnight():
    moment = schedule.service_time(date(2026, 9, 28), 24 * 3600 + 35 * 60)
    assert moment == at("2026-09-29T00:35:00")


def test_trains_for_day_details(data):
    sf = schedule.resolve_station("sf", data)
    pa = schedule.resolve_station("Palo Alto", data)
    trains = schedule.trains_for_day(sf, pa, date(2026, 9, 28), data)
    assert numbers(trains) == ["101", "501", "191"]
    local, express, late = trains
    assert local.service == "Local" and express.service == "Express"
    assert express.color == "#ce202f" and express.text_color == "#ffffff"
    assert local.direction == "Southbound"
    assert [s.name for s in local.stops] == ["San Francisco", "Millbrae", "Palo Alto"]
    assert local.stops_between == 1 and express.stops_between == 0
    assert local.duration_minutes == 50
    assert late.arrival == at("2026-09-29T00:35:00")


def test_wrong_direction_is_excluded(data):
    pa = schedule.resolve_station("pa", data)
    sf = schedule.resolve_station("sf", data)
    assert schedule.trains_for_day(pa, sf, date(2026, 9, 28), data) == []


def test_plan_next_trains(data):
    plan = schedule.plan_trip(
        "sf", "pa", data, when=at("2026-09-28T07:10:00"), now=at("2026-09-28T07:10:00")
    )
    assert plan.mode == "depart_after"
    assert numbers(plan.matches) == ["501", "191"]
    assert plan.note == "These are the last trains of the service day."
    assert numbers(plan.timetable.trains) == ["101", "501", "191"]


def test_plan_after_midnight_uses_previous_service_day(data):
    # 00:02 on Tuesday: Monday's 23:40 train reaches Millbrae at 00:05.
    plan = schedule.plan_trip("sf", "millbrae", data, when=at("2026-09-29T00:02:00"))
    # It left SF at 23:40, so the next one is Tuesday morning's 07:00.
    assert plan.matches[0].departure == at("2026-09-29T07:00:00")
    plan = schedule.plan_trip("millbrae", "pa", data, when=at("2026-09-29T00:02:00"))
    assert numbers(plan.matches)[0] == "191"
    assert plan.matches[0].service_date == date(2026, 9, 28)
    assert plan.timetable.day.service_date == date(2026, 9, 28)


def test_plan_rolls_forward_when_nothing_left(data):
    plan = schedule.plan_trip("sf", "sj", data, when=at("2026-09-28T23:59:00"))
    assert numbers(plan.matches) == ["101", "501"]
    assert plan.matches[0].service_date == date(2026, 9, 29)
    assert plan.note and plan.note.startswith("No more trains tonight")


def test_plan_rolls_over_weekend_without_service(data):
    # South County trains are weekday-only: Saturday rolls to Monday.
    plan = schedule.plan_trip("sj", "gilroy", data, when=at("2026-09-26T10:00:00"))
    assert numbers(plan.matches) == ["801"]
    assert plan.timetable.day.service_date == date(2026, 9, 28)
    assert plan.note and "on Saturday" in plan.note


def test_plan_arrive_by(data):
    plan = schedule.plan_trip(
        "sf",
        "pa",
        data,
        arrive_by=at("2026-09-28T08:00:00"),
        now=at("2026-09-28T06:00:00"),
        limit=3,
    )
    assert plan.mode == "arrive_by"
    assert numbers(plan.matches) == ["101"]

    # Trains that already left are not suggested.
    plan = schedule.plan_trip(
        "sf",
        "pa",
        data,
        arrive_by=at("2026-09-28T08:10:00"),
        now=at("2026-09-28T07:05:00"),
    )
    assert numbers(plan.matches) == ["501"]


def test_transfer_and_no_service_notes(data):
    plan = schedule.plan_trip("sf", "gilroy", data, when=at("2026-09-28T06:00:00"))
    assert plan.matches == []
    assert plan.note is not None
    assert "Change trains at San Jose Diridon" in plan.note

    plan = schedule.plan_trip("gilroy", "sj", data, when=at("2026-09-26T06:00:00"))
    assert plan.matches == []
    assert plan.note == "No scheduled trains stop at Gilroy on Saturday, September 26."


def test_holiday_day_info(data):
    info = schedule.day_info(date(2026, 11, 26), data)
    assert info.day_type == "Weekend"
    assert info.holiday == "Thanksgiving Day"
    sf = schedule.resolve_station("sf", data)
    pa = schedule.resolve_station("pa", data)
    assert numbers(schedule.trains_for_day(sf, pa, date(2026, 11, 26), data)) == ["601"]


def test_resolve_station_errors_and_ids(data):
    assert schedule.resolve_station("sj", data).name == "San Jose Diridon"
    assert schedule.resolve_station("gil", data).name == "Gilroy"  # station id
    with pytest.raises(schedule.ScheduleError, match="not found"):
        schedule.resolve_station("Narnia", data, "Origin")
    with pytest.raises(schedule.ScheduleError, match="same station"):
        schedule.plan_trip("sf", "San Francisco", data)


def test_stations_in_line_order(data):
    names = [s.name for s in schedule.stations_in_line_order(data)]
    assert names == [
        "San Francisco",
        "Millbrae",
        "Palo Alto",
        "San Jose Diridon",
        "Gilroy",
    ]


def test_json_payloads(data):
    plan = schedule.plan_trip(
        "sf", "pa", data, when=at("2026-09-28T06:00:00"), now=at("2026-09-28T06:00:00")
    )
    structured = schedule.plan_structured_json(plan)
    assert structured["origin"] == {"id": "sf", "name": "San Francisco"}
    assert structured["trains"][0] == {
        "train": "101",
        "service": "Local",
        "direction": "Southbound",
        "departure": "2026-09-28T07:00:00-07:00",
        "arrival": "2026-09-28T07:50:00-07:00",
        "departureTime": "7:00 AM",
        "arrivalTime": "7:50 AM",
        "durationMinutes": 50,
        "stopsBetween": 1,
    }
    assert "stops" not in structured["trains"][0]  # the model gets the compact form

    widget = schedule.plan_widget_json(plan)
    assert widget["matches"][0]["key"] == "2026-09-28/101"
    assert widget["timetable"]["trains"][2]["stops"][-1] == ["pa", "12:35 AM"]

    text = schedule.plan_text(plan)
    assert "Train 101 (Local): 7:00 AM → 7:50 AM, 50 min, 1 stops in between" in text
