import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/mcp/constants";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const description =
  "Caltrain timetables for ChatGPT, Claude and any MCP client: a free remote MCP server " +
  "with an interactive timetable view.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Caltrain MCP",
  description,
  openGraph: { title: "Caltrain MCP", description, url: SITE_URL, siteName: "Caltrain MCP" },
  twitter: { card: "summary", title: "Caltrain MCP", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
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
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
