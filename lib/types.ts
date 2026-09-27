// JSON shapes produced by lib/schedule.ts and consumed by the timetable widget.

export interface StationRef {
  id: string;
  name: string;
}

/** [station id, "6:54 PM"] */
export type StopTime = [string, string];

export interface TrainSummary {
  train: string;
  service: string;
  direction: string;
  departure: string;
  arrival: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stopsBetween: number;
}

export interface TrainDetail extends TrainSummary {
  key: string;
  tripId: string;
  serviceDate: string;
  headsign: string;
  color: string;
  textColor: string;
  stops: StopTime[];
}

export interface DayTimetable {
  origin: StationRef;
  destination: StationRef;
  serviceDate: string;
  dayType: string;
  holiday: string | null;
  now: string;
  trains: TrainDetail[];
}

/** `_meta["caltrain/timetable"]` on next_trains, structuredContent on get_timetable. */
export interface WidgetPayload {
  matches?: TrainDetail[];
  timetable: DayTimetable;
  stations: StationRef[];
}

/** structuredContent of next_trains (what the model sees). */
export interface PlanSummary {
  origin: StationRef;
  destination: StationRef;
  serviceDate: string;
  dayType: string;
  holiday: string | null;
  query: { mode: "depart_after" | "arrive_by"; time: string };
  trains: TrainSummary[];
  trainsThatDay: number;
  note: string | null;
}
