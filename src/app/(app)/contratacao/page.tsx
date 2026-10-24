import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, unitLabel, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { listAdmissions, listCandidates, listOpenings } from "@/lib/data/recruitment";
import { getLookups } from "@/lib/data/employees";
import { BOARD_STAGES, SOURCES, checklistProgress, funnel, stageLabel } from "@/lib/domain/recruitment";
import { EMPLOYMENT_TYPE_LABELS, formatDate } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { cn } from "@/components/ui/cn";
import { ActionButton } from "../comissoes/forms";
import { CandidateForm, ChecklistItem, OpeningForm } from "./forms";
import { addCandidate, completeAdmission, saveOpening, setOpeningStatus, toggleChecklist } from "./actions";

export const metadata: Metadata = { title: "Contratação" };

const TABS = [
  { id: "painel", label: "Painel" },
  { id: "vagas", label: "Vagas" },
  { id: "admissoes", label: "Admissões" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function RecruitmentPage(props: PageProps<"/contratacao">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-24" /><TableSkeleton rows={8} /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/contratacao">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewRecruitment")) return <AccessDenied what="a contratação" />;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.id === sp.aba)?.id ?? "painel") as Tab;
  const vaga = typeof sp.vaga === "string" ? sp.vaga : undefined;
  const [openings, candidates, admissions] = await Promise.all([listOpenings(viewer), listCandidates(viewer), listAdmissions(viewer)]);
  const open = openings.filter((o) => o.status === "aberta");
  const f = funnel(candidates);

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        title="Contratação"
        description={`${unitLabel(viewer)} · vagas, candidatos por etapa e admissões em andamento.`}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vagas abertas" value={open.reduce((a, o) => a + o.openings, 0)} note={`${open.length} processo(s) seletivo(s)`} tone="accent" />
        <Stat label="Candidatos ativos" value={f.active} note={`${f.counts.entrevista} em entrevista · ${f.counts.proposta} em proposta`} />
        <Stat label="Admissões em andamento" value={admissions.length} note={`${admissions.filter((a) => checklistProgress(a.checklist).complete).length} com checklist completo`} tone="attention" />
        <Stat label="Taxa de contratação" value={f.hireRate === null ? "—" : `${f.hireRate.toLocaleString("pt-BR")}%`} note="entre os processos concluídos" tone="signal" />
      </div>
      <nav aria-label="Seções" className="mb-5 flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-1 sm:w-fit">
        {TABS.map((t) => (
          <Link key={t.id} href={`/contratacao?aba=${t.id}`} aria-current={t.id === tab ? "page" : undefined}
            className={cn("rounded-[6px] px-3 py-1.5 text-[13px] transition-colors", t.id === tab ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "painel" ? <Board viewer={viewer} openings={openings} candidates={candidates} vaga={vaga} /> : null}
      {tab === "vagas" ? <Openings viewer={viewer} openings={openings} candidates={candidates} /> : null}
      {tab === "admissoes" ? <Admissions admissions={admissions} highlight={typeof sp.novo === "string" ? sp.novo : undefined} canManage={viewerCan(viewer, "managePeople")} /> : null}
    </>
  );
}

function Board({ viewer, openings, candidates, vaga }: {
  viewer: Viewer;
  openings: Awaited<ReturnType<typeof listOpenings>>;
  candidates: Awaited<ReturnType<typeof listCandidates>>;
  vaga?: string;
}) {
  const shown = candidates.filter((c) => !vaga || c.opening_id === vaga);
  const open = openings.filter((o) => o.status === "aberta");
  const closedOut = shown.filter((c) => c.stage === "reprovado" || c.stage === "desistiu").length;
  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="painel" />
        <label>
          <span className="sr-only">Vaga</span>
          <Select name="vaga" defaultValue={vaga ?? ""} className="w-80">
            <option value="">Todas as vagas</option>
            {openings.map((o) => <option key={o.id} value={o.id}>{o.title}{o.status !== "aberta" ? ` (${o.status})` : ""}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>

      <div className="grid gap-3 overflow-x-auto pb-2 [grid-template-columns:repeat(6,minmax(13rem,1fr))]">
        {BOARD_STAGES.map((stage) => {
          const list = shown.filter((c) => c.stage === stage);
          return (
            <section key={stage} className="glass flex min-h-48 flex-col rounded-[var(--radius-panel)] border border-line">
              <header className="flex items-center justify-between border-b border-line px-3 py-2">
                <h2 className="eyebrow !text-[10.5px] text-ink-2">{stageLabel(stage)}</h2>
                <span className="font-mono text-[12px] text-ink-3">{list.length}</span>
              </header>
              <ul className="flex flex-col gap-2 p-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contratacao/candidatos/${c.id}`} className="block rounded-[var(--radius-control)] border border-line bg-surface/70 px-3 py-2 transition-colors hover:border-accent/60">
                      <span className="block text-[13.5px] font-medium text-ink">{c.full_name}</span>
                      <span className="block truncate text-[12px] text-ink-3">{c.opening?.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-3">
                        {SOURCES[c.source as keyof typeof SOURCES] ?? c.source}
                        {c.resume_path ? <span className="text-accent">· currículo</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {closedOut ? <p className="text-[12.5px] text-ink-3">{closedOut} candidato(s) reprovado(s) ou desistente(s) fora do quadro — abra a vaga para ver todos.</p> : null}

      {viewerCan(viewer, "manageRecruitment") ? (
        <section>
          <SectionTitle>Cadastrar candidato</SectionTitle>
          <Panel>
            {open.length ? (
              <CandidateForm action={addCandidate} openings={open.map((o) => ({ id: o.id, label: o.title }))} defaultOpening={vaga} />
            ) : (
              <p className="p-4 text-sm text-ink-2">Abra uma vaga em <Link href="/contratacao?aba=vagas" className="text-accent hover:underline">Vagas</Link> para cadastrar candidatos.</p>
            )}
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

async function Openings({ viewer, openings, candidates }: {
  viewer: Viewer;
  openings: Awaited<ReturnType<typeof listOpenings>>;
  candidates: Awaited<ReturnType<typeof listCandidates>>;
}) {
  const canManage = viewerCan(viewer, "manageRecruitment");
  const lookups = canManage ? await getLookups(viewer) : null;
  return (
    <div className="flex flex-col gap-8">
      {lookups ? (
        <section>
          <SectionTitle>Abrir vaga</SectionTitle>
          <Panel>
            <OpeningForm
              action={saveOpening}
              units={lookups.units.map((u) => ({ id: u.id, label: u.name }))}
              departments={lookups.departments.map((d) => ({ id: d.id, label: d.name }))}
              positions={lookups.positions.map((p) => ({ id: p.id, label: p.title }))}
            />
          </Panel>
        </section>
      ) : null}
      <section>
        <SectionTitle>Vagas</SectionTitle>
        {openings.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {openings.map((o) => {
              const f = funnel(candidates.filter((c) => c.opening_id === o.id));
              return (
                <li key={o.id} className="glass rounded-[var(--radius-panel)] border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/contratacao?aba=painel&vaga=${o.id}`} className="text-[15px] font-semibold text-ink hover:text-accent">{o.title}</Link>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">
                        {o.unit?.name} · {o.department?.name ?? "sem departamento"} · {o.position?.title ?? "sem cargo"} · {EMPLOYMENT_TYPE_LABELS[o.employment_type as keyof typeof EMPLOYMENT_TYPE_LABELS]}
                      </p>
                    </div>
                    <Badge tone={o.status === "aberta" ? "ok" : o.status === "pausada" ? "attention" : "muted"}>{o.status}</Badge>
                  </div>
                  <p className="mt-3 font-mono text-[12.5px] text-ink-2">
                    {f.counts.contratado}/{o.openings} preenchida(s) · {f.active} ativo(s) · {f.total} candidato(s)
                  </p>
                  <p className="mt-1 text-[12px] text-ink-3">Aberta em {formatDate(o.created_at)}{o.closed_at ? ` · encerrada em ${formatDate(o.closed_at)}` : ""}{o.salary_range ? ` · ${o.salary_range}` : ""}</p>
                  {canManage ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {o.status !== "aberta" ? <ActionButton size="sm" label="Reabrir" action={setOpeningStatus.bind(null, o.id, "aberta")} /> : null}
                      {o.status === "aberta" ? <ActionButton size="sm" variant="ghost" label="Pausar" action={setOpeningStatus.bind(null, o.id, "pausada")} /> : null}
                      {o.status !== "encerrada" ? <ActionButton size="sm" variant="ghost" label="Encerrar" action={setOpeningStatus.bind(null, o.id, "encerrada")} confirmText="Encerrar esta vaga?" /> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Panel><EmptyState title="Nenhuma vaga ainda">Abra a primeira vaga pelo formulário acima.</EmptyState></Panel>
        )}
      </section>
    </div>
  );
}

function Admissions({ admissions, highlight, canManage }: { admissions: Awaited<ReturnType<typeof listAdmissions>>; highlight?: string; canManage: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {highlight ? <Notice tone="ok" title="Candidato contratado.">O cadastro foi criado em “Em admissão”. Complete o checklist e os dados pessoais no cadastro.</Notice> : null}
      {admissions.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {admissions.map((a) => {
            const p = checklistProgress(a.checklist);
            return (
              <li key={a.id} className={cn("glass rounded-[var(--radius-panel)] border p-4", a.id === highlight ? "border-accent" : "border-line")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/colaboradores/${a.id}`} className="text-[15px] font-semibold text-ink hover:text-accent">{a.full_name}</Link>
                    <p className="text-[12.5px] text-ink-3">{a.registration_number} · {a.unit?.code} · {a.position?.title ?? "sem cargo"} · início {formatDate(a.hire_date)}</p>
                  </div>
                  <span className="font-mono text-[13px] text-ink-2">{p.done}/{p.total}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${p.pct}%` }} />
                </div>
                <div className="mt-3">
                  {a.checklist.length ? (
                    a.checklist.map((it) =>
                      canManage ? (
                        <ChecklistItem key={it.item} label={it.label} done={it.done} toggle={toggleChecklist.bind(null, a.id, it.item)} />
                      ) : (
                        <p key={it.item} className={cn("py-1 text-[13px]", it.done ? "text-ink-3 line-through" : "text-ink")}>{it.label}</p>
                      ),
                    )
                  ) : (
                    <p className="text-[13px] text-ink-3">Sem checklist (admissão cadastrada fora da contratação).</p>
                  )}
                </div>
                {canManage ? (
                  <div className="mt-3 flex justify-end">
                    <ActionButton size="sm" variant={p.complete || !a.checklist.length ? "primary" : "secondary"} label="Concluir admissão" action={completeAdmission.bind(null, a.id)} confirmText={`Concluir a admissão de ${a.full_name}? A situação passa a ativo.`} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Panel><EmptyState title="Nenhuma admissão em andamento">Ao contratar um candidato, o cadastro e o checklist aparecem aqui.</EmptyState></Panel>
      )}
    </div>
  );
}
