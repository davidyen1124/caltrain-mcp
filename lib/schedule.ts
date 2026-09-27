/**
 * Timetable queries on top of the GTFS tables: per-day timetables between two
 * stations, Pacific-time handling, trains that run past midnight, and
 * "arrive by" searches. The MCP tools and the timetable UI both consume the
 * JSON produced here.
 */

import type { GtfsTables } from "./gtfs/tables";
import {
  ScheduleError,
  addDays,
  formatClock,
  formatDuration,
  gtfsDate,
  longDate,
  longDateWithYear,
  nowPacificMs,
  pacificDate,
  pacificIso,
  serviceTime,
  weekday,
  weekdayName,
} from "./time";
import type {
  DayTimetable,
  PlanSummary,
  StationRef,
  TrainDetail,
  TrainSummary,
  WidgetPayload,
} from "./types";

export { ScheduleError };

// Fallback styling when routes.txt is missing (colours match the Caltrain feed).
const SERVICE_COLORS: Record<string, [string, string]> = {
  Local: ["#dcddde", "#000000"],
  Limited: ["#99d7dc", "#000000"],
  Express: ["#ce202f", "#ffffff"],
  "South County": ["#fae4a7", "#000000"],
};
const DEFAULT_COLORS: [string, string] = ["#dcddde", "#000000"];
const NAME_SUFFIX = /(\s+caltrain)?(\s+station)?$/i;

const ABBREVIATIONS: Record<string, string> = {
  sf: "san francisco",
  sj: "san jose",
  diridon: "san jose diridon",
  sjd: "san jose diridon",
  pa: "palo alto",
  mv: "mountain view",
  rc: "redwood city",
  mp: "menlo park",
  sfo: "san francisco",
  ssf: "south san francisco",
  "22nd": "22nd street",
  "cal ave": "california avenue",
  "california ave": "california avenue",
  "cal avenue": "california avenue",
  ca: "california avenue",
  sa: "san antonio",
  cp: "college park",
  mh: "morgan hill",
  sb: "san bruno",
  sc: "san carlos",
  bway: "broadway",
};

export type QueryMode = "depart_after" | "arrive_by";

export interface Station {
  id: string;
  name: string;
  fullName: string;
  lat: number | null;
  zone: string | null;
  /** Lower-cased name without " station"/" caltrain", for matching. */
  normalized: string;
}

export interface Stop {
  stationId: string;
  name: string;
  arrival: number;
  departure: number;
}

export interface Train {
  tripId: string;
  number: string;
  service: string;
  color: string;
  textColor: string;
  direction: string;
  headsign: string;
  serviceDate: string;
  departure: number;
  arrival: number;
  stops: Stop[];
}

export interface DayInfo {
  serviceDate: string;
  dayType: string;
  holiday: string | null;
}

export interface Timetable {
  origin: Station;
  destination: Station;
  day: DayInfo;
  trains: Train[];
}

export interface TripPlan {
  origin: Station;
  destination: Station;
  mode: QueryMode;
  queryTime: number;
  now: number;
  matches: Train[];
  timetable: Timetable;
  note: string | null;
}

interface TripInfo {
  number: string;
  service: string;
  color: string;
  textColor: string;
  direction: string;
  headsign: string;
  serviceId: string;
}

/** [stop_sequence, station id, arrival seconds, departure seconds] */
type TripStop = [number, string, number, number];

interface CalendarRow {
  serviceId: string;
  serviceName: string;
  days: boolean[];
  start: string;
  end: string;
}

interface CalendarDate {
  serviceId: string;
  date: string;
  exceptionType: string;
  holiday: string;
}

export interface FeedInfo {
  version: string | null;
  startDate: string | null;
  endDate: string | null;
}

export const trainKey = (t: Train) => `${t.serviceDate}/${t.tripId}`;
export const durationMinutes = (t: Train) => Math.floor((t.arrival - t.departure) / 60000);
export const stopsBetween = (t: Train) => Math.max(t.stops.length - 2, 0);

