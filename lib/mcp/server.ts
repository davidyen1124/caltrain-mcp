import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import * as z from "zod";
import { WIDGET_HTML } from "../generated/widget-html";
import { getSchedule } from "../gtfs/feed";
import { ICON_128_DATA_URI } from "../icon";
import {
  ScheduleError,
  planStructuredJson,
  planText,
  planWidgetJson,
  stationJson,
  timetableJson,
  type Schedule,
} from "../schedule";
import { nowPacificMs, parseDate, parseWhen, pacificDate } from "../time";
import pkg from "../../package.json";

import { REPO_URL, TIMETABLE_URI } from "./constants";

export { TIMETABLE_URI };

const INSTRUCTIONS = `\
Caltrain schedules (San Francisco – San Jose – Gilroy) from the official GTFS feed.
Use next_trains for any question about when trains run between two stations:
"next train", "trains tomorrow morning", "last train tonight", "arrive by 9am".
Times are Pacific. Pass when_iso / arrive_by_iso as local Pacific ISO-8601 times.
In hosts that render the timetable UI, the user already sees a table of the
trains, so keep the text reply short: highlight the best option and anything
notable (express trains, last train, holiday schedule) instead of repeating
every row.`;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const WIDGET_META_KEY = "caltrain/timetable";

function error(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Turn schedule errors into tool errors; anything else is a real bug. */
function guard(fn: () => CallToolResult): CallToolResult {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ScheduleError) return error(err.message);
    throw err;
  }
}

function stationsJson(schedule: Schedule) {
  return schedule.stationsInLineOrder().map(stationJson);
}

/** A fresh server per request (the HTTP handler is stateless). */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "caltrain",
      title: "Caltrain",
      version: pkg.version,
      description: "Caltrain timetables with an interactive schedule view.",
      websiteUrl: REPO_URL,
      icons: [{ src: ICON_128_DATA_URI, mimeType: "image/png", sizes: ["128x128"] }],
    },
    { instructions: INSTRUCTIONS },
  );

  registerAppTool(
    server,
    "next_trains",
    {
      title: "Find Caltrain trains",
      description: `\
Use this when the user asks when Caltrain runs between two stations.

Finds the few trains that best match the request (the next ones after a time,
or the last ones that arrive by a time) and shows them in an interactive
timetable card that the user can expand to the whole day. The card already
lists every train, so reply briefly: recommend the best option and mention
anything notable (express, last train, holiday schedule, a needed transfer)
rather than re-listing the trains. Use list_stations if a station name is not
recognised.`,
      inputSchema: z.object({
        origin: z
          .string()
          .describe(
            "Departure station, e.g. 'Palo Alto', 'San Jose Diridon', 'SF', '22nd'. " +
              "Abbreviations like SF, SJ, MV, RC, PA work.",
          ),
        destination: z.string().describe("Arrival station, e.g. 'San Francisco', 'Mountain View'."),
        when_iso: z
          .string()
          .optional()
          .describe(
            "Leave at or after this Pacific time (ISO-8601, e.g. '2026-09-27T08:00:00'). " +
              "Omit for now. A date alone means that day from the first train.",
          ),
        arrive_by_iso: z
          .string()
          .optional()
          .describe(
            "Instead of 'leave after', find the latest trains that arrive by this " +
              "Pacific time (ISO-8601).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3)
          .describe("How many trains to highlight (default 3)."),
      }),
      annotations: READ_ONLY,
      _meta: {
        ui: { resourceUri: TIMETABLE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": TIMETABLE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Checking the Caltrain timetable…",
        "openai/toolInvocation/invoked": "Found your trains",
      },
    },
    async ({ origin, destination, when_iso, arrive_by_iso, limit }) =>
      guard(() => {
        const schedule = getSchedule();
        const now = nowPacificMs();
        const plan = schedule.planTrip(origin, destination, {
          when: when_iso ? parseWhen(when_iso) : undefined,
          arriveBy: arrive_by_iso ? parseWhen(arrive_by_iso) : undefined,
          limit,
          now,
        });
        return {
          content: [{ type: "text", text: planText(plan) }],
          structuredContent: { ...planStructuredJson(plan) },
          // UI-only data: hosts pass result `_meta` to the view but not the model.
          _meta: {
            [WIDGET_META_KEY]: { ...planWidgetJson(plan), stations: stationsJson(schedule) },
          },
        };
      }),
  );

  // App-only: the timetable UI calls this to switch stations or dates.
  server.registerTool(
    "get_timetable",
    {
      title: "Caltrain day timetable",
      description: "Full-day timetable between two stations (used by the timetable UI).",
      inputSchema: z.object({
        origin: z.string().describe("Departure station name or id."),
        destination: z.string().describe("Arrival station name or id."),
        date: z.string().optional().describe("Service date YYYY-MM-DD (Pacific). Omit for today."),
      }),
      annotations: READ_ONLY,
      _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    },
    async ({ origin, destination, date }) =>
      guard(() => {
        const schedule = getSchedule();
        const now = nowPacificMs();
        const serviceDate = parseDate(date, pacificDate(now));
        const table = schedule.timetable(origin, destination, serviceDate);
        return {
          content: [
            {
              type: "text",
              text:
                `${table.trains.length} trains from ${table.origin.name} to ` +
                `${table.destination.name} on ${serviceDate}.`,
            },
          ],
          // The full payload goes in structuredContent so the UI gets it even
          // from hosts that drop `_meta` on UI-initiated calls.
          structuredContent: { timetable: timetableJson(table, now), stations: stationsJson(schedule) },
        };
      }),
  );

  server.registerTool(
    "list_stations",
    {
      title: "List Caltrain stations",
      description:
        "List all Caltrain stations. Use it to find exact station names when " +
        "next_trains reports that a station was not found. Names are " +
        "case-insensitive and common abbreviations like 'SF' and 'SJ' work.",
      annotations: READ_ONLY,
    },
    async () => {
      const names = getSchedule().stationNames();
      return {
        content: [
          {
            type: "text",
            text:
              `Available Caltrain stations:\n${names.map((n) => `• ${n}`).join("\n")}\n\n` +
              "Note: Station names support common abbreviations like 'SF' for San Francisco " +
              "and 'SJ' for San Jose.",
          },
        ],
      };
    },
  );

  const resourceMeta = {
    // Everything is inlined, so the view needs no network access.
    ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true },
    "openai/widgetDescription":
      "An interactive Caltrain timetable card listing the matching trains (the user " +
      "can reveal later trains, open stop lists and a full-day view with station, " +
      "date and service filters). It already shows the train list, so don't repeat " +
      "it as a table.",
  };
  registerAppResource(
    server,
    "caltrain-timetable",
    TIMETABLE_URI,
    {
      title: "Caltrain timetable",
      description: "Interactive Caltrain timetable for a pair of stations.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: resourceMeta,
    },
    async () => ({
      contents: [
        { uri: TIMETABLE_URI, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML, _meta: resourceMeta },
      ],
    }),
  );

  return server;
}
