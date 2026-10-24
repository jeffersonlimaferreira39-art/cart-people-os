import type { ReactNode } from "react";
import { cn } from "./cn";

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "attention" | "danger" | "ok";
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius-control)] border-l-[3px] px-3.5 py-2.5 text-sm",
        tone === "info" && "border-ink-3 bg-surface-2 text-ink-2",
        tone === "attention" && "border-brass bg-brass-soft text-ink",
        tone === "danger" && "border-danger bg-danger-soft text-ink",
        tone === "ok" && "border-accent bg-accent-soft text-ink",
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5", "text-ink-2")}>{children}</div> : null}
    </div>
  );
}
