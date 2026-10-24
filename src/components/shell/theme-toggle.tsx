"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const ORDER = ["system", "light", "dark"] as const;
const LABEL = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" } as const;
const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = (mounted ? theme : "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-label={`${LABEL[current]}. Mudar para ${LABEL[next].toLowerCase()}`}
      title={LABEL[current]}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}
