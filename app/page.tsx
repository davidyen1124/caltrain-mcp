import { CalendarClock, Clock, ListTree, TrainFront } from "lucide-react";
import Image from "next/image";
import { CopyField } from "@/components/copy-field";
import { GithubIcon } from "@/components/github-icon";
import { InstallTabs } from "@/components/install-tabs";
import { LiveDemo } from "@/components/live-demo";
import { Button } from "@/components/ui/button";
import { getSchedule } from "@/lib/gtfs/feed";
import { REPO_URL, SITE_URL } from "@/lib/mcp/constants";
import { stationJson } from "@/lib/schedule";
import icon from "./icon.png";

function feedDate(value: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const FEATURES = [
  {
    icon: Clock,
    title: "Next and last trains",
    body: "“Next train from Palo Alto to SF”, “last train from San Jose tonight”. Trains that run past midnight and weekend-only gaps are handled.",
  },
  {
    icon: CalendarClock,
    title: "Arrive-by planning",
    body: "“What gets me to Millbrae by 9?” finds the latest trains that still make it, and skips ones that already left.",
  },
  {
    icon: ListTree,
    title: "The whole day, interactive",
    body: "Expand any train for its stops, or open the full-day timetable with station, date and Express/Limited/Local filters.",
  },
];

const TOOLS = [
  ["next_trains", "Trains between two stations after a time, or arriving by a time. Renders the timetable view."],
  ["list_stations", "Every station name, with abbreviations like SF, SJ, MV and RC."],
  ["get_timetable", "A full day between two stations. Only the timetable view calls it."],
];

export default function Home() {
  const schedule = getSchedule();
  const stations = schedule.stationsInLineOrder().map(stationJson);
  const validThrough = feedDate(schedule.feed.endDate);
  const mcpUrl = `${SITE_URL}/mcp`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Image src={icon} alt="" width={28} height={28} className="rounded-lg" priority />
          Caltrain MCP
        </a>
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href={REPO_URL}>
            <GithubIcon />
            GitHub
          </a>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="grid items-start gap-10 pt-8 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14 lg:pt-16 lg:pb-24">
          <div className="lg:pt-6">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <TrainFront className="size-3.5 text-brand" />
              Remote MCP server with an MCP Apps timetable
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Caltrain times, right in your AI chat.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              Ask ChatGPT, Claude or any MCP client for the next train, the last one tonight, or
              what gets you to San Francisco by 9. Hosts that support MCP Apps show an interactive
              timetable instead of a wall of text.
            </p>
            <div className="mt-8 grid max-w-xl gap-2">
              <span className="text-sm font-medium">Server URL</span>
              <CopyField value={mcpUrl} />
              <p className="text-sm text-muted-foreground">
                Free and open source, no sign-in. Add it to your client below.
              </p>
            </div>
          </div>
          <div>
            <LiveDemo stations={stations} />
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Live: the same view ChatGPT shows, running on this server. Try the full-day timetable.
            </p>
          </div>
        </section>

        <section id="install" className="grid gap-8 border-t py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Add it to your assistant</h2>
            <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
              It&apos;s a Streamable HTTP MCP server with no authentication, so any client that
              supports remote servers can use it.
            </p>
          </div>
          <InstallTabs url={mcpUrl} />
        </section>

        <section className="grid gap-4 border-t py-16 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border bg-card p-5">
              <Icon className="mb-4 size-5 text-brand" />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-8 border-t py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Tools</h2>
            <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
              All read-only. Times are Pacific, from Caltrain&apos;s official GTFS schedule
              {validThrough ? `, valid through ${validThrough}` : ""}.
            </p>
          </div>
          <dl className="divide-y rounded-2xl border bg-card">
            {TOOLS.map(([name, body]) => (
              <div key={name} className="grid gap-1 px-5 py-4">
                <dt className="font-mono text-sm font-medium">{name}</dt>
                <dd className="text-[15px] text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Not affiliated with Caltrain. Schedule data from the Caltrain GTFS feed.</p>
          <a href={REPO_URL} className="underline-offset-4 hover:text-foreground hover:underline">
            davidyen1124/caltrain-mcp
          </a>
        </div>
      </footer>
    </div>
  );
}
