import type { ReactNode } from "react";
import { cn } from "./cn";

/** Superfície de conteúdo. Use para agrupar, não para enfeitar. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[var(--radius-panel)] border border-line bg-surface", className)}>
      {children}
    </section>
  );
}
