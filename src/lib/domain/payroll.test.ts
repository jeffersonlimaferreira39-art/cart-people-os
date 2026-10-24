import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE, calcInss, calcIrrf, calculatePayroll, countChildrenUnder14, paidDaysInPeriod, workCalendar,
  type PayrollInput,
} from "./payroll";
import { REFERENCE_TABLES } from "./payroll-tables";

const base = (over: Partial<PayrollInput> = {}): PayrollInput => ({
  period: "2026-10",
  employmentType: "clt",
  hireDate: "2024-01-10",
  terminationDate: null,
  baseSalary: 3000,
  profile: DEFAULT_PROFILE,
  items: [],
  entries: [],
  irrfDependents: 0,
  childrenUnder14: 0,
  tables: REFERENCE_TABLES,
  ...over,
});
const line = (r: ReturnType<typeof calculatePayroll>, code: string) => r.lines.find((l) => l.code === code)?.amount;

describe("prévia de folha — tributos (tabelas de referência 2026)", () => {
  it("INSS progressivo por faixas e limitado ao teto", () => {
    expect(calcInss(3000, REFERENCE_TABLES.inss)).toBe(248.6);
    expect(calcInss(8000, REFERENCE_TABLES.inss)).toBe(921.51);
    expect(calcInss(20000, REFERENCE_TABLES.inss)).toBe(calcInss(8475.55, REFERENCE_TABLES.inss));
  });

  it("IRRF escolhe o menor imposto entre deduções legais e desconto simplificado", () => {
    // R$ 8.000: deduções legais vencem; acima da faixa de redução.
    expect(calcIrrf(8000, 921.51, REFERENCE_TABLES.irrf)).toMatchObject({ tax: 1037.85, method: "legal", reduction: 0 });
    // R$ 3.000: o simplificado zera o imposto.
    expect(calcIrrf(3000, 248.6, REFERENCE_TABLES.irrf)).toMatchObject({ tax: 0, method: "simplificado" });
  });

  it("IRRF com redução: zera até R$ 5.000 e reduz parcialmente até R$ 7.350", () => {
    expect(calcIrrf(4500, 431.51, REFERENCE_TABLES.irrf).tax).toBe(0);
    const r = calcIrrf(6000, 641.51, REFERENCE_TABLES.irrf);
    expect(r).toMatchObject({ method: "legal", reduction: 179.75, tax: 385.1 });
  });
});

