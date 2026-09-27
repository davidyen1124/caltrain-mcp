"""MCP server for Caltrain schedules, with an interactive timetable UI (MCP Apps)."""

from __future__ import annotations

import argparse
import base64
import os
import sys
from importlib import resources
from typing import Annotated, Any

from mcp.server.apps import APP_MIME_TYPE, Apps
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.resources import TextResource
from mcp_types import CallToolResult, Icon, TextContent, ToolAnnotations
from pydantic import Field

from . import gtfs, schedule

# Bump the version suffix whenever the HTML changes in a breaking way: hosts
# (ChatGPT in particular) cache UI resources by URI.
TIMETABLE_URI = "ui://caltrain/timetable-v9.html"

INSTRUCTIONS = """\
Caltrain schedules (San Francisco – San Jose – Gilroy) from the official GTFS feed.
Use next_trains for any question about when trains run between two stations:
"next train", "trains tomorrow morning", "last train tonight", "arrive by 9am".
Times are Pacific. Pass when_iso / arrive_by_iso as local Pacific ISO-8601 times.
In hosts that render the timetable UI, the user already sees a table of the
trains, so keep the text reply short: highlight the best option and anything
notable (express trains, last train, holiday schedule) instead of repeating
every row.
"""

READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)

apps = Apps()


def _widget_meta(payload: dict[str, Any]) -> dict[str, Any]:
    """UI-only data; hosts pass result `_meta` to the view but not the model."""
    stations = schedule.stations_in_line_order(gtfs.get_default_data())
    return {**payload, "stations": [schedule.station_json(s) for s in stations]}


def _error(message: str) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=message)], is_error=True
    )


@apps.tool(
    resource_uri=TIMETABLE_URI,
    visibility=["model", "app"],
    name="next_trains",
    title="Find Caltrain trains",
    annotations=READ_ONLY,
    meta={
        "ui/resourceUri": TIMETABLE_URI,
        "openai/outputTemplate": TIMETABLE_URI,
        "openai/widgetAccessible": True,
        "openai/toolInvocation/invoking": "Checking the Caltrain timetable…",
        "openai/toolInvocation/invoked": "Found your trains",
    },
)
async def next_trains(
    origin: Annotated[
        str,
        Field(
            description="Departure station, e.g. 'Palo Alto', 'San Jose Diridon', "
            "'SF', '22nd'. Abbreviations like SF, SJ, MV, RC, PA work."
        ),
    ],
    destination: Annotated[
        str,
        Field(description="Arrival station, e.g. 'San Francisco', 'Mountain View'."),
    ],
    when_iso: Annotated[
        str | None,
        Field(
            description="Leave at or after this Pacific time (ISO-8601, e.g. "
            "'2026-09-27T08:00:00'). Omit for now. A date alone means that "
            "day from the first train."
        ),
    ] = None,
    arrive_by_iso: Annotated[
        str | None,
        Field(
            description="Instead of 'leave after', find the latest trains that "
            "arrive by this Pacific time (ISO-8601)."
        ),
    ] = None,
    limit: Annotated[
        int,
        Field(ge=1, le=10, description="How many trains to highlight (default 3)."),
    ] = 3,
) -> CallToolResult:
    """Use this when the user asks when Caltrain runs between two stations.

    Finds the few trains that best match the request (the next ones after a
    time, or the last ones that arrive by a time) and shows them in an
    interactive timetable card that the user can expand to the whole day.
    The card already lists every train, so reply briefly: recommend the best
    option and mention anything notable (express, last train, holiday
    schedule, a needed transfer) rather than re-listing the trains.
    Use list_stations if a station name is not recognised.
    """
    try:
        data = gtfs.get_default_data()
        now = schedule.now_pacific()
        when = schedule.parse_when(when_iso) if when_iso else None
        arrive_by = schedule.parse_when(arrive_by_iso) if arrive_by_iso else None
        plan = schedule.plan_trip(
            origin,
            destination,
            data,
            when=when,
            arrive_by=arrive_by,
            limit=limit,
            now=now,
        )
    except schedule.ScheduleError as exc:
        return _error(str(exc))

    return CallToolResult(
        content=[TextContent(type="text", text=schedule.plan_text(plan))],
        structured_content=schedule.plan_structured_json(plan),
        _meta={"caltrain/timetable": _widget_meta(schedule.plan_widget_json(plan))},
    )


