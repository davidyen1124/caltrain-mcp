from io import StringIO

import pandas as pd
import pytest

from caltrain_mcp import gtfs


@pytest.fixture(autouse=True)
def fake_gtfs(monkeypatch):
    """Provide a minimal :class:`~caltrain_mcp.gtfs.GTFSData` object for tests."""
    # --- stops -------------------------------------------------
    stops_csv = """stop_id,stop_name,location_type,parent_station
100,San Francisco Caltrain,1,
101,San Francisco Caltrain Platform 1,0,100
200,Palo Alto,1,
201,Palo Alto Platform 1,0,200
"""
    all_stops_df = pd.read_csv(StringIO(stops_csv))
    all_stops_df["stop_id"] = all_stops_df["stop_id"].astype(str)

    stations_df = all_stops_df[all_stops_df.location_type == 1].copy()
    stations_df["normalized_name"] = (
        stations_df.stop_name.str.lower().str.replace(" caltrain", "")
    )

    # --- calendar ---------------------------------------------
    cal_csv = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WEEKDAY,1,1,1,1,1,0,0,20250101,20251231
"""
    calendar_df = pd.read_csv(StringIO(cal_csv))

    # --- calendar_dates ---------------------------------------
    cal_dates_csv = """service_id,date,exception_type
WEEKDAY,20250102,2
SPECIAL,20250102,1
SATURDAY,20250104,1
"""
    calendar_dates_df = pd.read_csv(StringIO(cal_dates_csv))

    # --- trips -------------------------------------------------
    trips_csv = "route_id,service_id,trip_id,trip_headsign,trip_short_name\n1,WEEKDAY,T1,San Jose,SJ\n"
    trips_df = pd.read_csv(StringIO(trips_csv))

    # --- stop_times -------------------------------------------
    st_csv = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
T1,08:00:00,08:00:00,101,1
T1,08:50:00,08:50:00,201,2
"""
    stop_times_df = pd.read_csv(StringIO(st_csv))
    stop_times_df["stop_id"] = stop_times_df["stop_id"].astype(str)

    def _conv(v):
        if pd.isna(v):
            return None
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(v)

    parent_station_str = all_stops_df["parent_station"].apply(_conv)
    all_stops_df["parent_station_str"] = parent_station_str
    grouped = (
        all_stops_df.dropna(subset=["parent_station_str"])
        .groupby("parent_station_str")["stop_id"]
        .apply(lambda s: s.astype(str).tolist())
    )
    station_to_platform = grouped.to_dict()

    data = gtfs.GTFSData(
        all_stops=all_stops_df,
        stations=stations_df,
        trips=trips_df,
        stop_times=stop_times_df,
        calendar=calendar_df,
        calendar_dates=calendar_dates_df,
        station_to_platform_stops=station_to_platform,
    )

    monkeypatch.setattr(gtfs, "get_default_data", lambda: data)
    return data
