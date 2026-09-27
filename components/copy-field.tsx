"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyField({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-xl border bg-card py-1.5 pr-1.5 pl-3.5 shadow-xs",
        className,
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-[13px] sm:text-sm">{value}</code>
      <Button
        size="sm"
        variant={copied ? "secondary" : "default"}
        className="shrink-0 rounded-lg"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
