import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { getCandidate } from "@/lib/data/recruitment";
import { getLookups } from "@/lib/data/employees";
import { todayIn, addDays } from "@/lib/domain/dates";
import { SOURCES, stageLabel } from "@/lib/domain/recruitment";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { ActionButton } from "../../../comissoes/forms";
import { HireForm, MoveForm } from "../../forms";
import { deleteCandidate, hireCandidate, moveCandidateForm } from "../../actions";

export const metadata: Metadata = { title: "Candidato" };

export default function CandidatePage(props: PageProps<"/contratacao/candidatos/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/contratacao/candidatos/[id]">["params"] }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewRecruitment")) return <AccessDenied what="candidatos" />;
  const data = await getCandidate(id);
  if (!data) notFound();
  const { candidate: c, events, opening } = data;
  const canManage = viewerCan(viewer, "manageRecruitment");
  const canHire = canManage && viewerCan(viewer, "managePeople") && (c.stage === "aprovado" || c.stage === "proposta");
  const lookups = canHire ? await getLookups(viewer) : null;
  const tone = c.stage === "contratado" ? "ok" : c.stage === "reprovado" || c.stage === "desistiu" ? "muted" : "attention";

  return (
    <>
      <PageHeader
        eyebrow={`Candidato · ${opening?.title ?? ""}`}
        title={c.full_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={tone}>{stageLabel(c.stage)}</Badge>
            <span>{SOURCES[c.source as keyof typeof SOURCES] ?? c.source}</span>
            <span className="text-ink-3">consentimento em {formatDate(c.consent_at)}</span>
          </span>
        }
        actions={
          <>
            {c.resume_path ? <a href={`/contratacao/candidatos/${c.id}/curriculo`} className="text-sm text-accent hover:underline">Baixar currículo</a> : null}
            {c.hired_employee_id ? <ButtonLink href={`/colaboradores/${c.hired_employee_id}`} variant="secondary">Ver cadastro</ButtonLink> : null}
            <ButtonLink href={`/contratacao?aba=painel&vaga=${c.opening_id}`} variant="ghost">Voltar ao painel</ButtonLink>
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>Dados</SectionTitle>
            <Panel>
              <dl className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
                {[["E-mail", c.email], ["Telefone", c.phone], ["Vaga", opening?.title], ["Unidade", opening?.unit?.name], ["Cadastrado em", formatDate(c.created_at)], ["Observações", c.notes]].map(([k, v]) => (
                  <div key={k as string}><dt className="text-[12.5px] text-ink-3">{k}</dt><dd className="mt-0.5 break-words text-ink">{v || "—"}</dd></div>
                ))}
              </dl>
            </Panel>
          </section>
          {canManage && c.stage !== "contratado" ? (
            <section>
              <SectionTitle>Mover no funil</SectionTitle>
              <Panel><MoveForm action={moveCandidateForm.bind(null, c.id)} current={c.stage} /></Panel>
            </section>
          ) : null}
          {canHire && lookups ? (
            <section>
              <SectionTitle>Contratar</SectionTitle>
              <Panel>
                <HireForm
                  action={hireCandidate.bind(null, c.id)}
                  departments={lookups.departments.map((d) => ({ id: d.id, label: d.name }))}
                  positions={lookups.positions.map((p) => ({ id: p.id, label: p.title }))}
                  defaults={{ department_id: opening?.department_id ?? null, position_id: opening?.position_id ?? null, hire_date: addDays(todayIn(), 7) }}
                />
              </Panel>
            </section>
          ) : null}
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>Histórico</SectionTitle>
            <Panel>
              <ol className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id} className="px-4 py-2.5 text-[13px]">
                    <span className="block text-ink">
                      {e.from_stage === e.to_stage ? "Anotação" : e.from_stage ? `${stageLabel(e.from_stage)} → ${stageLabel(e.to_stage)}` : `Cadastrado em ${stageLabel(e.to_stage)}`}
                    </span>
                    {e.note ? <span className="block text-ink-2">{e.note}</span> : null}
                    <span className="font-mono text-[11.5px] text-ink-3">{formatDateTime(e.created_at)}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </section>
          {canManage && c.stage !== "contratado" ? (
            <section>
              <SectionTitle>LGPD</SectionTitle>
              <p className="mb-2 text-[12.5px] text-ink-3">Exclua os dados quando o processo terminar sem contratação ou se o candidato pedir.</p>
              <ActionButton variant="danger" label="Excluir candidato e currículo" action={deleteCandidate.bind(null, c.id)} confirmText={`Excluir definitivamente ${c.full_name} e o currículo?`} />
            </section>
          ) : null}
          <p className="text-[12px] text-ink-3"><Link href="/contratacao?aba=admissoes" className="text-accent hover:underline">Admissões em andamento</Link></p>
        </aside>
      </div>
    </>
  );
}
