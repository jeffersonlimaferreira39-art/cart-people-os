import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { listLeaves, listMyLeaves, listPendingForDecision, listUpcoming } from "@/lib/data/leaves";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, formatDate } from "@/lib/format";
import type { LeaveRequest } from "@/lib/types";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Badge, type Tone } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { DecisionControls } from "./decision-row";
import { cancelLeave, decideLeave } from "./actions";

export const metadata: Metadata = { title: "Férias e ausências" };

const TONE: Record<string, Tone> = { pending: "attention", approved: "ok", rejected: "danger", cancelled: "muted" };

export default function LeavesPage(props: PageProps<"/ausencias">) {
  return (
    <>
      <PageHeader
        title="Férias e ausências"
        description="Solicitações passam pelo gestor ou pelo RH. As regras de férias da CLT são conferidas no envio."
        actions={<ButtonLink href="/ausencias/nova">Solicitar ausência</ButtonLink>}
      />
      <Suspense fallback={<TableSkeleton />}>
        <LeavesContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function Period({ l }: { l: LeaveRequest }) {
  return (
    <span className="tnum text-ink-2">
      {formatDate(l.start_date)} a {formatDate(l.end_date)}
      <span className="text-ink-3"> ({l.days} {l.days === 1 ? "dia" : "dias"}{l.sell_days ? `, ${l.sell_days} de abono` : ""})</span>
    </span>
  );
}

async function LeavesContent({ searchParams }: { searchParams: PageProps<"/ausencias">["searchParams"] }) {
  const viewer = await getViewer();
  const sp = await searchParams;
  const status = typeof sp.situacao === "string" ? sp.situacao : "all";
  const decides = viewerCan(viewer, "decideLeaves");
  const seesAll = viewerCan(viewer, "viewPeople");
  const [pending, upcoming, mine, history] = await Promise.all([
    decides ? listPendingForDecision(viewer) : Promise.resolve([]),
    seesAll ? listUpcoming(viewer) : Promise.resolve([]),
    listMyLeaves(viewer),
    seesAll ? listLeaves(viewer, { status, limit: 100 }) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-9">
      {sp.enviada ? <Notice tone="ok">Solicitação enviada. Você será avisado quando houver decisão.</Notice> : null}

      {decides ? (
        <section>
          <SectionTitle aside={<span className="tnum text-sm text-ink-3">{pending.length} pendente(s)</span>}>
            Aguardando sua decisão
          </SectionTitle>
          <Panel>
            {pending.length ? (
              <ul>
                {pending.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3.5 last:border-b-0">
                    <div className="min-w-56 flex-1">
                      <p className="font-medium text-ink">{l.employee?.full_name}</p>
                      <p className="text-sm">
                        <span className="text-ink">{LEAVE_TYPE_LABELS[l.type]}</span>, <Period l={l} />
                      </p>
                      {l.reason ? <p className="mt-0.5 text-[13px] text-ink-3">“{l.reason}”</p> : null}
                    </div>
                    <DecisionControls action={decideLeave.bind(null, l.id)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-ink-2">Nada aguardando decisão agora.</p>
            )}
          </Panel>
        </section>
      ) : null}

      {viewer.employee ? (
        <section>
          <SectionTitle>Minhas solicitações</SectionTitle>
          <Panel>
            {mine.length ? (
              <Table>
                <THead><tr><Th>Tipo</Th><Th>Período</Th><Th>Situação</Th><Th className="text-right"><span className="sr-only">Ações</span></Th></tr></THead>
                <TBody>
                  {mine.map((l) => (
                    <Tr key={l.id}>
                      <Td>{LEAVE_TYPE_LABELS[l.type]}</Td>
                      <Td><Period l={l} /></Td>
                      <Td>
                        <Badge tone={TONE[l.status]}>{LEAVE_STATUS_LABELS[l.status]}</Badge>
                        {l.decision_note ? <span className="mt-1 block text-[12.5px] text-ink-3">{l.decision_note}</span> : null}
                      </Td>
                      <Td className="text-right">
                        {l.status === "pending" ? (
                          <form action={cancelLeave.bind(null, l.id)}>
                            <button type="submit" className="text-sm text-ink-2 underline-offset-2 hover:text-danger hover:underline">
                              Cancelar solicitação
                            </button>
                          </form>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="px-4 py-5 text-ink-2">
                Você ainda não fez solicitações. <Link href="/ausencias/nova" className="text-accent hover:underline">Solicitar ausência</Link>
              </p>
            )}
          </Panel>
        </section>
      ) : null}

      {seesAll ? (
        <section>
          <SectionTitle>Próximos 45 dias</SectionTitle>
          <Panel>
            {upcoming.length ? (
              <ul className="divide-y divide-line">
                {upcoming
                  .slice()
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map((l) => (
                    <li key={l.id} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2.5">
                      <span className="tnum w-24 shrink-0 text-sm font-medium text-ink">{formatDate(l.start_date)}</span>
                      <span className="min-w-40 flex-1 text-ink">{l.employee?.full_name}</span>
                      <span className="text-sm text-ink-2">{LEAVE_TYPE_LABELS[l.type]}, até {formatDate(l.end_date)}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-ink-2">Ninguém ausente nos próximos 45 dias.</p>
            )}
          </Panel>
        </section>
      ) : null}

      {seesAll ? (
        <section>
          <SectionTitle
            aside={
              <nav aria-label="Filtrar por situação" className="flex gap-1 text-sm">
                {[["all", "Todas"], ["pending", "Pendentes"], ["approved", "Aprovadas"], ["rejected", "Recusadas"]].map(([v, l]) => (
                  <Link
                    key={v}
                    href={v === "all" ? "/ausencias" : `/ausencias?situacao=${v}`}
                    aria-current={status === v ? "page" : undefined}
                    className={cn("rounded px-2 py-1 text-ink-2 hover:bg-surface-2", status === v && "bg-surface-2 font-medium text-ink")}
                  >
                    {l}
                  </Link>
                ))}
              </nav>
            }
          >
            Histórico
          </SectionTitle>
          <Panel>
            {history.length ? (
              <Table>
                <THead><tr><Th>Colaborador</Th><Th>Tipo</Th><Th>Período</Th><Th>Situação</Th></tr></THead>
                <TBody>
                  {history.map((l) => (
                    <Tr key={l.id}>
                      <Td className="font-medium">{l.employee?.full_name}</Td>
                      <Td>{LEAVE_TYPE_LABELS[l.type]}</Td>
                      <Td><Period l={l} /></Td>
                      <Td><Badge tone={TONE[l.status]}>{LEAVE_STATUS_LABELS[l.status]}</Badge></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="px-4 py-5 text-ink-2">Nenhuma solicitação com este filtro.</p>
            )}
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
