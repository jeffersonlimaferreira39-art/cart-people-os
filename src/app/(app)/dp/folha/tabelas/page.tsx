import type { Metadata } from "next";
import { Suspense } from "react";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { getPayrollTables, listTableVersions } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { TABLE_LABELS, type TableKind } from "@/lib/domain/payroll-tables";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { TaxTableForm } from "@/components/payroll/table-forms";
import { saveTaxTable } from "../actions";

export const metadata: Metadata = { title: "Tabelas da folha" };

const KINDS: TableKind[] = ["inss", "irrf", "salario_familia", "parametros"];

export default function TablesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewSensitive")) return <AccessDenied what="as tabelas da folha" />;
  const period = todayIn().slice(0, 7);
  const [tables, versions] = await Promise.all([getPayrollTables(viewer, period), listTableVersions(viewer)]);
  const canEdit = viewer.orgWide && viewer.roles.some((r) => r === "admin" || r === "dp");

  return (
    <>
      <PageHeader
        eyebrow="Prévia da folha"
        title="Tabelas de cálculo"
        description="INSS, IRRF, salário-família e parâmetros com vigência. A prévia usa a vigência mais recente até a competência calculada."
        actions={<ButtonLink href="/dp/folha" variant="ghost">Voltar à prévia</ButtonLink>}
      />
      <div className="mb-6">
        <Notice tone="attention" title="Confirme os valores com a contabilidade.">
          Sem vigência cadastrada, o sistema usa as tabelas de referência 2026 embutidas no código. Cadastre a vigência
          oficial (portarias do INSS, tabela da Receita) para que a prévia passe a usar os seus valores.
        </Notice>
      </div>
      <div className="flex flex-col gap-8">
        {KINDS.map((kind) => {
          const mine = versions.filter((v) => v.kind === kind);
          return (
            <section key={kind}>
              <SectionTitle aside={tables.sources[kind] === "referência" ? <Badge tone="attention">Referência do sistema</Badge> : <Badge tone="ok">Vigente desde {formatDate(tables.sources[kind])}</Badge>}>
                {TABLE_LABELS[kind]}
              </SectionTitle>
              <Panel>
                {canEdit ? (
                  <TaxTableForm kind={kind} action={saveTaxTable.bind(null, kind)} current={tables[kind]} defaultPeriod={period} />
                ) : (
                  <pre className="overflow-x-auto p-4 font-mono text-[12px] text-ink-2">{JSON.stringify(tables[kind], null, 2)}</pre>
                )}
                {mine.length ? (
                  <ul className="divide-y divide-line border-t border-line">
                    {mine.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-[13px]">
                        <span className="text-ink">Vigência {formatDate(v.valid_from)}{v.notes ? ` · ${v.notes}` : ""}</span>
                        <span className="text-ink-3">cadastrada em {formatDateTime(v.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            </section>
          );
        })}
      </div>
    </>
  );
}
