/**
 * Pacific-time helpers. Instants are epoch milliseconds; service dates are
 * calendar dates as "YYYY-MM-DD" strings. Everything goes through Intl, so the
 * server's own time zone never matters.
 */

export const PACIFIC = "America/Los_Angeles";

export class ScheduleError extends Error {
  override name = "ScheduleError";
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const offsetFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  timeZoneName: "longOffset",
});

// Pacific offsets only change on whole UTC hours, so cache them per hour:
// Intl is far too slow to call for every stop of every train.
const offsetCache = new Map<number, number>();

/** Pacific UTC offset in minutes at an instant (-420 for PDT, -480 for PST). */
export function offsetMinutes(ms: number): number {
  const hour = Math.floor(ms / HOUR);
  let offset = offsetCache.get(hour);
  if (offset === undefined) {
    const name = offsetFmt.formatToParts(new Date(hour * HOUR)).find((p) => p.type === "timeZoneName")!.value;
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    offset = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
    offsetCache.set(hour, offset);
  }
  return offset;
}

/** Wall-clock parts of an instant in Pacific time. */
export function pacificParts(ms: number): Parts {
  const d = new Date(ms + offsetMinutes(ms) * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/**
 * The instant of a Pacific wall-clock time. Like Python's fold=0, the
 * pre-transition offset wins for times that happen twice (fall back) or
 * never (spring forward).
 */
export function pacificToMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const before = guess - offsetMinutes(guess - DAY) * 60_000;
  const after = guess - offsetMinutes(guess + DAY) * 60_000;
  const fits = (ms: number) => {
    const p = pacificParts(ms);
    return p.day === day && p.hour === hour && p.minute === minute;
  };
  if (fits(before)) return before;
  if (fits(after)) return after;
  return before;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** "2026-09-28T07:00:00-07:00" (same shape as Python's isoformat()). */
export function pacificIso(ms: number): string {
  const p = pacificParts(ms);
  const off = offsetMinutes(ms);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return (
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Pacific calendar date of an instant, "YYYY-MM-DD". */
export function pacificDate(ms: number): string {
  const p = pacificParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "7:05 AM" */
export function formatClock(ms: number): string {
  const p = pacificParts(ms);
  const h12 = p.hour % 12 || 12;
  return `${h12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m} min`;
}

export function nowPacificMs(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

// --- Service dates -----------------------------------------------------------

function dateParts(serviceDate: string): [number, number, number] {
  const [y, m, d] = serviceDate.split("-").map(Number);
  return [y, m, d];
}

export function addDays(serviceDate: string, days: number): string {
  const [y, m, d] = dateParts(serviceDate);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday (Python's date.weekday()). */
export function weekday(serviceDate: string): number {
  const [y, m, d] = dateParts(serviceDate);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function weekdayName(serviceDate: string): string {
  return WEEKDAYS[weekday(serviceDate)];
}

/** "Monday, September 28" */
export function longDate(serviceDate: string): string {
  const [, m, d] = dateParts(serviceDate);
  return `${weekdayName(serviceDate)}, ${MONTHS[m - 1]} ${d}`;
}

/** "Monday, September 28, 2026" */
export function longDateWithYear(serviceDate: string): string {
  return `${longDate(serviceDate)}, ${dateParts(serviceDate)[0]}`;
}

/** GTFS date "20260928" for a service date. */
export function gtfsDate(serviceDate: string): string {
  return serviceDate.replaceAll("-", "");
}

/**
 * GTFS stop times count seconds from "noon minus 12h" of the service day,
 * which stays correct on DST change days.
 */
export function serviceTime(serviceDate: string, seconds: number): number {
  let base = serviceDayBase.get(serviceDate);
  if (base === undefined) {
    const [y, m, d] = dateParts(serviceDate);
    base = pacificToMs(y, m, d, 12) - 12 * HOUR;
    serviceDayBase.set(serviceDate, base);
  }
  return base + seconds * 1000;
}

const serviceDayBase = new Map<string, number>();

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,]\d+)?)?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Parse an ISO-8601 date or datetime; naive values are Pacific wall-clock time. */
export function parseWhen(value: string | null | undefined, fallback?: number): number {
  if (value == null || !value.trim()) return fallback ?? nowPacificMs();
  const m = ISO_RE.exec(value.trim());
  const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const [h, mi, s] = m ? [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)] : [0, 0, 0];
  if (!m || !validDate(y, mo, d) || h > 23 || mi > 59 || s > 59 || (m[7] && !m[4])) {
    throw new ScheduleError(
      `Invalid datetime format: ${value}. Please use ISO-8601 format, e.g. 2026-09-26T08:30:00.`,
    );
  }
  const zone = m[7];
  if (!zone) return pacificToMs(y, mo, d, h, mi, s);
  let offset = 0;
  if (zone.toUpperCase() !== "Z") {
    const sign = zone[0] === "-" ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0));
  }
  return Date.UTC(y, mo - 1, d, h, mi, s) - offset * 60_000;
}

/** Parse "YYYY-MM-DD" (anything after the first 10 characters is ignored). */
export function parseDate(value: string | null | undefined, fallback?: string): string {
  if (value == null || !value.trim()) return fallback ?? pacificDate(nowPacificMs());
  const text = value.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m || !validDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new ScheduleError(`Invalid date: ${value}. Please use YYYY-MM-DD.`);
  }
  return text;
}
