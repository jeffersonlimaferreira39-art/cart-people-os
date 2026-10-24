import { cache } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { ROLE_LABELS } from "@/lib/domain/roles";
import { REPORTS } from "@/lib/reports/catalog";
import { NavLinks, type NavGroup } from "@/components/shell/nav-links";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UnitSwitcher } from "@/components/shell/unit-switcher";
import { signOut } from "./shell-actions";

// Uma vez por requisição: o menu lateral e o do celular usam o mesmo resultado.
const buildNav = cache(async (viewer: Viewer): Promise<NavGroup[]> => {
  const supabase = await createClient();
  const unit = viewer.selectedUnitId;
  let pendingLeaves = 0;
  let pendingDp = 0;

  // Contadores em paralelo: cada ida ao banco custa uma viagem de rede.
  const leavesQ = viewerCan(viewer, "decideLeaves")
    ? (() => {
        let q = supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (unit) q = q.eq("unit_id", unit);
        if (viewer.employee) q = q.neq("employee_id", viewer.employee.id);
        return q;
      })()
    : null;
  const dpQ = viewerCan(viewer, "manageDp")
    ? (() => {
        let q = supabase.from("dp_events").select("id", { count: "exact", head: true }).eq("status", "submitted");
        if (unit) q = q.eq("unit_id", unit);
        return q;
      })()
    : null;
  const [leavesRes, dpRes] = await Promise.all([leavesQ, dpQ]);
  pendingLeaves = leavesRes?.count ?? 0;
  pendingDp = dpRes?.count ?? 0;

  const people: NavGroup = {
    label: "Pessoas",
    items: [
      { href: "/painel", label: "Painel", icon: "painel" },
      ...(viewerCan(viewer, "viewPeople")
        ? [{ href: "/colaboradores", label: "Colaboradores", icon: "colaboradores" as const }]
        : []),
      { href: "/ausencias", label: "Férias e ausências", icon: "ausencias", badge: pendingLeaves },
      { href: "/documentos", label: "Documentos", icon: "documentos" },
    ],
  };
  const insights: NavGroup = {
    label: "Inteligência",
    items: [
      ...(viewerCan(viewer, "viewPeople") ? [{ href: "/analises", label: "Análises", icon: "analises" as const }] : []),
      ...(Object.values(REPORTS).some((r) => viewerCan(viewer, r.capability))
        ? [{ href: "/relatorios", label: "Relatórios", icon: "relatorios" as const }]
        : []),
    ],
  };
  const dp: NavGroup = {
    label: "Departamento Pessoal",
    items: [
      ...(viewerCan(viewer, "viewDp")
        ? [{ href: "/dp", label: "Movimentações", icon: "dp" as const, badge: pendingDp }]
        : []),
      ...(viewerCan(viewer, "viewSensitive") ? [{ href: "/dp/folha", label: "Prévia da folha", icon: "folha" as const }] : []),
      ...(viewerCan(viewer, "viewSensitive") ? [{ href: "/comissoes", label: "Comissões", icon: "comissoes" as const }] : []),
      ...(viewerCan(viewer, "viewTime") ? [{ href: "/ponto", label: "Ponto", icon: "ponto" as const }] : []),
    ],
  };
  const admin: NavGroup = {
    label: "Gestão",
    items: [
      ...(viewerCan(viewer, "useAssistant")
        ? [{ href: "/assistente", label: "Assistente", icon: "assistente" as const }]
        : []),
      ...(viewerCan(viewer, "viewAudit") && viewer.orgWide
        ? [{ href: "/auditoria", label: "Auditoria", icon: "auditoria" as const }]
        : []),
      ...(viewerCan(viewer, "manageSettings")
        ? [{ href: "/configuracoes", label: "Configurações", icon: "configuracoes" as const }]
        : []),
    ],
  };
  const me: NavGroup = {
    label: "Você",
    items: viewer.employee ? [{ href: "/meus-dados", label: "Meus dados", icon: "meus-dados" }] : [],
  };
  return [people, insights, dp, admin, me].filter((g) => g.items.length);
});

export async function SidebarNav() {
  const viewer = await getViewer();
  return <NavLinks groups={await buildNav(viewer)} />;
}

export async function MobileMenu() {
  const viewer = await getViewer();
  return <MobileNav groups={await buildNav(viewer)} />;
}

export async function UnitPicker() {
  const viewer = await getViewer();
  return (
    <UnitSwitcher
      units={viewer.units.map((u) => ({ id: u.id, name: u.name, code: u.code }))}
      selected={viewer.selectedUnitId}
      allowAll={viewer.units.length > 1}
    />
  );
}

export async function UserBlock() {
  const viewer = await getViewer();
  const name = viewer.employee?.full_name ?? viewer.email ?? "Usuário";
  return (
    <div className="flex items-center gap-2 border-t border-white/10 pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-brand-ink">{name}</p>
        <p className="truncate text-[12px] text-brand-ink-2">
          {viewer.roles.map((r) => ROLE_LABELS[r]).join(", ")}
        </p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-brand-ink-2 hover:bg-white/10 hover:text-brand-ink"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="size-4" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}

export async function OrgName() {
  const viewer = await getViewer();
  return <>{viewer.organization.name}</>;
}