// ---------------------------------------------------------------------------
// Index construction
// ---------------------------------------------------------------------------

/** "San Francisco Caltrain Station" -> "San Francisco". */
export function displayName(stopName: string): string {
  const name = stopName.trim();
  return name.replace(NAME_SUFFIX, "") || stopName;
}

function hex(value: string | undefined, fallback: string): string {
  const text = (value ?? "").trim();
  return text ? `#${text.replace(/^#/, "").toLowerCase()}` : fallback;
}

function serviceName(routeShortName: string): string {
  // "Local Weekday" / "Local Weekend" are both just "Local" to riders.
  const name = routeShortName.trim();
  for (const suffix of [" Weekday", " Weekend"]) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return name || "Train";
}

function optional(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  return text || null;
}

/** "HH:MM:SS" -> seconds since the service day's start (may exceed 24h). */
export function timeToSeconds(value: string | undefined): number | null {
  const parts = (value ?? "").trim().split(":");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [h, m, s] = parts.map(Number);
  return h * 3600 + m * 60 + s;
}

export class Schedule {
  readonly stations = new Map<string, Station>();
  /** stops.txt order, used for name matching. */
  private readonly stationList: Station[] = [];
  private readonly trips = new Map<string, TripInfo>();
  private readonly tripStops = new Map<string, TripStop[]>();
  private readonly stationTrips = new Map<string, Set<string>>();
  private readonly calendar: CalendarRow[];
  private readonly calendarDates: CalendarDate[];
  private readonly activeCache = new Map<string, string[]>();
  /** Recent per-day train lists (planTrip asks for the same days repeatedly). */
  private readonly dayCache = new Map<string, Train[]>();
  readonly feed: FeedInfo;

