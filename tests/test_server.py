import pytest

from caltrain_mcp import server


def _text(result) -> str:
    return "\n".join(block.text for block in result.content)


@pytest.mark.asyncio
async def test_next_trains_basic():
    # Test with a specific time early in the morning to catch the 08:00 departure
    result = await server.next_trains("SF", "Palo Alto", "2025-01-01T07:00:00")
    assert not result.is_error
    msg = _text(result)
    # Should list one departure at 08:00 → 08:50
    assert "8:00 AM → 8:50 AM" in msg
    trains = result.structured_content["trains"]
    assert [t["train"] for t in trains] == ["SJ"]
    assert trains[0]["departure"] == "2025-01-01T08:00:00-08:00"


@pytest.mark.asyncio
async def test_next_trains_widget_meta():
    result = await server.next_trains("SF", "Palo Alto", "2025-01-01T07:00:00")
    payload = result.meta["caltrain/timetable"]
    assert payload["timetable"]["serviceDate"] == "2025-01-01"
    assert payload["matches"][0]["stops"][0] == ["100", "8:00 AM"]
    assert {s["id"] for s in payload["stations"]} == {"100", "200"}


@pytest.mark.asyncio
async def test_next_trains_error_cases():
    """Test error handling in next_trains function"""
    # Test invalid datetime format
    result = await server.next_trains("SF", "Palo Alto", "invalid-datetime")
    assert result.is_error
    assert "Invalid datetime format" in _text(result)

    # Test nonexistent station
    result = await server.next_trains("Nonexistent Station", "Palo Alto")
    assert result.is_error
    assert "not found" in _text(result)

    # No trains on the weekend: roll forward to Monday's first train
    result = await server.next_trains("SF", "Palo Alto", "2025-01-04T07:00:00")
    assert not result.is_error
    assert result.structured_content["serviceDate"] == "2025-01-06"
    assert "No trains from San Francisco to Palo Alto on Saturday" in _text(result)


@pytest.mark.asyncio
async def test_next_trains_timezone_handling():
    """Timezone-aware times are converted to Pacific before searching."""
    # 15:00 UTC is 07:00 Pacific (PST, UTC-8), so the 08:00 train is next.
    result = await server.next_trains("SF", "Palo Alto", "2025-01-01T15:00:00Z")
    assert "8:00 AM → 8:50 AM" in _text(result)

    # 17:00 UTC is 09:00 Pacific: nothing left that day.
    result = await server.next_trains("SF", "Palo Alto", "2025-01-01T17:00:00+00:00")
    assert result.structured_content["trains"][0]["departure"].startswith("2025-01-03")


@pytest.mark.asyncio
async def test_get_timetable():
    result = await server.get_timetable("100", "200", "2025-01-01")
    assert not result.is_error
    payload = result.structured_content
    assert payload["timetable"]["origin"]["name"] == "San Francisco"
    assert len(payload["timetable"]["trains"]) == 1

    result = await server.get_timetable("100", "200", "not-a-date")
    assert result.is_error


@pytest.mark.asyncio
async def test_list_stations():
    """Test the list_stations function"""
    msg = await server.list_stations()
    assert "Available Caltrain stations:" in msg
    assert "San Francisco Caltrain" in msg
    assert "Palo Alto" in msg
    # Should be sorted alphabetically
    assert msg.index("Palo Alto") < msg.index("San Francisco Caltrain")


@pytest.mark.asyncio
async def test_tools_and_ui_resource_are_registered():
    tools = {t.name: t for t in await server.mcp.list_tools()}
    assert tools["next_trains"].meta["ui"]["resourceUri"] == server.TIMETABLE_URI
    assert tools["get_timetable"].meta["ui"]["visibility"] == ["app"]
    assert tools["next_trains"].annotations.read_only_hint is True

    contents = await server.mcp.read_resource(server.TIMETABLE_URI)
    assert contents[0].mime_type == "text/html;profile=mcp-app"
    assert "<html" in str(contents[0].content).lower()
