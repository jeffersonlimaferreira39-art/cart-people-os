/**
 * Prévia de 13º salário e de férias. Funções puras, complementares ao motor
 * mensal (payroll.ts). Estimativas para conferência — validar com a contabilidade:
 * médias de variáveis (horas × valor-hora atual, comissões em R$), avos e a
 * tributação exclusiva do 13º.
 */
import { addDays, addMonths, daysInclusive, monthBounds } from "./dates";
import {
  calcInss, calcIrrf, irrfFromTable, itemActive, round2,
  type MonthEntry, type PayrollLine, type PayrollProfile, type PayrollResult, type RecurringItem,
} from "./payroll";
import type { PayrollTables } from "./payroll-tables";

type Tables = Omit<PayrollTables, "sources">;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
const qty = (n: number, unit: string) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unit}`;

export type PayrollKind = "mensal" | "decimo1" | "decimo2" | "ferias";
export const PAYROLL_KINDS: { id: PayrollKind; label: string }[] = [
  { id: "mensal", label: "Mensal" },
  { id: "decimo1", label: "13º · 1ª parcela" },
  { id: "decimo2", label: "13º · 2ª parcela" },
  { id: "ferias", label: "Férias" },
];
export const isPayrollKind = (v: string): v is PayrollKind => PAYROLL_KINDS.some((k) => k.id === v);

export type BaseInput = {
  employmentType: string;
  hireDate: string;
  terminationDate: string | null;
  baseSalary: number | null;
  profile: PayrollProfile;
  items: RecurringItem[];
  irrfDependents: number;
  tables: Tables;
};

// ---------------------------------------------------------------------------
// Bases comuns
// ---------------------------------------------------------------------------

/** Remuneração fixa mensal: salário + adicionais + rubricas fixas com incidência de INSS. */
export function fixedRemuneration(input: BaseInput, period: string) {
  const p = input.profile;
  const params = input.tables.parametros;
  const salary = p.salary_type === "horista" ? (input.baseSalary ?? 0) * p.monthly_hours : (input.baseSalary ?? 0);
  let extras = 0;
  if (input.employmentType !== "estagio") {
    if (p.unhealthiness_grade !== "nenhum") extras += params.minimumWage * (params.unhealthinessRates[p.unhealthiness_grade] / 100);
    if (p.hazard_pay) extras += salary * (params.hazardRate / 100);
    for (const it of input.items) {
      if (it.kind !== "provento" || !it.incidence_inss || !itemActive(it, period)) continue;
      extras += it.percent !== null ? salary * (it.percent / 100) : (it.amount ?? 0);
    }
  }
  return { salary: round2(salary), extras: round2(extras), total: round2(salary + extras), hourRate: salary / p.monthly_hours };
}

export type HistoryEntry = MonthEntry & { period: string };

/**
 * Média mensal das variáveis (horas extras, adicional noturno, comissões) nos meses
 * informados: horas médias × valor-hora atual, comissões pela média em R$. Em cada
 * mês, o lançamento manual de um código prevalece sobre o ponto.
 */
export function averageVariables(history: HistoryEntry[], months: string[], hourRate: number, tables: Tables) {
  const params = tables.parametros;
  const sum = { HE50: 0, HE100: 0, ADN: 0, COMISSAO: 0 };
  for (const m of months) {
    const inMonth = history.filter((h) => h.period === m);
    const manual = new Set(inMonth.filter((h) => h.source !== "ponto").map((h) => h.code));
    for (const h of inMonth) {
      if (!(h.code in sum) || (h.source === "ponto" && manual.has(h.code))) continue;
      sum[h.code as keyof typeof sum] += h.code === "COMISSAO" ? (h.amount ?? 0) : (h.quantity ?? 0);
    }
  }
  const n = Math.max(months.length, 1);
  const avg = { he50: sum.HE50 / n, he100: sum.HE100 / n, adn: sum.ADN / n, commission: sum.COMISSAO / n };
  const value =
    avg.he50 * hourRate * (1 + params.overtimeRate / 100) +
    avg.he100 * hourRate * (1 + params.overtimeHolidayRate / 100) +
    avg.adn * hourRate * (params.nightShiftRate / 100) +
    avg.commission;
  return { ...avg, months: months.length, value: round2(value) };
}

/** Meses (YYYY-MM) de `from` a `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(`${m}-01`, 1).slice(0, 7)) out.push(m);
  return out;
}

