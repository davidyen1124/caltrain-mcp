import { describe, expect, it } from "vitest";
import { tablesFromCsv } from "@/lib/gtfs/tables";
import {
  Schedule,
  ScheduleError,
  durationMinutes,
  planStructuredJson,
  planText,
  planWidgetJson,
  stopsBetween,
  type Train,
} from "@/lib/schedule";
import { pacificIso, parseWhen, serviceTime } from "@/lib/time";

const STOPS = `stop_id,stop_name,stop_lat,location_type,parent_station,zone_id
sf,San Francisco Caltrain Station,37.77,1,,1
sf_n,San Francisco Northbound,37.77,0,sf,1
mb,Millbrae,37.60,1,,2
mb_s,Millbrae Southbound,37.60,0,mb,2
pa,Palo Alto Station,37.44,1,,3
pa_s,Palo Alto Southbound,37.44,0,pa,3
sj,San Jose Diridon Station,37.33,1,,4
sj_s,San Jose Diridon Southbound,37.33,0,sj,4
gil,Gilroy Station,37.00,1,,6
gil_s,Gilroy Southbound,37.00,0,gil,6
`;

const ROUTES = `route_id,route_short_name,route_color,route_text_color
L,Local Weekday,dcddde,000000
X,Express,ce202f,ffffff
S,South County,fae4a7,000000
`;

const CALENDAR = `service_id,service_name,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WK,Year Round (Weekday),1,1,1,1,1,0,0,20260101,20261231
WE,Year Round (Weekend),0,0,0,0,0,1,1,20260101,20261231
`;

const CALENDAR_DATES = `service_id,date,holiday_name,exception_type
WK,20261126,Thanksgiving Day,2
WE,20261126,Thanksgiving Day,1
`;

const TRIPS = `route_id,service_id,trip_id,trip_short_name,trip_headsign,direction_id
L,WK,101,101,San Jose,1
X,WK,501,501,San Jose,1
L,WK,191,191,San Jose,1
L,WE,601,601,San Jose,1
S,WK,801,801,Gilroy,1
`;

