import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { CopyField } from "@/components/copy-field";
import { LiveDemo } from "@/components/live-demo";
import { getSchedule } from "@/lib/gtfs/feed";
import { REPO_URL, SITE_URL } from "@/lib/mcp/constants";
import { stationJson } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import icon from "./icon.png";

function feedDate(value: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T12:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const FEATURES = [
  {
    title: "Next and last trains.",
    body: "Including the 12:05 AM that technically belongs to yesterday, and the weekends South County forgot.",
  },
  {
    title: "Arrive by.",
    body: "What gets me to Millbrae by 9? Skips the trains that already left without you.",
  },
  {
    title: "The whole day, interactive.",
    body: "Tap a train for its stops. Full-day timetable with Express / Limited / Local filters.",
  },
];

const TOOLS = [
  ["next_trains", "Trains after a time, or arriving by one. Renders the timetable view."],
  ["list_stations", "Every station, with abbreviations like SF, SJ and MV."],
  ["get_timetable", "A full day. Only the timetable view calls it."],
];

function Wordmark({ className }: { className?: string }) {
  return (
    <a href="/" className={cn("flex items-center gap-3", className)}>
      <Image
        src={icon}
        alt=""
        width={44}
        height={44}
        className="size-9 rounded-md sm:size-11"
        priority
      />
      <span className="font-display text-[1.75rem] leading-none tracking-[0.005em] sm:text-4xl">
        Caltrain MCP
      </span>
    </a>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:text-brand-text"
    >
      {children}
      <ArrowUpRight className="size-4" aria-hidden />
    </a>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(3.25rem,8.5vw,6.75rem)] leading-[0.95] uppercase">
      {children}
    </h2>
  );
}

export default function Home() {
  const schedule = getSchedule();
  const stations = schedule.stationsInLineOrder().map(stationJson);
  const validThrough = feedDate(schedule.feed.endDate);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-10 lg:px-14">
      <header className="flex items-center justify-between gap-4 py-3.5 sm:py-4">
        <Wordmark />
        <span className="text-sm sm:text-base">
          <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
        </span>
      </header>

      <main className="rule-heavy">
        <section className="pt-6 pb-8 sm:pt-10 sm:pb-12">
          <h1 className="font-display text-[clamp(3.75rem,12vw,10.75rem)] leading-[0.9] uppercase">
            <span className="block">Know when</span>
            <span className="block">to start</span>
            <span className="block text-brand">waiting.</span>
          </h1>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed sm:mt-6 sm:text-xl">
            Free, open-source Caltrain timetables in ChatGPT, Claude and other AI assistants.
          </p>
          <CopyField value={`${SITE_URL}/mcp`} className="mt-4 max-w-[960px] sm:mt-6" />
        </section>

        <section aria-labelledby="demo" className="rule-heavy pt-8 pb-10 sm:pt-12 sm:pb-14">
          <div className="relative border-[5px] border-ink px-2.5 pt-12 pb-4 sm:border-[6px] sm:px-10 sm:pt-16 sm:pb-8">
            <h2
              id="demo"
              className="absolute -top-5 left-3 -rotate-3 bg-brand px-3 py-1.5 font-display text-[1.9rem] leading-none text-white uppercase sm:-top-7 sm:left-6 sm:px-4 sm:py-2 sm:text-5xl"
            >
              Live demo
            </h2>
            <LiveDemo stations={stations} />
            <p className="mt-4 text-center text-[13px] leading-relaxed sm:mt-6 sm:text-lg">
              The same view ChatGPT shows, running live on this server. Delays sold separately.
            </p>
          </div>
        </section>

        <section className="rule-heavy pt-3 pb-10 sm:pt-5 sm:pb-14">
          <SectionTitle>
            What it <span className="max-sm:text-brand">does</span>
          </SectionTitle>
          <ol className="mt-3 sm:mt-4">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 border-b-2 border-ink py-3 sm:gap-x-10 sm:py-4"
              >
                <span
                  aria-hidden
                  className="numeral-outline w-[1.55em] font-display text-[clamp(3.5rem,7vw,6rem)] leading-none"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-sans text-xl leading-tight font-bold tracking-tight sm:text-[2rem]">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed sm:mt-1.5 sm:text-lg">{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rule-heavy pt-3 pb-10 sm:pt-5 sm:pb-14">
          <SectionTitle>Tools</SectionTitle>
          <dl className="mt-3 sm:mt-4">
            {TOOLS.map(([name, body]) => (
              <div
                key={name}
                className="grid gap-1 border-b border-rule py-2.5 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6 sm:py-3"
              >
                <dt className="text-[15px] font-semibold sm:text-lg">{name}</dt>
                <dd className="text-[13px] leading-relaxed sm:text-lg">{body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground sm:text-base">
            All read-only. Pacific time. Official Caltrain GTFS schedule
            {validThrough ? `, valid through ${validThrough}` : ""}. Punctuality not included.
          </p>
        </section>
      </main>

      <footer className="rule-heavy flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-6">
        <Wordmark />
        <div className="grid gap-1 text-sm sm:text-right">
          <p>Not affiliated with Caltrain. Take it up with them.</p>
          <span>
            <ExternalLink href={REPO_URL}>davidyen1124/caltrain-mcp</ExternalLink>
          </span>
        </div>
      </footer>
    </div>
  );
}
