import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS, type Role } from "@/lib/domain/roles";
import { formatDate } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { DepartmentForm, InviteForm, PositionForm, UnitForm } from "./forms";
import { createDepartment, createPosition, createUnit, inviteUser, revokeMembership, toggleActive } from "./actions";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configurações" description="Unidades, estrutura organizacional e quem acessa o People OS." />
      <Suspense fallback={<TableSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

function ToggleButton({ table, id, active }: { table: "units" | "departments" | "positions"; id: string; active: boolean }) {
  return (
    <form action={toggleActive.bind(null, table, id, !active)}>
      <button type="submit" className="text-sm text-ink-2 hover:text-ink hover:underline">
        {active ? "Desativar" : "Reativar"}
      </button>
    </form>
  );
}

async function emailsById(orgId: string, ids: string[]) {
  const supabase = await createClient();
  const { data: viaDb } = await supabase.rpc("org_users", { p_org: orgId });
  if (viaDb) return Object.fromEntries((viaDb as { user_id: string; email: string }[]).map((u) => [u.user_id, u.email]));
  // Administrador de unidade: a função é exclusiva do administrador geral.
  try {
    const admin = createAdminClient();
    const map: Record<string, string> = {};
    for (let page = 1; page <= 10; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      data.users.forEach((u) => ids.includes(u.id) && (map[u.id] = u.email ?? ""));
      if (data.users.length < 200) break;
    }
    return map;
  } catch {
    return {} as Record<string, string>;
  }
}

async function SettingsContent() {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageSettings")) return <AccessDenied what="configurações" />;
  const supabase = await createClient();
  const [units, departments, positions, memberships, employees] = await Promise.all([
    supabase.from("units").select("id, name, code, city, state, active").order("name"),
    supabase.from("departments").select("id, name, unit_id, active").order("name"),
    supabase.from("positions").select("id, title, cbo, active").order("title"),
    supabase.from("memberships").select("id, user_id, unit_id, role, active, created_at").eq("active", true).order("created_at"),
    supabase.from("employees").select("id, full_name, user_id").is("user_id", null).neq("status", "terminated").order("full_name"),
  ]);
  const unitName = new Map((units.data ?? []).map((u) => [u.id, u.name]));
  const emails = await emailsById(viewer.organization.id, [...new Set((memberships.data ?? []).map((m) => m.user_id))]);
  const activeUnits = (units.data ?? []).filter((u) => u.active);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionTitle>Acessos</SectionTitle>
        <Panel>
          <Table>
            <THead><tr><Th>Usuário</Th><Th>Papel</Th><Th>Escopo</Th><Th className="hidden sm:table-cell">Desde</Th><Th><span className="sr-only">Ações</span></Th></tr></THead>
            <TBody>
              {(memberships.data ?? []).map((m) => (
                <Tr key={m.id}>
                  <Td className="font-medium">{emails[m.user_id] || <span className="text-ink-3">Usuário sem e-mail visível</span>}</Td>
                  <Td>{ROLE_LABELS[m.role as Role]}</Td>
                  <Td className="text-ink-2">{m.unit_id ? unitName.get(m.unit_id) : "Todas as unidades"}</Td>
                  <Td className="hidden text-ink-3 sm:table-cell">{formatDate(m.created_at)}</Td>
                  <Td className="text-right">
                    {m.user_id !== viewer.userId ? (
                      <form action={revokeMembership.bind(null, m.id)}>
                        <button type="submit" className="text-sm text-ink-2 hover:text-danger hover:underline">Revogar</button>
                      </form>
                    ) : <span className="text-[12.5px] text-ink-3">Você</span>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <InviteForm action={inviteUser} units={activeUnits} employees={employees.data ?? []} />
        </Panel>
        <p className="mt-2 text-[13px] text-ink-3">
          Novos usuários recebem um convite por e-mail. Não existe cadastro aberto: só entra quem foi convidado.
          {viewer.scopes.some((s) => s.role === "admin" && s.unitId === null) ? (
            <> Bloqueio, revisão periódica e histórico de acessos ficam em <Link href="/acessos" className="text-accent hover:underline">Controle de acesso</Link>.</>
          ) : null}
        </p>
      </section>

      <section>
        <SectionTitle>Unidades</SectionTitle>
        <Panel>
          <Table>
            <THead><tr><Th>Unidade</Th><Th>Código</Th><Th>Cidade</Th><Th>Situação</Th><Th><span className="sr-only">Ações</span></Th></tr></THead>
            <TBody>
              {(units.data ?? []).map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="tnum text-ink-2">{u.code}</Td>
                  <Td className="text-ink-2">{[u.city, u.state].filter(Boolean).join("/") || "—"}</Td>
                  <Td><Badge tone={u.active ? "ok" : "muted"}>{u.active ? "Ativa" : "Inativa"}</Badge></Td>
                  <Td className="text-right"><ToggleButton table="units" id={u.id} active={u.active} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {viewer.orgWide ? <UnitForm action={createUnit} /> : null}
        </Panel>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle>Departamentos</SectionTitle>
          <Panel>
            <ul>
              {(departments.data ?? []).map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <span className={d.active ? "flex-1 text-ink" : "flex-1 text-ink-3 line-through"}>{d.name}</span>
                  <span className="text-[13px] text-ink-3">{d.unit_id ? unitName.get(d.unit_id) : "Todas"}</span>
                  <ToggleButton table="departments" id={d.id} active={d.active} />
                </li>
              ))}
            </ul>
            <DepartmentForm action={createDepartment} units={activeUnits} />
          </Panel>
        </section>
        <section>
          <SectionTitle>Cargos</SectionTitle>
          <Panel>
            <ul>
              {(positions.data ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <span className={p.active ? "flex-1 text-ink" : "flex-1 text-ink-3 line-through"}>{p.title}</span>
                  <span className="tnum text-[13px] text-ink-3">{p.cbo ? `CBO ${p.cbo}` : ""}</span>
                  <ToggleButton table="positions" id={p.id} active={p.active} />
                </li>
              ))}
            </ul>
            <PositionForm action={createPosition} />
          </Panel>
        </section>
      </div>
    </div>
  );
}
