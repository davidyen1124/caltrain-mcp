"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** The server URL as a hard ruled strip with an attached red Copy block. */
export function CopyField({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex min-w-0 items-stretch border-2 border-ink bg-background", className)}>
      <code className="min-w-0 flex-1 px-3 py-2.5 font-mono text-sm leading-snug break-all sm:px-5 sm:py-5 sm:text-xl">
        {value}
      </code>
      <button
        type="button"
        className="shrink-0 cursor-pointer border-l-2 border-ink bg-brand px-5 font-mono text-base font-semibold text-white transition-colors hover:bg-[#b8102f] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-12 sm:text-xl"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
        aria-live="polite"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
