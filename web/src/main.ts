/**
 * Caltrain timetable MCP App.
 *
 * Inline: the few trains that answer the rider's question, with "Show more"
 * to reveal later trains and a button to open the full timetable.
 * Fullscreen: the whole day with station/date pickers and service filters,
 * while the host's composer stays available so the user can keep chatting.
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import "./styles.css";
import {
  addDays,
  clock,
  clockParts,
  countdown,
  duration,
  esc,
  longDay,
  pacificToday,
  plural,
  shortDay,
} from "./format";
import type {
  DayTimetable,
  PlanSummary,
  StationRef,
  TrainDetail,
  WidgetPayload,
} from "./types";

type DisplayMode = "inline" | "fullscreen" | "pip";

interface State {
  phase: "waiting" | "ready" | "error";
  error: string | null;
  input: { origin?: string; destination?: string } | null;
  plan: PlanSummary | null;
  stations: StationRef[];
  day: DayTimetable | null;
  matches: TrainDetail[];
  later: number;
  open: string | null;
  filter: string;
  loading: boolean;
  toast: string | null;
  mode: DisplayMode;
  canFullscreen: boolean;
  canInline: boolean;
}

const INLINE_STEP = 5;
const META_KEY = "caltrain/timetable";

const root = document.getElementById("root") as HTMLElement;
const state: State = {
  phase: "waiting",
  error: null,
  input: null,
  plan: null,
  stations: [],
  day: null,
  matches: [],
  later: 0,
  open: null,
  filter: "All",
  loading: false,
  toast: null,
  mode: "inline",
  canFullscreen: false,
  canInline: true,
};
let scrollToAnchor = false;
let dayRequest = 0;

const app = new App(
  { name: "Caltrain timetable", version: "1.0.0" },
  { availableDisplayModes: ["inline", "fullscreen"] },
);

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPayload(result: {
  structuredContent?: unknown;
  _meta?: unknown;
}): WidgetPayload | null {
  const meta = isRecord(result._meta) ? result._meta[META_KEY] : undefined;
  if (isRecord(meta) && isRecord(meta.timetable)) return meta as unknown as WidgetPayload;
  const sc = result.structuredContent;
  if (isRecord(sc) && isRecord(sc.timetable)) return sc as unknown as WidgetPayload;
  return null;
}

function textOf(result: { content?: unknown }): string {
  const content = Array.isArray(result.content) ? result.content : [];
  return content
    .map((block) => (isRecord(block) && block.type === "text" ? String(block.text) : ""))
    .filter(Boolean)
    .join("\n");
}

function nowMs(): number {
  return Date.now();
}

function isToday(day: DayTimetable): boolean {
  return day.serviceDate === pacificToday();
}

function isPlanDay(day: DayTimetable): boolean {
  const plan = state.plan;
  return (
    !!plan &&
    plan.serviceDate === day.serviceDate &&
    plan.origin.id === day.origin.id &&
    plan.destination.id === day.destination.id
  );
}

function matchKeys(): Set<string> {
  return new Set(state.matches.map((t) => t.key));
}

/** Index range of the trains the inline card starts with. */
function anchorRange(day: DayTimetable): [number, number] {
  const keys = matchKeys();
  const idx = day.trains
    .map((t, i) => (keys.has(t.key) ? i : -1))
    .filter((i) => i >= 0);
  if (idx.length) return [idx[0], idx[idx.length - 1] + 1];
  const upcoming = day.trains.findIndex((t) => new Date(t.departure).getTime() >= nowMs());
  const start = upcoming >= 0 ? upcoming : isToday(day) ? day.trains.length : 0;
  return [start, Math.min(start + 3, day.trains.length)];
}

function inlineTrains(day: DayTimetable): { trains: TrainDetail[]; laterLeft: number } {
  const [start, end] = anchorRange(day);
  const stop = Math.min(day.trains.length, end + state.later);
  const shown = day.trains.slice(start, stop);
  // Matches from a neighbouring service day (e.g. an after-midnight train),
  // only while the user is still looking at the day the model answered for.
  const seen = new Set(shown.map((t) => t.key));
  const extra = isPlanDay(day) ? state.matches.filter((t) => !seen.has(t.key)) : [];
  const trains = [...shown, ...extra].sort(
    (a, b) => new Date(a.departure).getTime() - new Date(b.departure).getTime(),
  );
  return { trains, laterLeft: day.trains.length - stop };
}

