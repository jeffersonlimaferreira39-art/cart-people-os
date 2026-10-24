import "server-only";
import { createClient } from "@/lib/supabase/server";
import { viewerCan, type Viewer } from "@/lib/auth/viewer";
import { addDays, addMonths, todayIn } from "@/lib/domain/dates";
import { inUnit } from "./scope";

type Row = {
  id: string;
  full_name: string;
  status: string;
  hire_date: string;
  termination_date: string | null;
  department: { name: string } | null;
};

export type DashboardStats = {
  today: string;
  headcount: number;
  onboarding: number;
  hiresThisMonth: number;
  terminationsThisMonth: number;
  turnover12m: number | null;
  absentToday: { name: string; type: string; until: string }[];
  byDepartment: { name: string; count: number }[];
  workAnniversaries: { id: string; name: string; date: string; years: number }[];
  pendingLeaves: number;
  dpSubmitted: number;
  dpReady: number;
  expiringDocuments: number;
};

/** Indicadores calculados sobre o que a RLS deixa o usuário ver, na unidade em foco. */
export async function getDashboardStats(viewer: Viewer): Promise<DashboardStats> {
  const supabase = await createClient();
  const today = todayIn(viewer.units.find((u) => u.id === viewer.selectedUnitId)?.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearAgo = addMonths(today, -12);

  const empQ = inUnit(
    supabase
      .from("employees")
      .select("id, full_name, status, hire_date, termination_date, department:departments(name)")
      .limit(5000),
    viewer,
  );
  const leavesQ = inUnit(
    supabase
      .from("leave_requests")
      .select("type, end_date, employee:employees(full_name)")
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
    viewer,
  );
  const pendingQ = viewerCan(viewer, "decideLeaves")
    ? inUnit(supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"), viewer)
    : null;
  const dpSubQ = viewerCan(viewer, "manageDp")
    ? inUnit(supabase.from("dp_events").select("id", { count: "exact", head: true }).eq("status", "submitted"), viewer)
    : null;
  const dpReadyQ = viewerCan(viewer, "exportPayroll")
    ? inUnit(supabase.from("dp_events").select("id", { count: "exact", head: true }).eq("status", "approved"), viewer)
    : null;
  const docsQ = viewerCan(viewer, "managePeople")
    ? inUnit(
        supabase
          .from("employee_documents")
          .select("id", { count: "exact", head: true })
          .gte("expires_at", today)
          .lte("expires_at", addDays(today, 30)),
        viewer,
      )
    : null;

  const [emp, leaves, pending, dpSub, dpReady, docs] = await Promise.all([
    empQ,
    leavesQ,
    pendingQ ?? Promise.resolve({ count: 0 }),
    dpSubQ ?? Promise.resolve({ count: 0 }),
    dpReadyQ ?? Promise.resolve({ count: 0 }),
    docsQ ?? Promise.resolve({ count: 0 }),
  ]);

  const rows = (emp.data ?? []) as unknown as Row[];
  const active = rows.filter((r) => r.status !== "terminated");
  const hires12 = rows.filter((r) => r.hire_date >= yearAgo && r.hire_date <= today).length;
  const terms12 = rows.filter((r) => r.termination_date && r.termination_date >= yearAgo && r.termination_date <= today).length;

  const deptMap = new Map<string, number>();
  for (const r of active) {
    const k = r.department?.name ?? "Sem departamento";
    deptMap.set(k, (deptMap.get(k) ?? 0) + 1);
  }

  const month = today.slice(5, 7);
  const workAnniversaries = active
    .filter((r) => r.hire_date.slice(5, 7) === month && r.hire_date.slice(0, 4) < today.slice(0, 4))
    .map((r) => ({
      id: r.id,
      name: r.full_name,
      date: r.hire_date,
      years: Number(today.slice(0, 4)) - Number(r.hire_date.slice(0, 4)),
    }))
    .sort((a, b) => a.date.slice(8).localeCompare(b.date.slice(8)));

  return {
    today,
    headcount: active.length,
    onboarding: active.filter((r) => r.status === "onboarding").length,
    hiresThisMonth: rows.filter((r) => r.hire_date >= monthStart && r.hire_date <= today).length,
    terminationsThisMonth: rows.filter((r) => r.termination_date && r.termination_date >= monthStart && r.termination_date <= today).length,
    // Rotatividade anual: média de admissões e desligamentos sobre o quadro atual.
    turnover12m: active.length ? Math.round((((hires12 + terms12) / 2) / active.length) * 1000) / 10 : null,
    absentToday: (leaves.data ?? []).map((l) => ({
      name: (l.employee as unknown as { full_name: string })?.full_name ?? "",
      type: l.type,
      until: l.end_date,
    })),
    byDepartment: [...deptMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    workAnniversaries,
    pendingLeaves: pending.count ?? 0,
    dpSubmitted: dpSub.count ?? 0,
    dpReady: dpReady.count ?? 0,
    expiringDocuments: docs.count ?? 0,
  };
}
