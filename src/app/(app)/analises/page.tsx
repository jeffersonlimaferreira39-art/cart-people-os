import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileDown } from "lucide-react";
import { getViewer, unitLabel, viewerCan } from "@/lib/auth/viewer";
import { getAnalytics } from "@/lib/data/analytics";
import { PERIOD_OPTIONS, parsePeriodMonths } from "@/lib/domain/analytics";
import { formatDate, monthLabel } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ChartCard, Stat } from "@/components/ui/stat";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";
import { BarList, ColumnChart, DataTable, Legend, LineChart } from "@/components/charts/charts";

export const metadata: Metadata = { title: "Análises" };

const IN = { key: "in", label: "Admissões", color: "var(--series-1)" };
const OUT = { key: "out", label: "Desligamentos", color: "var(--series-2)" };

export default function AnalyticsPage(props: PageProps<"/analises">) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16 w-80" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

async function AnalyticsContent({ searchParams }: { searchParams: PageProps<"/analises">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewPeople")) return <AccessDenied what="análises" />;
  const sp = await searchParams;
  const months = parsePeriodMonths(typeof sp.periodo === "string" ? sp.periodo : undefined);
  const a = await getAnalytics(viewer, months);
  const s = a.summary;
  const labels = a.series.map((p) => monthLabel(p.period, months > 12));
  const fullLabels = a.series.map((p) => monthLabel(p.period, true));
  const hasPeople = a.series.some((p) => p.headcount > 0) || s.terminations > 0;

  return (
    <>
      <PageHeader
        eyebrow="Inteligência de pessoas"
        title="Análises"
        description={`${unitLabel(viewer)} · ${formatDate(a.from)} a ${formatDate(a.today)}. Números calculados sobre o que o seu acesso permite ver.`}
        actions={
          <>
            <nav aria-label="Período" className="flex rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-0.5">
              {PERIOD_OPTIONS.map((m) => (
                <Link
                  key={m}
                  href={`/analises?periodo=${m}`}
                  aria-current={m === months ? "page" : undefined}
                  className={cn(
                    "rounded-[6px] px-3 py-1.5 font-mono text-[12px] transition-colors",
                    m === months ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {m}M
                </Link>
              ))}
            </nav>
            <ButtonLink href={`/relatorios?periodo=${months}`} variant="secondary">
              <FileDown className="size-4" strokeWidth={1.75} />
              Exportar relatórios
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pessoas no quadro" value={s.headcount} note={s.onboarding ? `${s.onboarding} em admissão` : "ativos e afastados"} tone="accent" />
        <Stat label={`Admissões · ${months}M`} value={s.hires} note={`${s.terminations} desligamentos no período`} />
        <Stat
          label={`Rotatividade · ${months}M`}
          value={s.turnover === null ? "—" : `${s.turnover.toLocaleString("pt-BR")}%`}
          note="média de entradas e saídas sobre o quadro"
          tone="signal"
        />
        <Stat
          label="Tempo médio de casa"
          value={s.avgTenureYears === null ? "—" : `${s.avgTenureYears.toLocaleString("pt-BR")} a`}
          note={s.onLeave ? `${s.onLeave} afastado(s) hoje` : "ninguém afastado hoje"}
          tone="attention"
        />
      </div>

      {!hasPeople ? (
        <div className="glass rounded-[var(--radius-panel)] border border-line">
          <EmptyState
            title="Ainda não há dados para analisar"
            action={viewerCan(viewer, "managePeople") ? <ButtonLink href="/colaboradores/novo">Cadastrar colaborador</ButtonLink> : null}
          >
            Os gráficos aparecem assim que houver colaboradores cadastrados nesta unidade.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Evolução do quadro" subtitle="Pessoas ativas no fim de cada mês">
            <LineChart labels={labels} series={[{ key: "hc", label: "Quadro", color: "var(--series-1)", values: a.series.map((p) => p.headcount) }]} />
            <DataTable caption="Quadro por mês" head={["Mês", "Quadro"]} rows={a.series.map((p, i) => [fullLabels[i], p.headcount])} />
          </ChartCard>

          <ChartCard title="Admissões e desligamentos" subtitle="Movimento de entrada e saída por mês" legend={<Legend series={[IN, OUT]} />}>
            <ColumnChart
              labels={labels}
              series={[
                { ...IN, values: a.series.map((p) => p.hires) },
                { ...OUT, values: a.series.map((p) => p.terminations) },
              ]}
            />
            <DataTable
              caption="Admissões e desligamentos por mês"
              head={["Mês", "Admissões", "Desligamentos"]}
              rows={a.series.map((p, i) => [fullLabels[i], p.hires, p.terminations])}
            />
          </ChartCard>

          <ChartCard title="Rotatividade mensal" subtitle="Média de entradas e saídas sobre o quadro do mês, em %">
            <LineChart
              labels={labels}
              unit="%"
              series={[{ key: "to", label: "Rotatividade", color: "var(--series-2)", values: a.series.map((p) => p.turnover ?? 0) }]}
            />
            <DataTable caption="Rotatividade por mês" head={["Mês", "Rotatividade (%)"]} rows={a.series.map((p, i) => [fullLabels[i], p.turnover ?? 0])} />
          </ChartCard>

          <ChartCard title="Quadro por departamento" subtitle="Pessoas ativas hoje">
            <BarList items={a.byDepartment.map((d) => ({ label: d.label, value: d.count }))} />
          </ChartCard>

          {a.byUnit.length > 1 ? (
            <ChartCard title="Quadro por unidade" subtitle="Pessoas ativas hoje">
              <BarList items={a.byUnit.map((d) => ({ label: d.label, value: d.count }))} />
            </ChartCard>
          ) : null}

          <ChartCard title="Tempo de casa" subtitle="Distribuição do quadro ativo por faixa">
            <BarList items={a.tenure.map((d) => ({ label: d.label, value: d.count }))} limit={10} />
          </ChartCard>

          <ChartCard title="Tipo de vínculo" subtitle="Pessoas ativas hoje">
            <BarList items={a.byEmploymentType.map((d) => ({ label: d.label, value: d.count }))} />
          </ChartCard>

          <ChartCard title="Cargos" subtitle="Os cargos com mais pessoas">
            <BarList items={a.byPosition.map((d) => ({ label: d.label, value: d.count }))} />
          </ChartCard>

          <ChartCard title="Ausências aprovadas" subtitle={`Dias por tipo no período de ${months} meses`}>
            {a.leaveDays.length ? (
              <BarList items={a.leaveDays.map((d) => ({ label: d.label, value: d.days }))} unit=" d" />
            ) : (
              <p className="py-6 text-sm text-ink-3">Nenhuma ausência aprovada no período.</p>
            )}
          </ChartCard>

          {a.time ? (
            <ChartCard
              title="Ponto: horas extras e ausências"
              subtitle="Horas por mês, conforme o espelho importado"
              legend={
                <Legend
                  series={[
                    { key: "ot", label: "Horas extras", color: "var(--series-1)" },
                    { key: "ab", label: "Ausências", color: "var(--series-2)" },
                  ]}
                />
              }
            >
              {a.time.some((t) => t.overtime || t.absence) ? (
                <>
                  <ColumnChart
                    labels={labels}
                    series={[
                      { key: "ot", label: "Horas extras", color: "var(--series-1)", values: a.time.map((t) => Math.round(t.overtime / 6) / 10) },
                      { key: "ab", label: "Ausências", color: "var(--series-2)", values: a.time.map((t) => Math.round(t.absence / 6) / 10) },
                    ]}
                  />
                  <DataTable
                    caption="Horas extras e ausências por mês"
                    head={["Mês", "Horas extras (h)", "Ausências (h)"]}
                    rows={a.time.map((t, i) => [fullLabels[i], Math.round(t.overtime / 6) / 10, Math.round(t.absence / 6) / 10])}
                  />
                </>
              ) : (
                <p className="py-6 text-sm text-ink-3">Nenhum espelho de ponto importado no período.</p>
              )}
            </ChartCard>
          ) : null}
        </div>
      )}
    </>
  );
}
