import { ArrowLeftRight, ChevronLeft, ChevronRight, Minimize2 } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { DayTimetable, StationRef } from "@/lib/types";
import {
  dayLabel,
  filteredTrains,
  highlightKeys,
  isToday,
  nextTrainKey,
  serviceCounts,
  statusFor,
  summaryLine,
  type Answer,
} from "../lib/view";
import { Title } from "./inline-view";
import { EmptyDay, HolidayBadge, Note } from "./parts";
import { TrainRow } from "./train-row";

export interface Target {
  origin: string;
  destination: string;
  date: string;
}

export function FullscreenView({
  day,
  answer,
  note,
  stations,
  filter,
  open,
  loading,
  now,
  canInline,
  tableRef,
  onFilter,
  onToggle,
  onInline,
  onNavigate,
  stationName,
}: {
  day: DayTimetable;
  answer: Answer;
  note: string | null;
  stations: StationRef[];
  filter: string;
  open: string | null;
  loading: boolean;
  now: number;
  canInline: boolean;
  tableRef: Ref<HTMLDivElement>;
  onFilter: (filter: string) => void;
  onToggle: (key: string) => void;
  onInline: () => void;
  onNavigate: (to: "swap" | "prev" | "next" | "today" | { origin?: string; destination?: string }) => void;
  stationName: (id: string) => string;
}) {
  const trains = filteredTrains(day, filter);
  const keys = highlightKeys(trains, day, answer);
  const nextKey = nextTrainKey(trains, now);
  const today = isToday(day, now);
  const showStatus = !!nextKey || trains.some((t) => new Date(t.departure).getTime() < now);
  const chips: [string, number][] = [["All", day.trains.length], ...serviceCounts(day)];

  return (
    <div className="flex h-full flex-col px-[calc(16px+var(--safe-right))] pt-[calc(12px+var(--safe-top))] pl-[calc(16px+var(--safe-left))] max-[380px]:px-3">
      <div className="grid gap-2 border-b border-border-subtle pb-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {stations.length ? (
            <div className="flex min-w-0 flex-[1_1_280px] items-center gap-1">
              <label className="sr-only" htmlFor="origin">
                From
              </label>
              <NativeSelect
                id="origin"
                className="min-w-0 flex-1 [&_select]:h-9 [&_select]:bg-secondary [&_select]:font-semibold"
                value={day.origin.id}
                onChange={(e) => onNavigate({ origin: e.target.value })}
              >
                {stations.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                onClick={() => onNavigate("swap")}
                title="Swap direction"
                aria-label="Swap direction"
              >
                <ArrowLeftRight />
              </Button>
              <label className="sr-only" htmlFor="destination">
                To
              </label>
              <NativeSelect
                id="destination"
                className="min-w-0 flex-1 [&_select]:h-9 [&_select]:bg-secondary [&_select]:font-semibold"
                value={day.destination.id}
                onChange={(e) => onNavigate({ destination: e.target.value })}
              >
                {stations.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Title from={day.origin.name} to={day.destination.name} />
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => onNavigate("swap")}
                aria-label="Swap direction"
              >
                <ArrowLeftRight />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-0.5">
            {/* "Today" keeps its slot even when hidden so the arrows never move. */}
            <Button
              variant="secondary"
              size="xs"
              className={cn("mr-1 rounded-full", today && "invisible")}
              onClick={() => onNavigate("today")}
              tabIndex={today ? -1 : undefined}
              aria-hidden={today || undefined}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={() => onNavigate("prev")}
              aria-label="Previous day"
            >
              <ChevronLeft />
            </Button>
            <span aria-live="polite" className="w-[132px] text-center text-[13.5px] font-semibold whitespace-nowrap max-[380px]:w-[124px] max-[380px]:text-[13px]">
              {dayLabel(day, now)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={() => onNavigate("next")}
              aria-label="Next day"
            >
              <ChevronRight />
            </Button>
          </div>
          {canInline && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto rounded-full text-muted-foreground"
              onClick={onInline}
              title="Exit full screen"
              aria-label="Exit full screen"
            >
              <Minimize2 />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground">
          <span>
            {day.dayType} schedule <HolidayBadge day={day} />
          </span>
          <span>{summaryLine(trains)}</span>
          {keys.size > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-[3px] rounded-full bg-brand" />
              Suggested in chat
            </span>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => value && onFilter(value)}
          spacing={1.5}
          aria-label="Service type"
          className="flex-wrap"
        >
          {chips.map(([name, count]) => (
            <ToggleGroupItem
              key={name}
              value={name}
              variant="outline"
              size="sm"
              className="rounded-full px-3 font-semibold data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {name}
              <span className="font-normal opacity-60">{count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {note && <Note>{note}</Note>}
      <div
        ref={tableRef}
        id="table"
        className={cn(
          "relative -mx-2 min-h-0 flex-1 overflow-auto px-2 pb-[calc(140px+var(--safe-bottom))] transition-opacity",
          loading && "pointer-events-none opacity-45",
        )}
      >
        <div
          aria-hidden
          className="train-grid is-table sticky top-0 z-10 hidden border-b border-border-subtle bg-background pt-2.5 pr-2.5 pb-2 pl-3.5 text-[11.5px] font-semibold tracking-wider text-subtle-foreground uppercase sm:grid"
        >
          <span className="t-dep">Departs</span>
          <span className="t-arr">Arrives</span>
          <span className="t-dur">Duration</span>
          <span className="t-info">Train</span>
          <span className="t-when">{showStatus ? "Status" : ""}</span>
          <span className="t-chev" />
        </div>
        {trains.length ? (
          <ol className="m-0 list-none p-0">
            {trains.map((t) => (
              <TrainRow
                key={t.key}
                train={t}
                status={statusFor(t, nextKey, now)}
                highlighted={keys.has(t.key)}
                open={open === t.key}
                table
                onToggle={onToggle}
                stationName={stationName}
              />
            ))}
          </ol>
        ) : (
          !note && <EmptyDay day={day} />
        )}
      </div>
    </div>
  );
}
