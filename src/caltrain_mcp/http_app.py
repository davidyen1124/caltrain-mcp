"""Streamable HTTP app for hosting the server remotely (Vercel, uvicorn, ...)."""

from __future__ import annotations

from importlib import resources

from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, Response
from starlette.routing import Route
from starlette.types import ASGIApp

from . import gtfs, schedule
from .server import mcp

LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")

LANDING_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Caltrain MCP</title>
<link rel="icon" type="image/png" href="/icon.png">
<link rel="apple-touch-icon" href="/icon.png">
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto;
         padding: 0 1rem; color: #1d1d1f; }
  code { background: #f2f2f2; padding: .1rem .35rem; border-radius: 4px; }
  h1 { display: flex; align-items: center; gap: .6rem; font-size: 1.6rem; }
  h1 img { width: 2.2rem; height: 2.2rem; border-radius: 22%; }
</style></head>
<body>
<h1><img src="/icon.png" alt=""> Caltrain MCP server</h1>
<p>A remote <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
server for Caltrain timetables, with an interactive timetable UI (MCP Apps).</p>
<p>Connect your MCP client (ChatGPT developer mode, Claude, …) to
<code id="url">/mcp</code>. No authentication is required.</p>
<p><a href="https://github.com/davidyen1124/caltrain-mcp">Source on GitHub</a></p>
<script>
  document.getElementById("url").textContent = location.origin + "/mcp";
</script>
</body></html>
"""


async def _landing(_: Request) -> Response:
    return HTMLResponse(LANDING_PAGE)


async def _icon(_: Request) -> Response:
    png = resources.files("caltrain_mcp").joinpath("icons/icon-512.png").read_bytes()
    return Response(
        png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


async def _health(_: Request) -> Response:
    data = gtfs.get_default_data()
    return JSONResponse({"ok": True, "stations": len(data.stations)})


def create_app(host: str = "0.0.0.0") -> ASGIApp:
    """Build the ASGI app: ``/mcp`` (stateless Streamable HTTP) plus a landing page.

    Stateless JSON responses let any serverless instance answer any request.
    DNS-rebinding protection only matters for servers bound to localhost, so
    it is enabled there and left off for public deployments.
    """
    security = (
        TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*"],
            allowed_origins=[
                "http://127.0.0.1:*",
                "http://localhost:*",
                "http://[::1]:*",
            ],
        )
        if host in LOCAL_HOSTS
        else TransportSecuritySettings(enable_dns_rebinding_protection=False)
    )
    mcp_app = mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=security,
        host=host,
    )
    extra_routes = [
        Route("/", _landing, methods=["GET"]),
        Route("/health", _health, methods=["GET"]),
        Route("/icon.png", _icon, methods=["GET"]),
    ]
    app = Starlette(
        routes=[*mcp_app.routes, *extra_routes],
        lifespan=mcp_app.router.lifespan_context,
    )
    # Browser-based MCP clients (inspectors, web hosts) need CORS.
    return CORSMiddleware(
        app,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Mcp-Session-Id", "Mcp-Protocol-Version"],
    )


# Load the GTFS feed at import so serverless cold starts pay for it once,
# before the first request rather than during it.
schedule.warm_up(gtfs.get_default_data())
app = create_app()