function filteredTrains(day: DayTimetable): TrainDetail[] {
  if (state.filter === "All") return day.trains;
  return day.trains.filter((t) => t.service === state.filter);
}

function serviceCounts(day: DayTimetable): [string, number][] {
  const order = ["Express", "Limited", "Local", "South County"];
  const counts = new Map<string, number>();
  for (const t of day.trains) counts.set(t.service, (counts.get(t.service) ?? 0) + 1);
  const rank = (service: string) => {
    const i = order.indexOf(service);
    return i < 0 ? order.length : i;
  };
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

const SOON_MS = 12 * 3600 * 1000;

/** The first train still to leave, if it leaves within the next 12 hours. */
function nextTrainKey(trains: TrainDetail[]): string | null {
  const now = nowMs();
  const next = trains.find((t) => new Date(t.departure).getTime() >= now);
  return next && new Date(next.departure).getTime() - now < SOON_MS ? next.key : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const ICONS = {
  expand:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6"/></svg>',
  collapse:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 9h5M11 9V4M9 11H4M9 11v5M11 9l6-6M9 11l-6 6"/></svg>',
  swap: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7h12l-3-3M16 13H4l3 3"/></svg>',
  prev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4l6 6-6 6"/></svg>',
  chevron: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5l5 5-5 5"/></svg>',
};

function timeHtml(iso: string): string {
  const [time, period] = clockParts(iso);
  return `<b>${esc(time)}</b><small>${esc(period)}</small>`;
}

function statusFor(train: TrainDetail, nextKey: string | null): { cls: string; label: string } {
  const now = nowMs();
  const dep = new Date(train.departure).getTime();
  if (dep < now) {
    const arr = new Date(train.arrival).getTime();
    return arr >= now
      ? { cls: "is-past", label: "En route" }
      : { cls: "is-past", label: "Departed" };
  }
  const soon = dep - now < SOON_MS ? countdown(train.departure, now) : null;
  if (train.key === nextKey) return { cls: "is-next", label: soon ?? "Next" };
  return { cls: "", label: soon ?? "" };
}

function serviceChip(train: TrainDetail): string {
  return `<span class="svc" style="--svc-bg:${esc(train.color)};--svc-fg:${esc(
    train.textColor,
  )}">${esc(train.service)}</span>`;
}

function stationName(id: string): string {
  return state.stations.find((s) => s.id === id)?.name ?? id;
}

function stopsHtml(train: TrainDetail): string {
  const last = train.stops.length - 1;
  const items = train.stops
    .map(
      ([id, time], i) => `<li class="${i === 0 || i === last ? "end" : ""}">
        <time>${esc(time)}</time><span>${esc(stationName(id))}</span></li>`,
    )
    .join("");
  const head = train.headsign ? ` · to ${esc(train.headsign)}` : "";
  return `<div class="stops" id="stops-${esc(train.key)}">
    <p class="stops-head">${esc(train.direction || "Train")} ${esc(train.train)}${head}</p>
    <ol>${items}</ol></div>`;
}

/** Highlight the suggested trains only when other trains are listed too. */
function highlightKeys(trains: TrainDetail[]): Set<string> {
  // Same trip ids serve other station pairs, so only highlight the exact
  // origin/destination/day the model answered for.
  if (!state.day || !isPlanDay(state.day)) return new Set();
  const keys = matchKeys();
  return trains.some((t) => !keys.has(t.key)) ? keys : new Set();
}

function trainRow(train: TrainDetail, keys: Set<string>, nextKey: string | null): string {
  const status = statusFor(train, nextKey);
  const open = state.open === train.key;
  const classes = [
    "train",
    status.cls,
    keys.has(train.key) ? "is-match" : "",
    open ? "is-open" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<li class="${classes}" data-key="${esc(train.key)}">
    <button type="button" class="train-main" data-action="toggle" data-key="${esc(train.key)}"
      aria-expanded="${open}" aria-label="Train ${esc(train.train)}, ${esc(train.service)}, departs ${esc(
        clock(train.departure),
      )}, arrives ${esc(clock(train.arrival))}">
      <span class="c-dep">${timeHtml(train.departure)}</span>
      <span class="c-line" aria-hidden="true"><i></i><em>${esc(duration(train.durationMinutes))}</em><i></i></span>
      <span class="c-arr">${timeHtml(train.arrival)}</span>
      <span class="c-dur">${esc(duration(train.durationMinutes))}</span>
      <span class="c-info">${serviceChip(train)}<span class="num">${esc(train.train)}</span></span>
      <span class="c-when" data-when>${esc(status.label)}</span>
      <span class="c-chev">${ICONS.chevron}</span>
    </button>
    ${open ? stopsHtml(train) : ""}
  </li>`;
}

function subtitle(day: DayTimetable): string {
  const parts: string[] = [];
  const plan = state.plan;
  if (plan && isPlanDay(day) && state.matches.length) {
    const t = plan.query.time;
    if (plan.query.mode === "arrive_by") parts.push(`Arrive by ${clock(t)}`);
    else if (Math.abs(new Date(t).getTime() - nowMs()) > 5 * 60000)
      parts.push(`Leaving after ${clock(t)}`);
  }
  parts.push(isToday(day) ? `Today, ${shortDay(day.serviceDate)}` : shortDay(day.serviceDate));
  parts.push(`${day.dayType} schedule`);
  return parts.map(esc).join(" · ");
}

function holidayBadge(day: DayTimetable): string {
  return day.holiday ? `<span class="badge">${esc(day.holiday)}</span>` : "";
}

function header(day: DayTimetable): string {
  const expand =
    state.canFullscreen && state.mode !== "fullscreen"
      ? `<button type="button" class="icon-btn" data-action="fullscreen" title="Full timetable" aria-label="Open full timetable">${ICONS.expand}</button>`
      : "";
  return `<header class="head">
    <div class="head-text">
      <h1>${esc(day.origin.name)} <span class="arrow">→</span> ${esc(day.destination.name)}</h1>
      <p class="sub">${subtitle(day)} ${holidayBadge(day)}</p>
    </div>
    ${expand}
  </header>`;
}

function noteHtml(): string {
  const note = state.plan?.note;
  if (!note || !state.day || !isPlanDay(state.day)) return "";
  return `<p class="note">${esc(note)}</p>`;
}

function emptyHtml(day: DayTimetable): string {
  if (isPlanDay(day) && state.plan?.note) return ""; // the note already explains it
  return `<div class="empty"><p>No scheduled trains from ${esc(day.origin.name)} to ${esc(
    day.destination.name,
  )} on ${esc(longDay(day.serviceDate))}.</p></div>`;
}

function renderInline(day: DayTimetable): string {
  const { trains, laterLeft } = inlineTrains(day);
  const keys = highlightKeys(trains);
  const nextKey = nextTrainKey(trains);
  const rows = trains.map((t) => trainRow(t, keys, nextKey)).join("");
  const more =
    laterLeft > 0
      ? `<button type="button" class="btn" data-action="more">Show ${Math.min(
          INLINE_STEP,
          laterLeft,
        )} more <span class="muted">· ${plural(laterLeft, "later train")}</span></button>`
      : "";
  const full = state.canFullscreen
    ? `<button type="button" class="btn btn-ghost" data-action="fullscreen">Full day timetable</button>`
    : "";
  const footer =
    more || full ? `<footer class="foot">${more}${full}</footer>` : "";
  return `${header(day)}${noteHtml()}
    ${trains.length ? `<ol class="trains">${rows}</ol>` : emptyHtml(day)}
    ${footer}`;
}

function stationOptions(selected: string): string {
  return state.stations
    .map(
      (s) =>
        `<option value="${esc(s.id)}"${s.id === selected ? " selected" : ""}>${esc(s.name)}</option>`,
    )
    .join("");
}

function summaryLine(trains: TrainDetail[]): string {
  if (!trains.length) return "";
  const fastest = trains.reduce((a, b) => (b.durationMinutes < a.durationMinutes ? b : a));
  return `${plural(trains.length, "train")} · ${clock(trains[0].departure)} – ${clock(
    trains[trains.length - 1].departure,
  )} · fastest ${duration(fastest.durationMinutes)} (${fastest.service} ${fastest.train})`;
}

function renderFullscreen(day: DayTimetable): string {
  const trains = filteredTrains(day);
  const keys = highlightKeys(trains);
  const nextKey = nextTrainKey(trains);
  const counts = serviceCounts(day);
  const chips = [["All", day.trains.length] as [string, number], ...counts]
    .map(
      ([name, n]) =>
        `<button type="button" class="chip${state.filter === name ? " on" : ""}" data-action="filter" data-filter="${esc(
          name,
        )}" aria-pressed="${state.filter === name}">${esc(name)} <span>${n}</span></button>`,
    )
    .join("");
  const stationsUi = state.stations.length
    ? `<div class="pick">
        <label class="sr" for="origin">From</label>
        <select id="origin" data-action="origin">${stationOptions(day.origin.id)}</select>
        <button type="button" class="icon-btn" data-action="swap" title="Swap direction" aria-label="Swap direction">${ICONS.swap}</button>
        <label class="sr" for="destination">To</label>
        <select id="destination" data-action="destination">${stationOptions(day.destination.id)}</select>
      </div>`
    : `<h1 class="fs-title">${esc(day.origin.name)} → ${esc(day.destination.name)}
        <button type="button" class="icon-btn" data-action="swap" title="Swap direction" aria-label="Swap direction">${ICONS.swap}</button></h1>`;
  // "Today" keeps its slot even when hidden so the arrows never move.
  const today = `<button type="button" class="btn btn-small${isToday(day) ? " is-hidden" : ""}" data-action="today"${
    isToday(day) ? ' tabindex="-1" aria-hidden="true"' : ""
  }>Today</button>`;
  const exit = state.canInline
    ? `<button type="button" class="icon-btn" data-action="inline" title="Exit full screen" aria-label="Exit full screen">${ICONS.collapse}</button>`
    : "";
  const rows = trains.map((t) => trainRow(t, keys, nextKey)).join("");
  const legend = trains.some((t) => keys.has(t.key))
    ? `<span class="legend"><i></i>Suggested in chat</span>`
    : "";
  return `<div class="fs">
    <div class="toolbar">
      <div class="toolbar-row">
        ${stationsUi}
        <div class="datenav">
          ${today}
          <button type="button" class="icon-btn" data-action="day" data-delta="-1" aria-label="Previous day">${ICONS.prev}</button>
          <span class="date" aria-live="polite">${esc(isToday(day) ? `Today, ${shortDay(day.serviceDate)}` : shortDay(day.serviceDate))}</span>
          <button type="button" class="icon-btn" data-action="day" data-delta="1" aria-label="Next day">${ICONS.next}</button>
        </div>
        ${exit}
      </div>
      <div class="toolbar-row small">
        <span class="muted">${esc(day.dayType)} schedule ${holidayBadge(day)}</span>
        <span class="muted">${esc(summaryLine(trains))}</span>
        ${legend}
      </div>
      <div class="chips" role="group" aria-label="Service type">${chips}</div>
    </div>
    ${noteHtml()}
    <div class="table${state.loading ? " is-loading" : ""}" id="table">
      <div class="thead" aria-hidden="true">
        <span>Departs</span><span></span><span>Arrives</span><span>Duration</span><span>Train</span><span>${nextKey || trains.some((t) => new Date(t.departure).getTime() < nowMs()) ? "Status" : ""}</span><span></span>
      </div>
      ${trains.length ? `<ol class="trains">${rows}</ol>` : emptyHtml(day)}
    </div>
  </div>`;
}

