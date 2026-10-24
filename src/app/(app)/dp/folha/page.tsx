import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileSpreadsheet, Settings2, Sheet } from "lucide-react";
import { getViewer, unitLabel, viewerCan } from "@/lib/auth/viewer";
import { getPayrollPreview } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { PAYROLL_KINDS, isPayrollKind } from "@/lib/domain/payroll-annual";
import { EMPLOYMENT_TYPE_LABELS, formatMoney, formatPeriod } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Input } from "@/components/ui/field";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Prévia da folha" };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function PayrollPreviewPage(props: PageProps<"/dp/folha">) {
  return (
    <Suspense fallback={<><div className="mb-6 h-24" /><TableSkeleton rows={8} /></>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/dp/folha">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewSensitive")) return <AccessDenied what="esta prévia da folha" />;
  const sp = await searchParams;
  const wanted = typeof sp.competencia === "string" ? sp.competencia : "";
  const period = PERIOD_RE.test(wanted) ? wanted : todayIn().slice(0, 7);
  const kind = typeof sp.tipo === "string" && isPayrollKind(sp.tipo) ? sp.tipo : "mensal";
  const kindLabel = PAYROLL_KINDS.find((k) => k.id === kind)!.label;
  const preview = await getPayrollPreview(viewer, period, undefined, kind);
  const calc = preview.rows.filter((r) => r.result.status === "calculada");
  const out = preview.rows.filter((r) => r.result.status !== "calculada");
  const sum = (k: keyof (typeof calc)[number]["result"]["totals"]) => calc.reduce((a, r) => a + r.result.totals[k], 0);
  const usingReference = Object.values(preview.tables.sources).some((s) => s === "referência");
  const canEditTables = viewer.orgWide && viewer.roles.some((r) => r === "admin" || r === "dp");

  return (
    <>
      <PageHeader
        eyebrow="Departamento Pessoal"
        title="Prévia da folha"
        description={`${unitLabel(viewer)} · ${kindLabel.toLowerCase()} · competência ${formatPeriod(period).toLowerCase()}. Estimativa para conferência antes do envio à contabilidade.`}
        actions={
          <>
            <form className="flex items-end gap-2" role="search">
              <input type="hidden" name="tipo" value={kind} />
              <label>
                <span className="sr-only">Competência</span>
                <Input type="month" name="competencia" defaultValue={period} className="w-40" />
              </label>
              <Button type="submit" variant="secondary">Ver</Button>
            </form>
            <a href={`/dp/folha/arquivo?competencia=${period}&tipo=${kind}&formato=xlsx`} className={buttonClasses("primary")} download>
              <FileSpreadsheet className="size-4" strokeWidth={1.75} />
              Excel
            </a>
            <a href={`/dp/folha/arquivo?competencia=${period}&tipo=${kind}&formato=csv`} className={buttonClasses("secondary")} download>
              <Sheet className="size-4" strokeWidth={1.75} />
              CSV
            </a>
            <ButtonLink href="/dp/folha/tabelas" variant="ghost">
              <Settings2 className="size-4" strokeWidth={1.75} />
              Tabelas
            </ButtonLink>
          </>
        }
      />

      <nav aria-label="Tipo de folha" className="mb-5 flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-line-strong bg-surface/60 p-1 sm:w-fit">
        {PAYROLL_KINDS.map((k) => (
          <Link
            key={k.id}
            href={`/dp/folha?competencia=${period}&tipo=${k.id}`}
            aria-current={k.id === kind ? "page" : undefined}
            className={cn(
              "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
              k.id === kind ? "bg-accent font-medium text-accent-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {k.label}
          </Link>
        ))}
      </nav>

      <div className="mb-5 flex flex-col gap-2">
        <Notice tone="attention" title="Prévia, não é a folha oficial.">
          Os valores servem para conferir antes de enviar à contabilidade, que emite holerites, guias e eSocial.
          {usingReference ? " Há tabelas de referência do sistema em uso: confirme INSS, IRRF e salário-família vigentes" : ""}
          {usingReference ? (canEditTables ? <> em <Link href="/dp/folha/tabelas" className="underline">Tabelas</Link>.</> : " com o DP.") : ""}
        </Notice>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Na prévia" value={calc.length} note={out.length ? `${out.length} fora da folha` : "todos calculados"} tone="accent" />
        <Stat label="Proventos" value={formatMoney(sum("proventos"))} note={`descontos ${formatMoney(sum("descontos"))}`} />
        <Stat label="Líquido estimado" value={formatMoney(sum("liquido"))} note={`INSS ${formatMoney(sum("inss"))} · IRRF ${formatMoney(sum("irrf"))}`} tone="signal" />
        <Stat label="Custo estimado" value={formatMoney(sum("custoEmpresa"))} note={`FGTS ${formatMoney(sum("fgts"))} · benefícios ${formatMoney(sum("beneficiosEmpresa"))}`} tone="attention" />
      </div>

      <Panel>
        {preview.rows.length ? (
          <Table>
            <THead>
              <tr>
                <Th>Colaborador</Th>
                <Th>Vínculo</Th>
                <Th className="text-right">Dias</Th>
                <Th className="text-right">Proventos</Th>
                <Th className="text-right">INSS</Th>
                <Th className="text-right">IRRF</Th>
                <Th className="text-right">Outros desc.</Th>
                <Th className="text-right">Líquido</Th>
                <Th className="text-right">FGTS</Th>
              </tr>
            </THead>
            <TBody>
              {[...calc, ...out].map(({ key, employee: e, result: r, note }) => {
                const t = r.totals;
                const ok = r.status === "calculada";
                return (
                  <Tr key={key} className={cn(!ok && "opacity-60")}>
                    <Td>
                      <Link href={`/dp/folha/${e.id}?competencia=${period}&tipo=${kind}`} className="font-medium text-ink hover:text-accent hover:underline">
                        {e.full_name}
                      </Link>
                      <span className="block text-[12px] text-ink-3">
                        {e.registration_number} · {e.unit_code}
                        {e.department ? ` · ${e.department}` : ""}
                      </span>
                      {note ? <span className="block text-[12px] text-accent">{note}</span> : null}
                      {!ok ? <span className="block text-[12px] text-brass">{r.reason}</span> : null}
                      {ok && r.warnings.length ? <span className="mt-0.5 block"><Badge tone="attention">{r.warnings.length} aviso(s)</Badge></span> : null}
                    </Td>
                    <Td className="text-ink-2">{EMPLOYMENT_TYPE_LABELS[e.employment_type as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? e.employment_type}</Td>
                    <Td className="text-right font-mono">{ok && r.paidDays ? r.paidDays : "—"}</Td>
                    <Td className="text-right font-mono">{ok ? formatMoney(t.proventos) : "—"}</Td>
                    <Td className="text-right font-mono text-ink-2">{ok ? formatMoney(t.inss) : "—"}</Td>
                    <Td className="text-right font-mono text-ink-2">{ok ? formatMoney(t.irrf) : "—"}</Td>
                    <Td className="text-right font-mono text-ink-2">{ok ? formatMoney(Math.max(0, Math.round((t.descontos - t.inss - t.irrf) * 100) / 100)) : "—"}</Td>
                    <Td className="text-right font-mono font-medium text-accent">{ok ? formatMoney(t.liquido) : "—"}</Td>
                    <Td className="text-right font-mono text-ink-2">{ok ? formatMoney(t.fgts) : "—"}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        ) : (
          kind === "ferias" ? (
            <EmptyState title="Nenhuma férias começando nesta competência" action={<ButtonLink href="/ausencias">Ver férias e ausências</ButtonLink>}>
              O recibo de férias aparece no mês de início de cada férias aprovada em Férias e ausências.
            </EmptyState>
          ) : (
            <EmptyState title="Ninguém nesta competência" action={<ButtonLink href="/colaboradores">Ver colaboradores</ButtonLink>}>
              A prévia lista quem tinha vínculo ativo no mês. Cadastre o salário em Colaboradores → Dados da folha.
            </EmptyState>
          )
        )}
      </Panel>
    </>
  );
}
