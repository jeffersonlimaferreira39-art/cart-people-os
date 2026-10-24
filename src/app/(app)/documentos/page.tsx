import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, unitLabel, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { listEmployeeDocuments, listOrgDocuments, type DocumentFilters } from "@/lib/data/documents";
import { listEmployees } from "@/lib/data/employees";
import { addDays, todayIn } from "@/lib/domain/dates";
import { DOCUMENT_CATEGORY_LABELS, ORG_DOCUMENT_CATEGORIES, formatDate, formatPeriod, type OrgDocumentArea } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";
import { RemoveButton } from "@/components/payroll/forms";
import { EmployeeDocumentForm, OrgDocumentForm } from "./forms";
import { deleteEmployeeDocument, deleteOrgDocument, uploadEmployeeDocument, uploadOrgDocument } from "./actions";

export const metadata: Metadata = { title: "Documentos" };

type Tab = "colaboradores" | "rh" | "dp" | "empresa";

export default function DocumentsPage(props: PageProps<"/documentos">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-24" /><TableSkeleton rows={8} /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

function tabsFor(viewer: Viewer): { id: Tab; label: string }[] {
  const staff = viewerCan(viewer, "viewSensitive");
  if (!staff) return [{ id: "empresa", label: "Documentos da empresa" }];
  return [
    ...(viewerCan(viewer, "managePeople") ? [{ id: "colaboradores" as const, label: "Colaboradores" }] : []),
    { id: "rh", label: "RH" },
    { id: "dp", label: "DP" },
  ];
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-ink-3">—</span>;
  const today = todayIn();
  if (date < today) return <Badge tone="danger">Vencido {formatDate(date)}</Badge>;
  if (date <= addDays(today, 30)) return <Badge tone="attention">Vence {formatDate(date)}</Badge>;
  return <span className="font-mono text-[12.5px] text-ink-2">{formatDate(date)}</span>;
}

async function Content({ searchParams }: { searchParams: PageProps<"/documentos">["searchParams"] }) {
  const viewer = await getViewer();
  const sp = await searchParams;
  const tabs = tabsFor(viewer);
  const tab = (tabs.find((t) => t.id === sp.aba)?.id ?? tabs[0].id) as Tab;
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filters: DocumentFilters = { q: str("q"), category: str("categoria"), expiring: sp.vencendo === "1" };
  const categories: Record<string, string> =
    tab === "colaboradores" ? DOCUMENT_CATEGORY_LABELS : tab === "rh" || tab === "dp" ? ORG_DOCUMENT_CATEGORIES[tab] : { ...ORG_DOCUMENT_CATEGORIES.rh, ...ORG_DOCUMENT_CATEGORIES.dp };

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        title="Documentos"
        description={
          tab === "empresa"
            ? "Políticas, regulamentos e comunicados que o RH e o DP compartilharam com todos."
            : `${unitLabel(viewer)} · documentos dos colaboradores e do RH/DP em armazenamento privado. Downloads por link temporário.`
        }
      />

      {tabs.length > 1 ? (
        <nav aria-label="Áreas de documentos" className="mb-5 flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-1 sm:w-fit">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/documentos?aba=${t.id}`}
              aria-current={t.id === tab ? "page" : undefined}
              className={cn("rounded-[6px] px-3 py-1.5 text-[13px] transition-colors", t.id === tab ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <form className="mb-6 flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="aba" value={tab} />
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <Input name="q" defaultValue={filters.q} placeholder={tab === "colaboradores" ? "Buscar por colaborador ou arquivo" : "Buscar por título ou arquivo"} />
        </label>
        <label>
          <span className="sr-only">Categoria</span>
          <Select name="categoria" defaultValue={filters.category ?? ""} className="w-60">
            <option value="">Todas as categorias</option>
            {Object.entries(categories).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="vencendo" value="1" defaultChecked={filters.expiring} className="size-4 accent-[var(--accent)]" />
          Vencendo em 30 dias
        </label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      {tab === "colaboradores" ? <EmployeeDocs viewer={viewer} filters={filters} /> : <OrgDocs viewer={viewer} area={tab === "empresa" ? null : tab} filters={filters} />}
    </>
  );
}

async function EmployeeDocs({ viewer, filters }: { viewer: Viewer; filters: DocumentFilters }) {
  const [docs, employees] = await Promise.all([listEmployeeDocuments(viewer, filters), listEmployees(viewer, {})]);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Enviar documento de colaborador</SectionTitle>
        <Panel>
          <EmployeeDocumentForm action={uploadEmployeeDocument} employees={employees} />
        </Panel>
      </section>
      <section>
        <SectionTitle aside={<span className="text-[13px] text-ink-3">{docs.length} documento(s)</span>}>Documentos dos colaboradores</SectionTitle>
        <Panel>
          {docs.length ? (
            <Table>
              <THead>
                <tr>
                  <Th>Colaborador</Th>
                  <Th>Arquivo</Th>
                  <Th>Categoria</Th>
                  <Th>Vencimento</Th>
                  <Th>Enviado</Th>
                  <Th><span className="sr-only">Ações</span></Th>
                </tr>
              </THead>
              <TBody>
                {docs.map((d) => (
                  <Tr key={d.id}>
                    <Td>
                      <Link href={`/colaboradores/${d.employee_id}`} className="font-medium text-ink hover:text-accent hover:underline">{d.employee?.full_name}</Link>
                      <span className="block text-[12px] text-ink-3">{d.employee?.registration_number} · {d.unit?.code}</span>
                    </Td>
                    <Td>
                      <a href={`/colaboradores/${d.employee_id}/documentos/${d.id}`} className="text-accent hover:underline">{d.file_name}</a>
                    </Td>
                    <Td className="text-ink-2">{DOCUMENT_CATEGORY_LABELS[d.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? d.category}</Td>
                    <Td><ExpiryBadge date={d.expires_at} /></Td>
                    <Td className="font-mono text-[12.5px] text-ink-3">{formatDate(d.created_at)}</Td>
                    <Td className="text-right">
                      <RemoveButton action={deleteEmployeeDocument.bind(null, d.employee_id, d.id)} label={`Excluir ${d.file_name}`} confirmText={`Excluir ${d.file_name}?`} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="Nenhum documento encontrado">Envie contratos, ASOs, certificados e documentos pessoais pelo formulário acima.</EmptyState>
          )}
        </Panel>
      </section>
    </div>
  );
}

async function OrgDocs({ viewer, area, filters }: { viewer: Viewer; area: OrgDocumentArea | null; filters: DocumentFilters }) {
  const docs = await listOrgDocuments(viewer, area, filters);
  const canManage = area ? viewerCan(viewer, area === "rh" ? "manageRhDocs" : "manageDpDocs") : false;
  const units = viewer.units.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));
  const catLabel = (a: OrgDocumentArea, c: string) => (ORG_DOCUMENT_CATEGORIES[a] as Record<string, string>)[c] ?? c;

  return (
    <div className="flex flex-col gap-8">
      {area && canManage ? (
        <section>
          <SectionTitle>Enviar documento do {area.toUpperCase()}</SectionTitle>
          <Panel>
            <OrgDocumentForm action={uploadOrgDocument.bind(null, area)} area={area} units={units} orgWide={viewer.orgWide} />
          </Panel>
        </section>
      ) : null}
      <section>
        <SectionTitle aside={<span className="text-[13px] text-ink-3">{docs.length} documento(s)</span>}>
          {area ? `Documentos do ${area.toUpperCase()}` : "Documentos compartilhados"}
        </SectionTitle>
        <Panel>
          {docs.length ? (
            <Table>
              <THead>
                <tr>
                  <Th>Documento</Th>
                  <Th>Categoria</Th>
                  <Th>Unidade</Th>
                  <Th>Competência</Th>
                  <Th>Vencimento</Th>
                  {area ? <Th>Quem vê</Th> : null}
                  <Th>Enviado</Th>
                  {canManage ? <Th><span className="sr-only">Ações</span></Th> : null}
                </tr>
              </THead>
              <TBody>
                {docs.map((d) => (
                  <Tr key={d.id}>
                    <Td>
                      <a href={`/documentos/${d.id}/arquivo`} className="font-medium text-accent hover:underline">{d.title}</a>
                      <span className="block text-[12px] text-ink-3">{d.description ?? d.file_name}</span>
                    </Td>
                    <Td className="text-ink-2">{catLabel(d.area, d.category)}</Td>
                    <Td className="text-ink-2">{d.unit?.name ?? "Todas"}</Td>
                    <Td className="text-ink-2">{d.period ? formatPeriod(d.period) : "—"}</Td>
                    <Td><ExpiryBadge date={d.expires_at} /></Td>
                    {area ? <Td>{d.visibility === "todos" ? <Badge tone="ok">Todos</Badge> : <Badge tone="muted">Restrito</Badge>}</Td> : null}
                    <Td className="font-mono text-[12.5px] text-ink-3">{formatDate(d.created_at)}</Td>
                    {canManage ? (
                      <Td className="text-right">
                        <RemoveButton action={deleteOrgDocument.bind(null, d.id)} label={`Excluir ${d.title}`} confirmText={`Excluir o documento ${d.title}?`} />
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title={area ? "Nenhum documento nesta área" : "Nenhum documento compartilhado ainda"}>
              {area
                ? area === "rh"
                  ? "Envie políticas, regulamento interno, convenção coletiva, PGR/PCMSO e materiais de treinamento."
                  : "Envie guias de recolhimento, folhas, recibos do eSocial e faturas de benefícios."
                : "Quando o RH ou o DP compartilhar um documento com todos, ele aparece aqui."}
            </EmptyState>
          )}
        </Panel>
      </section>
    </div>
  );
}
