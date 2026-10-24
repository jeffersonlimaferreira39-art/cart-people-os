import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-10">
      <p className="font-medium text-ink">{title}</p>
      {children ? <p className="max-w-[60ch] text-sm text-ink-2">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
