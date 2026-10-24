import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { getEmployeePayroll, getMyPayroll, getPayrollTables, listEntries } from "@/lib/data/payroll";
import { addMonths, todayIn } from "@/lib/domain/dates";
import { ENTRY_CODES, ITEM_CODES } from "@/lib/domain/payroll";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Payslip } from "@/components/payroll/payslip";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Minha folha" };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const RELATIONSHIP = { conjuge: "Cônjuge", filho: "Filho(a)", enteado: "Enteado(a)", pai_mae: "Pai/mãe", outro: "Outro" } as const;

export default function MyPayrollPage(props: PageProps<"/meus-dados/folha">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13.5px]">
          <dt className="text-ink-2">{k}</dt>
          <dd className="text-right font-mono text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/meus-dados/folha">["searchParams"] }) {
  const viewer = await getViewer();
  if (!viewer.employee) {
    return (
      <>
        <PageHeader title="Minha folha" />
        <Notice tone="attention">Seu usuário ainda não está vinculado a um cadastro de colaborador. Fale com o RH.</Notice>
      </>
    );
  }
  const sp = await searchParams;
  const current = todayIn().slice(0, 7);
  const wanted = typeof sp.competencia === "string" ? sp.competencia : "";
  // Competência atual e as 5 anteriores; nada no futuro.
  const months = Array.from({ length: 6 }, (_, i) => addMonths(`${current}-01`, -i).slice(0, 7));
  const period = PERIOD_RE.test(wanted) && months.includes(wanted) ? wanted : current;
  const id = viewer.employee.id;
  const [row, data, entries, tables] = await Promise.all([
    getMyPayroll(viewer, period),
    getEmployeePayroll(id),
    listEntries(id, period),
    getPayrollTables(viewer, period),
  ]);
  const p = data.profile;
  const activeItems = data.items.filter((it) => it.start_period <= period && (!it.end_period || it.end_period >= period));

  const benefits: [string, string][] = [];
  if (p.vt_enabled) benefits.push(["Vale-transporte", `${formatMoney(p.vt_daily_amount)} por dia · ${p.vt_days} dias`]);
  if (p.va_monthly) benefits.push(["Vale-alimentação", `${formatMoney(p.va_monthly)} por mês`]);
  if (p.vr_monthly) benefits.push(["Vale-refeição", `${formatMoney(p.vr_monthly)} por mês`]);
  if (p.food_discount_pct) benefits.push(["Sua parte na alimentação", `${p.food_discount_pct.toLocaleString("pt-BR")}%`]);
  if (p.health_plan_employee || p.health_plan_company) benefits.push(["Plano de saúde (sua parte)", formatMoney(p.health_plan_employee)]);
  if (p.dental_plan_employee) benefits.push(["Plano odontológico", formatMoney(p.dental_plan_employee)]);
  if (p.life_insurance_employee) benefits.push(["Seguro de vida", formatMoney(p.life_insurance_employee)]);

  return (
    <>
      <PageHeader
        eyebrow="Meus dados"
        title="Minha folha"
        description="Estimativa do seu pagamento, com benefícios e descontos cadastrados pelo DP."
        actions={<ButtonLink href="/meus-dados" variant="ghost">Voltar a Meus dados</ButtonLink>}
      />

      <nav aria-label="Competência" className="mb-5 flex flex-wrap gap-1.5">
        {months.map((m) => (
          <Link
            key={m}
            href={`/meus-dados/folha?competencia=${m}`}
            aria-current={m === period ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] transition-colors",
              m === period ? "border-accent bg-accent text-accent-ink" : "border-line-strong text-ink-2 hover:border-accent/60 hover:text-ink",
            )}
          >
            {formatPeriod(m)}
          </Link>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section className="min-w-0">
          <SectionTitle>Demonstrativo estimado · {formatPeriod(period).toLowerCase()}</SectionTitle>
          <Panel>
            {row && data.baseSalary ? (
              <Payslip result={row.result} tables={tables} audience="titular" />
            ) : (
              <p className="px-4 py-5 text-sm text-ink-2">
                {row?.result.reason ?? "Ainda não há dados de folha para esta competência."} Se achar que está faltando algo, fale com o DP.
              </p>
            )}
          </Panel>
        </section>

        <aside className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>Benefícios</SectionTitle>
            <Panel>
              {benefits.length ? <Facts items={benefits} /> : <p className="px-4 py-4 text-sm text-ink-2">Nenhum benefício cadastrado.</p>}
            </Panel>
          </section>

          <section>
            <SectionTitle>Rubricas fixas</SectionTitle>
            <Panel>
              {activeItems.length ? (
                <ul className="divide-y divide-line">
                  {activeItems.map((it) => (
                    <li key={it.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                      <span className="min-w-0">
                        <span className="block text-ink">{it.description}</span>
                        <span className="text-[12px] text-ink-3">
                          {ITEM_CODES[it.code as keyof typeof ITEM_CODES]?.label ?? it.code}
                          {it.end_period ? ` · até ${formatPeriod(it.end_period).toLowerCase()}` : ""}
                        </span>
                      </span>
                      <span className={cn("font-mono whitespace-nowrap", it.kind === "desconto" ? "text-danger" : "text-ink")}>
                        {it.kind === "desconto" ? "−" : "+"}
                        {it.percent !== null ? `${it.percent.toLocaleString("pt-BR")}%` : formatMoney(it.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-2">Nenhuma rubrica fixa nesta competência.</p>
              )}
            </Panel>
          </section>

          <section>
            <SectionTitle>Lançamentos do mês</SectionTitle>
            <Panel>
              {entries.length ? (
                <ul className="divide-y divide-line">
                  {entries.map((en) => {
                    const def = ENTRY_CODES[en.code as keyof typeof ENTRY_CODES];
                    const value = def?.unit === "valor" ? formatMoney(en.amount) : `${(en.quantity ?? 0).toLocaleString("pt-BR")} ${def?.unit === "dias" ? "d" : "h"}`;
                    return (
                      <li key={en.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                        <span className="text-ink">{def?.label ?? en.code}</span>
                        <span className={cn("font-mono", def?.kind === "desconto" ? "text-danger" : "text-ink")}>{value}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-2">Nenhum lançamento manual. Horas extras do ponto entram automaticamente.</p>
              )}
            </Panel>
          </section>

          <section>
            <SectionTitle>Dependentes</SectionTitle>
            <Panel>
              {data.dependents.length ? (
                <ul className="divide-y divide-line">
                  {data.dependents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{d.full_name}</span>
                        <span className="text-[12px] text-ink-3">
                          {RELATIONSHIP[d.relationship as keyof typeof RELATIONSHIP] ?? d.relationship} · {formatDate(d.birth_date)}
                        </span>
                      </span>
                      {d.ir_dependent ? <Badge tone="ok">IR</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-2">Nenhum dependente cadastrado.</p>
              )}
            </Panel>
            <p className="mt-2 text-[12.5px] text-ink-3">
              Filhos até 14 anos dão direito a salário-família (dentro do limite de remuneração); dependentes no IR reduzem o
              imposto. Para incluir ou corrigir, envie os documentos ao DP.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
