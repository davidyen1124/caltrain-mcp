/** End-to-end tests of the /mcp route handler (what Vercel serves), on the real feed. */
import { describe, expect, it } from "vitest";
import { OPTIONS, POST } from "@/app/mcp/route";
import { TIMETABLE_URI, WIDGET_META_KEY } from "@/lib/mcp/server";

const HEADERS = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
  "mcp-protocol-version": "2025-11-25",
};

let id = 0;

/** One JSON-RPC call; the response may be JSON or a single-message SSE stream. */
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await POST(
    new Request("https://caltrain.example.com/mcp", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6))
    : JSON.parse(text);
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

describe("/mcp", () => {
  it("answers CORS preflight", () => {
    expect(OPTIONS().status).toBe(204);
  });

  it("initializes with server info and an icon", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.serverInfo.name).toBe("caltrain");
    expect(init.serverInfo.icons[0].src).toMatch(/^data:image\/png;base64,/);
    expect(init.instructions).toContain("next_trains");
  });

  it("lists the tools with UI metadata", async () => {
    const { tools } = await rpc("tools/list");
    const byName = Object.fromEntries(tools.map((t: { name: string }) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(["get_timetable", "list_stations", "next_trains"]);
    expect(byName.next_trains._meta.ui.resourceUri).toBe(TIMETABLE_URI);
    expect(byName.next_trains._meta["openai/outputTemplate"]).toBe(TIMETABLE_URI);
    expect(byName.next_trains.annotations.readOnlyHint).toBe(true);
    expect(byName.next_trains.inputSchema.properties.limit.default).toBe(3);
    expect(byName.get_timetable._meta.ui.visibility).toEqual(["app"]);
  });

  it("serves the timetable UI resource", async () => {
    const { contents } = await rpc("resources/read", { uri: TIMETABLE_URI });
    expect(contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(contents[0].text).toMatch(/<html/i);
    expect(contents[0]._meta.ui.prefersBorder).toBe(true);
  });

  it("finds trains with a text answer, structured data and the UI payload", async () => {
    const result = await rpc("tools/call", {
      name: "next_trains",
      arguments: { origin: "SF", destination: "Palo Alto", when_iso: "2026-10-05T07:00:00" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/^Next Caltrain departures from San Francisco to Palo Alto/);
    const sc = result.structuredContent;
    expect(sc.serviceDate).toBe("2026-10-05");
    expect(sc.dayType).toBe("Weekday");
    expect(sc.trains).toHaveLength(3);
    expect(sc.trains[0].departure >= "2026-10-05T07:00:00-07:00").toBe(true);
    const payload = result._meta[WIDGET_META_KEY];
    expect(payload.timetable.trains.length).toBeGreaterThan(20);
    expect(payload.matches.map((t: { key: string }) => t.key)).toHaveLength(3);
    expect(payload.stations[0].name).toBe("San Francisco");
  });

  it("reports bad input as tool errors", async () => {
    let result = await rpc("tools/call", {
      name: "next_trains",
      arguments: { origin: "Narnia", destination: "SF" },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");

    result = await rpc("tools/call", {
      name: "next_trains",
      arguments: { origin: "SF", destination: "SJ", when_iso: "soon" },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid datetime format");
  });

  it("returns a full day for the UI", async () => {
    const result = await rpc("tools/call", {
      name: "get_timetable",
      arguments: { origin: "sunnyvale", destination: "san_francisco", date: "2026-10-04" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.timetable.dayType).toBe("Weekend");
    expect(result.structuredContent.timetable.origin.name).toBe("Sunnyvale");
  });

  it("lists stations", async () => {
    const result = await rpc("tools/call", { name: "list_stations", arguments: {} });
    expect(result.content[0].text).toContain("• Palo Alto");
  });
});
