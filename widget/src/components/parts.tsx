import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DayTimetable } from "@/lib/types";
import { longDay } from "../lib/format";

export function HolidayBadge({ day }: { day: DayTimetable }) {
  if (!day.holiday) return null;
  return (
    <span className="ml-1 inline-block rounded-full bg-brand-soft px-[7px] py-px align-[1px] text-[11.5px] font-semibold text-brand-text">
      {day.holiday}
    </span>
  );
}

export function Note({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <p
      role={error ? "alert" : undefined}
      className={cn(
        "mt-1 mb-2.5 rounded-lg px-3 py-2 text-[13px]",
        error ? "bg-brand-soft text-brand-text" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function EmptyDay({ day }: { day: DayTimetable }) {
  return (
    <div className="px-3 py-5 text-center text-muted-foreground">
      No scheduled trains from {day.origin.name} to {day.destination.name} on{" "}
      {longDay(day.serviceDate)}.
    </div>
  );
}
