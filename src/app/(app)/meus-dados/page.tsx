import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { getEmployeeDetail } from "@/lib/data/employees";
import { getMyPayroll } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { formatPeriod } from "@/lib/format";
import { EMPLOYMENT_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, formatDate, formatMoney } from "@/lib/format";
import { formatCpf } from "@/lib/domain/documents-br";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Meus dados" };

export default function MyDataPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MyData />
    </Suspense>
  );
}

async function MyData() {
  const viewer = await getViewer();
  if (!viewer.employee) {
    return (
      <>
        <PageHeader title="Meus dados" />
        <Notice tone="attention">Seu usuário ainda não está vinculado a um cadastro de colaborador. Fale com o RH.</Notice>
      </>
    );
  }
  const period = todayIn().slice(0, 7);
  const [detail, payroll] = await Promise.all([getEmployeeDetail(viewer, viewer.employee.id), getMyPayroll(viewer, period)]);
  if (!detail) return null;
  const pay = payroll?.result.status === "calculada" ? payroll.result.totals : null;
  const { employee: e, sensitive: s } = detail;
  const rows: [string, string][] = [
    ["Matrícula", e.registration_number],
    ["Cargo", e.position?.title ?? "—"],
    ["Departamento", e.department?.name ?? "—"],
    ["Unidade", e.unit?.name ?? "—"],
    ["Gestor", e.manager?.full_name ?? "—"],
    ["Contrato", EMPLOYMENT_TYPE_LABELS[e.employment_type]],
    ["Admissão", formatDate(e.hire_date)],
    ["CPF", formatCpf(s?.cpf)],
    ["Salário base", formatMoney(s?.base_salary)],
    ["Conta para pagamento", [s?.bank_name, s?.bank_agency, s?.bank_account].filter(Boolean).join(", ") || "—"],
  ];

  return (
    <>
      <PageHeader
        title={e.social_name || e.full_name}
        description="Seus dados no People OS. Se algo estiver errado, peça a correção ao RH."
        actions={
          <>
            <ButtonLink href="/meus-dados/folha" variant="secondary">Minha folha</ButtonLink>
            <ButtonLink href="/meus-dados/senha" variant="secondary">Definir senha</ButtonLink>
            <ButtonLink href="/ausencias/nova">Solicitar ausência</ButtonLink>
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <SectionTitle>Cadastro</SectionTitle>
          <Panel>
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm text-ink-3">{k}</dt>
                  <dd className="tnum text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <p className="mt-3 text-[13px] text-ink-3">
            Você tem direito de acesso e correção dos seus dados pessoais (LGPD, art. 18).
          </p>
        </section>
        <div className="flex flex-col gap-8">
        <section>
          <SectionTitle aside={<Link href="/meus-dados/folha" className="text-sm text-accent hover:underline">Ver detalhes</Link>}>
            Minha folha
          </SectionTitle>
          <Link href="/meus-dados/folha" className="glass block rounded-[var(--radius-panel)] border border-line px-4 py-4 transition-colors hover:border-accent/50">
            <p className="eyebrow !text-[10.5px] text-ink-3">Líquido estimado · {formatPeriod(period).toLowerCase()}</p>
            <p className="mt-2 font-mono text-[26px] leading-none font-semibold text-accent">{pay ? formatMoney(pay.liquido) : "—"}</p>
            <p className="mt-2 text-[12.5px] text-ink-3">
              {pay
                ? `Proventos ${formatMoney(pay.proventos)} · descontos ${formatMoney(pay.descontos)}. O valor oficial é o do holerite.`
                : "Ainda não há dados de folha para este mês."}
            </p>
          </Link>
        </section>
        <section>
          <SectionTitle aside={<Link href="/ausencias" className="text-sm text-accent hover:underline">Ver todas</Link>}>
            Minhas ausências
          </SectionTitle>
          <Panel>
            {detail.leaves.length ? (
              <ul className="divide-y divide-line">
                {detail.leaves.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="block text-ink">{LEAVE_TYPE_LABELS[l.type]}</span>
                      <span className="tnum text-[13px] text-ink-3">{formatDate(l.start_date)} a {formatDate(l.end_date)}</span>
                    </span>
                    <Badge tone={l.status === "approved" ? "ok" : l.status === "pending" ? "attention" : "muted"}>
                      {LEAVE_STATUS_LABELS[l.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-ink-2">Nenhuma ausência registrada.</p>
            )}
          </Panel>
        </section>
        </div>
      </div>
    </>
  );
}