function renderWaiting(): string {
  const o = state.input?.origin;
  const d = state.input?.destination;
  const title = o && d ? `${esc(o)} <span class="arrow">→</span> ${esc(d)}` : "Caltrain timetable";
  const skeleton = Array.from({ length: 3 }, () => '<li class="skeleton"><span></span><span></span></li>').join("");
  return `<header class="head">
      <div class="head-text"><h1>${title}</h1><p class="sub">Checking the timetable…</p></div>
    </header><ol class="trains">${skeleton}</ol>`;
}

function renderError(): string {
  return `<header class="head">
      <div class="head-text"><h1>Caltrain timetable</h1><p class="sub">Couldn't load trains</p></div>
    </header><p class="note error">${esc(state.error ?? "Something went wrong.")}</p>`;
}

function render(): void {
  const table = document.getElementById("table");
  const prevScroll = table?.scrollTop ?? 0;
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focus;

  document.documentElement.dataset.mode = state.mode;
  let html: string;
  if (state.phase === "error") html = renderError();
  else if (state.phase === "waiting" || !state.day) html = renderWaiting();
  else html = state.mode === "fullscreen" ? renderFullscreen(state.day) : renderInline(state.day);
  if (state.toast) html += `<div class="toast" role="status">${esc(state.toast)}</div>`;
  // Padding lives on this inner wrapper, not on #root: ChatGPT sizes the
  // frame from #root's content box, which leaves out #root's own padding.
  root.innerHTML = `<div class="app">${html}</div>`;

  root.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.dataset.focus = `${el.dataset.action}:${el.dataset.key ?? el.dataset.filter ?? el.dataset.delta ?? ""}`;
  });
  if (focusKey) root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();

  const newTable = document.getElementById("table");
  if (newTable) {
    if (scrollToAnchor) {
      scrollToAnchor = false;
      // The host may still be resizing the frame (e.g. inline → fullscreen);
      // keep re-anchoring on resize until it settles or the user scrolls.
      anchorUntil = Date.now() + 2000;
      anchorTable();
    } else {
      newTable.scrollTop = prevScroll;
    }
  }
}

