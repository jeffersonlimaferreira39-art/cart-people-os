import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, calculatePayroll } from "./payroll";
import { REFERENCE_TABLES } from "./payroll-tables";
import {
  averageVariables, calculateThirteenth, calculateVacation, fixedRemuneration, monthRange, thirteenthAvos, vacationDaysInMonth,
  type BaseInput,
} from "./payroll-annual";

const base = (over: Partial<BaseInput> = {}): BaseInput => ({
  employmentType: "clt",
  hireDate: "2020-01-10",
  terminationDate: null,
  baseSalary: 3200,
  profile: DEFAULT_PROFILE,
  items: [],
  irrfDependents: 0,
  tables: REFERENCE_TABLES,
  ...over,
});
const line = (r: { lines: { code: string; amount: number }[] }, code: string) => r.lines.find((l) => l.code === code)?.amount;

describe("13º salário", () => {
  it("conta avos com 15 dias ou mais no mês", () => {
    expect(thirteenthAvos(2026, "2020-01-10", null)).toBe(12);
    expect(thirteenthAvos(2026, "2026-03-20", null)).toBe(9);
    expect(thirteenthAvos(2026, "2026-03-17", null)).toBe(10);
  });

  it("1ª parcela: metade, sem INSS e IRRF, com FGTS", () => {
    const r = calculateThirteenth({ ...base(), stage: "primeira", period: "2026-11", averages: 0, averagesSource: "calculada" });
    expect(line(r, "DECIMO_1")).toBe(1600);
    expect(r.totals).toMatchObject({ inss: 0, irrf: 0, fgts: 128, liquido: 1600 });
  });

  it("2ª parcela: integral menos adiantamento, INSS e IRRF exclusivos", () => {
    const r = calculateThirteenth({ ...base(), stage: "segunda", period: "2026-12", averages: 0, averagesSource: "calculada" });
    expect(line(r, "DECIMO_INTEGRAL")).toBe(3200);
    expect(line(r, "DECIMO_ADIANTAMENTO")).toBe(1600);
    expect(r.totals).toMatchObject({ inss: 272.6, irrf: 44.95, fgts: 128, liquido: 1282.45 });
    const paid = calculateThirteenth({ ...base(), stage: "segunda", period: "2026-12", averages: 0, averagesSource: "calculada", firstInstallmentPaid: 1000 });
    expect(line(paid, "DECIMO_ADIANTAMENTO")).toBe(1000);
  });

  it("proporcional para admitido no ano e fora para estágio, PJ e desligados", () => {
    const r = calculateThirteenth({ ...base({ hireDate: "2026-03-17" }), stage: "primeira", period: "2026-11", averages: 0, averagesSource: "calculada" });
    expect(line(r, "DECIMO_1")).toBe(round((3200 / 12) * 10 / 2));
    expect(calculateThirteenth({ ...base({ employmentType: "estagio" }), stage: "primeira", period: "2026-11", averages: 0, averagesSource: "calculada" }).status).toBe("fora_da_folha");
    expect(calculateThirteenth({ ...base({ terminationDate: "2026-06-30" }), stage: "segunda", period: "2026-12", averages: 0, averagesSource: "calculada" }).reason).toMatch(/rescisão/);
  });

  it("médias de variáveis entram na base", () => {
    const r = calculateThirteenth({ ...base(), stage: "segunda", period: "2026-12", averages: 300, averagesSource: "informada" });
    expect(line(r, "DECIMO_INTEGRAL")).toBe(3500);
  });
});

