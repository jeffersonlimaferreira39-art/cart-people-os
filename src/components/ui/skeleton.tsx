import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-surface-2", className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-surface" aria-busy aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-line px-4 py-3.5 last:border-b-0">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ))}
    </div>
  );
}
