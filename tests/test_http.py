"""End-to-end tests of the Streamable HTTP app (what Vercel serves)."""

from starlette.testclient import TestClient

from caltrain_mcp import server
from caltrain_mcp.http_app import create_app

HEADERS = {
    "accept": "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-11-25",
}


def _rpc(client: TestClient, method: str, params: dict | None = None) -> dict:
    response = client.post(
        "/mcp",
        headers=HEADERS,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
    )
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_http_app_serves_tools_and_ui():
    with TestClient(create_app(), base_url="https://caltrain.example.com") as client:
        assert client.get("/health").json()["ok"] is True
        assert "Caltrain MCP server" in client.get("/").text
        icon = client.get("/icon.png")
        assert icon.headers["content-type"] == "image/png"
        assert icon.content.startswith(b"\x89PNG")

        init = _rpc(
            client,
            "initialize",
            {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1"},
            },
        )
        assert init["serverInfo"]["name"] == "caltrain"
        assert init["serverInfo"]["icons"][0]["src"].startswith(
            "data:image/png;base64,"
        )

        tools = {t["name"]: t for t in _rpc(client, "tools/list")["tools"]}
        assert (
            tools["next_trains"]["_meta"]["ui"]["resourceUri"] == server.TIMETABLE_URI
        )

        contents = _rpc(client, "resources/read", {"uri": server.TIMETABLE_URI})
        assert contents["contents"][0]["mimeType"] == "text/html;profile=mcp-app"

        result = _rpc(
            client,
            "tools/call",
            {
                "name": "next_trains",
                "arguments": {
                    "origin": "SF",
                    "destination": "Palo Alto",
                    "when_iso": "2025-01-01T07:00:00",
                },
            },
        )
        assert result["structuredContent"]["trains"][0]["train"] == "SJ"
        assert "caltrain/timetable" in result["_meta"]


def test_localhost_app_rejects_foreign_host():
    # DNS-rebinding protection stays on when bound to localhost.
    with TestClient(
        create_app(host="127.0.0.1"), base_url="http://evil.example"
    ) as client:
        response = client.post(
            "/mcp",
            headers=HEADERS,
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        )
        assert response.status_code in (400, 403, 421)
