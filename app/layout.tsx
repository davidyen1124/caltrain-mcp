import type { Metadata, Viewport } from "next";
import { Anton, Geist, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/mcp/constants";
import "./globals.css";

// "Waiting room zine": condensed display, typewriter body, one grotesk for UI.
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const description =
  "Caltrain timetables in ChatGPT, Claude and other AI assistants: a free remote MCP server " +
  "with an interactive timetable view.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Caltrain MCP: know when to start waiting",
  description,
  openGraph: { title: "Caltrain MCP", description, url: SITE_URL, siteName: "Caltrain MCP" },
  twitter: { card: "summary", title: "Caltrain MCP", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

// Follow the OS light/dark setting before first paint (no toggle, no flash).
const THEME_SCRIPT = `(() => {
  const m = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", m.matches);
  apply();
  m.addEventListener("change", apply);
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${mono.variable} ${sans.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-mono">{children}</body>
    </html>
  );
}
