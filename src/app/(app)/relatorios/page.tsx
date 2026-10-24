import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileSpreadsheet, FileText, Sheet } from "lucide-react";
import { getViewer, unitLabel, viewerCan } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_OPTIONS, parsePeriodMonths } from "@/lib/domain/analytics";
import { formatDateTime } from "@/lib/format";
import { REPORTS, isReportId, type ReportId } from "@/lib/reports/catalog";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Relatórios" };

const FORMAT_LABELS = { xlsx: "Excel", csv: "CSV", pdf: "PDF" } as const;

export default function ReportsPage(props: PageProps<"/relatorios">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReportsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ReportsContent({ searchParams }: { searchParams: PageProps<"/relatorios">["searchParams"] }) {
  const viewer = await getViewer();
  const available = (Object.keys(REPORTS) as ReportId[]).filter((id) => viewerCan(viewer, REPORTS[id].capability));
  if (!available.length) return <AccessDenied what="relatórios" />;
  const sp = await searchParams;
  const months = parsePeriodMonths(typeof sp.periodo === "string" ? sp.periodo : undefined);
  const where = unitLabel(viewer).toLowerCase() === "todas as unidades" ? "todas as unidades" : unitLabel(viewer);

  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("report_exports")
    .select("id, report, format, row_count, created_at")
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <>
      <PageHeader
        eyebrow="Exportação"
        title="Relatórios"
        description={`Recorte: ${where}. Troque a unidade no topo da página. Toda exportação fica registrada (LGPD).`}
        actions={
          <nav aria-label="Período" className="flex rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-0.5">
            {PERIOD_OPTIONS.map((m) => (
              <Link
                key={m}
                href={`/relatorios?periodo=${m}`}
                aria-current={m === months ? "page" : undefined}
                className={cn(
                  "rounded-[6px] px-3 py-1.5 font-mono text-[12px] transition-colors",
                  m === months ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {m} meses
              </Link>
            ))}
          </nav>
        }
      />

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {available.map((id) => {
          const r = REPORTS[id];
          const q = `periodo=${months}`;
          return (
            <li key={id} className="glass group flex flex-col rounded-[var(--radius-panel)] border border-line p-4 transition-colors hover:border-accent/50">
              <p className="eyebrow !text-[10px] text-ink-3">{r.usesPeriod ? `Últimos ${months} meses` : "Posição atual"}</p>
              <h2 className="mt-1.5 text-[15.5px] font-semibold text-ink">{r.title}</h2>
              <p className="mt-1 flex-1 text-[13px] text-ink-2">{r.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/relatorios/${id}/arquivo?formato=xlsx&${q}`} className={buttonClasses("primary", "sm")} download>
                  <FileSpreadsheet className="size-3.5" strokeWidth={1.75} />
                  Excel
                </a>
                <a href={`/relatorios/${id}/arquivo?formato=csv&${q}`} className={buttonClasses("secondary", "sm")} download>
                  <Sheet className="size-3.5" strokeWidth={1.75} />
                  CSV
                </a>
                <a href={`/relatorios/${id}/imprimir?${q}&auto=1`} target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}>
                  <FileText className="size-3.5" strokeWidth={1.75} />
                  PDF
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-8 max-w-2xl">
        <SectionTitle>Suas últimas exportações</SectionTitle>
        <Panel>
          {recent?.length ? (
            <ul className="divide-y divide-line">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <span className="text-ink">{isReportId(e.report) ? REPORTS[e.report].title : e.report}</span>
                  <span className="flex items-center gap-3 text-ink-3">
                    <span className="font-mono">{FORMAT_LABELS[e.format as keyof typeof FORMAT_LABELS] ?? e.format}</span>
                    <span className="font-mono">{e.row_count} linhas</span>
                    <span>{formatDateTime(e.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-ink-2">Nenhuma exportação ainda.</p>
          )}
        </Panel>
      </section>
    </>
  );
}
