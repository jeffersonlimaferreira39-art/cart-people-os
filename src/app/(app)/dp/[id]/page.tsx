import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { getDpEvent, getPeopleNames } from "@/lib/data/dp";
import { DP_STATUS_LABELS, formatDate, formatDateTime } from "@/lib/format";
import { DP_EVENT_LABELS } from "@/lib/integrations/payroll";
import { describePayload } from "@/lib/domain/dp-events";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { TransitionButtons } from "../dp-controls";
import { transitionDpEvent } from "../actions";

export const metadata: Metadata = { title: "Movimentação" };

export default function DpEventPage(props: PageProps<"/dp/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/dp/[id]">["params"] }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewDp")) notFound();
  const event = await getDpEvent(id);
  if (!event) notFound();
  const names = await getPeopleNames([event.created_by, event.approved_by]);
  const canManage = viewerCan(viewer, "manageDp");
  const isAuthor = event.created_by === viewer.userId;

  const options: { to: string; label: string; variant?: "primary" | "secondary" | "danger" | "ghost" }[] = [];
  if (canManage) {
    if (event.status === "draft") options.push({ to: "submitted", label: "Enviar para aprovação", variant: "primary" }, { to: "cancelled", label: "Cancelar", variant: "ghost" });
    if (event.status === "submitted") {
      if (!isAuthor) options.push({ to: "approved", label: "Aprovar", variant: "primary" }, { to: "rejected", label: "Recusar", variant: "danger" });
      options.push({ to: "draft", label: "Voltar para rascunho" }, { to: "cancelled", label: "Cancelar", variant: "ghost" });
    }
    if (event.status === "approved") options.push({ to: "cancelled", label: "Cancelar antes do envio", variant: "danger" });
  }

  const facts: [string, string][] = [
    ["Colaborador", `${event.employee.full_name} (${event.employee.registration_number})`],
    ["Unidade", event.unit?.name ?? "—"],
    ["Data de efeito", formatDate(event.effective_date)],
    ...describePayload(event.type, event.payload),
    ["Registrada por", names[event.created_by ?? ""] ?? "Usuário do sistema"],
    ["Registrada em", formatDateTime(event.created_at)],
    ...(event.approved_at ? ([["Aprovada por", names[event.approved_by ?? ""] ?? "Usuário do sistema"], ["Aprovada em", formatDateTime(event.approved_at)]] as [string, string][]) : []),
    ...(event.exported_at ? ([["Enviada à folha em", formatDateTime(event.exported_at)]] as [string, string][]) : []),
  ];

  return (
    <>
      <PageHeader
        title={DP_EVENT_LABELS[event.type] ?? event.type}
        description={<Link href={`/colaboradores/${event.employee.id}`} className="text-accent hover:underline">{event.employee.full_name}</Link>}
        actions={<Badge tone={event.status === "submitted" ? "attention" : event.status === "approved" ? "ok" : "neutral"}>{DP_STATUS_LABELS[event.status]}</Badge>}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel>
          <dl className="divide-y divide-line">
            {facts.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]">
                <dt className="text-sm text-ink-3">{k}</dt>
                <dd className="tnum text-ink">{v}</dd>
              </div>
            ))}
            {event.notes ? (
              <div className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]">
                <dt className="text-sm text-ink-3">Observações</dt>
                <dd className="whitespace-pre-line text-ink">{event.notes}</dd>
              </div>
            ) : null}
          </dl>
        </Panel>
        <aside className="flex flex-col gap-4">
          {options.length ? <TransitionButtons action={transitionDpEvent.bind(null, event.id)} options={options} /> : null}
          {event.status === "submitted" && isAuthor ? (
            <Notice tone="info">Você registrou esta movimentação; a aprovação precisa ser de outra pessoa.</Notice>
          ) : null}
          {event.status === "exported" ? (
            <Notice tone="info">Já enviada à folha. Para corrigir, registre uma nova movimentação.</Notice>
          ) : null}
        </aside>
      </div>
    </>
  );
}
