import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { listImports, monthlySummary } from "@/lib/data/time";
import { timeClockAdapters } from "@/lib/integrations/time-clock";
import { addDays, monthBounds, todayIn } from "@/lib/domain/dates";
import { formatDate, formatDateTime, formatHours, formatPeriod } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/notice";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { TimeImportForm } from "./import-form";
import { importTimeFile } from "./actions";

export const metadata: Metadata = { title: "Ponto" };

export default function TimePage(props: PageProps<"/ponto">) {
  return (
    <>
      <PageHeader
        title="Ponto"
        description="Espelho consolidado importado do sistema de ponto da empresa, para conferência, indicadores e envio à folha."
      />
      <Suspense fallback={<TableSkeleton />}>
        <TimeContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function TimeContent({ searchParams }: { searchParams: PageProps<"/ponto">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewTime")) return <AccessDenied what="ponto" />;
  const sp = await searchParams;
  const current = todayIn().slice(0, 7);
  const period = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : current;
  const canImport = viewerCan(viewer, "importTime");
  const [rows, imports] = await Promise.all([monthlySummary(viewer, period), canImport ? listImports(viewer) : Promise.resolve([])]);
  const prev = monthBounds(addDays(`${current}-01`, -1).slice(0, 7));
  const totals = rows.reduce(
    (t, r) => ({ worked: t.worked + r.worked, overtime: t.overtime + r.overtime, absence: t.absence + r.absence, night: t.night + r.night }),
    { worked: 0, overtime: 0, absence: 0, night: 0 },
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionTitle
          aside={
            <form className="flex items-center gap-2">
              <label>
                <span className="sr-only">Competência</span>
                <Input type="month" name="mes" defaultValue={period} className="h-8 w-40" />
              </label>
              <Button type="submit" variant="secondary" size="sm">Ver</Button>
              {viewerCan(viewer, "exportPayroll") && rows.length ? (
                <a href={`/ponto/resumo?mes=${period}`} className={buttonClasses("secondary", "sm")}>Baixar resumo</a>
              ) : null}
            </form>
          }
        >
          {formatPeriod(period)}
        </SectionTitle>
        <Panel>
          {rows.length ? (
            <Table className="num">
              <THead>
                <tr>
                  <Th>Colaborador</Th>
                  <Th className="text-right">Dias</Th>
                  <Th className="text-right">Trabalhadas</Th>
                  <Th className="text-right">Extras</Th>
                  <Th className="text-right">Faltas</Th>
                  <Th className="hidden text-right sm:table-cell">Noturno</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={r.employee_id}>
                    <Td>
                      <span className="font-medium">{r.full_name}</span>
                      <span className="tnum block text-[12.5px] text-ink-3">{r.registration_number}</span>
                    </Td>
                    <Td className="text-right">{r.days}</Td>
                    <Td className="text-right">{formatHours(r.worked)}</Td>
                    <Td className={r.overtime ? "text-right font-medium text-brass" : "text-right text-ink-3"}>{formatHours(r.overtime)}</Td>
                    <Td className={r.absence ? "text-right font-medium text-danger" : "text-right text-ink-3"}>{formatHours(r.absence)}</Td>
                    <Td className="hidden text-right text-ink-2 sm:table-cell">{formatHours(r.night)}</Td>
                  </Tr>
                ))}
                <tr className="bg-surface-2/70 font-medium">
                  <Td>Total</Td>
                  <Td />
                  <Td className="text-right">{formatHours(totals.worked)}</Td>
                  <Td className="text-right">{formatHours(totals.overtime)}</Td>
                  <Td className="text-right">{formatHours(totals.absence)}</Td>
                  <Td className="hidden text-right sm:table-cell">{formatHours(totals.night)}</Td>
                </tr>
              </TBody>
            </Table>
          ) : (
            <p className="px-4 py-6 text-ink-2">Nenhum registro de ponto importado para esta competência.</p>
          )}
        </Panel>
      </section>

      {canImport ? (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <SectionTitle>Importar espelho</SectionTitle>
            {viewer.selectedUnitId ? (
              <Panel>
                <TimeImportForm
                  action={importTimeFile}
                  adapters={timeClockAdapters.map(({ id, label, description }) => ({ id, label, description }))}
                  defaultStart={prev.start}
                  defaultEnd={prev.end}
                />
              </Panel>
            ) : (
              <Notice tone="attention">Escolha uma unidade no topo da página para importar o ponto dela.</Notice>
            )}
            <p className="mt-3 max-w-[64ch] text-[13px] text-ink-3">
              O registro oficial de jornada continua no sistema de ponto (Portaria MTP 671/2021). Reimportar o mesmo dia
              substitui os valores anteriores.
            </p>
          </div>
          <div>
            <SectionTitle>Últimas importações</SectionTitle>
            <Panel>
              {imports.length ? (
                <ul>
                  {imports.map((i) => (
                    <li key={i.id} className="border-b border-line px-4 py-3 last:border-b-0">
                      <p className="truncate font-medium text-ink">{i.file_name}</p>
                      <p className="text-[12.5px] text-ink-3">
                        {formatDate(i.period_start)} a {formatDate(i.period_end)}, {i.row_count} registro(s)
                        {i.rejected_count ? `, ${i.rejected_count} ignorado(s)` : ""}. {formatDateTime(i.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-5 text-ink-2">Nenhuma importação ainda.</p>
              )}
            </Panel>
          </div>
        </section>
      ) : null}
    </div>
  );
}
