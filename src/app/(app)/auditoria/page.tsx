import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

export const metadata: Metadata = { title: "Auditoria" };

const TABLE_LABELS: Record<string, string> = {
  employees: "Colaborador",
  employee_sensitive: "Dados pessoais",
  dependents: "Dependente",
  leave_requests: "Ausência",
  dp_events: "Movimentação DP",
  payroll_export_batches: "Lote da folha",
  time_imports: "Importação de ponto",
  employee_documents: "Documento",
  memberships: "Acesso",
  units: "Unidade",
  departments: "Departamento",
  positions: "Cargo",
  organizations: "Organização",
};
const ACTION_LABELS: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Excluiu" };

export default function AuditPage(props: PageProps<"/auditoria">) {
  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Toda alteração em dados de pessoas fica registrada aqui. Em dados pessoais protegidos, registramos quais campos mudaram, sem os valores."
      />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <AuditContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function AuditContent({ searchParams }: { searchParams: PageProps<"/auditoria">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewAudit") || !viewer.orgWide) return <AccessDenied what="auditoria" />;
  const sp = await searchParams;
  const table = typeof sp.tabela === "string" && TABLE_LABELS[sp.tabela] ? sp.tabela : undefined;
  const before = typeof sp.antes === "string" && /^\d+$/.test(sp.antes) ? Number(sp.antes) : undefined;
  const supabase = await createClient();
  let q = supabase
    .from("audit_log")
    .select("id, actor_id, table_name, record_id, action, changed_fields, created_at, new_data, old_data")
    .order("id", { ascending: false })
    .limit(100);
  if (table) q = q.eq("table_name", table);
  if (before) q = q.lt("id", before);
  const { data: rows } = await q;

  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean) as string[])];
  const emails: Record<string, string> = {};
  if (actorIds.length) {
    try {
      const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
      data.users.forEach((u) => actorIds.includes(u.id) && (emails[u.id] = u.email ?? ""));
    } catch {
      /* sem chave secreta configurada: mostra apenas o identificador */
    }
  }
  const describe = (r: NonNullable<typeof rows>[number]) => {
    const d = (r.new_data ?? r.old_data) as Record<string, unknown> | null;
    const name = d?.full_name ?? d?.name ?? d?.title ?? d?.file_name ?? d?.type;
    return typeof name === "string" ? name : null;
  };

  return (
    <>
      <form className="mb-4 flex items-center gap-2">
        <label>
          <span className="sr-only">Tipo de registro</span>
          <Select name="tabela" defaultValue={table ?? ""} className="w-56">
            <option value="">Todos os registros</option>
            {Object.entries(TABLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
      <Panel>
        {rows?.length ? (
          <Table>
            <THead><tr><Th>Quando</Th><Th>Quem</Th><Th>O quê</Th><Th>Campos alterados</Th></tr></THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="tnum whitespace-nowrap text-ink-2">{formatDateTime(r.created_at)}</Td>
                  <Td className="text-ink-2">{r.actor_id ? emails[r.actor_id] || r.actor_id.slice(0, 8) : "Sistema"}</Td>
                  <Td>
                    <span className="font-medium">{ACTION_LABELS[r.action]} {TABLE_LABELS[r.table_name]?.toLowerCase() ?? r.table_name}</span>
                    {describe(r) ? <span className="block text-[12.5px] text-ink-3">{describe(r)}</span> : null}
                  </Td>
                  <Td className="max-w-80 text-[13px] text-ink-2">{r.changed_fields?.join(", ") ?? "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-ink-2">Nenhum registro encontrado.</p>
        )}
      </Panel>
      {rows && rows.length === 100 ? (
        <div className="mt-4">
          <Link
            href={`/auditoria?${new URLSearchParams({ ...(table ? { tabela: table } : {}), antes: String(rows[rows.length - 1].id) })}`}
            className="text-sm font-medium text-accent hover:underline"
          >
            Ver registros mais antigos
          </Link>
        </div>
      ) : null}
    </>
  );
}