function emptyResult(reason: string, regime: PayrollResult["regime"]): PayrollResult {
  return {
    status: "fora_da_folha",
    reason,
    regime,
    paidDays: 0,
    lines: [],
    totals: { proventos: 0, descontos: 0, liquido: 0, baseInss: 0, baseIrrf: 0, baseFgts: 0, inss: 0, irrf: 0, fgts: 0, beneficiosEmpresa: 0, custoEmpresa: 0 },
    warnings: [],
  };
}

function finish(lines: PayrollLine[], partial: Omit<PayrollResult["totals"], "proventos" | "descontos" | "liquido" | "beneficiosEmpresa" | "custoEmpresa">, regime: PayrollResult["regime"], paidDays: number, warnings: string[]): PayrollResult {
  const proventos = round2(lines.filter((l) => l.kind === "provento").reduce((a, l) => a + l.amount, 0));
  const descontos = round2(lines.filter((l) => l.kind === "desconto").reduce((a, l) => a + l.amount, 0));
  return {
    status: "calculada",
    regime,
    paidDays,
    lines,
    totals: { ...partial, proventos, descontos, liquido: round2(proventos - descontos), beneficiosEmpresa: 0, custoEmpresa: round2(proventos + partial.fgts) },
    warnings,
  };
}

const fgtsRateOf = (input: BaseInput) =>
  input.employmentType === "aprendiz" ? input.tables.parametros.fgtsApprenticeRate : input.tables.parametros.fgtsRate;

function alimonyOn(base: number, p: PayrollProfile) {
  if (p.alimony_type === "percentual") return round2(Math.max(0, base) * (p.alimony_value / 100));
  return 0; // Pensão em valor fixo é descontada na folha mensal.
}

// ---------------------------------------------------------------------------
// 13º salário
// ---------------------------------------------------------------------------

/** Avos do 13º: meses do ano com 15 dias ou mais de vínculo (até `untilMonth`). */
export function thirteenthAvos(year: number, hireDate: string, terminationDate: string | null, untilMonth = 12): number {
  let avos = 0;
  for (let m = 1; m <= untilMonth; m++) {
    const { start, end } = monthBounds(`${year}-${String(m).padStart(2, "0")}`);
    const from = hireDate > start ? hireDate : start;
    const to = terminationDate && terminationDate < end ? terminationDate : end;
    if (to >= from && daysInclusive(from, to) >= 15) avos++;
  }
  return avos;
}

