import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer, unitLabel, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { getDashboardStats } from "@/lib/data/dashboard";
import { listMyLeaves } from "@/lib/data/leaves";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, formatDate } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Painel" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function greeting(viewer: Viewer) {
  const first = viewer.employee?.full_name.split(" ")[0];
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Fortaleza" }).format(new Date()));
  const part = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return first ? `${part}, ${first}` : part;
}

async function Dashboard() {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewPeople")) return <PersonalDashboard viewer={viewer} />;
  const s = await getDashboardStats(viewer);
  const maxDept = Math.max(1, ...s.byDepartment.map((d) => d.count));

  const attention = [
    { show: s.pendingLeaves > 0, n: s.pendingLeaves, text: "solicitação(ões) de ausência aguardando decisão", href: "/ausencias" },
    { show: s.dpSubmitted > 0, n: s.dpSubmitted, text: "movimentação(ões) do DP aguardando aprovação", href: "/dp?aba=submitted" },
    { show: s.dpReady > 0, n: s.dpReady, text: "movimentação(ões) aprovada(s) para enviar à folha", href: "/dp?aba=approved" },
    { show: s.onboarding > 0, n: s.onboarding, text: "pessoa(s) em processo de admissão", href: "/colaboradores?situacao=onboarding" },
    { show: s.expiringDocuments > 0, n: s.expiringDocuments, text: "documento(s) vencendo em 30 dias", href: "/colaboradores" },
  ].filter((a) => a.show);

  return (
    <>
      <PageHeader title={greeting(viewer)} description={`Visão de ${unitLabel(viewer).toLowerCase() === "todas as unidades" ? "todas as unidades" : unitLabel(viewer)} em ${formatDate(s.today)}.`} />

      <Panel className="mb-8">
        <dl className="grid grid-cols-2 divide-line max-sm:[&>*:nth-child(-n+2)]:border-b sm:grid-cols-4 sm:divide-x">
          {[
            ["Pessoas no quadro", s.headcount, s.onboarding ? `${s.onboarding} em admissão` : "ativos e afastados"],
            ["Admissões no mês", s.hiresThisMonth, "desde o dia 1º"],
            ["Desligamentos no mês", s.terminationsThisMonth, "desde o dia 1º"],
            ["Rotatividade em 12 meses", s.turnover12m === null ? "—" : `${s.turnover12m.toLocaleString("pt-BR")}%`, "média de entradas e saídas"],
          ].map(([label, value, note]) => (
            <div key={label as string} className="border-line px-5 py-4">
              <dt className="text-[13px] text-ink-3">{label}</dt>
              <dd className="tnum mt-1 text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">{value}</dd>
              <dd className="mt-1.5 text-[12.5px] text-ink-3">{note}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle>Precisa de atenção</SectionTitle>
          <Panel>
            {attention.length ? (
              <ul>
                {attention.map((a) => (
                  <li key={a.href + a.text} className="border-b border-line last:border-b-0">
                    <Link href={a.href} className="flex items-baseline gap-3 px-4 py-3 hover:bg-surface-2/60">
                      <span className="tnum min-w-7 text-right text-[18px] font-semibold text-brass">{a.n}</span>
                      <span className="text-ink">{a.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-ink-2">Nenhuma pendência. Tudo em dia.</p>
            )}
          </Panel>

          <SectionTitle>
            <span className="mt-8 block">Ausentes hoje</span>
          </SectionTitle>
          <Panel>
            {s.absentToday.length ? (
              <ul className="divide-y divide-line">
                {s.absentToday.map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="text-ink">{a.name}</span>
                    <span className="text-sm text-ink-3">{LEAVE_TYPE_LABELS[a.type as keyof typeof LEAVE_TYPE_LABELS]}, volta após {formatDate(a.until)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-ink-2">Ninguém ausente hoje.</p>
            )}
          </Panel>
        </section>

        <section>
          <SectionTitle>Quadro por departamento</SectionTitle>
          <Panel className="p-4">
            {s.byDepartment.length ? (
              <ul className="flex flex-col gap-2.5">
                {s.byDepartment.map((d) => (
                  <li key={d.name} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
                    <span className="truncate text-ink-2" title={d.name}>{d.name}</span>
                    <span className="h-2.5 rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(d.count / maxDept) * 100}%` }} />
                    </span>
                    <span className="tnum text-right font-medium text-ink">{d.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-3 py-2">
                <p className="text-ink-2">Ainda não há colaboradores nesta unidade.</p>
                {viewerCan(viewer, "managePeople") ? <ButtonLink href="/colaboradores/novo">Cadastrar colaborador</ButtonLink> : null}
              </div>
            )}
          </Panel>

          <SectionTitle>
            <span className="mt-8 block">Tempo de casa neste mês</span>
          </SectionTitle>
          <Panel>
            {s.workAnniversaries.length ? (
              <ul className="divide-y divide-line">
                {s.workAnniversaries.slice(0, 8).map((w) => (
                  <li key={w.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <Link href={`/colaboradores/${w.id}`} className="text-ink hover:text-accent hover:underline">{w.name}</Link>
                    <span className="tnum text-sm text-ink-3">dia {w.date.slice(8)}, {w.years} {w.years === 1 ? "ano" : "anos"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-ink-2">Nenhum aniversário de empresa neste mês.</p>
            )}
          </Panel>
        </section>
      </div>
    </>
  );
}

async function PersonalDashboard({ viewer }: { viewer: Viewer }) {
  const mine = await listMyLeaves(viewer);
  return (
    <>
      <PageHeader
        title={greeting(viewer)}
        actions={<ButtonLink href="/ausencias/nova">Solicitar ausência</ButtonLink>}
      />
      <section className="max-w-2xl">
        <SectionTitle aside={<Link href="/meus-dados" className="text-sm text-accent hover:underline">Meus dados</Link>}>
          Minhas solicitações
        </SectionTitle>
        <Panel>
          {mine.length ? (
            <ul className="divide-y divide-line">
              {mine.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block text-ink">{LEAVE_TYPE_LABELS[l.type]}</span>
                    <span className="tnum text-[13px] text-ink-3">{formatDate(l.start_date)} a {formatDate(l.end_date)}</span>
                  </span>
                  <Badge tone={l.status === "approved" ? "ok" : l.status === "pending" ? "attention" : "muted"}>{LEAVE_STATUS_LABELS[l.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-ink-2">Você ainda não fez solicitações.</p>
          )}
        </Panel>
      </section>
    </>
  );
}
