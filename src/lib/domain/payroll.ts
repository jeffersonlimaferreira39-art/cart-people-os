/**
 * Motor da PRÉVIA de folha mensal. Funções puras, sem acesso a dados.
 *
 * É uma estimativa para conferência antes do envio à contabilidade: não emite
 * holerite oficial, não calcula encargos patronais além do FGTS e não considera
 * feriados no DSR. Regras CLT aqui implementadas: validar com a contabilidade.
 */
import { monthBounds } from "./dates";
import type { PayrollTables } from "./payroll-tables";

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export type Incidence = { inss: boolean; irrf: boolean; fgts: boolean };
const ALL: Incidence = { inss: true, irrf: true, fgts: true };
const NONE: Incidence = { inss: false, irrf: false, fgts: false };

/** Lançamentos variáveis do mês. `unit` diz se o campo é quantidade (h/d) ou valor (R$). */
export const ENTRY_CODES = {
  HE50: { label: "Horas extras (50%)", kind: "provento", unit: "horas" },
  HE100: { label: "Horas extras (100%)", kind: "provento", unit: "horas" },
  ADN: { label: "Adicional noturno", kind: "provento", unit: "horas" },
  COMISSAO: { label: "Comissões", kind: "provento", unit: "valor" },
  GRATIFICACAO: { label: "Gratificação / prêmio", kind: "provento", unit: "valor" },
  PROVENTO_DIVERSO: { label: "Outros proventos (tributáveis)", kind: "provento", unit: "valor" },
  REEMBOLSO: { label: "Reembolso de despesas (não tributável)", kind: "provento", unit: "valor" },
  FALTA_DIAS: { label: "Faltas injustificadas", kind: "desconto", unit: "dias" },
  FALTA_HORAS: { label: "Atrasos e saídas antecipadas", kind: "desconto", unit: "horas" },
  ADIANTAMENTO: { label: "Adiantamento salarial", kind: "desconto", unit: "valor" },
  DESCONTO_DIVERSO: { label: "Outros descontos", kind: "desconto", unit: "valor" },
  VT_DIAS: { label: "Dias de vale-transporte no mês", kind: "informativo", unit: "dias" },
} as const;
export type EntryCode = keyof typeof ENTRY_CODES;
export const isEntryCode = (v: string): v is EntryCode => Object.hasOwn(ENTRY_CODES, v);

/** Rubricas fixas (recorrentes) e incidências padrão. */
export const ITEM_CODES = {
  GRATIFICACAO_FUNCAO: { label: "Gratificação de função", kind: "provento", incidence: ALL },
  ADICIONAL_TEMPO: { label: "Adicional por tempo de serviço", kind: "provento", incidence: ALL },
  AJUDA_CUSTO: { label: "Ajuda de custo (não tributável)", kind: "provento", incidence: NONE },
  OUTRO_PROVENTO: { label: "Outro provento fixo", kind: "provento", incidence: ALL },
  EMPRESTIMO_CONSIGNADO: { label: "Empréstimo consignado", kind: "desconto", incidence: NONE },
  CONTRIBUICAO_ASSOCIATIVA: { label: "Contribuição associativa", kind: "desconto", incidence: NONE },
  PREVIDENCIA_PRIVADA: { label: "Previdência privada", kind: "desconto", incidence: NONE },
  CONVENIO_FARMACIA: { label: "Convênio farmácia", kind: "desconto", incidence: NONE },
  OUTRO_DESCONTO: { label: "Outro desconto fixo", kind: "desconto", incidence: NONE },
} as const satisfies Record<string, { label: string; kind: "provento" | "desconto"; incidence: Incidence }>;
export type ItemCode = keyof typeof ITEM_CODES;
export const isItemCode = (v: string): v is ItemCode => Object.hasOwn(ITEM_CODES, v);

// ---------------------------------------------------------------------------
// Entradas e saídas
// ---------------------------------------------------------------------------