let anchorUntil = 0;

/** Scroll the fullscreen table to the suggested (or next) train. */
function anchorTable(): void {
  const table = document.getElementById("table");
  if (!table || Date.now() > anchorUntil) return;
  const target =
    table.querySelector<HTMLElement>(".train.is-match") ??
    table.querySelector<HTMLElement>(".train.is-next");
  // Rows are offset from .table (position: relative); keep the sticky header
  // and one earlier train visible above the target for context.
  const thead = table.querySelector<HTMLElement>(".thead")?.offsetHeight ?? 0;
  const before = (target?.previousElementSibling as HTMLElement | null)?.offsetHeight ?? 0;
  table.scrollTop = target ? Math.max(0, target.offsetTop - thead - before - 6) : 0;
}

window.addEventListener("resize", anchorTable);
for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) {
  window.addEventListener(type, () => (anchorUntil = 0), { passive: true });
}

/** Refresh countdowns / departed state without rebuilding the DOM. */
function tick(): void {
  if (state.phase !== "ready" || !state.day) return;
  const all = new Map<string, TrainDetail>();
  for (const t of [...state.day.trains, ...state.matches]) all.set(t.key, t);
  const rows = [...root.querySelectorAll<HTMLElement>("li.train")];
  const visible = rows.map((r) => all.get(r.dataset.key ?? "")).filter(Boolean) as TrainDetail[];
  const nextKey = nextTrainKey(visible);
  for (const row of rows) {
    const train = all.get(row.dataset.key ?? "");
    if (!train) continue;
    const status = statusFor(train, nextKey);
    row.classList.toggle("is-past", status.cls === "is-past");
    row.classList.toggle("is-next", status.cls === "is-next");
    const when = row.querySelector("[data-when]");
    if (when && when.textContent !== status.label) when.textContent = status.label;
  }
}