describe("médias e remuneração fixa", () => {
  it("média de horas × valor-hora atual e comissões em R$, manual sobre o ponto", () => {
    const months = monthRange("2026-07", "2026-10");
    expect(months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    const avg = averageVariables(
      [
        { period: "2026-07", code: "HE50", quantity: 10, amount: null, source: "manual" },
        { period: "2026-08", code: "HE50", quantity: 40, amount: null, source: "ponto" },
        { period: "2026-08", code: "HE50", quantity: 10, amount: null, source: "manual" },
        { period: "2026-09", code: "COMISSAO", quantity: null, amount: 400, source: "manual" },
      ],
      months,
      3200 / 220,
      REFERENCE_TABLES,
    );
    expect(avg).toMatchObject({ he50: 5, commission: 100 });
    expect(avg.value).toBe(round(5 * (3200 / 220) * 1.5 + 100));
  });

  it("remuneração fixa soma adicionais e rubricas com incidência", () => {
    const r = fixedRemuneration(
      base({
        profile: { ...DEFAULT_PROFILE, hazard_pay: true },
        items: [
          { kind: "provento", code: "GRATIFICACAO_FUNCAO", description: "Gratificação", amount: 500, percent: null, incidence_inss: true, incidence_irrf: true, incidence_fgts: true, start_period: "2026-01", end_period: null },
          { kind: "provento", code: "AJUDA_CUSTO", description: "Ajuda", amount: 200, percent: null, incidence_inss: false, incidence_irrf: false, incidence_fgts: false, start_period: "2026-01", end_period: null },
        ],
      }),
      "2026-10",
    );
    expect(r).toMatchObject({ salary: 3200, extras: 1460, total: 4660 });
  });
});

describe("férias", () => {
  it("30 dias: férias + 1/3, INSS, IRRF (simplificado e redução) e FGTS", () => {
    const r = calculateVacation({ ...base({ baseSalary: 3000 }), vacation: { start: "2026-11-02", days: 30, sellDays: 0 }, averages: 0, averagesSource: "calculada" });
    expect(line(r, "FERIAS")).toBe(3000);
    expect(line(r, "FERIAS_TERCO")).toBe(1000);
    expect(r.totals).toMatchObject({ baseInss: 4000, inss: 368.6, irrf: 0, fgts: 320, liquido: 3631.4 });
    expect(r.warnings.join(" ")).toMatch(/31\/10\/2026/);
  });

  it("abono pecuniário de 10 dias com 1/3, isento de tributos", () => {
    const r = calculateVacation({ ...base({ baseSalary: 3000 }), vacation: { start: "2026-11-02", days: 20, sellDays: 10 }, averages: 0, averagesSource: "calculada" });
    expect(line(r, "FERIAS")).toBe(2000);
    expect(line(r, "FERIAS_TERCO")).toBe(666.67);
    expect(line(r, "ABONO")).toBe(1000);
    expect(line(r, "ABONO_TERCO")).toBe(333.33);
    expect(r.totals.baseInss).toBe(2666.67);
  });

  it("estágio: recesso sem 1/3, sem INSS e FGTS", () => {
    const r = calculateVacation({ ...base({ employmentType: "estagio", baseSalary: 1400 }), vacation: { start: "2026-11-02", days: 30, sellDays: 0 }, averages: 0, averagesSource: "calculada" });
    expect(line(r, "RECESSO")).toBe(1400);
    expect(line(r, "FERIAS_TERCO")).toBeUndefined();
    expect(r.totals).toMatchObject({ inss: 0, fgts: 0 });
  });

  it("dias de férias no mês saem do salário da folha mensal", () => {
    expect(vacationDaysInMonth([{ start_date: "2026-10-20", end_date: "2026-11-08" }], "2026-10")).toBe(12);
    const r = calculatePayroll({
      period: "2026-10", employmentType: "clt", hireDate: "2020-01-10", terminationDate: null, baseSalary: 3000,
      profile: DEFAULT_PROFILE, items: [], entries: [], irrfDependents: 0, childrenUnder14: 0, tables: REFERENCE_TABLES, vacationDays: 12,
    });
    expect(line(r, "SALARIO")).toBe(1800);
    expect(line(r, "FERIAS_INFO")).toBe(1200);
    expect(r.totals.proventos).toBe(1800);
  });
});

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
