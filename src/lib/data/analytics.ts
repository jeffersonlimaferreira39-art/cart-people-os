import "server-only";
import { createClient } from "@/lib/supabase/server";
import { viewerCan, type Viewer } from "@/lib/auth/viewer";
import { todayIn } from "@/lib/domain/dates";
import {
  countBy, headcountSeries, leaveDaysByType, monthsBack, periodStart, summarize, tenureDistribution, timeByMonth,
  type MonthPoint, type PeriodMonths, type Summary,
} from "@/lib/domain/analytics";
import { EMPLOYMENT_TYPE_LABELS, LEAVE_TYPE_LABELS } from "@/lib/format";
import { inUnit } from "./scope";

type EmployeeRow = {
  hire_date: string;
  termination_date: string | null;
  status: string;
  employment_type: keyof typeof EMPLOYMENT_TYPE_LABELS;
  unit: { name: string } | null;
  department: { name: string } | null;
  position: { title: string } | null;
};

export type Analytics = {
  today: string;
  from: string;
  months: PeriodMonths;
  summary: Summary;
  series: MonthPoint[];
  byDepartment: { label: string; count: number }[];
  byUnit: { label: string; count: number }[];
  byPosition: { label: string; count: number }[];
  byEmploymentType: { label: string; count: number }[];
  tenure: { label: string; count: number }[];
  leaveDays: { label: string; days: number }[];
  /** null quando o papel não vê o ponto. */
  time: { period: string; overtime: number; absence: number }[] | null;
};

/**
 * Indicadores da unidade em foco, calculados sobre o que a RLS deixa o usuário
 * ver (o gestor enxerga só a própria equipe). Sem dados sensíveis.
 */
export async function getAnalytics(viewer: Viewer, months: PeriodMonths): Promise<Analytics> {
  const supabase = await createClient();
  const today = todayIn(viewer.units.find((u) => u.id === viewer.selectedUnitId)?.timezone);
  const from = periodStart(today, months);

  const empQ = inUnit(
    supabase
      .from("employees")
      .select("hire_date, termination_date, status, employment_type, unit:units(name), department:departments(name), position:positions(title)")
      .limit(10000),
    viewer,
  );
  const leaveQ = inUnit(
    supabase
      .from("leave_requests")
      .select("type, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", from)
      .limit(20000),
    viewer,
  );
  const timeQ = viewerCan(viewer, "viewTime")
    ? inUnit(
        supabase
          .from("time_entries")
          .select("work_date, overtime_minutes, absence_minutes")
          .gte("work_date", from)
          .lte("work_date", today)
          .limit(100000),
        viewer,
      )
    : null;

  const [emp, leaves, time] = await Promise.all([empQ, leaveQ, timeQ ?? Promise.resolve(null)]);
  if (emp.error) throw new Error(emp.error.message);
  const rows = (emp.data ?? []) as unknown as EmployeeRow[];
  const active = rows.filter((r) => r.status !== "terminated");

  return {
    today,
    from,
    months,
    summary: summarize(rows, today, months),
    series: headcountSeries(rows, today, months),
    byDepartment: countBy(active, (r) => r.department?.name, "Sem departamento"),
    byUnit: countBy(active, (r) => r.unit?.name),
    byPosition: countBy(active, (r) => r.position?.title, "Sem cargo"),
    byEmploymentType: countBy(active, (r) => EMPLOYMENT_TYPE_LABELS[r.employment_type]),
    tenure: tenureDistribution(rows, today),
    leaveDays: leaveDaysByType(leaves.data ?? [], from, today).map((l) => ({
      label: LEAVE_TYPE_LABELS[l.type as keyof typeof LEAVE_TYPE_LABELS] ?? l.type,
      days: l.days,
    })),
    time: time ? timeByMonth(time.data ?? [], monthsBack(today, months)) : null,
  };
}
