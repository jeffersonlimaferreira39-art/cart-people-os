import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import { monthBounds } from "@/lib/domain/dates";
import { inUnit } from "./scope";

export type TimeSummaryRow = {
  employee_id: string;
  full_name: string;
  registration_number: string;
  unit_code: string;
  days: number;
  worked: number;
  overtime: number;
  absence: number;
  night: number;
};

export async function monthlySummary(viewer: Viewer, period: string): Promise<TimeSummaryRow[]> {
  const { start, end } = monthBounds(period);
  const supabase = await createClient();
  let q = supabase
    .from("time_entries")
    .select("employee_id, worked_minutes, overtime_minutes, absence_minutes, night_minutes, employee:employees(full_name, registration_number), unit:units(code)")
    .gte("work_date", start)
    .lte("work_date", end)
    .limit(20000);
  q = inUnit(q, viewer);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const map = new Map<string, TimeSummaryRow>();
  for (const r of data ?? []) {
    const emp = r.employee as unknown as { full_name: string; registration_number: string };
    const row = map.get(r.employee_id) ?? {
      employee_id: r.employee_id,
      full_name: emp?.full_name ?? "",
      registration_number: emp?.registration_number ?? "",
      unit_code: (r.unit as unknown as { code: string })?.code ?? "",
      days: 0, worked: 0, overtime: 0, absence: 0, night: 0,
    };
    row.days += 1;
    row.worked += r.worked_minutes;
    row.overtime += r.overtime_minutes;
    row.absence += r.absence_minutes;
    row.night += r.night_minutes;
    map.set(r.employee_id, row);
  }
  return [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
}

export async function listImports(viewer: Viewer) {
  const supabase = await createClient();
  let q = supabase
    .from("time_imports")
    .select("id, provider, file_name, period_start, period_end, row_count, rejected_count, created_at, unit:units(name)")
    .order("created_at", { ascending: false })
    .limit(12);
  q = inUnit(q, viewer);
  const { data } = await q;
  return data ?? [];
}