export function calculateThirteenth(
  input: BaseInput & {
    stage: "primeira" | "segunda";
    period: string; // competência de pagamento (YYYY-MM)
    averages: number; // médias de variáveis já calculadas (ou informadas)
    averagesSource: "calculada" | "informada";
    firstInstallmentPaid?: number; // 1ª parcela efetivamente paga (substitui o cálculo)
  },
): PayrollResult {
  if (input.employmentType === "pj") return emptyResult("Prestador PJ: sem 13º salário.", "fora");
  if (input.employmentType === "estagio") return emptyResult("Estágio não tem 13º salário (Lei 11.788/2008).", "estagio");
  if (!input.baseSalary || input.baseSalary <= 0) return emptyResult("Salário-base não cadastrado.", "clt");
  const year = Number(input.period.slice(0, 4));
  const { end: periodEnd } = monthBounds(input.period);
  if (input.hireDate > periodEnd) return emptyResult("Admissão posterior à competência.", "clt");
  if (input.terminationDate && input.terminationDate <= periodEnd) {
    return emptyResult("Desligado no ano: 13º proporcional pago na rescisão.", "clt");
  }

  const warnings: string[] = [];
  const rem = fixedRemuneration(input, input.period);
  const avos = thirteenthAvos(year, input.hireDate, null, 12); // projeta até dezembro para quem segue ativo
  if (avos === 0) return emptyResult("Sem avos no ano (menos de 15 dias de vínculo).", "clt");
  const base = rem.total + input.averages;
  const full = round2((base / 12) * avos);
  const first = round2(((base / 12) * avos) / 2); // do valor sem arredondar, como no integral
  const fgtsRate = fgtsRateOf(input);
  const lines: PayrollLine[] = [];
  const push = (code: string, label: string, kind: PayrollLine["kind"], reference: string, amount: number) => {
    const v = round2(amount);
    if (v > 0 || kind === "informativo") lines.push({ code, label, kind, reference, amount: v });
  };

  if (input.averages > 0) {
    push("MEDIAS_13", `Médias de variáveis (${input.averagesSource})`, "informativo", "por mês", input.averages);
  }

  if (input.stage === "primeira") {
    push("DECIMO_1", "13º salário · 1ª parcela", "provento", `${avos}/12 avos · 50%`, first);
    const fgts = round2(first * (fgtsRate / 100));
    push("FGTS", `FGTS ${pct(fgtsRate)} (empresa)`, "informativo", "depósito", fgts);
    warnings.push("1ª parcela sem INSS e IRRF: os tributos incidem na 2ª parcela, sobre o valor integral.");
    if (avos < 12) warnings.push(`13º proporcional: ${avos}/12 avos projetados até dezembro.`);
    return finish(lines, { baseInss: 0, baseIrrf: 0, baseFgts: first, inss: 0, irrf: 0, fgts }, "clt", 0, warnings);
  }

  const paidFirst = input.firstInstallmentPaid ?? first;
  push("DECIMO_INTEGRAL", "13º salário integral", "provento", `${avos}/12 avos`, full);
  push("DECIMO_ADIANTAMENTO", "Adiantamento · 1ª parcela", "desconto", input.firstInstallmentPaid !== undefined ? "informado" : "calculado", paidFirst);
  const inss = calcInss(full, input.tables.inss);
  push("INSS_13", "INSS sobre 13º", "desconto", "progressivo", inss);
  const alimony = alimonyOn(full - inss, input.profile);
  push("PENSAO_13", "Pensão alimentícia sobre 13º", "desconto", pct(input.profile.alimony_value), alimony);
  // Tributação exclusiva: base própria, só com as deduções legais.
  const irrfBase = round2(Math.max(0, full - inss - input.tables.irrf.dependentDeduction * input.irrfDependents - alimony));
  const irrf = irrfFromTable(irrfBase, input.tables.irrf);
  push("IRRF_13", "IRRF sobre 13º", "desconto", `${input.irrfDependents} dep.`, irrf);
  const baseFgts = round2(Math.max(0, full - paidFirst));
  const fgts = round2(baseFgts * (fgtsRate / 100));
  push("FGTS", `FGTS ${pct(fgtsRate)} (empresa)`, "informativo", "depósito", fgts);
  warnings.push("IRRF do 13º em tributação exclusiva, com deduções legais e sem redução mensal: confirme com a contabilidade.");
  if (avos < 12) warnings.push(`13º proporcional: ${avos}/12 avos.`);
  return finish(lines, { baseInss: full, baseIrrf: irrfBase, baseFgts, inss, irrf, fgts }, "clt", 0, warnings);
}

// ---------------------------------------------------------------------------
// Férias
// ---------------------------------------------------------------------------

export type Vacation = { start: string; days: number; sellDays: number };

