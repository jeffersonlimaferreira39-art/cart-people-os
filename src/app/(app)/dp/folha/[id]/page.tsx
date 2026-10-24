import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer, viewerCanInUnit } from "@/lib/auth/viewer";
import { getEmployeeDetail } from "@/lib/data/employees";
import { getPayrollPreview, listEntries } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { ENTRY_CODES } from "@/lib/domain/payroll";
import { formatMoney, formatPeriod } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Payslip } from "@/components/payroll/payslip";
import { EntryForm, RemoveButton } from "@/components/payroll/forms";
import { addEntry, removeEntry } from "../actions";

export const metadata: Metadata = { title: "Prévia do colaborador" };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function EmployeePreviewPage(props: PageProps<"/dp/folha/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/dp/folha/[id]">["params"];
  searchParams: PageProps<"/dp/folha/[id]">["searchParams"];
}) {
  const { id } = await params;
  const sp = await searchParams;
  const wanted = typeof sp.competencia === "string" ? sp.competencia : "";
  const period = PERIOD_RE.test(wanted) ? wanted : todayIn().slice(0, 7);
  const viewer = await getViewer();
  const detail = await getEmployeeDetail(viewer, id);
  if (!detail) notFound();
  const e = detail.employee;
  if (!viewerCanInUnit(viewer, "viewSensitive", e.unit_id)) return <AccessDenied what="esta prévia da folha" />;
  const [preview, entries] = await Promise.all([getPayrollPreview(viewer, period, id), listEntries(id, period)]);
  const row = preview.rows[0];

  return (
    <>
      <PageHeader
        eyebrow={`Prévia da folha · ${formatPeriod(period).toLowerCase()}`}
        title={e.social_name || e.full_name}
        description={`Matrícula ${e.registration_number}${row ? ` · ${row.childrenUnder14} filho(s) até 14 anos · ${row.irrfDependents} dependente(s) no IR` : ""}`}
        actions={
          <>
            <form className="flex items-end gap-2">
              <input type="month" name="competencia" defaultValue={period} aria-label="Competência"
                className="h-9 rounded-[var(--radius-control)] border border-line-strong bg-surface/80 px-3 text-sm text-ink" />
              <button type="submit" className="h-9 rounded-[var(--radius-control)] border border-line-strong px-3 text-sm text-ink hover:border-accent/60">Ver</button>
            </form>
            <ButtonLink href={`/colaboradores/${id}/folha`} variant="secondary">Dados da folha</ButtonLink>
            <ButtonLink href={`/dp/folha?competencia=${period}`} variant="ghost">Voltar à prévia</ButtonLink>
          </>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <section className="min-w-0">
          <SectionTitle>Demonstrativo estimado</SectionTitle>
          <Panel>{row ? <Payslip result={row.result} tables={preview.tables} /> : <p className="px-4 py-5 text-sm text-ink-2">Sem vínculo na competência.</p>}</Panel>
        </section>

        <section className="min-w-0">
          <SectionTitle>Lançamentos do mês</SectionTitle>
          <Panel>
            {entries.length ? (
              <ul className="divide-y divide-line">
                {entries.map((en) => {
                  const def = ENTRY_CODES[en.code as keyof typeof ENTRY_CODES];
                  const value = def?.unit === "valor" ? formatMoney(en.amount) : `${(en.quantity ?? 0).toLocaleString("pt-BR")} ${def?.unit === "dias" ? "d" : "h"}`;
                  return (
                    <li key={en.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-ink">{def?.label ?? en.code}</span>
                        {en.notes ? <span className="block truncate text-[12.5px] text-ink-3">{en.notes}</span> : null}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={def?.kind === "desconto" ? "font-mono text-danger" : "font-mono text-ink"}>{value}</span>
                        <RemoveButton action={removeEntry.bind(null, id, en.id)} label="Excluir lançamento" confirmText="Excluir este lançamento?" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-ink-2">
                Nenhum lançamento manual. Horas extras e noturnas do ponto importado entram automaticamente.
              </p>
            )}
            <EntryForm action={addEntry.bind(null, id)} period={period} />
          </Panel>
        </section>
      </div>
    </>
  );
}
