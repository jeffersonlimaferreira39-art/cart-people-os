import "server-only";
import { createClient } from "@/lib/supabase/server";
import { viewerCan, type Viewer } from "@/lib/auth/viewer";
import { monthBounds } from "@/lib/domain/dates";
import {
  DEFAULT_PROFILE, calculatePayroll, countChildrenUnder14,
  type MonthEntry, type PayrollProfile, type PayrollResult, type RecurringItem,
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
  employee: { id: string; full_name: string; registration_number: string; employment_type: string; unit_code: string; department: string };
  result: PayrollResult;
  childrenUnder14: number;
  irrfDependents: number;
};

export type PayrollPreview = { period: string; tables: PayrollTables; rows: PreviewRow[] };

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
export async function getPayrollPreview(viewer: Viewer, period: string, employeeId?: string): Promise<PayrollPreview> {
  if (!viewerCan(viewer, "viewSensitive")) throw new Error("Sem acesso à prévia da folha.");
  const supabase = await createClient();
  const { start, end } = monthBounds(period);

  let empQ = supabase
    .from("employees")
    .select("id, full_name, registration_number, employment_type, hire_date, termination_date, unit:units(code), department:departments(name)")
    .lte("hire_date", end)
    .or(`termination_date.is.null,termination_date.gte.${start}`)
    .order("full_name")
    .limit(5000);
  empQ = inUnit(empQ, viewer);
  if (employeeId) empQ = empQ.eq("id", employeeId);
  const { data: empData, error } = await empQ;
  if (error) throw new Error(error.message);
  const emps = (empData ?? []) as unknown as EmpRow[];
  const ids = emps.map((e) => e.id);
  const tables = await getPayrollTables(viewer, period);
  if (!ids.length) return { period, tables, rows: [] };

  const chunk = <T,>(arr: T[], n = 200) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const fetchIn = async <T,>(table: string, cols: string, extra?: (q: ReturnType<typeof supabase.from>) => unknown) => {
    const out: T[] = [];
    for (const part of chunk(ids)) {
      let q = supabase.from(table).select(cols).in("employee_id", part).limit(100000);
      if (extra) q = extra(q as never) as typeof q;
      const { data } = await q;
      out.push(...((data ?? []) as T[]));
    }
    return out;
  };

  const [sens, profiles, items, entries, deps, time] = await Promise.all([
    fetchIn<{ employee_id: string; base_salary: number | string | null }>("employee_sensitive", "employee_id, base_salary"),
    fetchIn<Record<string, unknown>>("employee_payroll_profile", PROFILE_COLUMNS),
    fetchIn<Record<string, unknown>>("employee_payroll_items", ITEM_COLUMNS),
    fetchIn<{ employee_id: string; code: string; quantity: number | null; amount: number | null }>(
      "payroll_entries", "employee_id, code, quantity, amount", (q) => (q as unknown as { eq: (c: string, v: string) => unknown }).eq("period", period)),
    fetchIn<{ employee_id: string; relationship: string; birth_date: string | null; ir_dependent: boolean }>(
      "dependents", "employee_id, relationship, birth_date, ir_dependent"),
    viewerCan(viewer, "viewTime")
      ? fetchIn<{ employee_id: string; overtime_minutes: number; night_minutes: number }>(
          "time_entries", "employee_id, overtime_minutes, night_minutes",
          (q) => (q as unknown as { gte: (c: string, v: string) => { lte: (c: string, v: string) => unknown } }).gte("work_date", start).lte("work_date", end))
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

  const rows = emps.map((e): PreviewRow => {
    const myDeps = depsOf.get(e.id) ?? [];
    const childrenUnder14 = countChildrenUnder14(myDeps, period);
    const irrfDependents = myDeps.filter((d) => d.ir_dependent).length;
    const t = timeOf.get(e.id) ?? [];
    const overtime = t.reduce((a, x) => a + x.overtime_minutes, 0);
    const night = t.reduce((a, x) => a + x.night_minutes, 0);
    const monthEntries: MonthEntry[] = [
      ...(entriesOf.get(e.id) ?? []).map((x) => ({
        code: x.code,
        quantity: x.quantity === null ? null : Number(x.quantity),
        amount: x.amount === null ? null : Number(x.amount),
        source: "manual" as const,
      })),
      ...(overtime ? [{ code: "HE50", quantity: Math.round((overtime / 60) * 100) / 100, amount: null, source: "ponto" as const }] : []),
      ...(night ? [{ code: "ADN", quantity: Math.round((night / 60) * 100) / 100, amount: null, source: "ponto" as const }] : []),
    ];
    const result = calculatePayroll({
      period,
      employmentType: e.employment_type,
      hireDate: e.hire_date,
      terminationDate: e.termination_date,
      baseSalary: salaryOf.get(e.id) ?? null,
      profile: toProfile(profileOf.get(e.id)),
      items: itemsOf.get(e.id) ?? [],
      entries: monthEntries,
      irrfDependents,
      childrenUnder14,
      tables,
    });
    return {
      employee: {
        id: e.id,
        full_name: e.full_name,
        registration_number: e.registration_number,
        employment_type: e.employment_type,
        unit_code: e.unit?.code ?? "",
        department: e.department?.name ?? "",
      },
      result,
      childrenUnder14,
      irrfDependents,
    };
  });
  return { period, tables, rows };
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
