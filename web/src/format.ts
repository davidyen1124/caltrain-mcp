// Formatting helpers. Caltrain runs on Pacific time, so everything is shown
// in America/Los_Angeles regardless of the viewer's own time zone.

export const TZ = "America/Los_Angeles";

const clockFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const longDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function clock(iso: string): string {
  return clockFmt.format(new Date(iso));
}

/** Split "6:54 PM" into ["6:54", "PM"] so the meridiem can be styled smaller. */
export function clockParts(iso: string): [string, string] {
  const parts = clockFmt.formatToParts(new Date(iso));
  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return [time, period];
}

/** "2026-09-26" -> "Sat, Sep 26" (service dates are calendar dates, not instants). */
export function shortDay(serviceDate: string): string {
  return dayFmt.format(new Date(`${serviceDate}T12:00:00Z`));
}

export function longDay(serviceDate: string): string {
  return longDayFmt.format(new Date(`${serviceDate}T12:00:00Z`));
}

/** Today's date in Pacific time as YYYY-MM-DD. */
export function pacificToday(now = new Date()): string {
  return isoDateFmt.format(now);
}

export function addDays(serviceDate: string, days: number): string {
  const d = new Date(`${serviceDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m} min`;
}

/** "in 7 min", "in 1h 5m", "now"; null once the train has left. */
export function countdown(iso: string, now: number): string | null {
  const minutes = Math.floor((new Date(iso).getTime() - now) / 60000);
  if (minutes < 0) return null;
  if (minutes === 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}