// ---------------------------------------------------------------------------
// Model context: tell the model what the user is looking at
// ---------------------------------------------------------------------------

let contextTimer: number | undefined;
let lastContext = "";

function describeView(): string | null {
  const day = state.day;
  if (!day) return null;
  const trains = state.mode === "fullscreen" ? filteredTrains(day) : inlineTrains(day).trains;
  const now = nowMs();
  const upcoming = trains.filter((t) => new Date(t.departure).getTime() >= now);
  const listed = (upcoming.length ? upcoming : trains).slice(0, 12);
  const lines = [
    `The user is viewing the Caltrain timetable UI (${state.mode}) for ${day.origin.name} → ${day.destination.name} on ${longDay(day.serviceDate)} (${day.dayType} schedule${day.holiday ? `, ${day.holiday}` : ""}).`,
  ];
  if (state.mode === "fullscreen" && state.filter !== "All")
    lines.push(`Filter: ${state.filter} trains only.`);
  lines.push(
    `${trains.length} trains shown. ${upcoming.length ? "Upcoming" : "Listed"}: ` +
      listed
        .map((t) => `${t.service} ${t.train} ${clock(t.departure)}→${clock(t.arrival)} (${duration(t.durationMinutes)})`)
        .join("; "),
  );
  const open = [...day.trains, ...state.matches].find((t) => t.key === state.open);
  if (open)
    lines.push(
      `The user expanded train ${open.train} (${open.service}, departs ${clock(open.departure)}), stops: ` +
        open.stops.map(([id, time]) => `${stationName(id)} ${time}`).join(", "),
    );
  return lines.join("\n");
}

