import type { ReactNode } from "react";
import { cn } from "./cn";

/** Métrica de destaque: rótulo técnico, número em mono e nota de contexto. */
export function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "accent" | "signal" | "attention";
}) {
  return (
    <div className="glass relative overflow-hidden rounded-[var(--radius-panel)] border border-line px-4 py-4">
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          tone === "default" && "bg-[linear-gradient(90deg,transparent,var(--line-strong),transparent)]",
          tone === "accent" && "bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]",
          tone === "signal" && "bg-[linear-gradient(90deg,transparent,var(--signal),transparent)]",
          tone === "attention" && "bg-[linear-gradient(90deg,transparent,var(--brass),transparent)]",
        )}
      />
      <p className="eyebrow !text-[10.5px] text-ink-3">{label}</p>
      <p className="mt-2 font-mono text-[28px] leading-none font-semibold tracking-[-0.03em] text-ink">{value}</p>
      {note ? <p className="mt-2 text-[12.5px] text-ink-3">{note}</p> : null}
    </div>
  );
}

/** Cartão de gráfico: título, subtítulo, legenda opcional e conteúdo. */
export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-[var(--radius-panel)] border border-line p-4 sm:p-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p> : null}
        </div>
        {legend}
      </header>
      {children}
    </section>
  );
}