  constructor(tables: GtfsTables) {
    for (const row of tables.stops) {
      if ((row.location_type ?? "").trim() !== "1") continue;
      const full = row.stop_name ?? "";
      const lat = Number.parseFloat(row.stop_lat ?? "");
      const station: Station = {
        id: row.stop_id,
        name: displayName(full),
        fullName: full,
        lat: Number.isFinite(lat) ? lat : null,
        zone: optional(row.zone_id),
        normalized: full.toLowerCase().replaceAll(" station", "").replaceAll(" caltrain", ""),
      };
      this.stations.set(station.id, station);
      this.stationList.push(station);
    }

    const platformToStation = new Map<string, string>();
    for (const row of tables.stops) {
      const parent = optional(row.parent_station);
      if (parent) platformToStation.set(row.stop_id, parent);
    }
    // Some feeds put stop_times directly on the station row.
    for (const id of this.stations.keys()) {
      if (!platformToStation.has(id)) platformToStation.set(id, id);
    }

    const routes = new Map<string, [string, string, string]>();
    for (const row of tables.routes) {
      const service = serviceName(row.route_short_name ?? "");
      const [bg, fg] = SERVICE_COLORS[service] ?? DEFAULT_COLORS;
      routes.set(row.route_id, [service, hex(row.route_color, bg), hex(row.route_text_color, fg)]);
    }

    for (const row of tables.trips) {
      const [service, color, textColor] = routes.get(row.route_id ?? "") ?? [
        "Train",
        ...DEFAULT_COLORS,
      ];
      const direction = ({ "0": "Northbound", "1": "Southbound" } as Record<string, string>)[
        optional(row.direction_id) ?? ""
      ];
      this.trips.set(row.trip_id, {
        number: optional(row.trip_short_name) ?? row.trip_id,
        service,
        color,
        textColor,
        direction: direction ?? "",
        headsign: optional(row.trip_headsign) ?? "",
        serviceId: row.service_id,
      });
    }

    for (const row of tables.stopTimes) {
      const station = platformToStation.get(row.stop_id);
      let arrival = timeToSeconds(row.arrival_time);
      let departure = timeToSeconds(row.departure_time);
      if (station === undefined || (arrival === null && departure === null)) continue;
      arrival ??= departure!;
      departure ??= arrival;
      const stops = this.tripStops.get(row.trip_id) ?? [];
      stops.push([Number(row.stop_sequence), station, arrival, departure]);
      this.tripStops.set(row.trip_id, stops);
      const trips = this.stationTrips.get(station) ?? new Set<string>();
      trips.add(row.trip_id);
      this.stationTrips.set(station, trips);
    }
    for (const stops of this.tripStops.values()) stops.sort((a, b) => a[0] - b[0]);

    this.calendar = tables.calendar.map((row) => ({
      serviceId: row.service_id,
      serviceName: row.service_name ?? "",
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (d) => (row[d] ?? "").trim() === "1",
      ),
      start: (row.start_date ?? "").trim(),
      end: (row.end_date ?? "").trim(),
    }));
    this.calendarDates = tables.calendarDates.map((row) => ({
      serviceId: row.service_id,
      date: (row.date ?? "").trim(),
      exceptionType: (row.exception_type ?? "").trim(),
      holiday: (row.holiday_name ?? "").trim(),
    }));
    const info = tables.feedInfo[0] ?? {};
    this.feed = {
      version: optional(info.feed_version),
      startDate: optional(info.feed_start_date),
      endDate: optional(info.feed_end_date),
    };
  }

  // -------------------------------------------------------------------------
  // Calendar and stations
  // -------------------------------------------------------------------------

  /** Service ids running on a date: calendar.txt, then calendar_dates.txt exceptions. */
  activeServiceIds(serviceDate: string): string[] {
    const cached = this.activeCache.get(serviceDate);
    if (cached) return cached;
    const day = gtfsDate(serviceDate);
    const dow = weekday(serviceDate);
    const active = new Set<string>();
    for (const row of this.calendar) {
      if (row.days[dow] && row.start <= day && row.end >= day) active.add(row.serviceId);
    }
    for (const ex of this.calendarDates) {
      if (ex.date !== day) continue;
      if (ex.exceptionType === "1") active.add(ex.serviceId);
      else if (ex.exceptionType === "2") active.delete(ex.serviceId);
    }
    const ids = [...active];
    this.activeCache.set(serviceDate, ids);
    return ids;
  }

  /** Station id for a name: abbreviation, exact, prefix, then substring match. */
  findStation(name: string): string {
    let needle = name.toLowerCase().trim();
    needle = ABBREVIATIONS[needle] ?? needle;
    const match =
      this.stationList.find((s) => s.normalized === needle) ??
      this.stationList.find((s) => s.normalized.startsWith(needle)) ??
      this.stationList.find((s) => s.fullName.toLowerCase().includes(needle));
    if (!match) throw new ScheduleError(`Station not found: ${name}`);
    return match.id;
  }

  /** Full station names, alphabetically. */
  stationNames(): string[] {
    return this.stationList.map((s) => s.fullName).sort();
  }

  resolveStation(name: string, role = "Station"): Station {
    const byId = this.stations.get(name); // exact GTFS station id (used by the UI)
    if (byId) return byId;
    try {
      return this.stations.get(this.findStation(name))!;
    } catch {
      const needle = name.toLowerCase().trim();
      const close = this.stationNames().filter(
        (s) =>
          needle && (s.toLowerCase().includes(needle) || s.toLowerCase().startsWith(needle.slice(0, 3))),
      );
      let message = `${role} station '${name}' not found.`;
      message += close.length
        ? ` Did you mean one of these? ${close.slice(0, 5).join(", ")}`
        : " Use list_stations() to see all available stations.";
      throw new ScheduleError(message);
    }
  }

  /** Stations from San Francisco (north) to Gilroy (south). */
  stationsInLineOrder(): Station[] {
    return [...this.stationList].sort(
      (a, b) => -(a.lat ?? 0) - -(b.lat ?? 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
  }

  dayInfo(serviceDate: string): DayInfo {
    const active = new Set(this.activeServiceIds(serviceDate));
    let dayType = weekday(serviceDate) >= 5 ? "Weekend" : "Weekday";
    const names = this.calendar.filter((c) => active.has(c.serviceId)).map((c) => c.serviceName);
    if (names.some((n) => /weekend/i.test(n))) dayType = "Weekend";
    else if (names.some((n) => /weekday/i.test(n))) dayType = "Weekday";
    const day = gtfsDate(serviceDate);
    const holiday = this.calendarDates.find((c) => c.date === day && c.holiday)?.holiday ?? null;
    return { serviceDate, dayType, holiday };
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Every train on a service date that stops at origin, then destination. */
  trainsForDay(origin: Station, destination: Station, serviceDate: string): Train[] {
    const key = `${origin.id}|${destination.id}|${serviceDate}`;
    let trains = this.dayCache.get(key);
    if (trains) {
      this.dayCache.delete(key); // keep recently used entries last
    } else {
      trains = this.computeTrainsForDay(origin, destination, serviceDate);
      if (this.dayCache.size >= 256) this.dayCache.delete(this.dayCache.keys().next().value!);
    }
    this.dayCache.set(key, trains);
    return trains;
  }

  private computeTrainsForDay(origin: Station, destination: Station, serviceDate: string): Train[] {
    const active = new Set(this.activeServiceIds(serviceDate));
    if (!active.size || origin.id === destination.id) return [];
    const atDestination = this.stationTrips.get(destination.id) ?? new Set<string>();
    const trains: Train[] = [];
    for (const tripId of this.stationTrips.get(origin.id) ?? []) {
      if (!atDestination.has(tripId)) continue;
      const info = this.trips.get(tripId);
      if (!info || !active.has(info.serviceId)) continue;
      const stops = this.tripStops.get(tripId)!;
      const start = stops.findIndex((s) => s[1] === origin.id);
      const end = stops.findIndex((s, i) => i > start && s[1] === destination.id);
      if (end < 0) continue;
      const leg = stops.slice(start, end + 1);
      trains.push({
        tripId,
        number: info.number,
        service: info.service,
        color: info.color,
        textColor: info.textColor,
        direction: info.direction,
        headsign: info.headsign,
        serviceDate,
        departure: serviceTime(serviceDate, leg[0][3]),
        arrival: serviceTime(serviceDate, leg[leg.length - 1][2]),
        stops: leg.map(([, stationId, arr, dep]) => ({
          stationId,
          name: this.stations.get(stationId)?.name ?? stationId,
          arrival: serviceTime(serviceDate, arr),
          departure: serviceTime(serviceDate, dep),
        })),
      });
    }
    return trains.sort(
      (a, b) =>
        a.departure - b.departure ||
        a.arrival - b.arrival ||
        (a.tripId < b.tripId ? -1 : a.tripId > b.tripId ? 1 : 0),
    );
  }

  /** Stations reachable without changing trains, with how many trips serve each. */
  private servedStations(station: Station, serviceDate: string): Map<string, number> {
    const active = new Set(this.activeServiceIds(serviceDate));
    const counts = new Map<string, number>();
    for (const tripId of this.stationTrips.get(station.id) ?? []) {
      const info = this.trips.get(tripId);
      if (!info || !active.has(info.serviceId)) continue;
      for (const [, stationId] of this.tripStops.get(tripId)!) {
        counts.set(stationId, (counts.get(stationId) ?? 0) + 1);
      }
    }
    counts.delete(station.id);
    return counts;
  }

  /** Explain an empty result: a station with no service, or a needed transfer. */
  noServiceNote(origin: Station, destination: Station, serviceDate: string): string {
    const day = longDate(serviceDate);
    const fromOrigin = this.servedStations(origin, serviceDate);
    const toDestination = this.servedStations(destination, serviceDate);
    for (const [station, served] of [
      [origin, fromOrigin],
      [destination, toDestination],
    ] as const) {
      if (!served.size) return `No scheduled trains stop at ${station.name} on ${day}.`;
    }
    const hubs = [...fromOrigin.keys()].filter((id) => toDestination.has(id));
    if (hubs.length) {
      const score = (id: string) => fromOrigin.get(id)! + toDestination.get(id)!;
      const hub = hubs.reduce((best, id) => (score(id) > score(best) ? id : best));
      const name = this.stations.get(hub)?.name ?? hub;
      return (
        `No direct trains from ${origin.name} to ${destination.name} on ${day}. ` +
        `Change trains at ${name}: look up ${origin.name} → ${name}, then ${name} → ${destination.name}.`
      );
    }
    return `No trains run from ${origin.name} to ${destination.name} on ${day}.`;
  }

  timetable(origin: string, destination: string, serviceDate: string): Timetable {
    const o = this.resolveStation(origin, "Origin");
    const d = this.resolveStation(destination, "Destination");
    return {
      origin: o,
      destination: d,
      day: this.dayInfo(serviceDate),
      trains: this.trainsForDay(o, d, serviceDate),
    };
  }

  /**
   * Find the trains that best answer a rider's question.
   *
   * depart_after (default): the next `limit` trains leaving at/after `when`
   * (or now). Trains that run after midnight on the previous service day
   * count. If nothing is left tonight, the first trains of the next day with
   * service are returned.
   *
   * arrive_by: the latest `limit` trains arriving at/before `arriveBy` that
   * have not already left (relative to `when` or now).
   */
  planTrip(
    origin: string,
    destination: string,
    opts: { when?: number; arriveBy?: number; limit?: number; now?: number } = {},
  ): TripPlan {
    const o = this.resolveStation(origin, "Origin");
    const d = this.resolveStation(destination, "Destination");
    if (o.id === d.id) throw new ScheduleError("Origin and destination are the same station.");
    const now = opts.now ?? nowPacificMs();
    const limit = Math.max(1, Math.min(opts.limit ?? 3, 20));
    let note: string | null = null;
    let mode: QueryMode;
    let queryTime: number;
    let matches: Train[];
    let timetableDay: string;

    if (opts.arriveBy !== undefined) {
      mode = "arrive_by";
      queryTime = opts.arriveBy;
      const earliest = opts.when ?? now;
      const day = pacificDate(queryTime);
      const pool = [...this.trainsForDay(o, d, addDays(day, -1)), ...this.trainsForDay(o, d, day)];
      const eligible = pool
        .filter((t) => t.arrival <= queryTime && t.departure >= earliest)
        .sort((a, b) => a.arrival - b.arrival);
      matches = eligible.slice(-limit).sort((a, b) => a.departure - b.departure);
      timetableDay = matches.length ? matches[matches.length - 1].serviceDate : day;
      if (!matches.length && !this.trainsForDay(o, d, day).length) {
        note = this.noServiceNote(o, d, day);
      } else if (!matches.length) {
        note =
          `No train that hasn't already left gets from ${o.name} to ${d.name} ` +
          `by ${formatClock(queryTime)}.`;
      }
    } else {
      mode = "depart_after";
      queryTime = opts.when ?? now;
      const day = pacificDate(queryTime);
      const pool = [...this.trainsForDay(o, d, addDays(day, -1)), ...this.trainsForDay(o, d, day)];
      matches = pool
        .filter((t) => t.departure >= queryTime)
        .sort((a, b) => a.departure - b.departure)
        .slice(0, limit);
      timetableDay = matches.length ? matches[0].serviceDate : day;
      if (!matches.length) {
        // Roll forward to the next day with service (e.g. weekend-only gaps).
        const ranToday = pool.some((t) => t.serviceDate === day);
        let nextDay = day;
        for (let ahead = 1; ahead < 8 && !matches.length; ahead++) {
          nextDay = addDays(day, ahead);
          matches = this.trainsForDay(o, d, nextDay).slice(0, limit);
        }
        if (matches.length) {
          timetableDay = nextDay;
          note =
            (ranToday
              ? `No more trains tonight from ${o.name} to ${d.name}.`
              : `No trains from ${o.name} to ${d.name} on ${weekdayName(day)}.`) +
            ` Showing the first trains on ${longDate(nextDay)}.`;
        } else {
          note = this.noServiceNote(o, d, day);
        }
      } else if (matches.length < limit) {
        note = "These are the last trains of the service day.";
      }
    }

    return {
      origin: o,
      destination: d,
      mode,
      queryTime,
      now,
      matches,
      timetable: {
        origin: o,
        destination: d,
        day: this.dayInfo(timetableDay),
        trains: this.trainsForDay(o, d, timetableDay),
      },
      note,
    };
  }
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export function stationJson(station: Station): StationRef {
  return { id: station.id, name: station.name };
}

/** Compact per-train data that the model sees. */
export function trainSummaryJson(train: Train): TrainSummary {
  return {
    train: train.number,
    service: train.service,
    direction: train.direction,
    departure: pacificIso(train.departure),
    arrival: pacificIso(train.arrival),
    departureTime: formatClock(train.departure),
    arrivalTime: formatClock(train.arrival),
    durationMinutes: durationMinutes(train),
    stopsBetween: stopsBetween(train),
  };
}

/** Full per-train data for the timetable UI. */
export function trainDetailJson(train: Train): TrainDetail {
  return {
    ...trainSummaryJson(train),
    key: trainKey(train),
    tripId: train.tripId,
    serviceDate: train.serviceDate,
    headsign: train.headsign,
    color: train.color,
    textColor: train.textColor,
    // Compact [station id, "6:54 PM"] pairs; the UI maps ids to names.
    stops: train.stops.map((s) => [s.stationId, formatClock(s.departure)]),
  };
}

function dayJson(day: DayInfo) {
  return { serviceDate: day.serviceDate, dayType: day.dayType, holiday: day.holiday };
}

export function timetableJson(table: Timetable, now?: number): DayTimetable {
  return {
    origin: stationJson(table.origin),
    destination: stationJson(table.destination),
    ...dayJson(table.day),
    now: pacificIso(now ?? nowPacificMs()),
    trains: table.trains.map(trainDetailJson),
  };
}

/** What the model (and the UI) receives as structuredContent. */
export function planStructuredJson(plan: TripPlan): PlanSummary {
  return {
    origin: stationJson(plan.origin),
    destination: stationJson(plan.destination),
    ...dayJson(plan.timetable.day),
    query: { mode: plan.mode, time: pacificIso(plan.queryTime) },
    trains: plan.matches.map(trainSummaryJson),
    trainsThatDay: plan.timetable.trains.length,
    note: plan.note,
  };
}

/** Extra data only the UI needs (full day + stop lists). */
export function planWidgetJson(plan: TripPlan): Omit<WidgetPayload, "stations"> {
  return {
    matches: plan.matches.map(trainDetailJson),
    timetable: timetableJson(plan.timetable, plan.now),
  };
}

/** Plain-text answer for clients without the UI. */
export function planText(plan: TripPlan): string {
  const day = plan.timetable.day;
  const schedule = `${day.dayType} schedule${day.holiday ? `, ${day.holiday}` : ""}`;
  const heading =
    plan.mode === "arrive_by"
      ? `Caltrain from ${plan.origin.name} to ${plan.destination.name}, arriving by ${formatClock(plan.queryTime)}`
      : `Next Caltrain departures from ${plan.origin.name} to ${plan.destination.name} after ${formatClock(plan.queryTime)}`;
  const lines = [`${heading} (${longDateWithYear(day.serviceDate)}, ${schedule}):`];
  for (const t of plan.matches) {
    lines.push(
      `• Train ${t.number} (${t.service}): ${formatClock(t.departure)} → ${formatClock(t.arrival)}, ` +
        `${formatDuration(durationMinutes(t))}, ${stopsBetween(t)} stops in between`,
    );
  }
  if (!plan.matches.length) lines.push("• No trains match.");
  if (plan.note) lines.push(plan.note);
  const trains = plan.timetable.trains;
  if (trains.length) {
    lines.push(
      `${trains.length} trains run this route that day ` +
        `(first ${formatClock(trains[0].departure)}, last ${formatClock(trains[trains.length - 1].departure)}).`,
    );
  }
  return lines.join("\n");
}
