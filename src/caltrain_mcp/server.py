"""FastMCP server for Caltrain MCP tools."""

from __future__ import annotations
import os
import sys
from datetime import datetime
from mcp.server.fastmcp import FastMCP
from . import gtfs


mcp = FastMCP("caltrain")


@mcp.tool()
async def next_trains(
    origin: str, destination: str, when_iso: str | None = None
) -> str:
    """Return the next few scheduled Caltrain departures.

    Args:
        origin: Station name (e.g. 'San Jose Diridon', 'Palo Alto', 'San Francisco').
                Supports common abbreviations like 'SF' for San Francisco, 'SJ' for San Jose.
                If station is not found, use list_stations() to see all available options.
        destination: Station name (e.g. 'San Francisco', 'Mountain View', 'Tamien').
                     Supports common abbreviations like 'SF' for San Francisco, 'SJ' for San Jose.
                     If station is not found, use list_stations() to see all available options.
        when_iso: Optional ISO-8601 datetime (local time). Default: now.

    Note: If you get a "Station not found" error, try using the list_stations() tool first
    to see exact station names, then retry with the correct spelling.
    """
    try:
        # Parse the target time
        if when_iso:
            try:
                when_dt = datetime.fromisoformat(when_iso.replace("Z", "+00:00"))
                # Convert to local time if needed
                if when_dt.tzinfo is not None:
                    # Convert to naive datetime assuming Pacific time
                    when_dt = when_dt.replace(tzinfo=None)
            except ValueError:
                return (
                    f"Invalid datetime format: {when_iso}. Please use ISO-8601 format."
                )
        else:
            when_dt = datetime.now()

        target_date = when_dt.date()
        seconds_since_midnight = (
            when_dt.hour * 3600 + when_dt.minute * 60 + when_dt.second
        )

        # Find station IDs with enhanced error handling
        try:
            origin_id = gtfs.find_station(origin)
        except ValueError:
            available_stations = gtfs.list_all_stations()
            # Try to find close matches
            close_matches = [
                s
                for s in available_stations
                if origin.lower() in s.lower()
                or s.lower().startswith(origin.lower()[:3])
            ]
            error_msg = f"Origin station '{origin}' not found."
            if close_matches:
                error_msg += (
                    f" Did you mean one of these? {', '.join(close_matches[:5])}"
                )
            else:
                error_msg += " Use list_stations() to see all available stations."
            return error_msg

        try:
            dest_id = gtfs.find_station(destination)
        except ValueError:
            available_stations = gtfs.list_all_stations()
            # Try to find close matches
            close_matches = [
                s
                for s in available_stations
                if destination.lower() in s.lower()
                or s.lower().startswith(destination.lower()[:3])
            ]
            error_msg = f"Destination station '{destination}' not found."
            if close_matches:
                error_msg += (
                    f" Did you mean one of these? {', '.join(close_matches[:5])}"
                )
            else:
                error_msg += " Use list_stations() to see all available stations."
            return error_msg

        # Get station names for display
        origin_name = gtfs.get_station_name(origin_id)
        dest_name = gtfs.get_station_name(dest_id)

        # Find next trains
        trains = gtfs.find_next_trains(
            origin_id, dest_id, seconds_since_midnight, target_date
        )

        if not trains:
            return f"No more trains today from {origin_name} to {dest_name}."

        # Format results
        lines = []
        for dep_time, arr_time, train_name, headsign in trains:
            line = f"• Train {train_name}: {dep_time} → {arr_time}"
            if headsign:
                line += f" (to {headsign})"
            lines.append(line)

        date_str = target_date.strftime("%A, %B %d, %Y")
        current_time_str = when_dt.strftime("%I:%M %p")
        header = (
            f"Next Caltrain departures from {origin_name} to {dest_name} "
            f"on {date_str}:\n(Current time: {current_time_str})\n\n"
        )
        return header + "\n".join(lines)

    except Exception as e:
        return f"Error: {str(e)}"


@mcp.tool()
async def list_stations() -> str:
    """List all available Caltrain stations.

    This tool is useful when you need to find the exact station names, especially if
    the next_trains() tool returns a "Station not found" error. Station names are
    case-insensitive and support some common abbreviations like 'SF' and 'SJ'.

    Returns a formatted list of all Caltrain stations that can be used as origin
    or destination in the next_trains() tool.
    """
    try:
        stations = gtfs.list_all_stations()
        stations_list = "\n".join([f"• {station}" for station in stations])
        return f"Available Caltrain stations:\n{stations_list}\n\nNote: Station names support common abbreviations like 'SF' for San Francisco and 'SJ' for San Jose."
    except Exception as e:
        return f"Error: {str(e)}"


def main():
    """Main entry point for the MCP server."""
    # Only load GTFS data when not in test mode
    if os.getenv("PYTEST_CURRENT_TEST") is None and "pytest" not in sys.modules:
        try:
            gtfs.load_gtfs_data()
            print(
                f"Loaded GTFS data successfully. Found {len(gtfs.STATIONS_DF)} stations."
            )
        except Exception as e:
            print(f"Error loading GTFS data: {e}")
            sys.exit(1)

    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
