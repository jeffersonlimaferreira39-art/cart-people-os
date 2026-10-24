import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, unitLabel, viewerCan } from "@/lib/auth/viewer";
import { getLookups, listEmployees } from "@/lib/data/employees";
import { EMPLOYEE_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink, Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Input, Select } from "@/components/ui/field";

export const metadata: Metadata = { title: "Colaboradores" };

const STATUS_TONE: Record<string, Tone> = { onboarding: "attention", active: "ok", on_leave: "neutral", terminated: "muted" };

export default function EmployeesPage(props: PageProps<"/colaboradores">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-16" /><TableSkeleton /></>}>
      <EmployeesContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function EmployeesContent({ searchParams }: { searchParams: PageProps<"/colaboradores">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewPeople")) return <AccessDenied what="colaboradores" />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters = { q: str("q"), status: str("situacao"), department: str("departamento") };
  const [employees, lookups] = await Promise.all([listEmployees(viewer, filters), getLookups(viewer)]);
  const canManage = viewerCan(viewer, "managePeople");

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description={`${employees.length} ${employees.length === 1 ? "pessoa" : "pessoas"} em ${unitLabel(viewer).toLowerCase() === "todas as unidades" ? "todas as unidades" : unitLabel(viewer)}.`}
        actions={canManage ? <ButtonLink href="/colaboradores/novo">Cadastrar colaborador</ButtonLink> : null}
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar por nome ou matrícula</span>
          <Input name="q" defaultValue={filters.q} placeholder="Buscar por nome ou matrícula" />
        </label>
        <label>
          <span className="sr-only">Situação</span>
          <Select name="situacao" defaultValue={filters.status ?? ""} className="w-44">
            <option value="">Sem desligados</option>
            <option value="all">Todas as situações</option>
            {Object.entries(EMPLOYEE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Departamento</span>
          <Select name="departamento" defaultValue={filters.department ?? ""} className="w-48">
            <option value="">Todos os departamentos</option>
            {lookups.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <Panel>
        {employees.length === 0 ? (
          <EmptyState
            title={filters.q ? `Ninguém encontrado para “${filters.q}”.` : "Nenhum colaborador nesta seleção."}
            action={canManage && !filters.q ? <ButtonLink href="/colaboradores/novo">Cadastrar o primeiro colaborador</ButtonLink> : null}
          >
            {filters.q ? "Confira a grafia ou busque pela matrícula." : "Troque a unidade em foco ou ajuste os filtros."}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Nome</Th>
                <Th className="hidden sm:table-cell">Matrícula</Th>
                <Th className="hidden sm:table-cell">Cargo</Th>
                <Th className="hidden md:table-cell">Departamento</Th>
                {!viewer.selectedUnitId ? <Th className="hidden md:table-cell">Unidade</Th> : null}
                <Th className="hidden sm:table-cell">Admissão</Th>
                <Th>Situação</Th>
              </tr>
            </THead>
            <TBody>
              {employees.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <Link href={`/colaboradores/${e.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                      {e.social_name || e.full_name}
                    </Link>
                    <span className="block text-[12.5px] text-ink-3">
                      {EMPLOYMENT_TYPE_LABELS[e.employment_type]}
                      <span className="sm:hidden">, {e.position?.title ?? "sem cargo"}, matrícula {e.registration_number}</span>
                    </span>
                  </Td>
                  <Td className="hidden text-ink-2 sm:table-cell">{e.registration_number}</Td>
                  <Td className="hidden text-ink-2 sm:table-cell">{e.position?.title ?? "—"}</Td>
                  <Td className="hidden text-ink-2 md:table-cell">{e.department?.name ?? "—"}</Td>
                  {!viewer.selectedUnitId ? <Td className="hidden text-ink-2 md:table-cell">{e.unit?.name}</Td> : null}
                  <Td className="hidden text-ink-2 sm:table-cell">{formatDate(e.hire_date)}</Td>
                  <Td><Badge tone={STATUS_TONE[e.status]}>{EMPLOYEE_STATUS_LABELS[e.status]}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
