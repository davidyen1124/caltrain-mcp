from io import StringIO

import pandas as pd
import pytest

from caltrain_mcp import gtfs


@pytest.fixture(autouse=True)
def fake_gtfs(monkeypatch):
    """Inject minimal GTFS frames so load_gtfs_data() isn't needed."""
    # --- stops -------------------------------------------------
    stops_csv = """stop_id,stop_name,location_type,parent_station
100,San Francisco Caltrain,1,
101,San Francisco Caltrain Platform 1,0,100
200,Palo Alto,1,
201,Palo Alto Platform 1,0,200
"""
    gtfs.ALL_STOPS_DF = pd.read_csv(StringIO(stops_csv))
    # Ensure consistent data types for stop_id columns (like in real GTFS loading)
    gtfs.ALL_STOPS_DF["stop_id"] = gtfs.ALL_STOPS_DF["stop_id"].astype(str)

    gtfs.STATIONS_DF = gtfs.ALL_STOPS_DF[gtfs.ALL_STOPS_DF.location_type == 1].copy()
    gtfs.STATIONS_DF["normalized_name"] = (
        gtfs.STATIONS_DF.stop_name.str.lower().str.replace(" caltrain", "")
    )

    # --- calendar ---------------------------------------------
    cal_csv = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WEEKDAY,1,1,1,1,1,0,0,20250101,20251231
"""
    gtfs.CALENDAR_DF = pd.read_csv(StringIO(cal_csv))

    # --- trips -------------------------------------------------
    trips_csv = "route_id,service_id,trip_id,trip_headsign,trip_short_name\n1,WEEKDAY,T1,San Jose,SJ\n"
    gtfs.TRIPS_DF = pd.read_csv(StringIO(trips_csv))

    # --- stop_times -------------------------------------------
    st_csv = """trip_id,arrival_time,departure_time,stop_id,stop_sequence
T1,08:00:00,08:00:00,101,1
T1,08:50:00,08:50:00,201,2
"""
    gtfs.STOP_TIMES_DF = pd.read_csv(StringIO(st_csv))
    # Ensure consistent data types for stop_id columns (like in real GTFS loading)
    gtfs.STOP_TIMES_DF["stop_id"] = gtfs.STOP_TIMES_DF["stop_id"].astype(str)
