// Shared by the MCP server and the site's live demo.

// Bump the version suffix whenever the timetable HTML changes: hosts (ChatGPT
// in particular) cache UI resources by URI.
export const TIMETABLE_URI = "ui://caltrain/timetable-v10.html";

export const REPO_URL = "https://github.com/davidyen1124/caltrain-mcp";

/** Where the production deployment lives (links, install instructions). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://caltrain-mcp-rho.vercel.app";
