import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrainDetail } from "@/lib/types";
import { clock, clockParts, duration } from "../lib/format";
import type { Status } from "../lib/view";

function Time({ iso, className }: { iso: string; className?: string }) {
  const [time, period] = clockParts(iso);
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      <b className="text-[17px] font-semibold tracking-tight max-[380px]:text-base">{time}</b>
      <small className="ml-[3px] text-[11px] font-medium text-muted-foreground">{period}</small>
    </span>
  );
}

export function ServiceBadge({ train }: { train: TrainDetail }) {
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-full px-[7px] text-[11px] leading-none font-semibold whitespace-nowrap"
      style={{ backgroundColor: train.color, color: train.textColor }}
    >
      {train.service}
    </span>
  );
}

function StopList({
  train,
  table,
  stationName,
}: {
  train: TrainDetail;
  table?: boolean;
  stationName: (id: string) => string;
}) {
  const last = train.stops.length - 1;
  return (
    <div className={cn("px-3.5 pt-0.5 pb-3", table && "sm:pl-[110px]")}>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
        {train.direction || "Train"} {train.train}
        {train.headsign ? ` · to ${train.headsign}` : ""}
      </p>
      <ol className="stop-list m-0 list-none p-0 pl-1">
        {train.stops.map(([id, time], i) => {
          const end = i === 0 || i === last;
          return (
            <li
              key={`${id}-${i}`}
              data-end={end || undefined}
              className={cn(
                "grid grid-cols-[72px_1fr] gap-2 py-[7px] pl-[22px] text-[13px] leading-[18px]",
                end && "font-semibold",
              )}
            >
              <time
                className={cn(
                  "whitespace-nowrap tabular-nums",
                  end ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {time}
              </time>
              <span>{stationName(id)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TrainRow({
  train,
  status,
  highlighted,
  open,
  table,
  onToggle,
  stationName,
}: {
  train: TrainDetail;
  status: Status;
  highlighted: boolean;
  open: boolean;
  /** Full-day table layout on wide frames. */
  table?: boolean;
  onToggle: (key: string) => void;
  stationName: (id: string) => string;
}) {
  const past = status.kind === "past";
  const dim = past && "opacity-45";
  return (
    <li
      data-key={train.key}
      data-match={highlighted || undefined}
      data-next={status.kind === "next" || undefined}
      className={cn(
        "relative rounded-lg [&+&]:mt-0.5",
        highlighted && "bg-brand-soft",
        open && (highlighted ? "bg-brand/10" : "bg-muted"),
      )}
    >
      {highlighted && (
        <span aria-hidden className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-brand" />
      )}
      <button
        type="button"
        onClick={() => onToggle(train.key)}
        aria-expanded={open}
        aria-label={`Train ${train.train}, ${train.service}, departs ${clock(train.departure)}, arrives ${clock(train.arrival)}`}
        className={cn(
          "train-grid w-full cursor-pointer rounded-[inherit] border-0 bg-transparent py-[9px] pr-2.5 pl-3.5 text-left",
          "hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring max-[380px]:pr-1.5 max-[380px]:pl-3",
          table && "is-table sm:py-2",
        )}
      >
        <Time iso={train.departure} className={cn("t-dep", dim)} />
        <span
          aria-hidden
          className={cn(
            "t-line flex min-w-0 items-center gap-1.5 text-[11.5px] text-subtle-foreground",
            table && "sm:hidden",
            dim,
          )}
        >
          <i className="h-px flex-1 bg-border" />
          <em className="not-italic whitespace-nowrap">{duration(train.durationMinutes)}</em>
          <i className="h-px flex-1 bg-border" />
        </span>
        <Time iso={train.arrival} className={cn("t-arr", dim)} />
        <span className={cn("t-dur hidden text-muted-foreground tabular-nums", table && "sm:block", dim)}>
          {duration(train.durationMinutes)}
        </span>
        <span className={cn("t-info flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground", dim)}>
          <ServiceBadge train={train} />
          <span>Train {train.train}</span>
        </span>
        <span
          data-when
          className={cn(
            "t-when text-[12.5px] whitespace-nowrap tabular-nums text-muted-foreground",
            status.kind === "next" && "font-semibold text-brand-text",
            past && "text-subtle-foreground",
          )}
        >
          {status.label}
        </span>
        <span className="t-chev grid place-items-center text-subtle-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </span>
      </button>
      {open && <StopList train={train} table={table} stationName={stationName} />}
    </li>
  );
}
