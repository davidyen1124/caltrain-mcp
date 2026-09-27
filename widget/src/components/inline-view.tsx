import { ArrowRight, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DayTimetable } from "@/lib/types";
import { plural } from "../lib/format";
import {
  INLINE_STEP,
  highlightKeys,
  inlineTrains,
  nextTrainKey,
  statusFor,
  subtitle,
  type Answer,
} from "../lib/view";
import { EmptyDay, HolidayBadge, Note } from "./parts";
import { TrainRow } from "./train-row";

export function Title({ from, to }: { from: string; to: string }) {
  return (
    <h1 className="m-0 flex flex-wrap items-center gap-x-1 text-base leading-tight font-semibold tracking-tight">
      {from}
      <ArrowRight aria-label="to" className="size-4 text-subtle-foreground" strokeWidth={2} />
      {to}
    </h1>
  );
}

export function InlineView({
  day,
  answer,
  note,
  later,
  open,
  now,
  canFullscreen,
  onMore,
  onToggle,
  onFullscreen,
  stationName,
}: {
  day: DayTimetable;
  answer: Answer;
  note: string | null;
  later: number;
  open: string | null;
  now: number;
  canFullscreen: boolean;
  onMore: () => void;
  onToggle: (key: string) => void;
  onFullscreen: () => void;
  stationName: (id: string) => string;
}) {
  const { trains, laterLeft } = inlineTrains(day, answer, later, now);
  const keys = highlightKeys(trains, day, answer);
  const nextKey = nextTrainKey(trains, now);
  return (
    <div className="px-4 pt-3.5 pb-3">
      <header className="mb-2 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <Title from={day.origin.name} to={day.destination.name} />
          <p className="mt-0.5 mb-0 text-[13px] text-muted-foreground">
            {subtitle(day, answer, now)} <HolidayBadge day={day} />
          </p>
        </div>
        {canFullscreen && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-0.5 -mr-1.5 rounded-full text-muted-foreground"
            onClick={onFullscreen}
            title="Full timetable"
            aria-label="Open full timetable"
          >
            <Maximize2 />
          </Button>
        )}
      </header>
      {note && <Note>{note}</Note>}
      {trains.length ? (
        <ol className="-mx-2 my-0 list-none p-0">
          {trains.map((t) => (
            <TrainRow
              key={t.key}
              train={t}
              status={statusFor(t, nextKey, now)}
              highlighted={keys.has(t.key)}
              open={open === t.key}
              onToggle={onToggle}
              stationName={stationName}
            />
          ))}
        </ol>
      ) : (
        !note && <EmptyDay day={day} />
      )}
      {(laterLeft > 0 || canFullscreen) && (
        <footer className="mt-2.5 flex flex-wrap gap-2">
          {laterLeft > 0 && (
            <Button variant="secondary" className="rounded-full" onClick={onMore}>
              Show {Math.min(INLINE_STEP, laterLeft)} more
              <span className="font-normal text-muted-foreground">
                · {plural(laterLeft, "later train")}
              </span>
            </Button>
          )}
          {canFullscreen && (
            <Button variant="outline" className="rounded-full" onClick={onFullscreen}>
              Full day timetable
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}
