"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Banknote, BadgePercent, BriefcaseBusiness, CalendarRange, FolderOpen, ClipboardList, Clock3, FileClock, FileDown, LayoutDashboard, Settings2, ShieldCheck, Sparkles, UserRound, Users,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

const ICONS = {
  painel: LayoutDashboard,
  analises: BarChart3,
  relatorios: FileDown,
  colaboradores: Users,
  ausencias: CalendarRange,
  dp: ClipboardList,
  documentos: FolderOpen,
  contratacao: BriefcaseBusiness,
  folha: Banknote,
  comissoes: BadgePercent,
  ponto: Clock3,
  assistente: Sparkles,
  auditoria: FileClock,
  acessos: ShieldCheck,
  configuracoes: Settings2,
  "meus-dados": UserRound,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };
export type NavGroup = { label: string; items: NavItem[] };

export function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  // O item mais específico vence (ex.: /dp/folha não acende "Movimentações" em /dp).
  const activeHref = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="eyebrow mb-2 px-3 !text-[10px] text-brand-ink-2">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-[14px] text-brand-ink/75 transition-colors",
                      "hover:bg-white/[0.06] hover:text-brand-ink",
                      active &&
                        "bg-[linear-gradient(90deg,rgb(45_212_196/0.16),rgb(45_212_196/0.02))] font-medium text-brand-ink shadow-[inset_2px_0_0_#2dd4c4,0_0_24px_-10px_#2dd4c4]",
                    )}
                  >
                    <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-[#2dd4c4]" : "opacity-70")} strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-[#ff3b45] px-1.5 font-mono text-[11px] font-semibold text-white shadow-[0_0_10px_rgb(255_59_69/0.6)]">
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
