import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FileText, Trash2 } from "lucide-react";
import { getViewer, viewerCan, viewerCanInUnit } from "@/lib/auth/viewer";
import { getEmployeeDetail } from "@/lib/data/employees";
import {
  DOCUMENT_CATEGORY_LABELS, DP_STATUS_LABELS, EMPLOYEE_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS, formatDate, formatMoney,
} from "@/lib/format";
import { DP_EVENT_LABELS } from "@/lib/integrations/payroll";
import { formatCpf, maskCpf } from "@/lib/domain/documents-br";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { DocumentUpload } from "./document-upload";
import { deleteDocument, uploadDocument } from "../actions";

export const metadata: Metadata = { title: "Colaborador" };

export default function EmployeePage(props: PageProps<"/colaboradores/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
      <EmployeeContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12.5px] text-ink-3">{k}</dt>
          <dd className="mt-0.5 break-words text-ink">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

async function EmployeeContent({
  params,
  searchParams,
}: {
  params: PageProps<"/colaboradores/[id]">["params"];
  searchParams: PageProps<"/colaboradores/[id]">["searchParams"];
}) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();
  const detail = await getEmployeeDetail(viewer, id);
  if (!detail) notFound();
  const { employee: e, sensitive: s } = detail;
  const canEdit = viewerCanInUnit(viewer, "managePeople", e.unit_id);
  const isFullSensitive = viewerCan(viewer, "viewSensitive");

  return (
    <>
      <PageHeader
        title={e.social_name || e.full_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{e.position?.title ?? "Cargo não definido"}</span>
            <span className="text-ink-3">Matrícula {e.registration_number}</span>
            <Badge tone={e.status === "active" ? "ok" : e.status === "terminated" ? "muted" : "attention"}>
              {EMPLOYEE_STATUS_LABELS[e.status]}
            </Badge>
          </span>
        }
        actions={
          canEdit ? (
            <>
              {viewerCan(viewer, "manageDp") ? (
                <ButtonLink href={`/dp/nova?colaborador=${e.id}`} variant="secondary">Nova movimentação</ButtonLink>
              ) : null}
              {viewerCanInUnit(viewer, "viewSensitive", e.unit_id) ? (
                <ButtonLink href={`/colaboradores/${e.id}/folha`} variant="secondary">Dados da folha</ButtonLink>
              ) : null}
              <ButtonLink href={`/colaboradores/${e.id}/editar`}>Editar cadastro</ButtonLink>
            </>
          ) : null
        }
      />

      {sp.aviso === "sensiveis" ? (
        <div className="mb-6"><Notice tone="attention" title="Cadastro criado, mas os dados pessoais não foram salvos.">Abra a edição e preencha novamente CPF, salário e dados bancários.</Notice></div>
      ) : sp.aviso === "admissao" ? (
        <div className="mb-6"><Notice tone="attention" title="Cadastro criado, mas a movimentação de admissão não foi aberta.">Crie a admissão em Movimentações.</Notice></div>
      ) : null}

      <div className="flex flex-col gap-8">
        <section>
          <SectionTitle>Vínculo</SectionTitle>
          <Panel>
            <Facts
              items={[
                ["Unidade", e.unit?.name],
                ["Departamento", e.department?.name],
                ["Gestor direto", e.manager ? <Link className="text-accent hover:underline" href={`/colaboradores/${e.manager.id}`}>{e.manager.full_name}</Link> : null],
                ["Contrato", EMPLOYMENT_TYPE_LABELS[e.employment_type]],
                ["Jornada", e.work_schedule],
                ["Admissão", formatDate(e.hire_date)],
                ...(e.termination_date ? ([["Desligamento", formatDate(e.termination_date)]] as [string, string][]) : []),
                ["E-mail", e.work_email],
                ["Telefone", e.phone],
                ["CBO", e.position?.cbo],
                ["Liderados diretos", detail.reports.length ? detail.reports.map((r) => r.full_name).join(", ") : "Nenhum"],
              ]}
            />
          </Panel>
        </section>

        {detail.canSeeSensitive ? (
          <section>
            <SectionTitle aside={<span className="text-[13px] text-ink-3">Dado pessoal protegido (LGPD)</span>}>
              Dados pessoais
            </SectionTitle>
            <Panel>
              {s ? (
                <Facts
                  items={[
                    ["CPF", isFullSensitive ? formatCpf(s.cpf) : maskCpf(s.cpf)],
                    ["RG", s.rg],
                    ["Nascimento", formatDate(s.birth_date)],
                    ["PIS/PASEP", s.pis],
                    ["Salário base", <span key="sal" className="tnum">{formatMoney(s.base_salary)}</span>],
                    ["Banco", [s.bank_name, s.bank_agency && `ag. ${s.bank_agency}`, s.bank_account && `cc ${s.bank_account}`].filter(Boolean).join(", ")],
                    ["Pix", s.pix_key],
                    ["Endereço", [s.address.logradouro, s.address.numero, s.address.bairro, s.address.cidade, s.address.uf].filter(Boolean).join(", ")],
                    ["Emergência", [s.emergency_contact.nome, s.emergency_contact.parentesco, s.emergency_contact.telefone].filter(Boolean).join(", ")],
                  ]}
                />
              ) : (
                <p className="p-5 text-ink-2">Dados pessoais ainda não preenchidos.</p>
              )}
            </Panel>
          </section>
        ) : null}

        <section>
          <SectionTitle aside={<Link href="/ausencias" className="text-sm text-accent hover:underline">Ver todas</Link>}>
            Férias e ausências
          </SectionTitle>
          <Panel>
            {detail.leaves.length ? (
              <Table>
                <THead><tr><Th>Tipo</Th><Th>Período</Th><Th>Dias</Th><Th>Situação</Th></tr></THead>
                <TBody>
                  {detail.leaves.map((l) => (
                    <Tr key={l.id}>
                      <Td>{LEAVE_TYPE_LABELS[l.type]}</Td>
                      <Td className="text-ink-2">{formatDate(l.start_date)} a {formatDate(l.end_date)}</Td>
                      <Td className="tnum">{l.days}{l.sell_days ? ` + ${l.sell_days} abono` : ""}</Td>
                      <Td><Badge tone={l.status === "approved" ? "ok" : l.status === "pending" ? "attention" : "muted"}>{LEAVE_STATUS_LABELS[l.status]}</Badge></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : <p className="p-5 text-ink-2">Nenhuma ausência registrada.</p>}
          </Panel>
        </section>

        {viewerCan(viewer, "viewDp") ? (
          <section>
            <SectionTitle>Movimentações do DP</SectionTitle>
            <Panel>
              {detail.dpEvents.length ? (
                <Table>
                  <THead><tr><Th>Movimentação</Th><Th>Efeito</Th><Th>Situação</Th></tr></THead>
                  <TBody>
                    {detail.dpEvents.map((d) => (
                      <Tr key={d.id}>
                        <Td><Link href={`/dp/${d.id}`} className="hover:text-accent hover:underline">{DP_EVENT_LABELS[d.type] ?? d.type}</Link></Td>
                        <Td className="text-ink-2">{formatDate(d.effective_date)}</Td>
                        <Td><Badge tone={d.status === "approved" || d.status === "exported" ? "ok" : d.status === "submitted" ? "attention" : "muted"}>{DP_STATUS_LABELS[d.status]}</Badge></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              ) : <p className="p-5 text-ink-2">Nenhuma movimentação registrada.</p>}
            </Panel>
          </section>
        ) : null}

        <section>
          <SectionTitle>Documentos</SectionTitle>
          <Panel>
            {detail.documents.length ? (
              <ul>
                {detail.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <FileText aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                    <a href={`/colaboradores/${e.id}/documentos/${d.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent hover:underline">
                      {d.file_name}
                    </a>
                    <span className="hidden text-[13px] text-ink-3 sm:inline">
                      {DOCUMENT_CATEGORY_LABELS[d.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? d.category}
                    </span>
                    {d.expires_at ? (
                      <Badge tone={d.expires_at < new Date().toISOString().slice(0, 10) ? "danger" : "neutral"}>
                        vence {formatDate(d.expires_at)}
                      </Badge>
                    ) : null}
                    {canEdit ? (
                      <form action={deleteDocument.bind(null, e.id, d.id)}>
                        <button type="submit" className="inline-flex size-8 items-center justify-center rounded text-ink-3 hover:bg-danger-soft hover:text-danger" aria-label={`Excluir ${d.file_name}`}>
                          <Trash2 className="size-4" strokeWidth={1.75} />
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="p-5 text-ink-2">Nenhum documento anexado.</p>}
            {canEdit ? <DocumentUpload action={uploadDocument.bind(null, e.id)} /> : null}
          </Panel>
        </section>
      </div>
    </>
  );
}
