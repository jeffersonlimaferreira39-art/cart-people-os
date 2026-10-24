import "server-only";
import { createClient } from "@/lib/supabase/server";
import { viewerCan, type Viewer } from "@/lib/auth/viewer";
import { addMonths, monthBounds } from "@/lib/domain/dates";
import {
  averageVariables, calculateThirteenth, calculateVacation, fixedRemuneration, monthRange, vacationDaysInMonth,
  type HistoryEntry, type PayrollKind,
} from "@/lib/domain/payroll-annual";
import { formatDate } from "@/lib/format";
import {
  DEFAULT_PROFILE, calculatePayroll, countChildrenUnder14, round2,
   type PayrollProfile, type PayrollResult, type RecurringItem,
} from "@/lib/domain/payroll";
import { REFERENCE_TABLES, TABLE_SCHEMAS, type PayrollTables, type TableKind } from "@/lib/domain/payroll-tables";
import { inUnit } from "./scope";

const PROFILE_COLUMNS =
  "employee_id, salary_type, monthly_hours, vt_enabled, vt_daily_amount, vt_days, va_monthly, vr_monthly, food_discount_pct," +
  " health_plan_employee, health_plan_company, dental_plan_employee, life_insurance_employee, unhealthiness_grade, hazard_pay," +
  " union_fee, alimony_type, alimony_value, notes";
const ITEM_COLUMNS =
  "id, employee_id, kind, code, description, amount, percent, incidence_inss, incidence_irrf, incidence_fgts, start_period, end_period";

/** O PostgREST devolve numeric como número ou string; normaliza para número. */
function toProfile(row: Record<string, unknown> | null | undefined): PayrollProfile {
  if (!row) return DEFAULT_PROFILE;
  const out: Record<string, unknown> = { ...DEFAULT_PROFILE };
  for (const k of Object.keys(DEFAULT_PROFILE)) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    out[k] = typeof (DEFAULT_PROFILE as Record<string, unknown>)[k] === "number" ? Number(v) : v;
  }
  return out as PayrollProfile;
}
const toItem = (r: Record<string, unknown>): RecurringItem & { id: string; employee_id: string } => ({
  id: r.id as string,
  employee_id: r.employee_id as string,
  kind: r.kind as RecurringItem["kind"],
  code: r.code as string,
  description: r.description as string,
  amount: r.amount === null ? null : Number(r.amount),
  percent: r.percent === null ? null : Number(r.percent),
  incidence_inss: Boolean(r.incidence_inss),
  incidence_irrf: Boolean(r.incidence_irrf),
  incidence_fgts: Boolean(r.incidence_fgts),
  start_period: r.start_period as string,
  end_period: (r.end_period as string | null) ?? null,
});

/** Tabelas vigentes na competência: cadastradas pela empresa ou, na falta, as de referência. */
export async function getPayrollTables(viewer: Viewer, period: string): Promise<PayrollTables> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payroll_tax_tables")
    .select("kind, valid_from, data")
    .eq("organization_id", viewer.organization.id)
    .lte("valid_from", `${period}-01`)
    .order("valid_from", { ascending: false });
  const tables = { ...REFERENCE_TABLES } as Omit<PayrollTables, "sources">;
  const sources: Record<TableKind, string> = { inss: "referência", irrf: "referência", salario_familia: "referência", parametros: "referência" };
  for (const kind of Object.keys(TABLE_SCHEMAS) as TableKind[]) {
    const row = data?.find((r) => r.kind === kind);
    if (!row) continue;
    const parsed = TABLE_SCHEMAS[kind].safeParse(row.data);
    if (!parsed.success) continue;
    (tables as Record<TableKind, unknown>)[kind] = parsed.data;
    sources[kind] = row.valid_from as string;
  }
  return { ...tables, sources };
}

export type TableVersion = { id: string; kind: TableKind; valid_from: string; data: unknown; notes: string | null; created_at: string };

export async function listTableVersions(viewer: Viewer): Promise<TableVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payroll_tax_tables")
    .select("id, kind, valid_from, data, notes, created_at")
    .eq("organization_id", viewer.organization.id)
    .order("valid_from", { ascending: false });
  return (data ?? []) as TableVersion[];
}

export type Dependent = {
  id: string;
  full_name: string;
  relationship: string;
  birth_date: string | null;
  ir_dependent: boolean;
};

export type EmployeePayrollData = {
  baseSalary: number | null;
  profile: PayrollProfile;
  hasProfile: boolean;
  notes: string | null;
  items: (RecurringItem & { id: string })[];
  dependents: Dependent[];
};

