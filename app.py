"""Vercel entrypoint: the Caltrain MCP server over Streamable HTTP at /mcp."""

from caltrain_mcp.http_app import app

__all__ = ["app"]