const STOP_TIMES = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
101,07:00:00,07:00:00,sf_n,1
101,07:20:00,07:21:00,mb_s,2
101,07:50:00,07:50:00,pa_s,3
101,08:20:00,08:20:00,sj_s,4
501,07:30:00,07:30:00,sf_n,1
501,08:05:00,08:05:00,pa_s,2
501,08:30:00,08:30:00,sj_s,3
191,23:40:00,23:40:00,sf_n,1
191,24:05:00,24:05:00,mb_s,2
191,24:35:00,24:35:00,pa_s,3
601,09:00:00,09:00:00,sf_n,1
601,09:50:00,09:50:00,pa_s,2
801,08:40:00,08:40:00,sj_s,1
801,09:30:00,09:30:00,gil_s,2
`;

const data = new Schedule(
  tablesFromCsv({
    stops: STOPS,
    routes: ROUTES,
    calendar: CALENDAR,
    calendarDates: CALENDAR_DATES,
    trips: TRIPS,
    stopTimes: STOP_TIMES,
  }),
);

/** A naive Pacific wall-clock time. */
const at = (text: string) => parseWhen(text);
const numbers = (trains: Train[]) => trains.map((t) => t.number);

describe("time helpers", () => {
  it("parses zones and dates", () => {
    expect(pacificIso(parseWhen("2026-09-28T08:00:00"))).toBe("2026-09-28T08:00:00-07:00");
    // 16:00 UTC is 09:00 PDT
    expect(parseWhen("2026-09-28T16:00:00Z")).toBe(at("2026-09-28T09:00:00"));
    expect(parseWhen("2026-09-28")).toBe(at("2026-09-28T00:00:00"));
    expect(() => parseWhen("tomorrow-ish")).toThrow(ScheduleError);
    expect(() => parseWhen("2026-02-30T08:00:00")).toThrow(ScheduleError);
  });

  it("crosses midnight and DST", () => {
    expect(serviceTime("2026-09-28", 24 * 3600 + 35 * 60)).toBe(at("2026-09-29T00:35:00"));
    // Fall back (Nov 1): 08:00 is PST, noon-minus-12h keeps wall-clock times right.
    expect(pacificIso(serviceTime("2026-11-01", 8 * 3600))).toBe("2026-11-01T08:00:00-08:00");
    // Spring forward (Mar 8): 08:00 is PDT.
    expect(pacificIso(serviceTime("2026-03-08", 8 * 3600))).toBe("2026-03-08T08:00:00-07:00");
  });

  it("resolves naive times on DST change days like Python (fold=0)", () => {
    expect(pacificIso(parseWhen("2026-11-01T05:00:00"))).toBe("2026-11-01T05:00:00-08:00");
    // 01:30 happens twice on Nov 1: the first (PDT) one wins.
    expect(pacificIso(parseWhen("2026-11-01T01:30:00"))).toBe("2026-11-01T01:30:00-07:00");
    // 02:30 never happens on Mar 8: it reads as PST, i.e. 03:30 PDT.
    expect(pacificIso(parseWhen("2026-03-08T02:30:00"))).toBe("2026-03-08T03:30:00-07:00");
  });
});

describe("schedule", () => {
  it("lists trains for a day with details", () => {
    const sf = data.resolveStation("sf");
    const pa = data.resolveStation("Palo Alto");
    const trains = data.trainsForDay(sf, pa, "2026-09-28");
    expect(numbers(trains)).toEqual(["101", "501", "191"]);
    const [local, express, late] = trains;
    expect(local.service).toBe("Local");
    expect(express.service).toBe("Express");
    expect([express.color, express.textColor]).toEqual(["#ce202f", "#ffffff"]);
    expect(local.direction).toBe("Southbound");
    expect(local.stops.map((s) => s.name)).toEqual(["San Francisco", "Millbrae", "Palo Alto"]);
    expect([stopsBetween(local), stopsBetween(express)]).toEqual([1, 0]);
    expect(durationMinutes(local)).toBe(50);
    expect(late.arrival).toBe(at("2026-09-29T00:35:00"));
  });

  it("excludes the wrong direction", () => {
    const pa = data.resolveStation("pa");
    const sf = data.resolveStation("sf");
    expect(data.trainsForDay(pa, sf, "2026-09-28")).toEqual([]);
  });

  it("plans the next trains", () => {
    const plan = data.planTrip("sf", "pa", {
      when: at("2026-09-28T07:10:00"),
      now: at("2026-09-28T07:10:00"),
    });
    expect(plan.mode).toBe("depart_after");
    expect(numbers(plan.matches)).toEqual(["501", "191"]);
    expect(plan.note).toBe("These are the last trains of the service day.");
    expect(numbers(plan.timetable.trains)).toEqual(["101", "501", "191"]);
  });

  it("uses the previous service day after midnight", () => {
    // 00:02 on Tuesday: Monday's 23:40 train reaches Millbrae at 00:05.
    let plan = data.planTrip("sf", "millbrae", { when: at("2026-09-29T00:02:00") });
    // It left SF at 23:40, so the next one is Tuesday morning's 07:00.
    expect(plan.matches[0].departure).toBe(at("2026-09-29T07:00:00"));
    plan = data.planTrip("millbrae", "pa", { when: at("2026-09-29T00:02:00") });
    expect(plan.matches[0].number).toBe("191");
    expect(plan.matches[0].serviceDate).toBe("2026-09-28");
    expect(plan.timetable.day.serviceDate).toBe("2026-09-28");
  });

  it("rolls forward when nothing is left tonight", () => {
    const plan = data.planTrip("sf", "sj", { when: at("2026-09-28T23:59:00") });
    expect(numbers(plan.matches)).toEqual(["101", "501"]);
    expect(plan.matches[0].serviceDate).toBe("2026-09-29");
    expect(plan.note).toMatch(/^No more trains tonight/);
  });

  it("rolls over a weekend without service", () => {
    // South County trains are weekday-only: Saturday rolls to Monday.
    const plan = data.planTrip("sj", "gilroy", { when: at("2026-09-26T10:00:00") });
    expect(numbers(plan.matches)).toEqual(["801"]);
    expect(plan.timetable.day.serviceDate).toBe("2026-09-28");
    expect(plan.note).toContain("on Saturday");
  });

  it("plans arrive-by trips", () => {
    let plan = data.planTrip("sf", "pa", {
      arriveBy: at("2026-09-28T08:00:00"),
      now: at("2026-09-28T06:00:00"),
      limit: 3,
    });
    expect(plan.mode).toBe("arrive_by");
    expect(numbers(plan.matches)).toEqual(["101"]);

    // Trains that already left are not suggested.
    plan = data.planTrip("sf", "pa", {
      arriveBy: at("2026-09-28T08:10:00"),
      now: at("2026-09-28T07:05:00"),
    });
    expect(numbers(plan.matches)).toEqual(["501"]);
  });

  it("explains transfers and missing service", () => {
    let plan = data.planTrip("sf", "gilroy", { when: at("2026-09-28T06:00:00") });
    expect(plan.matches).toEqual([]);
    expect(plan.note).toContain("Change trains at San Jose Diridon");

    plan = data.planTrip("gilroy", "sj", { when: at("2026-09-26T06:00:00") });
    expect(plan.matches).toEqual([]);
    expect(plan.note).toBe("No scheduled trains stop at Gilroy on Saturday, September 26.");
  });

  it("applies holiday calendar exceptions", () => {
    const info = data.dayInfo("2026-11-26");
    expect(info.dayType).toBe("Weekend");
    expect(info.holiday).toBe("Thanksgiving Day");
    const sf = data.resolveStation("sf");
    const pa = data.resolveStation("pa");
    expect(numbers(data.trainsForDay(sf, pa, "2026-11-26"))).toEqual(["601"]);
  });

  it("resolves stations by name, abbreviation and id", () => {
    expect(data.resolveStation("sj").name).toBe("San Jose Diridon");
    expect(data.resolveStation("gil").name).toBe("Gilroy"); // station id
    expect(() => data.resolveStation("Narnia", "Origin")).toThrow(/not found/);
    expect(() => data.planTrip("sf", "San Francisco")).toThrow(/same station/);
  });

  it("orders stations north to south", () => {
    expect(data.stationsInLineOrder().map((s) => s.name)).toEqual([
      "San Francisco",
      "Millbrae",
      "Palo Alto",
      "San Jose Diridon",
      "Gilroy",
    ]);
  });

  it("serialises plans for the model and the UI", () => {
    const plan = data.planTrip("sf", "pa", {
      when: at("2026-09-28T06:00:00"),
      now: at("2026-09-28T06:00:00"),
    });
    const structured = planStructuredJson(plan);
    expect(structured.origin).toEqual({ id: "sf", name: "San Francisco" });
    expect(structured.trains[0]).toEqual({
      train: "101",
      service: "Local",
      direction: "Southbound",
      departure: "2026-09-28T07:00:00-07:00",
      arrival: "2026-09-28T07:50:00-07:00",
      departureTime: "7:00 AM",
      arrivalTime: "7:50 AM",
      durationMinutes: 50,
      stopsBetween: 1,
    });
    expect(structured.trains[0]).not.toHaveProperty("stops"); // the model gets the compact form

    const widget = planWidgetJson(plan);
    expect(widget.matches?.[0].key).toBe("2026-09-28/101");
    expect(widget.timetable.trains[2].stops.at(-1)).toEqual(["pa", "12:35 AM"]);

    expect(planText(plan)).toContain(
      "Train 101 (Local): 7:00 AM → 7:50 AM, 50 min, 1 stops in between",
    );
  });
});

describe("calendar and station matching (from the old gtfs tests)", () => {
  const cal = new Schedule(
    tablesFromCsv({
      stops: `stop_id,stop_name,location_type,parent_station
