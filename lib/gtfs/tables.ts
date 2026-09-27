import { parseCsv } from "./csv";

type Row = Record<string, string>;

/** The GTFS tables (and columns) the schedule engine reads, as raw strings. */
export interface GtfsTables {
  stops: Row[];
  routes: Row[];
  trips: Row[];
  stopTimes: Row[];
  calendar: Row[];
  calendarDates: Row[];
  feedInfo: Row[];
}

export const TABLE_FILES: Record<keyof GtfsTables, string> = {
  stops: "stops.txt",
  routes: "routes.txt",
  trips: "trips.txt",
  stopTimes: "stop_times.txt",
  calendar: "calendar.txt",
  calendarDates: "calendar_dates.txt",
  feedInfo: "feed_info.txt",
};

const COLUMNS: Record<keyof GtfsTables, string[]> = {
  stops: ["stop_id", "stop_name", "stop_lat", "location_type", "parent_station", "zone_id"],
  routes: ["route_id", "route_short_name", "route_color", "route_text_color"],
  trips: ["route_id", "service_id", "trip_id", "trip_short_name", "trip_headsign", "direction_id"],
  stopTimes: ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
  calendar: [
    "service_id",
    "service_name",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "start_date",
    "end_date",
  ],
  calendarDates: ["service_id", "date", "exception_type", "holiday_name"],
  feedInfo: ["feed_version", "feed_start_date", "feed_end_date"],
};

/** Compact column-oriented form, used for the generated JSON bundle. */
export type PackedTables = Record<keyof GtfsTables, { columns: string[]; rows: string[][] }>;

/** Parse GTFS CSV text (missing files are empty tables). */
export function tablesFromCsv(files: Partial<Record<keyof GtfsTables, string>>): GtfsTables {
  const out = {} as GtfsTables;
  for (const key of Object.keys(COLUMNS) as (keyof GtfsTables)[]) {
    const text = files[key];
    out[key] = text ? parseCsv(text) : [];
  }
  return out;
}

export function packTables(tables: GtfsTables): PackedTables {
  const out = {} as PackedTables;
  for (const key of Object.keys(COLUMNS) as (keyof GtfsTables)[]) {
    const present = COLUMNS[key].filter((c) => tables[key].some((row) => c in row));
    out[key] = {
      columns: present,
      rows: tables[key].map((row) => present.map((c) => row[c] ?? "")),
    };
  }
  return out;
}

export function unpackTables(packed: PackedTables): GtfsTables {
  const out = {} as GtfsTables;
  for (const key of Object.keys(COLUMNS) as (keyof GtfsTables)[]) {
    const { columns, rows } = packed[key] ?? { columns: [], rows: [] };
    out[key] = rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  }
  return out;
}
