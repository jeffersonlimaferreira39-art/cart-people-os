"use client";

import { useTransition } from "react";
import { Building2 } from "lucide-react";
import { selectUnit } from "@/app/(app)/shell-actions";

export function UnitSwitcher({
  units,
  selected,
  allowAll,
}: {
  units: { id: string; name: string; code: string }[];
  selected: string | null;
  allowAll: boolean;
}) {
  const [pending, start] = useTransition();
  if (units.length <= 1) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink-2">
        <Building2 aria-hidden className="size-4" strokeWidth={1.75} />
        {units[0]?.name ?? "Sem unidade"}
      </span>
    );
  }
  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-2">
      <Building2 aria-hidden className="size-4" strokeWidth={1.75} />
      <span className="sr-only">Unidade em foco</span>
      <select
        value={selected ?? "all"}
        disabled={pending}
        onChange={(e) => start(() => selectUnit(e.target.value))}
        className="h-8 rounded-[var(--radius-control)] border border-line bg-surface pr-7 pl-2 text-sm font-medium text-ink"
      >
        {allowAll ? <option value="all">Todas as unidades</option> : null}
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
