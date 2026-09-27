"""Timetable queries on top of the GTFS tables.

This module turns the raw GTFS frames from :mod:`caltrain_mcp.gtfs` into
per-day timetables between two stations, with Pacific-time handling, trains
that run past midnight, and "arrive by" searches. The MCP tools and the
timetable UI both consume the JSON produced here.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import pandas as pd

from . import gtfs

PACIFIC = ZoneInfo("America/Los_Angeles")

# Fallback styling when routes.txt is missing (colours match the Caltrain feed).
_SERVICE_COLORS = {
    "Local": ("#dcddde", "#000000"),
    "Limited": ("#99d7dc", "#000000"),
    "Express": ("#ce202f", "#ffffff"),
    "South County": ("#fae4a7", "#000000"),
}
_DEFAULT_COLORS = ("#dcddde", "#000000")
_NAME_SUFFIX = re.compile(r"(\s+caltrain)?(\s+station)?$", re.IGNORECASE)

QueryMode = Literal["depart_after", "arrive_by"]


class ScheduleError(ValueError):
    """Raised for user-facing query problems (bad station, bad date...)."""


@dataclass(frozen=True)
class Station:
    id: str
    name: str
    full_name: str
    lat: float | None
    zone: str | None


@dataclass(frozen=True)
class Stop:
    station_id: str
    name: str
    arrival: datetime
    departure: datetime


@dataclass(frozen=True)
class Train:
    trip_id: str
    number: str
    service: str
    color: str
    text_color: str
    direction: str
    headsign: str
    service_date: date
    departure: datetime
    arrival: datetime
    stops: tuple[Stop, ...]

    @property
    def key(self) -> str:
        return f"{self.service_date.isoformat()}/{self.trip_id}"

    @property
    def duration_minutes(self) -> int:
        return int((self.arrival - self.departure).total_seconds() // 60)

    @property
    def stops_between(self) -> int:
        return max(len(self.stops) - 2, 0)


@dataclass(frozen=True)
class _TripInfo:
    number: str
    service: str
    color: str
    text_color: str
    direction: str
    headsign: str
    service_id: str


@dataclass
class _Index:
    stations: dict[str, Station]
    platform_to_station: dict[str, str]
    trips: dict[str, _TripInfo]
    # trip_id -> [(stop_sequence, station_id, arrival_s, departure_s)]
    trip_stops: dict[str, list[tuple[int, str, int, int]]]
    # station_id -> set of trip_ids that stop there
    station_trips: dict[str, set[str]]


@dataclass(frozen=True)
class DayInfo:
    service_date: date
    day_type: str
    holiday: str | None


@dataclass(frozen=True)
class Timetable:
    origin: Station
    destination: Station
    day: DayInfo
    trains: list[Train]


@dataclass(frozen=True)
class TripPlan:
    origin: Station
    destination: Station
    mode: QueryMode
    query_time: datetime
    now: datetime
    matches: list[Train]
    timetable: Timetable
    note: str | None


# ---------------------------------------------------------------------------
# Index construction
# ---------------------------------------------------------------------------


def display_name(stop_name: str) -> str:
    """'San Francisco Caltrain Station' -> 'San Francisco'."""
    return _NAME_SUFFIX.sub("", str(stop_name).strip()) or str(stop_name)


def _hex(value: Any, fallback: str) -> str:
    if value is None or pd.isna(value) or not str(value).strip():
        return fallback
    text = str(value).strip().lstrip("#")
    return f"#{text.lower()}"


def _service_name(route_short_name: str) -> str:
    # "Local Weekday" / "Local Weekend" are both just "Local" to riders.
    name = route_short_name.strip()
    for suffix in (" Weekday", " Weekend"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name or "Train"


def _optional_str(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    return text or None


def _build_index(data: gtfs.GTFSData) -> _Index:
    stations: dict[str, Station] = {}
    for row in data.stations.itertuples(index=False):
        stop_id = str(row.stop_id)
        full = str(row.stop_name)
        lat = getattr(row, "stop_lat", None)
        stations[stop_id] = Station(
            id=stop_id,
            name=display_name(full),
            full_name=full,
            lat=None if lat is None or pd.isna(lat) else float(lat),
            zone=_optional_str(getattr(row, "zone_id", None)),
        )

    platform_to_station: dict[str, str] = {}
    for station_id, platforms in data.station_to_platform_stops.items():
        for platform in platforms:
            platform_to_station[str(platform)] = str(station_id)
    # Some feeds put stop_times directly on the station row.
    for station_id in stations:
        platform_to_station.setdefault(station_id, station_id)

    routes: dict[str, tuple[str, str, str]] = {}
    if data.routes is not None:
        for route in data.routes.itertuples(index=False):
            service = _service_name(str(getattr(route, "route_short_name", "") or ""))
            default_bg, default_fg = _SERVICE_COLORS.get(service, _DEFAULT_COLORS)
            routes[str(route.route_id)] = (
                service,
                _hex(getattr(route, "route_color", None), default_bg),
                _hex(getattr(route, "route_text_color", None), default_fg),
            )

    trips: dict[str, _TripInfo] = {}
    for trip in data.trips.itertuples(index=False):
        trip_id = str(trip.trip_id)
        service, color, text_color = routes.get(
            str(getattr(trip, "route_id", "")), ("Train", *_DEFAULT_COLORS)
        )
        direction_id = _optional_str(getattr(trip, "direction_id", None))
        direction = {"0": "Northbound", "1": "Southbound"}.get(direction_id or "", "")
        trips[trip_id] = _TripInfo(
            number=_optional_str(getattr(trip, "trip_short_name", None)) or trip_id,
            service=service,
            color=color,
            text_color=text_color,
            direction=direction,
            headsign=_optional_str(getattr(trip, "trip_headsign", None)) or "",
            service_id=str(trip.service_id),
        )

    trip_stops: dict[str, list[tuple[int, str, int, int]]] = {}
    station_trips: dict[str, set[str]] = {}
    rows: Iterable[Any] = data.stop_times.itertuples(index=False)
    for st in rows:
        stop_station = platform_to_station.get(str(st.stop_id))
        arrival = gtfs.time_to_seconds(st.arrival_time)
        departure = gtfs.time_to_seconds(st.departure_time)
        if stop_station is None or (arrival is None and departure is None):
            continue
        arrival = departure if arrival is None else arrival
        departure = arrival if departure is None else departure
        assert arrival is not None and departure is not None
        trip_id = str(st.trip_id)
        trip_stops.setdefault(trip_id, []).append(
            (int(st.stop_sequence), stop_station, arrival, departure)
        )
        station_trips.setdefault(stop_station, set()).add(trip_id)
    for stops in trip_stops.values():
        stops.sort()

    return _Index(
        stations=stations,
        platform_to_station=platform_to_station,
        trips=trips,
        trip_stops=trip_stops,
        station_trips=station_trips,
    )


def warm_up(data: gtfs.GTFSData) -> None:
    """Build the lookup tables ahead of the first request."""
    _index(data)


def _index(data: gtfs.GTFSData) -> _Index:
    if data.schedule_index is None:
        data.schedule_index = _build_index(data)
    index: _Index = data.schedule_index
    return index


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------


def now_pacific() -> datetime:
    return datetime.now(PACIFIC).replace(microsecond=0)


def parse_when(value: str | None, *, default: datetime | None = None) -> datetime:
    """Parse an ISO-8601 date/datetime; naive values are Pacific wall-clock time."""
    if value is None or not value.strip():
        return default or now_pacific()
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.combine(date.fromisoformat(text), time())
        except ValueError:
            raise ScheduleError(
                f"Invalid datetime format: {value}. Please use ISO-8601 format, "
                "e.g. 2026-09-26T08:30:00."
            ) from None
    parsed = parsed.replace(microsecond=0)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=PACIFIC)
    return parsed.astimezone(PACIFIC)


def parse_date(value: str | None, *, default: date | None = None) -> date:
    if value is None or not value.strip():
        return default or now_pacific().date()
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        raise ScheduleError(f"Invalid date: {value}. Please use YYYY-MM-DD.") from None


def service_time(service_date: date, seconds: int) -> datetime:
    """GTFS times count from "noon minus 12h" of the service day (DST-safe)."""
    noon = datetime.combine(service_date, time(12), tzinfo=PACIFIC)
    base = noon.astimezone(UTC) - timedelta(hours=12)
    return (base + timedelta(seconds=seconds)).astimezone(PACIFIC)


def format_clock(moment: datetime) -> str:
    return moment.strftime("%I:%M %p").lstrip("0")


def format_duration(minutes: int) -> str:
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins} min"


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------


def resolve_station(name: str, data: gtfs.GTFSData, role: str = "Station") -> Station:
    stations = _index(data).stations
    if name in stations:  # exact GTFS station id (used by the UI)
        return stations[name]
    try:
        station_id = gtfs.find_station(name, data)
    except ValueError:
        available = gtfs.list_all_stations(data)
        needle = name.lower().strip()
        close = [
            s
            for s in available
            if needle and (needle in s.lower() or s.lower().startswith(needle[:3]))
        ]
        message = f"{role} station '{name}' not found."
        if close:
            message += f" Did you mean one of these? {', '.join(close[:5])}"
        else:
            message += " Use list_stations() to see all available stations."
        raise ScheduleError(message) from None
    return stations[station_id]


def stations_in_line_order(data: gtfs.GTFSData) -> list[Station]:
    """Stations from San Francisco (north) to Gilroy (south)."""
    stations = list(_index(data).stations.values())
    return sorted(stations, key=lambda s: (-(s.lat or 0.0), s.name))


def day_info(service_date: date, data: gtfs.GTFSData) -> DayInfo:
    active = set(gtfs.get_active_service_ids(service_date, data))
    day_type = "Weekend" if service_date.weekday() >= 5 else "Weekday"
    if "service_name" in data.calendar.columns:
        names = data.calendar[data.calendar["service_id"].astype(str).isin(active)][
            "service_name"
        ].astype(str)
        if names.str.contains("Weekend", case=False).any():
            day_type = "Weekend"
        elif names.str.contains("Weekday", case=False).any():
            day_type = "Weekday"

    holiday = None
    cal_dates = data.calendar_dates
    if "holiday_name" in cal_dates.columns:
        rows = cal_dates[
            cal_dates["date"].astype(str) == service_date.strftime("%Y%m%d")
        ]
        holidays = [str(n) for n in rows["holiday_name"].dropna().unique() if str(n)]
        if holidays:
            holiday = holidays[0]
    return DayInfo(service_date=service_date, day_type=day_type, holiday=holiday)


def trains_for_day(
    origin: Station, destination: Station, service_date: date, data: gtfs.GTFSData
) -> list[Train]:
    """Every train on ``service_date`` that stops at origin, then destination."""
    index = _index(data)
    active = set(gtfs.get_active_service_ids(service_date, data))
    if not active or origin.id == destination.id:
        return []

    candidates = index.station_trips.get(origin.id, set()) & index.station_trips.get(
        destination.id, set()
    )
    trains: list[Train] = []
    for trip_id in candidates:
        info = index.trips.get(trip_id)
        if info is None or info.service_id not in active:
            continue
        stops = index.trip_stops[trip_id]
        start = next(i for i, s in enumerate(stops) if s[1] == origin.id)
        end = next(
            (i for i, s in enumerate(stops) if s[1] == destination.id and i > start),
            None,
        )
        if end is None:
            continue
        leg = stops[start : end + 1]
        trains.append(
            Train(
                trip_id=trip_id,
                number=info.number,
                service=info.service,
                color=info.color,
                text_color=info.text_color,
                direction=info.direction,
                headsign=info.headsign,
                service_date=service_date,
                departure=service_time(service_date, leg[0][3]),
                arrival=service_time(service_date, leg[-1][2]),
                stops=tuple(
                    Stop(
                        station_id=station_id,
                        name=index.stations[station_id].name
                        if station_id in index.stations
                        else station_id,
                        arrival=service_time(service_date, arr),
                        departure=service_time(service_date, dep),
                    )
                    for _, station_id, arr, dep in leg
                ),
            )
        )
    trains.sort(key=lambda t: (t.departure, t.arrival))
    return trains


def _served_stations(
    station: Station, service_date: date, data: gtfs.GTFSData
) -> dict[str, int]:
    """Stations reachable without changing trains, with how many trips serve each."""
    index = _index(data)
    active = set(gtfs.get_active_service_ids(service_date, data))
    counts: dict[str, int] = {}
    for trip_id in index.station_trips.get(station.id, set()):
        info = index.trips.get(trip_id)
        if info is None or info.service_id not in active:
            continue
        for _, station_id, _, _ in index.trip_stops[trip_id]:
            counts[station_id] = counts.get(station_id, 0) + 1
    counts.pop(station.id, None)
    return counts


def no_service_note(
    origin: Station, destination: Station, service_date: date, data: gtfs.GTFSData
) -> str:
    """Explain an empty result: a station with no service, or a needed transfer."""
    day_str = f"{service_date:%A, %B} {service_date.day}"
    from_origin = _served_stations(origin, service_date, data)
    to_destination = _served_stations(destination, service_date, data)
    for station, served in ((origin, from_origin), (destination, to_destination)):
        if not served:
            return f"No scheduled trains stop at {station.name} on {day_str}."
    hubs = set(from_origin) & set(to_destination)
    if hubs:
        index = _index(data)
        hub = max(hubs, key=lambda sid: from_origin[sid] + to_destination[sid])
        name = index.stations[hub].name if hub in index.stations else hub
        return (
            f"No direct trains from {origin.name} to {destination.name} on "
            f"{day_str}. Change trains at {name}: look up {origin.name} → {name}, "
            f"then {name} → {destination.name}."
        )
    return f"No trains run from {origin.name} to {destination.name} on {day_str}."


def timetable(
    origin: str, destination: str, service_date: date, data: gtfs.GTFSData
) -> Timetable:
    o = resolve_station(origin, data, "Origin")
    d = resolve_station(destination, data, "Destination")
    return Timetable(
        origin=o,
        destination=d,
        day=day_info(service_date, data),
        trains=trains_for_day(o, d, service_date, data),
    )


def plan_trip(
    origin: str,
    destination: str,
    data: gtfs.GTFSData,
    *,
    when: datetime | None = None,
    arrive_by: datetime | None = None,
    limit: int = 3,
    now: datetime | None = None,
) -> TripPlan:
    """Find the trains that best answer a rider's question.

    ``depart_after`` (default): the next ``limit`` trains leaving at/after ``when``
    (or now). Trains that run after midnight on the previous service day count.
    If nothing is left tonight, the first trains of the next day are returned.

    ``arrive_by``: the latest ``limit`` trains arriving at/before ``arrive_by``
    that have not already left (relative to ``when`` or now).
    """
    o = resolve_station(origin, data, "Origin")
    d = resolve_station(destination, data, "Destination")
    if o.id == d.id:
        raise ScheduleError("Origin and destination are the same station.")
    now = now or now_pacific()
    limit = max(1, min(limit, 20))
    note: str | None = None

    if arrive_by is not None:
        mode: QueryMode = "arrive_by"
        query_time = arrive_by
        earliest = when or now
        day = arrive_by.date()
        pool = trains_for_day(o, d, day - timedelta(days=1), data) + trains_for_day(
            o, d, day, data
        )
        eligible = [
            t for t in pool if t.arrival <= arrive_by and t.departure >= earliest
        ]
        eligible.sort(key=lambda t: t.arrival)
        matches = sorted(eligible[-limit:], key=lambda t: t.departure)
        timetable_day = matches[-1].service_date if matches else day
        if not matches and not trains_for_day(o, d, day, data):
            note = no_service_note(o, d, day, data)
        elif not matches:
            note = (
                f"No train that hasn't already left gets from {o.name} to "
                f"{d.name} by {format_clock(arrive_by)}."
            )
    else:
        mode = "depart_after"
        query_time = when or now
        day = query_time.date()
        pool = trains_for_day(o, d, day - timedelta(days=1), data) + trains_for_day(
            o, d, day, data
        )
        upcoming = sorted(
            (t for t in pool if t.departure >= query_time), key=lambda t: t.departure
        )
        matches = upcoming[:limit]
        timetable_day = matches[0].service_date if matches else day
        if not matches:
            # Roll forward to the next day with service (e.g. weekend-only gaps).
            ran_today = any(t.service_date == day for t in pool)
            for ahead in range(1, 8):
                next_day = day + timedelta(days=ahead)
                matches = trains_for_day(o, d, next_day, data)[:limit]
                if matches:
                    break
            if matches:
                timetable_day = next_day
                first = f"{next_day:%A, %B} {next_day.day}"
                note = (
                    f"No more trains tonight from {o.name} to {d.name}."
                    if ran_today
                    else f"No trains from {o.name} to {d.name} on {day:%A}."
                ) + f" Showing the first trains on {first}."
            else:
                note = no_service_note(o, d, day, data)
        elif len(matches) < limit:
            note = "These are the last trains of the service day."

    day_trains = trains_for_day(o, d, timetable_day, data)
    return TripPlan(
        origin=o,
        destination=d,
        mode=mode,
        query_time=query_time,
        now=now,
        matches=matches,
        timetable=Timetable(
            origin=o,
            destination=d,
            day=day_info(timetable_day, data),
            trains=day_trains,
        ),
        note=note,
    )


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def station_json(station: Station) -> dict[str, Any]:
    return {"id": station.id, "name": station.name}


def train_summary_json(train: Train) -> dict[str, Any]:
    """Compact per-train data that the model sees."""
    return {
        "train": train.number,
        "service": train.service,
        "direction": train.direction,
        "departure": train.departure.isoformat(),
        "arrival": train.arrival.isoformat(),
        "departureTime": format_clock(train.departure),
        "arrivalTime": format_clock(train.arrival),
        "durationMinutes": train.duration_minutes,
        "stopsBetween": train.stops_between,
    }


def train_detail_json(train: Train) -> dict[str, Any]:
    """Full per-train data for the timetable UI."""
    return {
        **train_summary_json(train),
        "key": train.key,
        "tripId": train.trip_id,
        "serviceDate": train.service_date.isoformat(),
        "headsign": train.headsign,
        "color": train.color,
        "textColor": train.text_color,
        # Compact [station id, "6:54 PM"] pairs; the UI maps ids to names.
        "stops": [
            [stop.station_id, format_clock(stop.departure)] for stop in train.stops
        ],
    }


def day_json(day: DayInfo) -> dict[str, Any]:
    return {
        "serviceDate": day.service_date.isoformat(),
        "dayType": day.day_type,
        "holiday": day.holiday,
    }


def timetable_json(table: Timetable, now: datetime | None = None) -> dict[str, Any]:
    return {
        "origin": station_json(table.origin),
        "destination": station_json(table.destination),
        **day_json(table.day),
        "now": (now or now_pacific()).isoformat(),
        "trains": [train_detail_json(t) for t in table.trains],
    }


def plan_structured_json(plan: TripPlan) -> dict[str, Any]:
    """What the model (and the UI) receives as structuredContent."""
    return {
        "origin": station_json(plan.origin),
        "destination": station_json(plan.destination),
        **day_json(plan.timetable.day),
        "query": {"mode": plan.mode, "time": plan.query_time.isoformat()},
        "trains": [train_summary_json(t) for t in plan.matches],
        "trainsThatDay": len(plan.timetable.trains),
        "note": plan.note,
    }


def plan_widget_json(plan: TripPlan) -> dict[str, Any]:
    """Extra data only the UI needs (full day + stop lists)."""
    return {
        "matches": [train_detail_json(t) for t in plan.matches],
        "timetable": timetable_json(plan.timetable, plan.now),
    }


def plan_text(plan: TripPlan) -> str:
    """Plain-text answer for clients without the UI."""
    day = plan.timetable.day
    date_str = (
        f"{day.service_date:%A, %B} {day.service_date.day}, {day.service_date.year}"
    )
    schedule = f"{day.day_type} schedule" + (f", {day.holiday}" if day.holiday else "")
    if plan.mode == "arrive_by":
        heading = (
            f"Caltrain from {plan.origin.name} to {plan.destination.name}, "
            f"arriving by {format_clock(plan.query_time)}"
        )
    else:
        heading = (
            f"Next Caltrain departures from {plan.origin.name} to "
            f"{plan.destination.name} after {format_clock(plan.query_time)}"
        )
    lines = [f"{heading} ({date_str}, {schedule}):"]
    for train in plan.matches:
        lines.append(
            f"• Train {train.number} ({train.service}): "
            f"{format_clock(train.departure)} → {format_clock(train.arrival)}, "
            f"{format_duration(train.duration_minutes)}, "
            f"{train.stops_between} stops in between"
        )
    if not plan.matches:
        lines.append("• No trains match.")
    if plan.note:
        lines.append(plan.note)
    trains = plan.timetable.trains
    if trains:
        lines.append(
            f"{len(trains)} trains run this route that day "
            f"(first {format_clock(trains[0].departure)}, "
            f"last {format_clock(trains[-1].departure)})."
        )
    return "\n".join(lines)
