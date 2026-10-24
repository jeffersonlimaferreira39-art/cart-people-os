import { describe, expect, it } from "vitest";
import { calculateCommission, tierRateFor, type CommissionPlan } from "./commissions";

const plan = (over: Partial<CommissionPlan> = {}): CommissionPlan => ({ base: "venda", default_rate: 3, tiers: [], category_rates: {}, ...over });
const sales = [
  { id: "a", sale_date: "2026-10-03", category: "planejados", amount: 20000, status: "ativa" as const },
  { id: "b", sale_date: "2026-10-20", category: "acessorios", amount: 2000, status: "ativa" as const },
  { id: "c", sale_date: "2026-10-21", category: "planejados", amount: 9000, status: "cancelada" as const },
  { id: "d", sale_date: "2026-09-28", category: "planejados", amount: 10000, status: "ativa" as const },
];
const base = { period: "2026-10", target: null, rateOverride: null, sales, payments: [] };

describe("comissões", () => {
  it("% fixo sobre as vendas do mês, sem canceladas e sem outros meses", () => {
    const r = calculateCommission({ ...base, plan: plan() });
    expect(r).toMatchObject({ base: 22000, total: 660, salesCount: 2, attainment: null });
  });

  it("faixas por meta: vale a maior faixa alcançada", () => {
    const tiers = [{ from: 100, rate: 4 }, { from: 0, rate: 2 }, { from: 80, rate: 3 }];
    expect(tierRateFor(tiers, 79.9)).toBe(2);
    expect(tierRateFor(tiers, 80)).toBe(3);
    expect(tierRateFor(tiers, 130)).toBe(4);
    const r = calculateCommission({ ...base, target: 20000, plan: plan({ tiers }) });
    expect(r).toMatchObject({ attainment: 110, tierRate: 4, total: 880 });
  });

  it("% por categoria prevalece; % do vendedor substitui faixa e padrão", () => {
    const r = calculateCommission({ ...base, target: 20000, rateOverride: 2.5, plan: plan({ category_rates: { acessorios: 5 }, tiers: [{ from: 100, rate: 4 }] }) });
    expect(r.lines).toEqual([
      { category: "planejados", base: 20000, rate: 2.5, source: "vendedor", commission: 500 },
      { category: "acessorios", base: 2000, rate: 5, source: "categoria", commission: 100 },
    ]);
    expect(r.total).toBe(600);
  });

  it("base recebimento: só o que foi pago no mês, de vendas ativas", () => {
    const r = calculateCommission({
      ...base,
      plan: plan({ base: "recebimento" }),
      payments: [
        { sale_id: "d", paid_at: "2026-10-05", amount: 5000 }, // venda de setembro, paga em outubro: conta
        { sale_id: "a", paid_at: "2026-11-05", amount: 5000 }, // pago em novembro: não conta
        { sale_id: "c", paid_at: "2026-10-22", amount: 9000 }, // venda cancelada: não conta
        { sale_id: "b", paid_at: "2026-10-25", amount: 1000 },
      ],
    });
    expect(r).toMatchObject({ base: 6000, total: 180, salesCount: 2 });
  });
});

describe("importação de vendas e recebimentos", async () => {
  const { parseSalesCsv, parsePaymentsCsv, categoryKey } = await import("./commission-import");
  it("lê vendas com cabeçalho acentuado, datas BR e valores BR; aponta linhas ruins", () => {
    const csv = "Data;Matrícula;Pedido;Cliente;Categoria;Valor\n05/10/2026;1001;P-77;Ana;Móveis Planejados;R$ 12.500,00\n31/02/2026;1002;;;;100\n2026-10-06;;P-9;;;50\n2026-10-07;1003;;;Acessórios;abc\n";
    const r = parseSalesCsv(csv);
    expect(r.rows).toEqual([
      { line: 2, sale_date: "2026-10-05", registration: "1001", order_number: "P-77", customer: "Ana", category: "moveis_planejados", amount: 12500 },
    ]);
    expect(r.issues.map((i) => [i.line, i.message])).toEqual([[3, "data inválida"], [4, "matrícula vazia"], [5, "valor inválido"]]);
    expect(categoryKey("")).toBe("geral");
  });
  it("recebimentos exigem pedido, data e valor; recusa planilha sem colunas", () => {
    const r = parsePaymentsCsv("pedido,data_pagamento,valor\nP-77,10/10/2026,4000\n");
    expect(r.rows).toEqual([{ line: 2, order_number: "P-77", registration: null, paid_at: "2026-10-10", amount: 4000 }]);
    expect(parsePaymentsCsv("pedido;valor\nP-1;10").error).toMatch(/data_pagamento/);
  });
});
