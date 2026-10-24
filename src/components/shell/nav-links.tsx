"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange, ClipboardList, Clock3, FileClock, LayoutDashboard, Settings2, Sparkles, UserRound, Users,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

const ICONS = {
  painel: LayoutDashboard,
  colaboradores: Users,
  ausencias: CalendarRange,
  dp: ClipboardList,
  ponto: Clock3,
  assistente: Sparkles,
  auditoria: FileClock,
  configuracoes: Settings2,
  "meus-dados": UserRound,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };
export type NavGroup = { label: string; items: NavItem[] };

export function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[12px] font-medium text-brand-ink-2">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-[14px] text-brand-ink/85",
                      "hover:bg-white/8 hover:text-brand-ink",
                      active && "bg-white/12 font-medium text-brand-ink shadow-[inset_2px_0_0_var(--focus)]",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0 opacity-80" strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="tnum rounded-full bg-[var(--focus)] px-1.5 text-[11.5px] font-semibold text-brand">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
