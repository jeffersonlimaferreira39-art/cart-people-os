import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer, viewerCanInUnit } from "@/lib/auth/viewer";
import { getEmployeeDetail } from "@/lib/data/employees";
import { getEmployeePayroll, getPayrollPreview } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { countChildrenUnder14, ITEM_CODES } from "@/lib/domain/payroll";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/ui/access-denied";
import { Payslip } from "@/components/payroll/payslip";
import { DependentForm, ItemForm, ProfileForm, RemoveButton } from "@/components/payroll/forms";
import { addDependent, addItem, removeDependent, removeItem, saveProfile } from "../../../dp/folha/actions";

export const metadata: Metadata = { title: "Dados da folha" };

const RELATIONSHIP = { conjuge: "Cônjuge", filho: "Filho(a)", enteado: "Enteado(a)", pai_mae: "Pai/mãe", outro: "Outro" } as const;

export default function EmployeePayrollPage(props: PageProps<"/colaboradores/[id]/folha">) {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
      <Content params={props.params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/colaboradores/[id]/folha">["params"] }) {
  const { id } = await params;
  const viewer = await getViewer();
  const detail = await getEmployeeDetail(viewer, id);
  if (!detail) notFound();
  const e = detail.employee;
  if (!viewerCanInUnit(viewer, "viewSensitive", e.unit_id)) return <AccessDenied what="dados de remuneração" />;
  const period = todayIn().slice(0, 7);
  const [data, preview] = await Promise.all([getEmployeePayroll(id), getPayrollPreview(viewer, period, id)]);
  const row = preview.rows[0];
  const children = countChildrenUnder14(data.dependents, period);
  const irDeps = data.dependents.filter((d) => d.ir_dependent).length;

  return (
    <>
      <PageHeader
        eyebrow="Departamento Pessoal · folha"
        title={e.social_name || e.full_name}
        description={`Matrícula ${e.registration_number} · remuneração, benefícios, descontos e dependentes usados na prévia da folha.`}
        actions={
          <>
            <ButtonLink href={`/dp/folha/${id}?competencia=${period}`} variant="secondary">Lançamentos do mês</ButtonLink>
            <ButtonLink href={`/colaboradores/${id}`} variant="ghost">Voltar ao cadastro</ButtonLink>
          </>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <SectionTitle>Remuneração e benefícios</SectionTitle>
            <Panel>
              <ProfileForm action={saveProfile.bind(null, id)} profile={data.profile} baseSalary={data.baseSalary} notes={data.notes} />
            </Panel>
          </section>

          <section>
            <SectionTitle aside={<span className="text-[13px] text-ink-3">{children} filho(s) até 14 anos · {irDeps} dependente(s) no IR</span>}>
              Dependentes
            </SectionTitle>
            <Panel>
              {data.dependents.length ? (
                <ul className="divide-y divide-line">
                  {data.dependents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{d.full_name}</span>
                        <span className="text-[12.5px] text-ink-3">
                          {RELATIONSHIP[d.relationship as keyof typeof RELATIONSHIP] ?? d.relationship} · nascimento {formatDate(d.birth_date)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {d.ir_dependent ? <Badge tone="ok">IR</Badge> : null}
                        <RemoveButton action={removeDependent.bind(null, id, d.id)} label={`Excluir ${d.full_name}`} confirmText={`Excluir o dependente ${d.full_name}?`} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-2">Nenhum dependente. Filhos até 14 anos geram salário-família; dependentes no IR reduzem o imposto.</p>
              )}
              <DependentForm action={addDependent.bind(null, id)} />
            </Panel>
          </section>

          <section>
            <SectionTitle>Rubricas fixas</SectionTitle>
            <Panel>
              {data.items.length ? (
                <ul className="divide-y divide-line">
                  {data.items.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{it.description}</span>
                        <span className="text-[12.5px] text-ink-3">
                          {ITEM_CODES[it.code as keyof typeof ITEM_CODES]?.label ?? it.code} · {formatPeriod(it.start_period)}
                          {it.end_period ? ` até ${formatPeriod(it.end_period)}` : " em diante"}
                          {it.kind === "provento"
                            ? ` · incide: ${[it.incidence_inss && "INSS", it.incidence_irrf && "IRRF", it.incidence_fgts && "FGTS"].filter(Boolean).join(", ") || "nenhum"}`
                            : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={it.kind === "desconto" ? "font-mono text-danger" : "font-mono text-ink"}>
                          {it.kind === "desconto" ? "−" : "+"}
                          {it.percent !== null ? `${it.percent.toLocaleString("pt-BR")}%` : formatMoney(it.amount)}
                        </span>
                        <RemoveButton action={removeItem.bind(null, id, it.id)} label={`Excluir ${it.description}`} confirmText={`Excluir a rubrica ${it.description}?`} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-ink-2">Nenhuma rubrica fixa. Use para gratificações, consignado, previdência privada e outros valores mensais.</p>
              )}
              <ItemForm action={addItem.bind(null, id)} defaultPeriod={period} />
            </Panel>
          </section>
        </div>

        <aside className="min-w-0">
          <div className="xl:sticky xl:top-20">
            <SectionTitle>Prévia de {formatPeriod(period).toLowerCase()}</SectionTitle>
            <Panel>{row ? <Payslip result={row.result} tables={preview.tables} compact /> : <p className="px-4 py-5 text-sm text-ink-2">Sem vínculo na competência.</p>}</Panel>
          </div>
        </aside>
      </div>
    </>
  );
}