100,San Francisco Caltrain,1,
101,San Francisco Caltrain Platform 1,0,100
110,South San Francisco Caltrain,1,
200,Palo Alto,1,
201,Palo Alto Platform 1,0,200
`,
      calendar: `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WEEKDAY,1,1,1,1,1,0,0,20250101,20251231
`,
      calendarDates: `service_id,date,exception_type
WEEKDAY,20250102,2
SPECIAL,20250102,1
SATURDAY,20250104,1
`,
    }),
  );

  it("applies calendar_dates exceptions", () => {
    expect(cal.activeServiceIds("2025-01-01")).toEqual(["WEEKDAY"]);
    expect(cal.activeServiceIds("2025-01-04")).toEqual(["SATURDAY"]);
    expect(cal.activeServiceIds("2025-01-02")).toEqual(["SPECIAL"]);
    expect(cal.activeServiceIds("2025-01-05")).toEqual([]);
  });

  it("prefers exact, then prefix, then substring matches", () => {
    expect(cal.findStation("sf")).toBe("100");
    expect(cal.findStation("Palo Alto")).toBe("200");
    expect(cal.findStation("San Francisco")).toBe("100"); // not South San Francisco
    expect(cal.findStation("San")).toBe("100");
    expect(cal.findStation("South San")).toBe("110");
    expect(cal.findStation("ssf")).toBe("110");
    expect(() => cal.findStation("xyz123")).toThrow("Station not found: xyz123");
  });
});