export type PayrollProfile = {
  salary_type: "mensalista" | "horista";
  monthly_hours: number;
  vt_enabled: boolean;
  vt_daily_amount: number;
  vt_days: number;
  va_monthly: number;
  vr_monthly: number;
  food_discount_pct: number;
  health_plan_employee: number;
  health_plan_company: number;
  dental_plan_employee: number;
  life_insurance_employee: number;
  unhealthiness_grade: "nenhum" | "minimo" | "medio" | "maximo";
  hazard_pay: boolean;
  union_fee: number;
  alimony_type: "nenhuma" | "percentual" | "valor";
  alimony_value: number;
};

export const DEFAULT_PROFILE: PayrollProfile = {
  salary_type: "mensalista",
  monthly_hours: 220,
  vt_enabled: false,
  vt_daily_amount: 0,
  vt_days: 22,
  va_monthly: 0,
  vr_monthly: 0,
  food_discount_pct: 0,
  health_plan_employee: 0,
  health_plan_company: 0,
  dental_plan_employee: 0,
  life_insurance_employee: 0,
  unhealthiness_grade: "nenhum",
  hazard_pay: false,
  union_fee: 0,
  alimony_type: "nenhuma",
  alimony_value: 0,
};

export type RecurringItem = {
  kind: "provento" | "desconto";
  code: string;
  description: string;
  amount: number | null;
  percent: number | null;
  incidence_inss: boolean;
  incidence_irrf: boolean;
  incidence_fgts: boolean;
  start_period: string;
  end_period: string | null;
};

export type MonthEntry = { code: string; quantity: number | null; amount: number | null; source?: "manual" | "ponto" };

export type PayrollInput = {
  period: string; // YYYY-MM
  employmentType: string; // clt | pj | estagio | temporario | aprendiz | intermitente
  hireDate: string;
  terminationDate: string | null;
  /** Salário-base mensal (mensalista) ou valor da hora (horista). */
  baseSalary: number | null;
  profile: PayrollProfile;
  items: RecurringItem[];
  entries: MonthEntry[];
  irrfDependents: number;
  childrenUnder14: number;
  tables: Omit<PayrollTables, "sources">;
};

export type PayrollLine = {
  code: string;
  label: string;
  kind: "provento" | "desconto" | "informativo";
  reference: string;
  amount: number;
};