function scheduleContextUpdate(): void {
  window.clearTimeout(contextTimer);
  contextTimer = window.setTimeout(() => {
    const text = describeView();
    if (!text || text === lastContext) return;
    lastContext = text;
    app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {
      /* host may not support it */
    });
  }, 600);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function showToast(message: string): void {
  state.toast = message;
  render();
  window.setTimeout(() => {
    if (state.toast === message) {
      state.toast = null;
      render();
    }
  }, 3500);
}

/** Where the view is headed (the in-flight request), or where it is. */
let target: { origin: string; destination: string; date: string } | null = null;

function currentTarget(day: DayTimetable) {
  return target ?? { origin: day.origin.id, destination: day.destination.id, date: day.serviceDate };
}

async function loadDay(origin: string, destination: string, date: string): Promise<void> {
  const request = ++dayRequest;
  target = { origin, destination, date };
  state.loading = true;
  render();
  try {
    const result = await app.callServerTool({
      name: "get_timetable",
      arguments: { origin, destination, date },
    });
    if (request !== dayRequest) return;
    const payload = readPayload(result);
    if (result.isError || !payload) {
      showToast(textOf(result) || "Couldn't load that timetable.");
      return;
    }
    state.day = payload.timetable;
    if (payload.stations?.length) state.stations = payload.stations;
    state.open = null;
    state.later = 0;
    if (state.filter !== "All" && !payload.timetable.trains.some((t) => t.service === state.filter))
      state.filter = "All";
    scrollToAnchor = true;
  } catch (err) {
    if (request === dayRequest) showToast(`Couldn't load that timetable (${String(err)}).`);
  } finally {
    if (request === dayRequest) {
      target = null;
      state.loading = false;
      render();
      scheduleContextUpdate();
    }
  }
}

async function setMode(mode: DisplayMode): Promise<void> {
  try {
    const result = await app.requestDisplayMode({ mode });
    state.mode = (result?.mode as DisplayMode) ?? state.mode;
  } catch {
    return;
  }
  scrollToAnchor = state.mode === "fullscreen";
  render();
  scheduleContextUpdate();
}

