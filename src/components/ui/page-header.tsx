import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="relative mb-7 flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2 text-accent">{eyebrow}</p> : null}
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[68ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      {/* Filete com brilho: separa o cabeçalho do conteúdo. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,var(--accent),color-mix(in_oklab,var(--accent)_25%,transparent)_35%,var(--line)_60%)]"
      />
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="eyebrow flex items-center gap-2 text-ink-2">
        <span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        {children}
      </h2>
      {aside}
    </div>
  );
}