export type PayrollResult = {
  status: "calculada" | "fora_da_folha";
  reason?: string;
  regime: "clt" | "estagio" | "fora";
  paidDays: number;
  lines: PayrollLine[];
  totals: {
    proventos: number;
    descontos: number;
    liquido: number;
    baseInss: number;
    baseIrrf: number;
    baseFgts: number;
    inss: number;
    irrf: number;
    fgts: number;
    /** Custo de benefícios pago pela empresa (VT, alimentação, saúde). */
    beneficiosEmpresa: number;
    /** Bruto + FGTS + benefícios da empresa (sem INSS patronal, que depende do regime tributário). */
    custoEmpresa: number;
  };
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const brl = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
const qty = (n: number, unit: string) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unit}`;

/** INSS progressivo por faixas, limitado ao teto da última faixa. */
export function calcInss(base: number, table: PayrollTables["inss"]): number {
  let tax = 0;
  let lower = 0;
  for (const b of table.brackets) {
    if (base <= lower) break;
    tax += (Math.min(base, b.upTo) - lower) * (b.rate / 100);
    lower = b.upTo;
  }
  return round2(tax);
}

/** Imposto da tabela progressiva (parcela a deduzir). */
export function irrfFromTable(base: number, table: PayrollTables["irrf"]): number {
  if (base <= 0) return 0;
  const b = table.brackets.find((x) => x.upTo === null || base <= x.upTo) ?? table.brackets[table.brackets.length - 1];
  return round2(Math.max(0, base * (b.rate / 100) - b.deduction));
}

/**
 * IRRF mensal: compara deduções legais × desconto simplificado (o menor imposto
 * vale) e aplica a redução sobre os rendimentos tributáveis, quando configurada.
 */
export function calcIrrf(
  taxableIncome: number,
  legalDeductions: number,
  table: PayrollTables["irrf"],
): { tax: number; base: number; method: "legal" | "simplificado"; reduction: number } {
  const legalBase = round2(Math.max(0, taxableIncome - legalDeductions));
  const simpleBase = round2(Math.max(0, taxableIncome - table.simplifiedDiscount));
  const legalTax = irrfFromTable(legalBase, table);
  const simpleTax = irrfFromTable(simpleBase, table);
  const useSimple = simpleTax < legalTax;
  const tax = useSimple ? simpleTax : legalTax;
  let reduction = 0;
  const r = table.reduction;
  if (r && tax > 0) {
    if (taxableIncome <= r.exemptUpTo) reduction = Math.min(tax, r.maxReduction);
    else if (taxableIncome <= r.phaseOutUpTo) reduction = Math.max(0, r.phaseOutConstant - r.phaseOutFactor * taxableIncome);
    reduction = round2(Math.min(tax, reduction));
  }
  return { tax: round2(tax - reduction), base: useSimple ? simpleBase : legalBase, method: useSimple ? "simplificado" : "legal", reduction };
}

/** Dias úteis (segunda a sábado) e domingos do mês — DSR sem feriados. */
export function workCalendar(period: string): { workDays: number; restDays: number } {
  const { start, end } = monthBounds(period);
  const last = Number(end.slice(8, 10));
  let rest = 0;
  for (let d = 1; d <= last; d++) {
    if (new Date(`${start.slice(0, 8)}${String(d).padStart(2, "0")}T12:00:00Z`).getUTCDay() === 0) rest++;
  }
  return { workDays: last - rest, restDays: rest };
}

/** Dias pagos no mês comercial de 30 dias, considerando admissão e desligamento. */
export function paidDaysInPeriod(period: string, hireDate: string, terminationDate: string | null): number {
  const { start, end } = monthBounds(period);
  if (hireDate > end || (terminationDate && terminationDate < start)) return 0;
  const lastDay = Number(end.slice(8, 10));
  const from = hireDate > start ? Number(hireDate.slice(8, 10)) : 1;
  const to = terminationDate && terminationDate <= end ? Number(terminationDate.slice(8, 10)) : lastDay;
  if (from === 1 && to === lastDay) return 30;
  // Mês comercial: admissão conta até o dia 30; desligamento conta os dias trabalhados.
  const toCommercial = to === lastDay ? 30 : Math.min(to, 30);
  return Math.max(0, toCommercial - Math.min(from, 30) + 1);
}

function itemActive(item: RecurringItem, period: string) {
  return item.start_period <= period && (!item.end_period || item.end_period >= period);
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { tables, profile: p, period } = input;
  const params = tables.parametros;
  const warnings: string[] = [];
  const empty = (reason: string, regime: PayrollResult["regime"] = "fora"): PayrollResult => ({
    status: "fora_da_folha",
    reason,
    regime,
    paidDays: 0,
    lines: [],
    totals: { proventos: 0, descontos: 0, liquido: 0, baseInss: 0, baseIrrf: 0, baseFgts: 0, inss: 0, irrf: 0, fgts: 0, beneficiosEmpresa: 0, custoEmpresa: 0 },
    warnings,
  });

  if (input.employmentType === "pj") return empty("Prestador PJ: pagamento por nota fiscal, fora da folha.");
  const regime: PayrollResult["regime"] = input.employmentType === "estagio" ? "estagio" : "clt";
  const paidDays = paidDaysInPeriod(period, input.hireDate, input.terminationDate);
  if (paidDays === 0) return empty("Sem vínculo ativo na competência.", regime);
  if (!input.baseSalary || input.baseSalary <= 0) return empty("Salário-base não cadastrado.", regime);

  const lines: PayrollLine[] = [];
  const bases = { inss: 0, irrf: 0, fgts: 0 };
  const add = (code: string, label: string, kind: PayrollLine["kind"], reference: string, amount: number, inc: Incidence = NONE) => {
    const v = round2(amount);
    if (v <= 0 && kind !== "informativo") return;
    lines.push({ code, label, kind, reference, amount: v });
    const sign = kind === "desconto" ? -1 : kind === "provento" ? 1 : 0;
    if (inc.inss) bases.inss += sign * v;
    if (inc.irrf) bases.irrf += sign * v;
    if (inc.fgts) bases.fgts += sign * v;
  };

  const monthly = p.salary_type === "horista" ? input.baseSalary * p.monthly_hours : input.baseSalary;
  const hourRate = monthly / p.monthly_hours;
  const dayRate = monthly / 30;
  const { workDays, restDays } = workCalendar(period);

  // Lançamentos do mês: manuais têm prioridade sobre os vindos do ponto (mesmo código).
  const manualCodes = new Set(input.entries.filter((e) => e.source !== "ponto").map((e) => e.code));
  const entries = input.entries.filter((e) => e.source !== "ponto" || !manualCodes.has(e.code));
  const sumQty = (code: EntryCode) => entries.filter((e) => e.code === code).reduce((a, e) => a + (e.quantity ?? 0), 0);
  const sumAmt = (code: EntryCode) => entries.filter((e) => e.code === code).reduce((a, e) => a + (e.amount ?? 0), 0);
  const fromPonto = (code: EntryCode) => entries.some((e) => e.code === code && e.source === "ponto");

  // --- Proventos ---------------------------------------------------------
  const salary = round2(dayRate * paidDays);
  add("SALARIO", regime === "estagio" ? "Bolsa-auxílio" : "Salário", "provento", qty(paidDays, "d"), salary,
    regime === "estagio" ? { inss: false, irrf: true, fgts: false } : ALL);

  const inc = regime === "estagio" ? { inss: false, irrf: true, fgts: false } : ALL;
  let variables = 0;
  const he50 = sumQty("HE50");
  if (he50) {
    const v = hourRate * (1 + params.overtimeRate / 100) * he50;
    variables += round2(v);
    add("HE50", `Horas extras ${params.overtimeRate}%${fromPonto("HE50") ? " (ponto)" : ""}`, "provento", qty(he50, "h"), v, inc);
  }
  const he100 = sumQty("HE100");
  if (he100) {
    const v = hourRate * (1 + params.overtimeHolidayRate / 100) * he100;
    variables += round2(v);
    add("HE100", `Horas extras ${params.overtimeHolidayRate}%`, "provento", qty(he100, "h"), v, inc);
  }
  const adn = sumQty("ADN");
  if (adn) {
    const v = hourRate * (params.nightShiftRate / 100) * adn;
    variables += round2(v);
    add("ADN", `Adicional noturno ${params.nightShiftRate}%${fromPonto("ADN") ? " (ponto)" : ""}`, "provento", qty(adn, "h"), v, inc);
  }
  const commission = sumAmt("COMISSAO");
  if (commission) {
    variables += commission;
    add("COMISSAO", "Comissões", "provento", "valor", commission, inc);
  }
  if (variables > 0 && regime === "clt") {
    add("DSR", "DSR sobre variáveis", "provento", `${restDays}/${workDays} d`, (variables / workDays) * restDays, ALL);
  }
  add("GRATIFICACAO", "Gratificação / prêmio", "provento", "valor", sumAmt("GRATIFICACAO"), inc);
  add("PROVENTO_DIVERSO", "Outros proventos", "provento", "valor", sumAmt("PROVENTO_DIVERSO"), inc);

  if (regime === "clt" && p.unhealthiness_grade !== "nenhum") {
    const rate = params.unhealthinessRates[p.unhealthiness_grade];
    add("INSALUBRIDADE", `Insalubridade grau ${({ minimo: "mínimo", medio: "médio", maximo: "máximo" } as const)[p.unhealthiness_grade]}`, "provento", `${pct(rate)} do mínimo`,
      (params.minimumWage * (rate / 100) * paidDays) / 30, ALL);
  }
  if (regime === "clt" && p.hazard_pay) {
    add("PERICULOSIDADE", "Periculosidade", "provento", pct(params.hazardRate), salary * (params.hazardRate / 100), ALL);
  }

  for (const it of input.items.filter((i) => itemActive(i, period))) {
    const value = it.percent !== null ? salary * (it.percent / 100) : (it.amount ?? 0);
    const itInc = regime === "estagio" ? { inss: false, irrf: it.incidence_irrf, fgts: false }
      : { inss: it.incidence_inss, irrf: it.incidence_irrf, fgts: it.incidence_fgts };
    add(it.code, it.description, it.kind, it.percent !== null ? pct(it.percent) : "fixo", value, itInc);
  }

  // --- Faltas (reduzem as bases) ----------------------------------------
  const absenceDays = Math.min(sumQty("FALTA_DIAS"), paidDays);
  if (absenceDays) {
    add("FALTA_DIAS", "Faltas", "desconto", qty(absenceDays, "d"), dayRate * absenceDays, ALL);
    if (regime === "clt") {
      // Aproximação: uma falta injustificada por semana faz perder o DSR daquela semana.
      const lostDsr = Math.min(absenceDays, restDays);
      add("DSR_FALTA", "DSR perdido por faltas", "desconto", qty(lostDsr, "d"), dayRate * lostDsr, ALL);
      warnings.push("DSR das faltas estimado: confira as semanas das faltas.");
    }
  }
  const lateHours = sumQty("FALTA_HORAS");
  if (lateHours) add("FALTA_HORAS", "Atrasos e saídas antecipadas", "desconto", qty(lateHours, "h"), hourRate * lateHours, ALL);

  // Reembolso fica fora das bases.
  add("REEMBOLSO", "Reembolso de despesas", "provento", "valor", sumAmt("REEMBOLSO"));

  // --- Salário-família (não tributável) -------------------------------------
  const sf = tables.salario_familia;
  if (regime === "clt" && input.childrenUnder14 > 0) {
    if (bases.inss <= sf.incomeLimit) {
      add("SALARIO_FAMILIA", "Salário-família", "provento", qty(input.childrenUnder14, input.childrenUnder14 === 1 ? "filho" : "filhos"),
        (sf.quota * input.childrenUnder14 * paidDays) / 30);
    }
  }

  // --- Descontos legais ------------------------------------------------------
  const baseInss = round2(Math.max(0, bases.inss));
  const inss = regime === "clt" ? calcInss(baseInss, tables.inss) : 0;
  if (inss) add("INSS", "INSS", "desconto", "progressivo", inss);
  const topInss = tables.inss.brackets[tables.inss.brackets.length - 1].upTo;
  if (regime === "clt" && baseInss > topInss) warnings.push("Base do INSS acima do teto: contribuição limitada ao teto.");

  // Pensão alimentícia: percentual sobre (rendimentos tributáveis − INSS) ou valor fixo.
  let alimony = 0;
  if (p.alimony_type === "percentual") alimony = Math.max(0, bases.irrf - inss) * (p.alimony_value / 100);
  if (p.alimony_type === "valor") alimony = p.alimony_value;
  alimony = round2(alimony);
  if (alimony) add("PENSAO", "Pensão alimentícia", "desconto", p.alimony_type === "percentual" ? pct(p.alimony_value) : "valor", alimony);

  const taxable = round2(Math.max(0, bases.irrf));
  const irrfDeps = tables.irrf.dependentDeduction * input.irrfDependents;
  const irrf = calcIrrf(taxable, inss + irrfDeps + alimony, tables.irrf);
  const irrfRef = [irrf.method === "simplificado" ? "desc. simplificado" : `${input.irrfDependents} dep.`, irrf.reduction ? `red. ${brl.format(irrf.reduction)}` : ""]
    .filter(Boolean)
    .join(" · ");
  if (irrf.tax) add("IRRF", "IRRF", "desconto", irrfRef, irrf.tax);

  // --- Benefícios e descontos contratuais ------------------------------------
  let companyBenefits = 0;
  if (p.vt_enabled && p.vt_daily_amount > 0) {
    const vtDays = entries.some((e) => e.code === "VT_DIAS") ? sumQty("VT_DIAS") : p.vt_days;
    const vtCost = round2(p.vt_daily_amount * vtDays);
    // Estagiário recebe auxílio-transporte sem o desconto de 6%.
    const vtDiscount = regime === "clt" ? round2(Math.min(vtCost, salary * (params.vtMaxDiscountRate / 100))) : 0;
    add("VT_INFO", "Vale-transporte concedido", "informativo", qty(vtDays, "d"), vtCost);
    add("VT", "Vale-transporte", "desconto", pct(params.vtMaxDiscountRate), vtDiscount);
    companyBenefits += vtCost - vtDiscount;
  }
  const food = round2(p.va_monthly + p.vr_monthly);
  if (food > 0) {
    const foodDiscount = round2(food * (p.food_discount_pct / 100));
    add("VA_INFO", "Vale-alimentação/refeição concedido", "informativo", "crédito", food);
    add("VA", "Vale-alimentação/refeição", "desconto", pct(p.food_discount_pct), foodDiscount);
    companyBenefits += food - foodDiscount;
  }
  add("PLANO_SAUDE", "Plano de saúde", "desconto", "mensal", p.health_plan_employee);
  add("PLANO_ODONTO", "Plano odontológico", "desconto", "mensal", p.dental_plan_employee);
  add("SEGURO_VIDA", "Seguro de vida", "desconto", "mensal", p.life_insurance_employee);
  add("CONTRIB_SINDICAL", "Contribuição sindical/assistencial", "desconto", "autorizada", p.union_fee);
  companyBenefits += p.health_plan_company;
  add("ADIANTAMENTO", "Adiantamento salarial", "desconto", "valor", sumAmt("ADIANTAMENTO"));
  add("DESCONTO_DIVERSO", "Outros descontos", "desconto", "valor", sumAmt("DESCONTO_DIVERSO"));

  // --- Totais -----------------------------------------------------------------
  const proventos = round2(lines.filter((l) => l.kind === "provento").reduce((a, l) => a + l.amount, 0));
  const descontos = round2(lines.filter((l) => l.kind === "desconto").reduce((a, l) => a + l.amount, 0));
  const baseFgts = round2(Math.max(0, bases.fgts));
  const fgtsRate = input.employmentType === "aprendiz" ? params.fgtsApprenticeRate : params.fgtsRate;
  const fgts = regime === "clt" ? round2(baseFgts * (fgtsRate / 100)) : 0;
  if (fgts) add("FGTS", `FGTS ${pct(fgtsRate)} (empresa)`, "informativo", "depósito", fgts);
  const liquido = round2(proventos - descontos);
  if (liquido < 0) warnings.push("Líquido negativo: revise descontos e adiantamentos.");
  if (paidDays < 30) warnings.push(`Mês proporcional: ${paidDays} dias pagos.`);
  companyBenefits = round2(companyBenefits);

  return {
    status: "calculada",
    regime,
    paidDays,
    lines,
    totals: {
      proventos,
      descontos,
      liquido,
      baseInss,
      baseIrrf: irrf.base,
      baseFgts: regime === "clt" ? baseFgts : 0,
      inss,
      irrf: irrf.tax,
      fgts,
      beneficiosEmpresa: companyBenefits,
      custoEmpresa: round2(proventos + fgts + companyBenefits),
    },
    warnings,
  };
}

/** Filhos (ou enteados) com menos de 14 anos no último dia da competência. */
export function countChildrenUnder14(
  dependents: { relationship: string; birth_date: string | null }[],
  period: string,
): number {
  const { end } = monthBounds(period);
  const limit = `${Number(end.slice(0, 4)) - 14}${end.slice(4)}`;
  return dependents.filter((d) => (d.relationship === "filho" || d.relationship === "enteado") && d.birth_date && d.birth_date > limit).length;
}
