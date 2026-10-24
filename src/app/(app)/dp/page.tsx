import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { listBatches, listDpEvents } from "@/lib/data/dp";
import { DP_STATUS_LABELS, formatDate, formatDateTime, formatPeriod } from "@/lib/format";
import { DP_EVENT_LABELS } from "@/lib/integrations/payroll";
import { todayIn } from "@/lib/domain/dates";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Badge, type Tone } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { BatchForm, SimpleAction } from "./dp-controls";
import { createPayrollBatch, importApprovedVacationsAction } from "./actions";

export const metadata: Metadata = { title: "Movimentações do DP" };

const TONE: Record<string, Tone> = { draft: "neutral", submitted: "attention", approved: "ok", exported: "muted", rejected: "danger", cancelled: "muted" };
const TABS = [
  ["submitted", "Aguardando aprovação"],
  ["draft", "Rascunhos"],
  ["approved", "Prontas para a folha"],
  ["exported", "Enviadas"],
  ["rejected,cancelled", "Recusadas e canceladas"],
] as const;

export default function DpPage(props: PageProps<"/dp">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <DpContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DpContent({ searchParams }: { searchParams: PageProps<"/dp">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewDp")) return <AccessDenied what="movimentações do DP" />;
  const sp = await searchParams;
  const tab = typeof sp.aba === "string" && TABS.some(([v]) => v === sp.aba) ? sp.aba : "submitted";
  const canManage = viewerCan(viewer, "manageDp");
  const canExport = viewerCan(viewer, "exportPayroll");
  const [events, batches] = await Promise.all([
    listDpEvents(viewer, tab),
    canExport ? listBatches(viewer) : Promise.resolve([]),
  ]);
  const newBatch = typeof sp.lote === "string" ? batches.find((b) => b.id === sp.lote) : undefined;

  return (
    <>
      <PageHeader
        title="Movimentações do DP"
        description="Admissões, alterações, afastamentos e desligamentos conferidos aqui e enviados ao processamento oficial da folha."
        actions={canManage ? <ButtonLink href="/dp/nova">Nova movimentação</ButtonLink> : null}
      />

      {newBatch ? (
        <div className="mb-6">
          <Notice tone="ok" title={`Lote de ${formatPeriod(newBatch.period)} gerado com ${newBatch.event_count} movimentação(ões).`}>
            <a href={`/dp/lotes/${newBatch.id}`} className="font-medium text-accent hover:underline">Baixar arquivo para a contabilidade</a>
          </Notice>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Situação" className="flex flex-wrap gap-1 text-sm">
          {TABS.map(([v, l]) => (
            <Link
              key={v}
              href={`/dp?aba=${v}`}
              aria-current={tab === v ? "page" : undefined}
              className={cn("rounded px-2.5 py-1.5 text-ink-2 hover:bg-surface-2", tab === v && "bg-surface font-medium text-ink ring-1 ring-line")}
            >
              {l}
            </Link>
          ))}
        </nav>
        {canManage ? <SimpleAction action={importApprovedVacationsAction} label="Trazer férias aprovadas" /> : null}
      </div>

      <Panel>
        {events.length ? (
          <Table>
            <THead>
              <tr><Th>Colaborador</Th><Th>Movimentação</Th><Th>Data de efeito</Th><Th>Situação</Th><Th className="hidden sm:table-cell">Registrada em</Th></tr>
            </THead>
            <TBody>
              {events.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <Link href={`/dp/${e.id}`} className="font-medium text-ink hover:text-accent hover:underline">{e.employee?.full_name}</Link>
                    <span className="tnum block text-[12.5px] text-ink-3">Matrícula {e.employee?.registration_number}</span>
                  </Td>
                  <Td>{DP_EVENT_LABELS[e.type] ?? e.type}</Td>
                  <Td className="tnum text-ink-2">{formatDate(e.effective_date)}</Td>
                  <Td><Badge tone={TONE[e.status]}>{DP_STATUS_LABELS[e.status]}</Badge></Td>
                  <Td className="hidden text-ink-3 sm:table-cell">{formatDateTime(e.created_at)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="px-4 py-6 text-ink-2">Nenhuma movimentação nesta situação.</p>
        )}
      </Panel>

      {canExport ? (
        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <SectionTitle>Enviar à folha</SectionTitle>
            <p className="mb-4 max-w-[60ch] text-sm text-ink-2">
              Reúne as movimentações aprovadas até o fim da competência num arquivo para o sistema de folha ou o escritório
              contábil. O cálculo da folha, encargos e eventos do eSocial continuam com o processador oficial.
            </p>
            <BatchForm action={createPayrollBatch} defaultPeriod={todayIn().slice(0, 7)} />
          </div>
          <div>
            <SectionTitle>Lotes gerados</SectionTitle>
            <Panel>
              {batches.length ? (
                <ul>
                  {batches.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span className="flex-1">
                        <span className="block font-medium text-ink">{formatPeriod(b.period)}</span>
                        <span className="text-[12.5px] text-ink-3">{b.event_count} movimentação(ões), gerado em {formatDateTime(b.created_at)}</span>
                      </span>
                      <a href={`/dp/lotes/${b.id}`} className="inline-flex size-8 items-center justify-center rounded text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`Baixar lote de ${formatPeriod(b.period)}`}>
                        <Download className="size-4" strokeWidth={1.75} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-5 text-ink-2">Nenhum lote gerado ainda.</p>
              )}
            </Panel>
          </div>
        </section>
      ) : null}
    </>
  );
}