/** Dados de remuneração de um colaborador (RLS: Admin/RH/DP da unidade ou o titular). */
export async function getEmployeePayroll(employeeId: string): Promise<EmployeePayrollData> {
  const supabase = await createClient();
  const [sens, prof, items, deps] = await Promise.all([
    supabase.from("employee_sensitive").select("base_salary").eq("employee_id", employeeId).maybeSingle(),
    supabase.from("employee_payroll_profile").select(PROFILE_COLUMNS).eq("employee_id", employeeId).maybeSingle(),
    supabase.from("employee_payroll_items").select(ITEM_COLUMNS).eq("employee_id", employeeId).order("start_period"),
    supabase.from("dependents").select("id, full_name, relationship, birth_date, ir_dependent").eq("employee_id", employeeId).order("birth_date"),
  ]);
  const profRow = prof.data as unknown as Record<string, unknown> | null;
  return {
    baseSalary: sens.data?.base_salary === null || sens.data?.base_salary === undefined ? null : Number(sens.data.base_salary),
    profile: toProfile(profRow),
    hasProfile: Boolean(profRow),
    notes: (profRow?.notes as string | null) ?? null,
    items: ((items.data ?? []) as Record<string, unknown>[]).map(toItem),
    dependents: (deps.data ?? []) as Dependent[],
  };
}

export type PreviewRow = {
  /** Único por linha (um colaborador pode ter mais de um recibo de férias no mês). */
  key: string;
  employee: { id: string; full_name: string; registration_number: string; employment_type: string; unit_code: string; department: string };
  result: PayrollResult;
  childrenUnder14: number;
  irrfDependents: number;
  /** Contexto da linha (ex.: período das férias). */
  note?: string;
};

export type PayrollPreview = { period: string; kind: PayrollKind; tables: PayrollTables; rows: PreviewRow[] };

type EmpRow = {
  id: string;
  full_name: string;
  registration_number: string;
  employment_type: string;
  hire_date: string;
  termination_date: string | null;
  unit: { code: string } | null;
  department: { name: string } | null;
};

/**
 * Prévia da competência para a unidade em foco. Horas extras e noturnas do
 * ponto entram como sugestão; lançamento manual do mesmo código prevalece.
 */
export async function getPayrollPreview(
  viewer: Viewer,
  period: string,
  employeeId?: string,
  kind: PayrollKind = "mensal",
): Promise<PayrollPreview> {
  if (!viewerCan(viewer, "viewSensitive")) throw new Error("Sem acesso à prévia da folha.");
  return computePreview(viewer, period, kind, { employeeId, scopeToUnit: true, includeTime: viewerCan(viewer, "viewTime") });
}

/**
 * "Minha folha": a prévia do próprio colaborador. A RLS libera ao titular a
 * leitura dos próprios dados de remuneração, dependentes, ausências e ponto.
 */
export async function getMyPayroll(viewer: Viewer, period: string, kind: PayrollKind = "mensal"): Promise<PreviewRow[]> {
  if (!viewer.employee) return [];
  const preview = await computePreview(viewer, period, kind, { employeeId: viewer.employee.id, scopeToUnit: false, includeTime: true });
  return preview.rows;
}

/** Meses usados nas médias de variáveis de cada tipo de folha. */
function averagesWindow(kind: PayrollKind, period: string): { from: string; to: string } | null {
  const prev = addMonths(`${period}-01`, -1).slice(0, 7);
  if (kind === "decimo1" || kind === "decimo2") {
    const jan = `${period.slice(0, 4)}-01`;
    return prev >= jan ? { from: jan, to: prev } : null;
  }
  if (kind === "ferias") return { from: addMonths(`${period}-01`, -12).slice(0, 7), to: prev };
  return null;
}

