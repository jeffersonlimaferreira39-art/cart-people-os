import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import type { LeaveRequest } from "@/lib/types";
import { addDays, todayIn } from "@/lib/domain/dates";
import { inUnit } from "./scope";

const SELECT = "*, employee:employees(full_name, registration_number, user_id)";

export async function listLeaves(viewer: Viewer, opts: { status?: string; from?: string; to?: string; limit?: number }) {
  const supabase = await createClient();
  let q = supabase.from("leave_requests").select(SELECT).order("start_date", { ascending: false }).limit(opts.limit ?? 200);
  q = inUnit(q, viewer);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.from) q = q.gte("end_date", opts.from);
  if (opts.to) q = q.lte("start_date", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LeaveRequest[];
}

/** Pendências que o usuário pode decidir (não inclui as próprias). */
export async function listPendingForDecision(viewer: Viewer) {
  const supabase = await createClient();
  let q = supabase.from("leave_requests").select(SELECT).eq("status", "pending").order("start_date");
  q = inUnit(q, viewer);
  if (viewer.employee) q = q.neq("employee_id", viewer.employee.id);
  const { data } = await q;
  return (data ?? []) as unknown as LeaveRequest[];
}

export async function listMyLeaves(viewer: Viewer) {
  if (!viewer.employee) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select(SELECT)
    .eq("employee_id", viewer.employee.id)
    .order("start_date", { ascending: false })
    .limit(30);
  return (data ?? []) as unknown as LeaveRequest[];
}

export async function listUpcoming(viewer: Viewer, days = 45) {
  const today = todayIn();
  return listLeaves(viewer, { status: "approved", from: today, to: addDays(today, days) });
}

/** Pessoas para quem o usuário pode abrir solicitação (RLS + papel). */
export async function listRequestableEmployees(viewer: Viewer) {
  const supabase = await createClient();
  let q = supabase
    .from("employees")
    .select("id, full_name, registration_number, unit_id, hire_date")
    .neq("status", "terminated")
    .order("full_name");
  q = inUnit(q, viewer);
  const { data } = await q;
  return data ?? [];
}