describe("prévia de folha — cálculo do colaborador", () => {
  it("salário cheio: INSS, líquido e FGTS", () => {
    const r = calculatePayroll(base());
    expect(r.status).toBe("calculada");
    expect(r.totals).toMatchObject({ proventos: 3000, inss: 248.6, irrf: 0, liquido: 2751.4, fgts: 240, baseFgts: 3000 });
  });

  it("vale-transporte limitado a 6% do salário e custo da empresa", () => {
    const r = calculatePayroll(base({ profile: { ...DEFAULT_PROFILE, vt_enabled: true, vt_daily_amount: 10, vt_days: 22 } }));
    expect(line(r, "VT")).toBe(180);
    expect(line(r, "VT_INFO")).toBe(220);
    expect(r.totals.beneficiosEmpresa).toBe(40);
    // Dias informados no mês substituem o padrão do cadastro.
    const r2 = calculatePayroll(base({
      profile: { ...DEFAULT_PROFILE, vt_enabled: true, vt_daily_amount: 10, vt_days: 22 },
      entries: [{ code: "VT_DIAS", quantity: 10, amount: null }],
    }));
    expect(line(r2, "VT")).toBe(100);
  });

  it("alimentação com coparticipação, planos e descontos fixos", () => {
    const r = calculatePayroll(base({
      profile: { ...DEFAULT_PROFILE, va_monthly: 600, food_discount_pct: 10, health_plan_employee: 150, health_plan_company: 300, union_fee: 30 },
      items: [{ kind: "desconto", code: "EMPRESTIMO_CONSIGNADO", description: "Consignado", amount: 250, percent: null,
        incidence_inss: false, incidence_irrf: false, incidence_fgts: false, start_period: "2026-01", end_period: null }],
    }));
    expect(line(r, "VA")).toBe(60);
    expect(line(r, "PLANO_SAUDE")).toBe(150);
    expect(line(r, "EMPRESTIMO_CONSIGNADO")).toBe(250);
    expect(r.totals.baseInss).toBe(3000);
    expect(r.totals.beneficiosEmpresa).toBe(840);
    expect(r.totals.liquido).toBe(round(3000 - 248.6 - 60 - 150 - 30 - 250));
  });

  it("horas extras e DSR sobre variáveis (sem feriados)", () => {
    expect(workCalendar("2026-10")).toEqual({ workDays: 27, restDays: 4 });
    const r = calculatePayroll(base({ baseSalary: 2200, entries: [{ code: "HE50", quantity: 10, amount: null }] }));
    expect(line(r, "HE50")).toBe(150);
    expect(line(r, "DSR")).toBe(22.22);
    expect(r.totals.baseInss).toBe(2372.22);
  });

  it("lançamento manual substitui o que veio do ponto no mesmo código", () => {
    const r = calculatePayroll(base({
      baseSalary: 2200,
      entries: [
        { code: "HE50", quantity: 30, amount: null, source: "ponto" },
        { code: "HE50", quantity: 5, amount: null, source: "manual" },
      ],
    }));
    expect(line(r, "HE50")).toBe(75);
  });

  it("faltas reduzem as bases e descontam o DSR", () => {
    const r = calculatePayroll(base({ entries: [{ code: "FALTA_DIAS", quantity: 2, amount: null }] }));
    expect(line(r, "FALTA_DIAS")).toBe(200);
    expect(line(r, "DSR_FALTA")).toBe(200);
    expect(r.totals.baseInss).toBe(2600);
  });

  it("salário-família por filho até o limite de remuneração", () => {
    const r = calculatePayroll(base({ baseSalary: 1700, childrenUnder14: 2 }));
    expect(line(r, "SALARIO_FAMILIA")).toBe(135.08);
    expect(line(calculatePayroll(base({ baseSalary: 3000, childrenUnder14: 2 })), "SALARIO_FAMILIA")).toBeUndefined();
  });

  it("insalubridade sobre o mínimo e periculosidade sobre o salário", () => {
    const r = calculatePayroll(base({ profile: { ...DEFAULT_PROFILE, unhealthiness_grade: "medio", hazard_pay: true } }));
    expect(line(r, "INSALUBRIDADE")).toBe(324.2);
    expect(line(r, "PERICULOSIDADE")).toBe(900);
  });

  it("pensão alimentícia percentual entra como dedução do IRRF", () => {
    const r = calculatePayroll(base({ baseSalary: 8000, profile: { ...DEFAULT_PROFILE, alimony_type: "percentual", alimony_value: 20 } }));
    expect(line(r, "PENSAO")).toBe(round((8000 - 921.51) * 0.2));
    expect(r.totals.irrf).toBeLessThan(1037.85);
  });

  it("mês proporcional na admissão e no desligamento", () => {
    expect(paidDaysInPeriod("2026-10", "2026-10-16", null)).toBe(15);
    expect(paidDaysInPeriod("2026-10", "2020-01-01", "2026-10-10")).toBe(10);
    expect(paidDaysInPeriod("2026-02", "2026-02-15", null)).toBe(16);
    expect(paidDaysInPeriod("2026-10", "2026-11-01", null)).toBe(0);
    const r = calculatePayroll(base({ hireDate: "2026-10-16" }));
    expect(line(r, "SALARIO")).toBe(1500);
  });

  it("aprendiz recolhe FGTS de 2%; estagiário sem INSS, FGTS e desconto de VT", () => {
    expect(calculatePayroll(base({ employmentType: "aprendiz" })).totals.fgts).toBe(60);
    const e = calculatePayroll(base({ employmentType: "estagio", profile: { ...DEFAULT_PROFILE, vt_enabled: true, vt_daily_amount: 10 } }));
    expect(e.totals).toMatchObject({ inss: 0, fgts: 0 });
    expect(line(e, "VT")).toBeUndefined();
  });

  it("PJ, sem salário ou fora do período ficam fora da prévia", () => {
    expect(calculatePayroll(base({ employmentType: "pj" })).status).toBe("fora_da_folha");
    expect(calculatePayroll(base({ baseSalary: null })).reason).toMatch(/Salário-base/);
    expect(calculatePayroll(base({ terminationDate: "2026-09-30" })).status).toBe("fora_da_folha");
  });

  it("conta filhos e enteados menores de 14 anos na competência", () => {
    const deps = [
      { relationship: "filho", birth_date: "2013-01-05" },
      { relationship: "filho", birth_date: "2012-10-31" },
      { relationship: "enteado", birth_date: "2020-06-01" },
      { relationship: "conjuge", birth_date: "1990-01-01" },
      { relationship: "filho", birth_date: null },
    ];
    expect(countChildrenUnder14(deps, "2026-10")).toBe(2);
  });
});

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

describe("benefícios e descontos consolidados", async () => {
  const { benefitsBreakdown } = await import("./payroll-benefits");
  it("separa concedido, desconto e custo da empresa a partir do demonstrativo", () => {
    const r = calculatePayroll(base({
      profile: {
        ...DEFAULT_PROFILE, vt_enabled: true, vt_daily_amount: 10, vt_days: 22, va_monthly: 600, food_discount_pct: 10,
        health_plan_employee: 150, health_plan_company: 300, dental_plan_employee: 25, union_fee: 30,
      },
      items: [{ kind: "desconto", code: "EMPRESTIMO_CONSIGNADO", description: "Consignado", amount: 250, percent: null,
        incidence_inss: false, incidence_irrf: false, incidence_fgts: false, start_period: "2026-01", end_period: null }],
      entries: [{ code: "ADIANTAMENTO", quantity: null, amount: 400 }, { code: "FALTA_DIAS", quantity: 1, amount: null }],
    }));
    const b = benefitsBreakdown(r);
    expect(b).toMatchObject({
      vtGranted: 220, vtDiscount: 180, vtCompany: 40,
      foodGranted: 600, foodDiscount: 60, foodCompany: 540,
      healthEmployee: 150, healthCompany: 300, dental: 25, unionFee: 30, fixedDiscounts: 250, advance: 400,
      companyTotal: 880,
      employeeTotal: 180 + 60 + 150 + 25 + 30 + 250 + 400,
    });
    // Bate com o total de benefícios da empresa do demonstrativo.
    expect(b.companyTotal).toBe(r.totals.beneficiosEmpresa);
  });
});