export function calculateVacation(
  input: BaseInput & { vacation: Vacation; averages: number; averagesSource: "calculada" | "informada" },
): PayrollResult {
  if (input.employmentType === "pj") return emptyResult("Prestador PJ: sem férias CLT.", "fora");
  if (!input.baseSalary || input.baseSalary <= 0) return emptyResult("Salário-base não cadastrado.", "clt");
  const { vacation: v, tables } = input;
  const internship = input.employmentType === "estagio";
  const regime: PayrollResult["regime"] = internship ? "estagio" : "clt";
  const period = v.start.slice(0, 7);
  const rem = fixedRemuneration(input, period);
  const base = rem.total + input.averages;
  const daily = base / 30;
  const warnings: string[] = [];
  const lines: PayrollLine[] = [];
  const push = (code: string, label: string, kind: PayrollLine["kind"], reference: string, amount: number) => {
    const val = round2(amount);
    if (val > 0 || kind === "informativo") lines.push({ code, label, kind, reference, amount: val });
  };

  if (input.averages > 0) push("MEDIAS_FERIAS", `Médias de variáveis (${input.averagesSource})`, "informativo", "por mês", input.averages);

  const vacationPay = round2(daily * v.days);
  if (internship) {
    // Recesso remunerado do estagiário: sem 1/3, sem abono, sem INSS/FGTS.
    push("RECESSO", "Recesso remunerado", "provento", qty(v.days, "d"), vacationPay);
    const irrf = calcIrrf(vacationPay, tables.irrf.dependentDeduction * input.irrfDependents, tables.irrf);
    push("IRRF", "IRRF", "desconto", "tabela mensal", irrf.tax);
    warnings.push("Estágio: recesso remunerado sem adicional de 1/3 (Lei 11.788/2008, art. 13).");
    return finish(lines, { baseInss: 0, baseIrrf: irrf.base, baseFgts: 0, inss: 0, irrf: irrf.tax, fgts: 0 }, regime, v.days, warnings);
  }

  const third = round2(vacationPay / 3);
  push("FERIAS", "Férias", "provento", qty(v.days, "d"), vacationPay);
  push("FERIAS_TERCO", "1/3 constitucional de férias", "provento", "1/3", third);
  const bonus = round2(daily * v.sellDays);
  const bonusThird = round2(bonus / 3);
  // Abono pecuniário e seu 1/3 são isentos de INSS, IRRF e FGTS.
  push("ABONO", "Abono pecuniário", "provento", qty(v.sellDays, "d"), bonus);
  push("ABONO_TERCO", "1/3 sobre abono pecuniário", "provento", "1/3", bonusThird);

  const taxable = round2(vacationPay + third);
  const inss = calcInss(taxable, tables.inss);
  push("INSS", "INSS", "desconto", "progressivo", inss);
  const alimony = alimonyOn(taxable - inss, input.profile);
  push("PENSAO", "Pensão alimentícia", "desconto", pct(input.profile.alimony_value), alimony);
  const irrf = calcIrrf(taxable, inss + tables.irrf.dependentDeduction * input.irrfDependents + alimony, tables.irrf);
  push("IRRF", "IRRF", "desconto", irrf.method === "simplificado" ? "desc. simplificado" : `${input.irrfDependents} dep.`, irrf.tax);
  const fgtsRate = fgtsRateOf(input);
  const fgts = round2(taxable * (fgtsRate / 100));
  push("FGTS", `FGTS ${pct(fgtsRate)} (empresa)`, "informativo", "depósito", fgts);

  const payBy = addDays(v.start, -2);
  warnings.push(`Pagamento até ${payBy.slice(8, 10)}/${payBy.slice(5, 7)}/${payBy.slice(0, 4)} (2 dias antes do início, CLT art. 145).`);
  if (v.sellDays) warnings.push("Abono pecuniário isento de INSS, IRRF e FGTS.");
  return finish(lines, { baseInss: taxable, baseIrrf: irrf.base, baseFgts: taxable, inss, irrf: irrf.tax, fgts }, regime, v.days, warnings);
}

/** Dias (comerciais) de férias que caem dentro da competência. */
export function vacationDaysInMonth(vacations: { start_date: string; end_date: string }[], period: string): number {
  const { start, end } = monthBounds(period);
  let days = 0;
  for (const v of vacations) {
    const from = v.start_date > start ? v.start_date : start;
    const to = v.end_date < end ? v.end_date : end;
    if (to >= from) days += daysInclusive(from, to);
  }
  return Math.min(days, 30);
}
