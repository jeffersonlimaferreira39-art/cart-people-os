import type { PayrollResult } from "@/lib/domain/payroll";
import type { PayrollTables } from "@/lib/domain/payroll-tables";
import { formatDate, formatMoney } from "@/lib/format";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/components/ui/cn";

/** Demonstrativo da prévia (formato de holerite), com bases e avisos. */
export function Payslip({
  result,
  tables,
  compact = false,
  audience = "dp",
}: {
  result: PayrollResult;
  tables: PayrollTables;
  compact?: boolean;
  /** "titular": texto para o próprio colaborador, sem detalhes técnicos das tabelas. */
  audience?: "dp" | "titular";
}) {
  if (result.status !== "calculada") {
    return <p className="px-4 py-5 text-sm text-ink-2">{result.reason}</p>;
  }
  const t = result.totals;
  const main = result.lines.filter((l) => l.kind !== "informativo");
  const info = result.lines.filter((l) => l.kind === "informativo");
  const sources = Object.values(tables.sources);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {(compact ? ["Descrição", "Valor"] : ["Descrição", "Referência", "Proventos", "Descontos"]).map((h) => (
                <th key={h} scope="col" className={cn("eyebrow border-b border-line px-4 py-2.5 !text-[10.5px] text-ink-3", h === "Descrição" || h === "Referência" ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {main.map((l, i) =>
              compact ? (
                <tr key={l.code + i} className="border-b border-line">
                  <td className="px-4 py-2 text-ink">
                    {l.label}
                    <span className="block font-mono text-[11.5px] text-ink-3">{l.reference}</span>
                  </td>
                  <td className={cn("px-4 py-2 text-right font-mono whitespace-nowrap", l.kind === "desconto" ? "text-danger" : "text-ink")}>
                    {l.kind === "desconto" ? "−" : ""}
                    {formatMoney(l.amount)}
                  </td>
                </tr>
              ) : (
              <tr key={l.code + i} className="border-b border-line">
                <td className="px-4 py-2 text-ink">{l.label}</td>
                <td className="px-4 py-2 font-mono text-[12.5px] text-ink-3">{l.reference}</td>
                <td className="px-4 py-2 text-right font-mono text-ink">{l.kind === "provento" ? formatMoney(l.amount) : ""}</td>
                <td className="px-4 py-2 text-right font-mono text-danger">{l.kind === "desconto" ? formatMoney(l.amount) : ""}</td>
              </tr>
              ),
            )}
          </tbody>
          <tfoot>
            {compact ? (
              <>
                <tr>
                  <th scope="row" className="px-4 pt-2.5 text-left font-medium text-ink-2">Proventos</th>
                  <td className="px-4 pt-2.5 text-right font-mono text-ink">{formatMoney(t.proventos)}</td>
                </tr>
                <tr className="border-b border-line-strong">
                  <th scope="row" className="px-4 pb-2.5 text-left font-medium text-ink-2">Descontos</th>
                  <td className="px-4 pb-2.5 text-right font-mono text-danger">−{formatMoney(t.descontos)}</td>
                </tr>
              </>
            ) : (
              <tr className="border-b border-line-strong">
                <th scope="row" colSpan={2} className="px-4 py-2.5 text-left font-medium text-ink-2">Totais</th>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-ink">{formatMoney(t.proventos)}</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-danger">{formatMoney(t.descontos)}</td>
              </tr>
            )}
            <tr>
              <th scope="row" colSpan={compact ? 1 : 3} className="px-4 py-3 text-left text-[15px] font-semibold text-ink">Líquido estimado</th>
              <td className="px-4 py-3 text-right font-mono text-[17px] font-semibold text-accent">{formatMoney(t.liquido)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <dl className={cn("grid grid-cols-2 gap-px border-t border-line bg-line", !compact && "sm:grid-cols-4")}>
        {[
          ["Base INSS", t.baseInss],
          ["Base IRRF", t.baseIrrf],
          ["Base FGTS", t.baseFgts],
          ["FGTS (empresa)", t.fgts],
          ...info.filter((l) => l.code !== "FGTS" && (audience === "dp" || !l.code.endsWith("_EMPRESA"))).map((l) => [l.label, l.amount] as [string, number]),
          // Custo da empresa é informação interna do DP, não do titular.
          ...(audience === "dp"
            ? ([
                ["Benefícios (empresa)", t.beneficiosEmpresa],
                ["Custo estimado", t.custoEmpresa],
              ] as [string, number][])
            : []),
        ].map(([k, v]) => (
          <div key={k as string} className="bg-surface px-4 py-3">
            <dt className="eyebrow !text-[10px] text-ink-3">{k}</dt>
            <dd className="mt-1 font-mono text-[14px] text-ink">{formatMoney(v as number)}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 border-t border-line p-4">
        {result.warnings.map((w) => <Notice key={w} tone="attention">{w}</Notice>)}
        {audience === "titular" ? (
          <p className="text-[12px] text-ink-3">
            Estimativa calculada pelo People OS. O valor que vale é o do holerite emitido pela contabilidade, que pode
            incluir ajustes do mês. Dúvidas? Fale com o DP.
          </p>
        ) : (
        <p className="text-[12px] text-ink-3">
          Prévia para conferência, não é holerite oficial. Tabelas:{" "}
          {sources.every((s) => s === "referência")
            ? "referência 2026 do sistema (confirme com a contabilidade)"
            : `vigências ${[...new Set(sources)].map((s) => (s === "referência" ? "referência" : formatDate(s))).join(", ")}`}
          . DSR sem feriados; encargos patronais além do FGTS ficam com a contabilidade.
        </p>
        )}
      </div>
    </div>
  );
}
