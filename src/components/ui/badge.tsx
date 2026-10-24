import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "ok" | "attention" | "danger" | "muted";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "ok" && "bg-accent-soft text-accent",
        tone === "attention" && "bg-brass-soft text-brass",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "muted" && "text-ink-3 ring-1 ring-line ring-inset",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}
