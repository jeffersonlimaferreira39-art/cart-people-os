/**
 * Apuração de comissões (função pura). Regras, em ordem de prioridade por categoria:
 *   1. % da categoria definido no plano (ex.: acessórios 5%);
 *   2. % próprio do vendedor (quando cadastrado);
 *   3. % da faixa de atingimento da meta (maior faixa alcançada);
 *   4. % padrão do plano.
 * Base "venda": vendas ativas com data no mês. Base "recebimento": pagamentos
 * recebidos no mês de vendas ativas (cada pagamento leva a categoria da venda).
 * Regras comerciais da empresa: validar com o comercial e a contabilidade.
 */
import { monthBounds } from "./dates";

export type CommissionPlan = {
  base: "venda" | "recebimento";
  default_rate: number;
  tiers: { from: number; rate: number }[];
  category_rates: Record<string, number>;
};
export type SaleFact = { id: string; sale_date: string; category: string; amount: number; status: "ativa" | "cancelada" };
export type PaymentFact = { sale_id: string; paid_at: string; amount: number };

export type CommissionResult = {
  base: number;
  target: number | null;
  /** Atingimento da meta em % (null sem meta). */
  attainment: number | null;
  tierRate: number | null;
  lines: { category: string; base: number; rate: number; source: "categoria" | "vendedor" | "faixa" | "padrão"; commission: number }[];
  total: number;
  salesCount: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Maior faixa alcançada pelo atingimento (faixas em qualquer ordem). */
export function tierRateFor(tiers: CommissionPlan["tiers"], attainment: number | null): number | null {
  if (attainment === null || !tiers.length) return null;
  const reached = [...tiers].sort((a, b) => a.from - b.from).filter((t) => attainment >= t.from);
  return reached.length ? reached[reached.length - 1].rate : null;
}

export function calculateCommission(input: {
  period: string;
  plan: CommissionPlan;
  target: number | null;
  rateOverride: number | null;
  sales: SaleFact[];
  payments: PaymentFact[];
}): CommissionResult {
  const { start, end } = monthBounds(input.period);
  const active = new Map(input.sales.filter((s) => s.status === "ativa").map((s) => [s.id, s]));
  const byCategory = new Map<string, number>();
  let salesCount = 0;

  if (input.plan.base === "venda") {
    for (const s of active.values()) {
      if (s.sale_date < start || s.sale_date > end) continue;
      byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + s.amount);
      salesCount++;
    }
  } else {
    const counted = new Set<string>();
    for (const p of input.payments) {
      const s = active.get(p.sale_id);
      if (!s || p.paid_at < start || p.paid_at > end) continue;
      byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + p.amount);
      counted.add(s.id);
    }
    salesCount = counted.size;
  }

  const base = r2([...byCategory.values()].reduce((a, b) => a + b, 0));
  const target = input.target && input.target > 0 ? input.target : null;
  const attainment = target ? r2((base / target) * 100) : null;
  const tierRate = tierRateFor(input.plan.tiers, attainment);

  const lines = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, catBase]) => {
      const cat = input.plan.category_rates[category];
      const [rate, source] =
        cat !== undefined ? [cat, "categoria" as const]
        : input.rateOverride !== null ? [input.rateOverride, "vendedor" as const]
        : tierRate !== null ? [tierRate, "faixa" as const]
        : [input.plan.default_rate, "padrão" as const];
      return { category, base: r2(catBase), rate, source, commission: r2((catBase * rate) / 100) };
    });
  return { base, target, attainment, tierRate, lines, total: r2(lines.reduce((a, l) => a + l.commission, 0)), salesCount };
}