async function computePreview(
  viewer: Viewer,
  period: string,
  kind: PayrollKind,
  opts: { employeeId?: string; scopeToUnit: boolean; includeTime: boolean },
): Promise<PayrollPreview> {
  const { employeeId } = opts;
  const supabase = await createClient();
  const { start, end } = monthBounds(period);
  // 13º: quem esteve ativo em algum momento do ano; demais: ativos na competência.
  const activeFrom = kind === "decimo1" || kind === "decimo2" ? `${period.slice(0, 4)}-01-01` : start;

  let empQ = supabase
    .from("employees")
    .select("id, full_name, registration_number, employment_type, hire_date, termination_date, unit:units(code), department:departments(name)")
    .lte("hire_date", end)
    .or(`termination_date.is.null,termination_date.gte.${activeFrom}`)
    .order("full_name")
    .limit(5000);
  if (opts.scopeToUnit) empQ = inUnit(empQ, viewer);
  if (employeeId) empQ = empQ.eq("id", employeeId);
  const { data: empData, error } = await empQ;
  if (error) throw new Error(error.message);
  const emps = (empData ?? []) as unknown as EmpRow[];
  const ids = emps.map((e) => e.id);
  const tables = await getPayrollTables(viewer, period);
  if (!ids.length) return { period, kind, tables, rows: [] };

  const win = averagesWindow(kind, period);
  const histFrom = win?.from ?? period;
  const timeFrom = `${histFrom}-01`;

  const chunk = <T,>(arr: T[], n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  type Q = { eq: (c: string, v: string) => Q; gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q };
  const fetchIn = async <T,>(table: string, cols: string, extra?: (q: Q) => Q) => {
    const out: T[] = [];
    for (const part of chunk(ids)) {
      let q = supabase.from(table).select(cols).in("employee_id", part).limit(100000);
      if (extra) q = extra(q as unknown as Q) as unknown as typeof q;
      const { data } = await q;
      out.push(...((data ?? []) as T[]));
    }
    return out;
  };

  const [sens, profiles, items, entries, deps, time, vacations] = await Promise.all([
    fetchIn<{ employee_id: string; base_salary: number | string | null }>("employee_sensitive", "employee_id, base_salary"),
    fetchIn<Record<string, unknown>>("employee_payroll_profile", PROFILE_COLUMNS),
    fetchIn<Record<string, unknown>>("employee_payroll_items", ITEM_COLUMNS),
    fetchIn<{ employee_id: string; period: string; code: string; quantity: number | null; amount: number | null }>(
      "payroll_entries", "employee_id, period, code, quantity, amount", (q) => q.gte("period", histFrom).lte("period", period)),
    fetchIn<{ employee_id: string; relationship: string; birth_date: string | null; ir_dependent: boolean }>(
      "dependents", "employee_id, relationship, birth_date, ir_dependent"),
    opts.includeTime
      ? fetchIn<{ employee_id: string; work_date: string; overtime_minutes: number; night_minutes: number }>(
          "time_entries", "employee_id, work_date, overtime_minutes, night_minutes", (q) => q.gte("work_date", timeFrom).lte("work_date", end))
      : Promise.resolve([]),
    kind === "mensal" || kind === "ferias"
      ? fetchIn<{ employee_id: string; start_date: string; end_date: string; days: number; sell_days: number }>(
          "leave_requests", "employee_id, start_date, end_date, days, sell_days",
          (q) => q.eq("type", "ferias").eq("status", "approved").lte("start_date", end).gte("end_date", start))
      : Promise.resolve([]),
  ]);

  const by = <T extends { employee_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.employee_id) ?? m.set(r.employee_id, []).get(r.employee_id)!).push(r);
    return m;
  };
  const salaryOf = new Map(sens.map((s) => [s.employee_id, s.base_salary === null ? null : Number(s.base_salary)]));
  const profileOf = new Map(profiles.map((p) => [p.employee_id as string, p]));
  const itemsOf = by(items.map(toItem));
  const entriesOf = by(entries);
  const depsOf = by(deps);
  const timeOf = by(time);
  const vacationsOf = by(vacations);

  /** Lançamentos manuais + horas do ponto (por mês) de um colaborador. */
  const historyOf = (id: string): HistoryEntry[] => {
    const manual = (entriesOf.get(id) ?? []).map((x) => ({
      period: x.period,
      code: x.code,
      quantity: x.quantity === null ? null : Number(x.quantity),
      amount: x.amount === null ? null : Number(x.amount),
      source: "manual" as const,
    }));
    const perMonth = new Map<string, { ot: number; night: number }>();
    for (const t of timeOf.get(id) ?? []) {
      const m = t.work_date.slice(0, 7);
      const acc = perMonth.get(m) ?? { ot: 0, night: 0 };
      acc.ot += t.overtime_minutes;
      acc.night += t.night_minutes;
      perMonth.set(m, acc);
    }
    const ponto: HistoryEntry[] = [];
    for (const [m, v] of perMonth) {
      if (v.ot) ponto.push({ period: m, code: "HE50", quantity: Math.round((v.ot / 60) * 100) / 100, amount: null, source: "ponto" });
      if (v.night) ponto.push({ period: m, code: "ADN", quantity: Math.round((v.night / 60) * 100) / 100, amount: null, source: "ponto" });
    }
    return [...manual, ...ponto];
  };

  const rows: PreviewRow[] = [];
  for (const e of emps) {
    const myDeps = depsOf.get(e.id) ?? [];
    const childrenUnder14 = countChildrenUnder14(myDeps, period);
    const irrfDependents = myDeps.filter((d) => d.ir_dependent).length;
    const history = historyOf(e.id);
    const current = history.filter((h) => h.period === period);
    const informed = (code: string) => {
      const list = current.filter((h) => h.code === code && h.source === "manual");
      return list.length ? list.reduce((a, h) => a + (h.amount ?? 0), 0) : undefined;
    };
    const baseInput = {
      employmentType: e.employment_type,
      hireDate: e.hire_date,
      terminationDate: e.termination_date,
      baseSalary: salaryOf.get(e.id) ?? null,
      profile: toProfile(profileOf.get(e.id)),
      items: itemsOf.get(e.id) ?? [],
      irrfDependents,
      tables,
    };
    const employee = {
      id: e.id,
      full_name: e.full_name,
      registration_number: e.registration_number,
      employment_type: e.employment_type,
      unit_code: e.unit?.code ?? "",
      department: e.department?.name ?? "",
    };
    /** Médias no intervalo, só nos meses de vínculo. */
    const averagesFor = (w: { from: string; to: string } | null, override?: number) => {
      if (override !== undefined) return { value: round2(override), source: "informada" as const };
      if (!w) return { value: 0, source: "calculada" as const };
      const months = monthRange(w.from, w.to).filter((m) => m >= e.hire_date.slice(0, 7) && (!e.termination_date || m <= e.termination_date.slice(0, 7)));
      if (!months.length) return { value: 0, source: "calculada" as const };
      const hourRate = fixedRemuneration(baseInput, period).hourRate;
      return { value: averageVariables(history, months, hourRate, tables).value, source: "calculada" as const };
    };

    if (kind === "mensal") {
      const result = calculatePayroll({
        ...baseInput,
        period,
        entries: current.map(({ code, quantity, amount, source }) => ({ code, quantity, amount, source })),
        childrenUnder14,
        vacationDays: vacationDaysInMonth(vacationsOf.get(e.id) ?? [], period),
      });
      rows.push({ key: e.id, employee, result, childrenUnder14, irrfDependents });
    } else if (kind === "decimo1" || kind === "decimo2") {
      const avg = averagesFor(win, informed("MEDIAS_13"));
      const result = calculateThirteenth({
        ...baseInput,
        stage: kind === "decimo1" ? "primeira" : "segunda",
        period,
        averages: avg.value,
        averagesSource: avg.source,
        firstInstallmentPaid: kind === "decimo2" ? informed("ADIANTAMENTO_13") : undefined,
      });
      rows.push({ key: e.id, employee, result, childrenUnder14, irrfDependents });
    } else {
      const starting = (vacationsOf.get(e.id) ?? []).filter((v) => v.start_date >= start && v.start_date <= end);
      for (const v of starting) {
        const w = { from: addMonths(`${v.start_date.slice(0, 7)}-01`, -12).slice(0, 7), to: addMonths(`${v.start_date.slice(0, 7)}-01`, -1).slice(0, 7) };
        const avg = averagesFor(w, informed("MEDIAS_FERIAS"));
        const result = calculateVacation({
          ...baseInput,
          vacation: { start: v.start_date, days: Number(v.days), sellDays: Number(v.sell_days) },
          averages: avg.value,
          averagesSource: avg.source,
        });
        rows.push({
          key: `${e.id}-${v.start_date}`,
          employee,
          result,
          childrenUnder14,
          irrfDependents,
          note: `${formatDate(v.start_date)} a ${formatDate(v.end_date)} · ${v.days} d${Number(v.sell_days) ? ` + ${v.sell_days} d de abono` : ""}`,
        });
      }
    }
  }
  return { period, kind, tables, rows };
}

export type EntryRow = { id: string; code: string; quantity: number | null; amount: number | null; notes: string | null; created_at: string };

export async function listEntries(employeeId: string, period: string): Promise<EntryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payroll_entries")
    .select("id, code, quantity, amount, notes, created_at")
    .eq("employee_id", employeeId)
    .eq("period", period)
    .order("created_at");
  return ((data ?? []) as EntryRow[]).map((r) => ({ ...r, quantity: r.quantity === null ? null : Number(r.quantity), amount: r.amount === null ? null : Number(r.amount) }));
}
