"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Steps({ children }: { children: ReactNode }) {
  return <ol className="grid list-decimal gap-2 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-subtle-foreground [&_b]:font-medium [&_b]:text-foreground">{children}</ol>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border bg-muted/60 px-4 py-3 font-mono text-[13px] leading-relaxed">
      {children}
    </pre>
  );
}

export function InstallTabs({ url }: { url: string }) {
  const clients: { id: string; label: string; body: ReactNode }[] = [
    {
      id: "chatgpt",
      label: "ChatGPT",
      body: (
        <Steps>
          <li>
            Open <b>Plugins</b>, then <b>Add → Create MCP App</b> (needs a plan with developer mode).
          </li>
          <li>
            Name it <b>Caltrain</b>, paste the server URL and choose <b>No authentication</b>.
          </li>
          <li>Start a new chat and ask “next train from Palo Alto to SF”.</li>
        </Steps>
      ),
    },
    {
      id: "claude",
      label: "Claude",
      body: (
        <Steps>
          <li>
            Open <b>Settings → Connectors → Add custom connector</b>.
          </li>
          <li>
            Name it <b>Caltrain</b> and paste the server URL.
          </li>
          <li>Ask “when is the last train from San Jose tonight?”</li>
        </Steps>
      ),
    },
    {
      id: "claude-code",
      label: "Claude Code",
      body: <Code>{`claude mcp add --transport http caltrain ${url}`}</Code>,
    },
    {
      id: "codex",
      label: "Codex",
      body: <Code>{`codex mcp add caltrain --url ${url}`}</Code>,
    },
    {
      id: "vscode",
      label: "VS Code",
      body: (
        <div className="grid gap-2">
          <p className="text-[15px] text-muted-foreground">
            Add to <code className="font-mono text-foreground">.vscode/mcp.json</code>:
          </p>
          <Code>{JSON.stringify({ servers: { caltrain: { type: "http", url } } }, null, 2)}</Code>
        </div>
      ),
    },
    {
      id: "cursor",
      label: "Cursor",
      body: (
        <div className="grid gap-2">
          <p className="text-[15px] text-muted-foreground">
            Add to <code className="font-mono text-foreground">~/.cursor/mcp.json</code>:
          </p>
          <Code>{JSON.stringify({ mcpServers: { caltrain: { url } } }, null, 2)}</Code>
        </div>
      ),
    },
  ];

  return (
    <Tabs defaultValue="chatgpt" className="min-w-0 gap-4">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          {clients.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className="px-3">
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {clients.map((c) => (
        <TabsContent key={c.id} value={c.id} className="grid gap-4">
          {c.body}
        </TabsContent>
      ))}
    </Tabs>
  );
}