root.addEventListener("click", (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el || !state.day) return;
  const t = currentTarget(state.day);
  switch (el.dataset.action) {
    case "toggle":
      state.open = state.open === el.dataset.key ? null : (el.dataset.key ?? null);
      render();
      scheduleContextUpdate();
      break;
    case "more":
      state.later += INLINE_STEP;
      render();
      scheduleContextUpdate();
      break;
    case "fullscreen":
      void setMode("fullscreen");
      break;
    case "inline":
      void setMode("inline");
      break;
    case "filter":
      state.filter = el.dataset.filter ?? "All";
      scrollToAnchor = true;
      render();
      scheduleContextUpdate();
      break;
    case "swap":
      void loadDay(t.destination, t.origin, t.date);
      break;
    case "day":
      void loadDay(t.origin, t.destination, addDays(t.date, Number(el.dataset.delta)));
      break;
    case "today":
      void loadDay(t.origin, t.destination, pacificToday());
      break;
  }
});

root.addEventListener("change", (event) => {
  const el = event.target as HTMLSelectElement;
  if (!state.day || (el.dataset.action !== "origin" && el.dataset.action !== "destination")) return;
  const t = currentTarget(state.day);
  let { origin, destination } = t;
  if (el.dataset.action === "origin") origin = el.value;
  else destination = el.value;
  if (origin === destination) {
    // Picking the other end's station flips the direction.
    [origin, destination] = [t.destination, t.origin];
  }
  void loadDay(origin, destination, t.date);
});

// ---------------------------------------------------------------------------
// Host wiring (handlers must be registered before connect())
// ---------------------------------------------------------------------------

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.displayMode) state.mode = ctx.displayMode as DisplayMode;
  if (ctx.availableDisplayModes) {
    state.canFullscreen = ctx.availableDisplayModes.includes("fullscreen");
    state.canInline = ctx.availableDisplayModes.includes("inline");
  }
  const insets = ctx.safeAreaInsets;
  if (insets) {
    const s = document.documentElement.style;
    s.setProperty("--safe-top", `${insets.top}px`);
    s.setProperty("--safe-right", `${insets.right}px`);
    s.setProperty("--safe-bottom", `${insets.bottom}px`);
    s.setProperty("--safe-left", `${insets.left}px`);
  }
  const dims = ctx.containerDimensions as { height?: number } | undefined;
  if (dims && typeof dims.height === "number")
    document.documentElement.style.setProperty("--container-height", `${dims.height}px`);
}

app.ontoolinput = (params) => {
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  state.input = {
    origin: typeof args.origin === "string" ? args.origin : undefined,
    destination: typeof args.destination === "string" ? args.destination : undefined,
  };
  if (state.phase === "waiting") render();
};

app.ontoolresult = (result) => {
  if (result.isError) {
    state.phase = "error";
    state.error = textOf(result);
    render();
    return;
  }
  const payload = readPayload(result);
  const sc = result.structuredContent;
  state.plan = isRecord(sc) && Array.isArray(sc.trains) ? (sc as unknown as PlanSummary) : null;
  if (!payload) {
    // Host dropped `_meta`: fetch the day ourselves.
    const plan = state.plan;
    if (plan) {
      state.phase = "ready";
      void loadDay(plan.origin.id, plan.destination.id, plan.serviceDate);
    } else {
      state.phase = "error";
      state.error = textOf(result) || "No timetable data received.";
      render();
    }
    return;
  }
  state.phase = "ready";
  state.day = payload.timetable;
  state.stations = payload.stations ?? [];
  state.matches = payload.matches ?? [];
  state.later = 0;
  state.open = null;
  state.filter = "All";
  scrollToAnchor = true;
  render();
};

app.ontoolcancelled = () => {
  if (state.phase === "waiting") {
    state.phase = "error";
    state.error = "The request was cancelled.";
    render();
  }
};

app.onhostcontextchanged = (ctx) => {
  const before = state.mode;
  applyHostContext(ctx);
  if (state.mode !== before) scrollToAnchor = state.mode === "fullscreen";
  render();
  if (state.mode !== before) scheduleContextUpdate();
};

app.onteardown = async () => ({});
app.onerror = (err) => console.error("[caltrain]", err);

render();
app
  .connect()
  .then(() => {
    const ctx = app.getHostContext();
    if (ctx) applyHostContext(ctx);
    render();
  })
  .catch((err) => console.error("[caltrain] connect failed", err));

window.setInterval(tick, 20_000);
