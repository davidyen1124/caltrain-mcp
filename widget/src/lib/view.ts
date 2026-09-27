/** Pure view logic for the timetable UI (what to show, not how). */
import type { DayTimetable, PlanSummary, TrainDetail } from "@/lib/types";
import { clock, countdown, duration, longDay, pacificToday, plural, shortDay } from "./format";

export const INLINE_STEP = 5;
const SOON_MS = 12 * 3600 * 1000;

export type DisplayMode = "inline" | "fullscreen" | "pip";

/** The query the model answered, plus the trains it picked. */
export interface Answer {
  plan: PlanSummary | null;
  matches: TrainDetail[];
}

const ms = (iso: string) => new Date(iso).getTime();

export function isToday(day: DayTimetable, now = Date.now()): boolean {
  return day.serviceDate === pacificToday(new Date(now));
}

/** Is the view still on the stations and day the model answered for? */
export function isPlanDay(day: DayTimetable, { plan }: Answer): boolean {
  return (
    !!plan &&
    plan.serviceDate === day.serviceDate &&
    plan.origin.id === day.origin.id &&
    plan.destination.id === day.destination.id
  );
}

/** Index range of the trains the inline card starts with. */
export function anchorRange(day: DayTimetable, answer: Answer, now: number): [number, number] {
  const keys = new Set(answer.matches.map((t) => t.key));
  const idx = day.trains.flatMap((t, i) => (keys.has(t.key) ? [i] : []));
  if (idx.length) return [idx[0], idx[idx.length - 1] + 1];
  const upcoming = day.trains.findIndex((t) => ms(t.departure) >= now);
  const start = upcoming >= 0 ? upcoming : isToday(day, now) ? day.trains.length : 0;
  return [start, Math.min(start + 3, day.trains.length)];
}

/** Trains on the inline card: the answer, plus `later` more after it. */
export function inlineTrains(
  day: DayTimetable,
  answer: Answer,
  later: number,
  now: number,
): { trains: TrainDetail[]; laterLeft: number } {
  const [start, end] = anchorRange(day, answer, now);
  const stop = Math.min(day.trains.length, end + later);
  const shown = day.trains.slice(start, stop);
  // Matches from a neighbouring service day (e.g. an after-midnight train),
  // only while the user is still looking at the day the model answered for.
  const seen = new Set(shown.map((t) => t.key));
  const extra = isPlanDay(day, answer) ? answer.matches.filter((t) => !seen.has(t.key)) : [];
  const trains = [...shown, ...extra].sort((a, b) => ms(a.departure) - ms(b.departure));
  return { trains, laterLeft: day.trains.length - stop };
}

export function filteredTrains(day: DayTimetable, filter: string): TrainDetail[] {
  return filter === "All" ? day.trains : day.trains.filter((t) => t.service === filter);
}

/** [service, count] in rider-friendly order. */
export function serviceCounts(day: DayTimetable): [string, number][] {
  const order = ["Express", "Limited", "Local", "South County"];
  const counts = new Map<string, number>();
  for (const t of day.trains) counts.set(t.service, (counts.get(t.service) ?? 0) + 1);
  const rank = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length);
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** The first train still to leave, if it leaves within the next 12 hours. */
export function nextTrainKey(trains: TrainDetail[], now: number): string | null {
  const next = trains.find((t) => ms(t.departure) >= now);
  return next && ms(next.departure) - now < SOON_MS ? next.key : null;
}

export type Status = { kind: "past" | "next" | "upcoming"; label: string };

export function statusFor(train: TrainDetail, nextKey: string | null, now: number): Status {
  const dep = ms(train.departure);
  if (dep < now) {
    return { kind: "past", label: ms(train.arrival) >= now ? "En route" : "Departed" };
  }
  const soon = dep - now < SOON_MS ? countdown(train.departure, now) : null;
  if (train.key === nextKey) return { kind: "next", label: soon ?? "Next" };
  return { kind: "upcoming", label: soon ?? "" };
}

/** Highlight the suggested trains only when other trains are listed too. */
export function highlightKeys(
  trains: TrainDetail[],
  day: DayTimetable,
  answer: Answer,
): Set<string> {
  // Same trip ids serve other station pairs, so only highlight the exact
  // origin/destination/day the model answered for.
  if (!isPlanDay(day, answer)) return new Set();
  const keys = new Set(answer.matches.map((t) => t.key));
  return trains.some((t) => !keys.has(t.key)) ? keys : new Set();
}

export function dayLabel(day: DayTimetable, now: number): string {
  return isToday(day, now) ? `Today, ${shortDay(day.serviceDate)}` : shortDay(day.serviceDate);
}

export function subtitle(day: DayTimetable, answer: Answer, now: number): string {
  const parts: string[] = [];
  const plan = answer.plan;
  if (plan && isPlanDay(day, answer) && answer.matches.length) {
    const t = plan.query.time;
    if (plan.query.mode === "arrive_by") parts.push(`Arrive by ${clock(t)}`);
    else if (Math.abs(ms(t) - now) > 5 * 60000) parts.push(`Leaving after ${clock(t)}`);
  }
  parts.push(dayLabel(day, now));
  parts.push(`${day.dayType} schedule`);
  return parts.join(" · ");
}

export function summaryLine(trains: TrainDetail[]): string {
  if (!trains.length) return "";
  const fastest = trains.reduce((a, b) => (b.durationMinutes < a.durationMinutes ? b : a));
  return (
    `${plural(trains.length, "train")} · ${clock(trains[0].departure)} – ` +
    `${clock(trains[trains.length - 1].departure)} · fastest ${duration(fastest.durationMinutes)} ` +
    `(${fastest.service} ${fastest.train})`
  );
}

/** What the model is told the user is looking at (MCP Apps model context). */
export function describeView(opts: {
  day: DayTimetable;
  answer: Answer;
  mode: DisplayMode;
  filter: string;
  later: number;
  open: string | null;
  stationName: (id: string) => string;
  now: number;
}): string {
  const { day, answer, mode, filter, later, open, stationName, now } = opts;
  const trains =
    mode === "fullscreen" ? filteredTrains(day, filter) : inlineTrains(day, answer, later, now).trains;
  const upcoming = trains.filter((t) => ms(t.departure) >= now);
  const listed = (upcoming.length ? upcoming : trains).slice(0, 12);
  const lines = [
    `The user is viewing the Caltrain timetable UI (${mode}) for ${day.origin.name} → ` +
      `${day.destination.name} on ${longDay(day.serviceDate)} (${day.dayType} schedule` +
      `${day.holiday ? `, ${day.holiday}` : ""}).`,
  ];
  if (mode === "fullscreen" && filter !== "All") lines.push(`Filter: ${filter} trains only.`);
  lines.push(
    `${trains.length} trains shown. ${upcoming.length ? "Upcoming" : "Listed"}: ` +
      listed
        .map(
          (t) =>
            `${t.service} ${t.train} ${clock(t.departure)}→${clock(t.arrival)} (${duration(t.durationMinutes)})`,
        )
        .join("; "),
  );
  const expanded = [...day.trains, ...answer.matches].find((t) => t.key === open);
  if (expanded) {
    lines.push(
      `The user expanded train ${expanded.train} (${expanded.service}, departs ` +
        `${clock(expanded.departure)}), stops: ` +
        expanded.stops.map(([id, time]) => `${stationName(id)} ${time}`).join(", "),
    );
  }
  return lines.join("\n");
}
