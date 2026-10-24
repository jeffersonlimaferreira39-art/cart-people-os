import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { parsePeriodMonths } from "@/lib/domain/analytics";
import { formatDate } from "@/lib/format";
import { REPORTS, isReportId } from "@/lib/reports/catalog";
import { buildReport, logExport } from "@/lib/reports/build";
import { AccessDenied } from "@/components/ui/access-denied";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { TableSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Relatório" };

export default function PrintReportPage(props: PageProps<"/relatorios/[tipo]/imprimir">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <PrintReport params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PrintReport({
  params,
  searchParams,
}: {
  params: PageProps<"/relatorios/[tipo]/imprimir">["params"];
  searchParams: PageProps<"/relatorios/[tipo]/imprimir">["searchParams"];
}) {
  const { tipo } = await params;
  if (!isReportId(tipo)) notFound();
  const sp = await searchParams;
  const months = parsePeriodMonths(typeof sp.periodo === "string" ? sp.periodo : undefined);
  const viewer = await getViewer();
  const table = await buildReport(viewer, tipo, months);
  if (!table) return <AccessDenied what={REPORTS[tipo].title.toLowerCase()} />;
  const logged = await logExport(viewer, tipo, "pdf", months, table.rows.length);
  if (!logged) return <Notice tone="danger" title="Não foi possível registrar a exportação.">Tente de novo em instantes.</Notice>;
  const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }).format(new Date());

  return (
    <article className="print-report">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href={`/relatorios?periodo=${months}`} variant="ghost">
          ← Relatórios
        </ButtonLink>
        <PrintButton auto={sp.auto === "1"} />
      </div>

      <header className="mb-5 flex items-start justify-between gap-6 border-b border-line pb-4">
        <div>
          <p className="eyebrow text-accent">C&apos;Art People OS · Relatório</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">{table.title}</h1>
          <p className="mt-1 text-sm text-ink-2">{table.scope}</p>
        </div>
        <div className="text-right text-[12px] text-ink-3">
          <p>Gerado em {generatedAt}</p>
          <p>por {viewer.employee?.full_name ?? viewer.email}</p>
          <p className="font-mono">{table.rows.length} {table.rows.length === 1 ? "linha" : "linhas"}</p>
        </div>
      </header>

      {table.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th
                    key={c.header}
                    scope="col"
                    className={cn("border-b-2 border-line-strong px-2 py-2 text-left font-semibold whitespace-nowrap text-ink-2", c.kind === "number" && "text-right")}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-line break-inside-avoid">
                  {r.map((v, j) => {
                    const kind = table.columns[j]?.kind;
                    const text = v === null || v === "" ? "—" : kind === "date" ? formatDate(String(v)) : typeof v === "number" ? v.toLocaleString("pt-BR") : v;
                    return (
                      <td key={j} className={cn("px-2 py-1.5 text-ink", kind !== "text" && "font-mono whitespace-nowrap", kind === "number" && "text-right")}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-ink-2">Nenhum registro neste recorte.</p>
      )}

      <footer className="mt-6 text-[11px] text-ink-3">
        Documento interno com dados pessoais (LGPD). Não compartilhe fora das finalidades de RH e DP. Exportação registrada em {formatDate(new Date().toISOString())}.
      </footer>
    </article>
  );
}
