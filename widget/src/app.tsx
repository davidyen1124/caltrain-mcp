/**
 * Caltrain timetable MCP App.
 *
 * Inline: the few trains that answer the rider's question, with "Show more"
 * to reveal later trains and a button to open the full timetable.
 * Fullscreen: the whole day with station/date pickers and service filters,
 * while the host's composer stays available so the user can keep chatting.
 */
import {
  useApp,
  useHostStyles,
  type App as McpApp,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DayTimetable, PlanSummary, StationRef, WidgetPayload } from "@/lib/types";
import { FullscreenView, type Target } from "./components/fullscreen-view";
import { InlineView, Title } from "./components/inline-view";
import { Note } from "./components/parts";
import { addDays, pacificToday } from "./lib/format";
import { INLINE_STEP, describeView, isPlanDay, type Answer, type DisplayMode } from "./lib/view";

const META_KEY = "caltrain/timetable";

type ToolResult = { structuredContent?: unknown; _meta?: unknown; content?: unknown; isError?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPayload(result: ToolResult): WidgetPayload | null {
  const meta = isRecord(result._meta) ? result._meta[META_KEY] : undefined;
  if (isRecord(meta) && isRecord(meta.timetable)) return meta as unknown as WidgetPayload;
  const sc = result.structuredContent;
  if (isRecord(sc) && isRecord(sc.timetable)) return sc as unknown as WidgetPayload;
  return null;
}

function textOf(result: ToolResult): string {
  const content = Array.isArray(result.content) ? result.content : [];
  return content
    .map((block) => (isRecord(block) && block.type === "text" ? String(block.text) : ""))
    .filter(Boolean)
    .join("\n");
}

type Phase =
  | { kind: "waiting"; origin?: string; destination?: string }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const [answer, setAnswer] = useState<Answer>({ plan: null, matches: [] });
  const [stations, setStations] = useState<StationRef[]>([]);
  const [day, setDay] = useState<DayTimetable | null>(null);
  const [later, setLater] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [ctx, setCtx] = useState<McpUiHostContext>({});
  const [mode, setModeState] = useState<DisplayMode>("inline");
  const [now, setNow] = useState(() => Date.now());

  const appRef = useRef<McpApp | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollToAnchor = useRef(false);
  const dayRequest = useRef(0);
  /** Where the view is headed (the in-flight request), or where it is. */
  const target = useRef<Target | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3500);
  }, []);

  const loadDay = useCallback(
    async (origin: string, destination: string, date: string) => {
      const app = appRef.current;
      if (!app) return;
      const request = ++dayRequest.current;
      target.current = { origin, destination, date };
      setLoading(true);
      try {
        const result = (await app.callServerTool({
          name: "get_timetable",
          arguments: { origin, destination, date },
        })) as ToolResult;
        if (request !== dayRequest.current) return;
        const payload = readPayload(result);
        if (result.isError || !payload) {
          showToast(textOf(result) || "Couldn't load that timetable.");
          return;
        }
        setDay(payload.timetable);
        if (payload.stations?.length) setStations(payload.stations);
        setOpen(null);
        setLater(0);
        setFilter((f) =>
          f !== "All" && !payload.timetable.trains.some((t) => t.service === f) ? "All" : f,
        );
        setPhase({ kind: "ready" });
        scrollToAnchor.current = true;
      } catch (err) {
        if (request === dayRequest.current) showToast(`Couldn't load that timetable (${String(err)}).`);
      } finally {
        if (request === dayRequest.current) {
          target.current = null;
          setLoading(false);
        }
      }
    },
    [showToast],
  );

  const { app, error } = useApp({
    appInfo: { name: "Caltrain timetable", version: "1.0.0" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (created) => {
      appRef.current = created;
      created.ontoolinput = (params) => {
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        setPhase((p) =>
          p.kind === "waiting"
            ? {
                kind: "waiting",
                origin: typeof args.origin === "string" ? args.origin : undefined,
                destination: typeof args.destination === "string" ? args.destination : undefined,
              }
            : p,
        );
      };
      created.ontoolresult = (result) => {
        const r = result as ToolResult;
        if (r.isError) {
          setPhase({ kind: "error", message: textOf(r) || "Something went wrong." });
          return;
        }
        const sc = r.structuredContent;
        const plan = isRecord(sc) && Array.isArray(sc.trains) ? (sc as unknown as PlanSummary) : null;
        const payload = readPayload(r);
        if (!payload) {
          // Host dropped `_meta`: fetch the day ourselves.
          setAnswer({ plan, matches: [] });
          if (plan) void loadDay(plan.origin.id, plan.destination.id, plan.serviceDate);
          else setPhase({ kind: "error", message: textOf(r) || "No timetable data received." });
          return;
        }
        setAnswer({ plan, matches: payload.matches ?? [] });
        setDay(payload.timetable);
        setStations(payload.stations ?? []);
        setLater(0);
        setOpen(null);
        setFilter("All");
        setPhase({ kind: "ready" });
        scrollToAnchor.current = true;
      };
      created.ontoolcancelled = () => {
        setPhase((p) => (p.kind === "waiting" ? { kind: "error", message: "The request was cancelled." } : p));
      };
      created.onteardown = async () => ({});
      created.addEventListener("hostcontextchanged", (changed) =>
        setCtx((prev) => ({ ...prev, ...changed })),
      );
    },
  });

  useHostStyles(app, app?.getHostContext());
  useEffect(() => {
    if (app) setCtx((prev) => ({ ...app.getHostContext(), ...prev }));
  }, [app]);

  // Host context → display mode, safe areas, fullscreen height.
  const canFullscreen = !!ctx.availableDisplayModes?.includes("fullscreen");
  const canInline = ctx.availableDisplayModes ? ctx.availableDisplayModes.includes("inline") : true;
  useEffect(() => {
    if (!ctx.displayMode) return;
    setModeState((prev) => {
      if (prev !== ctx.displayMode && ctx.displayMode === "fullscreen") scrollToAnchor.current = true;
      return ctx.displayMode as DisplayMode;
    });
  }, [ctx.displayMode]);
  useEffect(() => {
    const insets = ctx.safeAreaInsets;
    if (!insets) return;
    const s = document.documentElement.style;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      s.setProperty(`--safe-${side}`, `${insets[side]}px`);
    }
  }, [ctx.safeAreaInsets]);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);
  const dims = ctx.containerDimensions as { height?: number } | undefined;
  const fullHeight = typeof dims?.height === "number" ? `${dims.height}px` : "100vh";

  const setMode = useCallback(async (next: DisplayMode) => {
    const app = appRef.current;
    if (!app) return;
    try {
      const result = await app.requestDisplayMode({ mode: next });
      const actual = (result?.mode as DisplayMode) ?? next;
      scrollToAnchor.current = actual === "fullscreen";
      setModeState(actual);
    } catch {
      /* host refused */
    }
  }, []);

  // Countdowns and "departed" states.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const stationName = useCallback(
    (id: string) => stations.find((s) => s.id === id)?.name ?? id,
    [stations],
  );

  // Tell the model what the user is looking at (debounced).
  const context = useMemo(
    () =>
      day && phase.kind === "ready"
        ? describeView({ day, answer, mode, filter, later, open, stationName, now: Date.now() })
        : null,
    [day, phase.kind, answer, mode, filter, later, open, stationName],
  );
  const lastContext = useRef("");
  useEffect(() => {
    if (!context || !app || context === lastContext.current) return;
    const id = window.setTimeout(() => {
      lastContext.current = context;
      app.updateModelContext({ content: [{ type: "text", text: context }] }).catch(() => {
        /* host may not support it */
      });
    }, 600);
    return () => window.clearTimeout(id);
  }, [context, app]);

  // Fullscreen: scroll to the suggested (or next) train, and keep re-anchoring
  // while the host is still resizing the frame, until the user scrolls.
  const anchorUntil = useRef(0);
  const anchorTable = useCallback(() => {
    const table = tableRef.current;
    if (!table || Date.now() > anchorUntil.current) return;
    const row =
      table.querySelector<HTMLElement>("li[data-match]") ?? table.querySelector<HTMLElement>("li[data-next]");
    const head = table.querySelector<HTMLElement>("[aria-hidden].sticky")?.offsetHeight ?? 0;
    const before = (row?.previousElementSibling as HTMLElement | null)?.offsetHeight ?? 0;
    table.scrollTop = row ? Math.max(0, row.offsetTop - head - before - 6) : 0;
  }, []);
  useLayoutEffect(() => {
    if (!scrollToAnchor.current || mode !== "fullscreen" || !tableRef.current) return;
    scrollToAnchor.current = false;
    anchorUntil.current = Date.now() + 2000;
    anchorTable();
  });
  useEffect(() => {
    const stop = () => (anchorUntil.current = 0);
    window.addEventListener("resize", anchorTable);
    const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    for (const e of events) window.addEventListener(e, stop, { passive: true });
    return () => {
      window.removeEventListener("resize", anchorTable);
      for (const e of events) window.removeEventListener(e, stop);
    };
  }, [anchorTable]);

  const onToggle = useCallback((key: string) => setOpen((o) => (o === key ? null : key)), []);
  const onFilter = useCallback((f: string) => {
    setFilter(f);
    scrollToAnchor.current = true;
  }, []);

  const onNavigate = useCallback(
    (to: "swap" | "prev" | "next" | "today" | { origin?: string; destination?: string }) => {
      if (!day) return;
      const t = target.current ?? {
        origin: day.origin.id,
        destination: day.destination.id,
        date: day.serviceDate,
      };
      if (to === "swap") return void loadDay(t.destination, t.origin, t.date);
      if (to === "prev") return void loadDay(t.origin, t.destination, addDays(t.date, -1));
      if (to === "next") return void loadDay(t.origin, t.destination, addDays(t.date, 1));
      if (to === "today") return void loadDay(t.origin, t.destination, pacificToday());
      let origin = to.origin ?? t.origin;
      let destination = to.destination ?? t.destination;
      // Picking the other end's station flips the direction.
      if (origin === destination) [origin, destination] = [t.destination, t.origin];
      void loadDay(origin, destination, t.date);
    },
    [day, loadDay],
  );

  let body;
  if (error) {
    body = <ErrorCard message={`Couldn't connect to the host (${error.message}).`} />;
  } else if (phase.kind === "error") {
    body = <ErrorCard message={phase.message} />;
  } else if (phase.kind === "waiting" || !day) {
    body = <Waiting origin={phase.kind === "waiting" ? phase.origin : undefined} destination={phase.kind === "waiting" ? phase.destination : undefined} />;
  } else {
    const note = answer.plan?.note && isPlanDay(day, answer) ? answer.plan.note : null;
    body =
      mode === "fullscreen" ? (
        <div style={{ height: fullHeight }}>
          <FullscreenView
            day={day}
            answer={answer}
            note={note}
            stations={stations}
            filter={filter}
            open={open}
            loading={loading}
            now={now}
            canInline={canInline}
            tableRef={tableRef}
            onFilter={onFilter}
            onToggle={onToggle}
            onInline={() => void setMode("inline")}
            onNavigate={onNavigate}
            stationName={stationName}
          />
        </div>
      ) : (
        <InlineView
          day={day}
          answer={answer}
          note={note}
          later={later}
          open={open}
          now={now}
          canFullscreen={canFullscreen}
          onMore={() => setLater((l) => l + INLINE_STEP)}
          onToggle={onToggle}
          onFullscreen={() => void setMode("fullscreen")}
          stationName={stationName}
        />
      );
  }

  return (
    <>
      {body}
      {toast && (
        <div
          role="status"
          className="fixed bottom-[calc(16px+var(--safe-bottom))] left-1/2 z-20 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-full bg-foreground px-3.5 py-2 text-[13px] text-background shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}

function Waiting({ origin, destination }: { origin?: string; destination?: string }) {
  return (
    <div className="px-4 pt-3.5 pb-3" aria-busy>
      <header className="mb-2">
        {origin && destination ? (
          <Title from={origin} to={destination} />
        ) : (
          <h1 className="m-0 text-base font-semibold">Caltrain timetable</h1>
        )}
        <p className="mt-0.5 mb-0 text-[13px] text-muted-foreground">Checking the timetable…</p>
      </header>
      <div className="grid gap-4 py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2 px-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="px-4 pt-3.5 pb-3">
      <header className="mb-2">
        <h1 className="m-0 text-base font-semibold">Caltrain timetable</h1>
        <p className="mt-0.5 mb-0 text-[13px] text-muted-foreground">Couldn&apos;t load trains</p>
      </header>
      <Note error>{message}</Note>
    </div>
  );
}

