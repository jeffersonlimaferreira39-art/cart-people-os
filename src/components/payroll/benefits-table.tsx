import Link from "next/link";
import type { PreviewRow } from "@/lib/data/payroll";
import { benefitsBreakdown, type BenefitsBreakdown } from "@/lib/domain/payroll-benefits";
import { formatMoney } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

const m = (v: number) => (v ? formatMoney(v) : "—");

/** Célula com dois valores: concedido/colaborador em cima, desconto/empresa embaixo. */
function Pair({ top, bottom, bottomTone = "muted" }: { top: number; bottom: number; bottomTone?: "muted" | "danger" }) {
  return (
    <td className="px-2.5 py-2.5 text-right align-top font-mono text-[12.5px] whitespace-nowrap">
      <span className="block text-ink">{m(top)}</span>
      <span className={cn("block", bottom && bottomTone === "danger" ? "text-danger" : "text-ink-3")}>{bottom ? (bottomTone === "danger" ? "−" : "") + formatMoney(bottom) : "—"}</span>
    </td>
  );
}

const HEAD: [string, string][] = [
  ["VT", "concedido / desconto"],
  ["VA/VR", "concedido / copart."],
  ["Plano de saúde", "colab. / empresa"],
  ["Odonto · seguro", "odonto / seguro"],
  ["Sindical · pensão", "sindical / pensão"],
  ["Fixos · adiant.", "fixos / adiant. + outros"],
  ["Custo empresa", "VT + VA/VR + saúde"],
  ["Descontado", "do colaborador"],
];

/** Aba "Benefícios e descontos": consolida o que cada pessoa recebe e o que é descontado. */
export function BenefitsView({ rows, period }: { rows: PreviewRow[]; period: string }) {
  const calc = rows.filter((r) => r.result.status === "calculada").map((r) => ({ row: r, b: benefitsBreakdown(r.result) }));
  const total = (k: keyof BenefitsBreakdown) => calc.reduce((a, x) => a + x.b[k], 0);
  const withBenefits = calc.filter((x) => x.b.companyTotal > 0 || x.b.employeeTotal > 0);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Custo empresa · benefícios" value={formatMoney(total("companyTotal"))} note={`${withBenefits.length} pessoa(s) com benefício ou desconto`} tone="accent" />
        <Stat label="Vale-transporte" value={formatMoney(total("vtGranted"))} note={`empresa ${formatMoney(total("vtCompany"))} · descontado ${formatMoney(total("vtDiscount"))}`} />
        <Stat label="Alimentação (VA/VR)" value={formatMoney(total("foodGranted"))} note={`empresa ${formatMoney(total("foodCompany"))} · copart. ${formatMoney(total("foodDiscount"))}`} />
        <Stat
          label="Descontado dos colaboradores"
          value={formatMoney(total("employeeTotal"))}
          note={`saúde ${formatMoney(total("healthEmployee") + total("dental"))} · fixos ${formatMoney(total("fixedDiscounts"))}`}
          tone="signal"
        />
      </div>

      <Panel>
        {withBenefits.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="eyebrow border-b border-line px-4 py-2.5 text-left !text-[10.5px] text-ink-3">Colaborador</th>
                  {HEAD.map(([h, sub]) => (
                    <th key={h} scope="col" className="border-b border-line px-3 py-2.5 text-right align-bottom">
                      <span className="eyebrow block !text-[10.5px] whitespace-nowrap text-ink-3">{h}</span>
                      <span className="block text-[11px] font-normal whitespace-nowrap text-ink-3/80">{sub}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withBenefits.map(({ row: r, b }) => (
                  <tr key={r.key} className="border-b border-line transition-colors last:border-b-0 hover:bg-accent/[0.05]">
                    <td className="px-4 py-2.5 align-top whitespace-nowrap">
                      <Link href={`/dp/folha/${r.employee.id}?competencia=${period}&tipo=mensal`} className="font-medium text-ink hover:text-accent hover:underline">
                        {r.employee.full_name}
                      </Link>
                      <span className="block text-[12px] text-ink-3">{r.employee.registration_number} · {r.employee.unit_code}</span>
                    </td>
                    <Pair top={b.vtGranted} bottom={b.vtDiscount} bottomTone="danger" />
                    <Pair top={b.foodGranted} bottom={b.foodDiscount} bottomTone="danger" />
                    <Pair top={b.healthEmployee} bottom={b.healthCompany} />
                    <Pair top={b.dental} bottom={b.lifeInsurance} />
                    <Pair top={b.unionFee} bottom={b.alimony} />
                    <Pair top={b.fixedDiscounts} bottom={b.advance + b.otherDiscounts} />
                    <td className="px-3 py-2.5 text-right align-top font-mono font-medium whitespace-nowrap text-accent">{m(b.companyTotal)}</td>
                    <td className="px-3 py-2.5 text-right align-top font-mono font-medium whitespace-nowrap text-danger">{m(b.employeeTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong">
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">Totais</th>
                  <Pair top={total("vtGranted")} bottom={total("vtDiscount")} bottomTone="danger" />
                  <Pair top={total("foodGranted")} bottom={total("foodDiscount")} bottomTone="danger" />
                  <Pair top={total("healthEmployee")} bottom={total("healthCompany")} />
                  <Pair top={total("dental")} bottom={total("lifeInsurance")} />
                  <Pair top={total("unionFee")} bottom={total("alimony")} />
                  <Pair top={total("fixedDiscounts")} bottom={total("advance") + total("otherDiscounts")} />
                  <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap text-accent">{formatMoney(total("companyTotal"))}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap text-danger">{formatMoney(total("employeeTotal"))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum benefício ou desconto nesta competência" action={<ButtonLink href="/colaboradores">Ver colaboradores</ButtonLink>}>
            Cadastre VT, VA/VR, planos e descontos em Colaboradores → Dados da folha.
          </EmptyState>
        )}
      </Panel>
      <p className="mt-3 text-[12.5px] text-ink-3">
        {calc.length - withBenefits.length > 0 ? `${calc.length - withBenefits.length} pessoa(s) sem benefício nem desconto não aparecem na lista. ` : ""}
        Valores do mês conforme a prévia mensal (VT proporcional aos dias trabalhados; férias reduzem os dias). INSS, IRRF e faltas
        ficam na aba Mensal. Use a planilha para conferir as faturas das operadoras de VT, VA/VR e planos.
      </p>
    </>
  );
}