async def get_timetable(
    origin: Annotated[str, Field(description="Departure station name or id.")],
    destination: Annotated[str, Field(description="Arrival station name or id.")],
    date: Annotated[
        str | None,
        Field(description="Service date YYYY-MM-DD (Pacific). Omit for today."),
    ] = None,
) -> CallToolResult:
    """Full-day timetable between two stations (used by the timetable UI)."""
    try:
        data = gtfs.get_default_data()
        now = schedule.now_pacific()
        service_date = schedule.parse_date(date, default=now.date())
        table = schedule.timetable(origin, destination, service_date, data)
    except schedule.ScheduleError as exc:
        return _error(str(exc))

    payload = _widget_meta({"timetable": schedule.timetable_json(table, now)})
    summary = (
        f"{len(table.trains)} trains from {table.origin.name} to "
        f"{table.destination.name} on {service_date.isoformat()}."
    )
    # App-only tool: the full payload goes in structuredContent so the UI gets it
    # even from hosts that drop `_meta` on UI-initiated calls.
    return CallToolResult(
        content=[TextContent(type="text", text=summary)],
        structured_content=payload,
    )


def _timetable_html() -> str:
    try:
        return (
            resources.files("caltrain_mcp")
            .joinpath("ui/timetable.html")
            .read_text(encoding="utf-8")
        )
    except FileNotFoundError:
        return (
            "<!doctype html><html><body><p>Timetable UI not built. "
            "Run <code>npm run build</code> in <code>web/</code>.</p></body></html>"
        )


apps.add_resource(
    TextResource(
        uri=TIMETABLE_URI,
        name="caltrain-timetable",
        title="Caltrain timetable",
        description="Interactive Caltrain timetable for a pair of stations.",
        mime_type=APP_MIME_TYPE,
        text=_timetable_html(),
        meta={
            # Everything is inlined, so the view needs no network access.
            "ui": {
                "csp": {"connectDomains": [], "resourceDomains": []},
                "prefersBorder": True,
            },
            "openai/widgetDescription": (
                "An interactive Caltrain timetable card listing the matching "
                "trains (the user can reveal later trains, open stop lists and "
                "a full-day view with station, date and service filters). It "
                "already shows the train list, so don't repeat it as a table."
            ),
        },
    )
)


def _icon() -> Icon:
    # Inlined so the icon also works for stdio installs with no web server.
    png = resources.files("caltrain_mcp").joinpath("icons/icon-128.png").read_bytes()
    return Icon(
        src="data:image/png;base64," + base64.b64encode(png).decode("ascii"),
        mime_type="image/png",
        sizes=["128x128"],
    )


mcp = MCPServer(
    "caltrain",
    title="Caltrain",
    instructions=INSTRUCTIONS,
    website_url="https://github.com/davidyen1124/caltrain-mcp",
    icons=[_icon()],
    extensions=[apps],
)


mcp.add_tool(
    get_timetable,
    name="get_timetable",
    title="Caltrain day timetable",
    annotations=READ_ONLY,
    # App-only: the timetable UI calls this to switch stations or dates.
    meta={"ui": {"visibility": ["app"]}, "openai/widgetAccessible": True},
)


@mcp.tool(title="List Caltrain stations", annotations=READ_ONLY)
async def list_stations() -> str:
    """List all available Caltrain stations.

    This tool is useful when you need to find the exact station names, especially if
    the next_trains() tool returns a "Station not found" error. Station names are
    case-insensitive and support some common abbreviations like 'SF' and 'SJ'.

    Returns a formatted list of all Caltrain stations that can be used as origin
    or destination in the next_trains() tool.
    """
    try:
        stations = gtfs.list_all_stations(gtfs.get_default_data())
        stations_list = "\n".join([f"• {station}" for station in stations])
        return f"Available Caltrain stations:\n{stations_list}\n\nNote: Station names support common abbreviations like 'SF' for San Francisco and 'SJ' for San Jose."
    except Exception as e:
        return f"Error: {str(e)}"


def _load_data_or_exit() -> None:
    try:
        data = gtfs.get_default_data()
        # Use stderr for logging to avoid interfering with MCP protocol on stdout
        print(
            f"Loaded GTFS data successfully. Found {len(data.stations)} stations.",
            file=sys.stderr,
        )
    except Exception as e:
        print(f"Error loading GTFS data: {e}", file=sys.stderr)
        sys.exit(1)


def main(argv: list[str] | None = None) -> None:
    """Run the server over stdio (default) or Streamable HTTP (``--http``)."""
    parser = argparse.ArgumentParser(prog="caltrain-mcp", description=__doc__)
    parser.add_argument(
        "--http", action="store_true", help="serve Streamable HTTP instead of stdio"
    )
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    args = parser.parse_args(argv)

    # Only load GTFS data when not in test mode
    if os.getenv("PYTEST_CURRENT_TEST") is None and "pytest" not in sys.modules:
        _load_data_or_exit()

    if not args.http:
        mcp.run(transport="stdio")
        return

    import uvicorn

    from .http_app import create_app

    print(f"Serving MCP at http://{args.host}:{args.port}/mcp", file=sys.stderr)
    uvicorn.run(create_app(host=args.host), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
