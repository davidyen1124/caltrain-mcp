"use client";

import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ArrowLeftRight, ArrowUpDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TIMETABLE_URI } from "@/lib/mcp/constants";
import type { StationRef } from "@/lib/types";
import { cn } from "@/lib/utils";

let rpcId = 0;

/** One JSON-RPC call to this site's MCP endpoint (JSON or single-event SSE reply). */
async function mcp<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((l) => l.startsWith("data: "))!.slice(6))
    : JSON.parse(text);
  if (json.error) throw new Error(json.error.message ?? "MCP error");
  return json.result as T;
}

/** The site's palette, passed to the view the way ChatGPT passes its own. */
function hostContext(mode: "inline" | "fullscreen", frame: HTMLIFrameElement): McpUiHostContext {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    theme: root.classList.contains("dark") ? "dark" : "light",
    displayMode: mode,
    availableDisplayModes: ["inline", "fullscreen"],
    platform: "web",
    containerDimensions:
      mode === "fullscreen"
        ? { height: frame.clientHeight, width: frame.clientWidth }
        : { maxHeight: 4000, width: frame.clientWidth },
    styles: {
      // Partial palette; hosts may send any subset of the style variables.
      variables: {
        "--color-background-primary": v("--card"),
        "--color-background-secondary": v("--secondary"),
        "--color-background-tertiary": v("--accent"),
        "--color-text-primary": v("--foreground"),
        "--color-text-secondary": v("--muted-foreground"),
        "--color-text-tertiary": v("--subtle-foreground"),
        "--color-border-primary": v("--border"),
        "--color-border-secondary": v("--border-subtle"),
        "--color-ring-primary": v("--ring"),
      } as NonNullable<McpUiHostContext["styles"]>["variables"],
    },
  };
}

export function LiveDemo({ stations }: { stations: StationRef[] }) {
  const [origin, setOrigin] = useState("sunnyvale");
  const [destination, setDestination] = useState("san_francisco");
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"inline" | "fullscreen">("inline");
  const [height, setHeight] = useState(370);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    mcp<{ contents: { text: string }[] }>("resources/read", { uri: TIMETABLE_URI })
      .then((r) => setHtml(r.contents[0].text))
      .catch(() => setFailed(true));
  }, []);

  // Connect a host bridge to each freshly loaded frame, then "call" next_trains.
  const onFrameLoad = async () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    await bridgeRef.current?.close().catch(() => {});
    const bridge = new AppBridge(
      null,
      { name: "caltrain-mcp-site", version: "1.0.0" },
      { openLinks: {}, serverTools: {}, updateModelContext: { text: {} } },
      { hostContext: hostContext(modeRef.current, frame) },
    );
    bridgeRef.current = bridge;
    const args = { origin, destination, limit: 4 };
    bridge.onsizechange = ({ height: h }) => {
      if (modeRef.current === "inline" && h) setHeight(h);
    };
    bridge.oncalltool = (params) => mcp<CallToolResult>("tools/call", params);
    bridge.onupdatemodelcontext = async () => ({});
    bridge.onrequestdisplaymode = async ({ mode: requested }) => {
      const next = requested === "fullscreen" ? "fullscreen" : "inline";
      // Update the ref now: the view reports its new size before React re-renders.
      modeRef.current = next;
      setMode(next);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      bridge.setHostContext(hostContext(next, frame));
      return { mode: next };
    };
    bridge.oninitialized = async () => {
      bridge.sendToolInput({ arguments: args });
      try {
        bridge.sendToolResult(await mcp<CallToolResult>("tools/call", { name: "next_trains", arguments: args }));
      } catch (err) {
        bridge.sendToolResult({ isError: true, content: [{ type: "text", text: String(err) }] });
      }
    };
    await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
  };

  // Follow the site's light/dark switch.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const frame = frameRef.current;
      if (frame && bridgeRef.current) bridgeRef.current.setHostContext(hostContext(modeRef.current, frame));
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Escape leaves the full-day view, like a host would.
  useEffect(() => {
    if (mode !== "fullscreen") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      modeRef.current = "inline";
      setMode("inline");
      const frame = frameRef.current;
      if (frame && bridgeRef.current) bridgeRef.current.setHostContext(hostContext("inline", frame));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const select = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className="grid min-w-0 flex-1 gap-1.5">
      <label htmlFor={id} className="font-sans text-sm font-semibold sm:text-base">
        {label}
      </label>
      <NativeSelect
        id={id}
        className="w-full [&_select]:h-11 [&_select]:rounded-md [&_select]:bg-card [&_select]:pl-3.5 [&_select]:font-sans [&_select]:text-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {stations.map((s) => (
          <NativeSelectOption key={s.id} value={s.id}>
            {s.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[740px]">
      <div className="mb-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-4">
        {select("demo-from", "From", origin, (v) => {
          if (v === destination) setDestination(origin);
          setOrigin(v);
        })}
        <Button
          variant="outline"
          size="icon-lg"
          className="size-11 self-center rounded-md bg-card sm:self-auto"
          aria-label="Swap direction"
          onClick={() => {
            setOrigin(destination);
            setDestination(origin);
          }}
        >
          <ArrowUpDown className="sm:hidden" />
          <ArrowLeftRight className="max-sm:hidden" />
        </Button>
        {select("demo-to", "To", destination, (v) => {
          if (v === origin) setOrigin(destination);
          setDestination(v);
        })}
      </div>
      <div
        className={cn(
          "overflow-hidden bg-card",
          mode === "fullscreen"
            ? "fixed inset-0 z-50"
            : "rounded-2xl border",
        )}
      >
        {html ? (
          <iframe
            key={`${origin}-${destination}`}
            ref={frameRef}
            title="Caltrain timetable (live demo)"
            srcDoc={html}
            sandbox="allow-scripts"
            onLoad={onFrameLoad}
            className="block w-full border-0"
            style={{ height: mode === "fullscreen" ? "100%" : height }}
          />
        ) : (
          <div className="grid h-[370px] place-items-center text-sm text-muted-foreground">
            {failed ? "Couldn't load the demo." : "Loading the timetable…"}
          </div>
        )}
      </div>
    </div>
  );
}
