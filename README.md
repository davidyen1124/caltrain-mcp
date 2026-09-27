# Caltrain MCP

[![CI](https://github.com/davidyen1124/caltrain-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/davidyen1124/caltrain-mcp/actions/workflows/ci.yml)

A remote [MCP](https://modelcontextprotocol.io) server that tells you exactly when the next Caltrain leaves, so you can be precisely informed about how late it is. It runs on Caltrain's official GTFS schedule, which means the disappointment is official too.

Server: `https://caltrain-mcp-rho.vercel.app/mcp` (Streamable HTTP, no auth). Live demo at [caltrain-mcp-rho.vercel.app](https://caltrain-mcp-rho.vercel.app).

![The full-day Caltrain timetable open next to the chat in ChatGPT](assets/chatgpt-full-day.jpg)

In ChatGPT and other [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) hosts, answers come with an interactive timetable. Tap a train for its stops, or open the whole day with Express / Limited / Local filters and keep asking questions about what's on screen. Everywhere else you get the same answer as text.

## What it knows

- The next trains between two stations, or the last ones that still get you there by 9.
- That the 12:05 AM train belongs to yesterday, that Thanksgiving runs a weekend schedule, and that South County doesn't do weekends.
- Where to change trains when there's no direct one.
- That `sf`, `sj` and `22nd` are stations, because nobody types "San Francisco Caltrain Station".

Tools: `next_trains`, `list_stations`, and `get_timetable` (only the timetable view calls that one). All read-only.

## Development

```bash
npm install
npm run dev    # http://localhost:3000, MCP at /mcp
npm test
```

It's Next.js on Vercel:

- **Schedule engine:** [`lib/schedule.ts`](lib/schedule.ts).
- **Timetable view:** [`widget/`](widget/), React, Tailwind and shadcn built into one HTML file.
- **Feed:** [`data/gtfs/`](data/gtfs/). A weekly GitHub Action fetches a fresh one and opens a PR, and merging deploys it.

When the view changes, bump `TIMETABLE_URI` in [`lib/mcp/constants.ts`](lib/mcp/constants.ts). ChatGPT caches it harder than you'd think.

The old Python package on PyPI (`uvx caltrain-mcp`) still installs, but it's retired. Use the URL above.

## License

[LICENSE.md](LICENSE.md). Uses official Caltrain GTFS data; not affiliated with Caltrain. If the train is late, take it up with them.
