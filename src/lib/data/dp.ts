import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import type { DpEvent } from "@/lib/types";
import { inUnit } from "./scope";

const SELECT = "*, employee:employees(full_name, registration_number)";

export async function listDpEvents(viewer: Viewer, status?: string) {
  const supabase = await createClient();
  let q = supabase.from("dp_events").select(SELECT).order("effective_date", { ascending: false }).limit(300);
  q = inUnit(q, viewer);
  if (status) q = q.in("status", status.split(","));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DpEvent[];
}

export async function getDpEvent(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dp_events")
    .select("*, employee:employees(id, full_name, registration_number), unit:units(name, code)")
    .eq("id", id)
    .maybeSingle();
  return data as (DpEvent & { employee: { id: string; full_name: string; registration_number: string }; unit: { name: string; code: string } }) | null;
}

export async function listBatches(viewer: Viewer) {
  const supabase = await createClient();
  let q = supabase
    .from("payroll_export_batches")
    .select("id, provider, period, file_name, event_count, created_at, unit_id")
    .order("created_at", { ascending: false })
    .limit(24);
  if (viewer.selectedUnitId) q = q.or(`unit_id.eq.${viewer.selectedUnitId},unit_id.is.null`);
  const { data } = await q;
  return data ?? [];
}

/** Nome de quem criou/aprovou, quando visível pela RLS (via vínculo de colaborador). */
export async function getPeopleNames(userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return {} as Record<string, string>;
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("user_id, full_name").in("user_id", ids);
  return Object.fromEntries((data ?? []).map((r) => [r.user_id, r.full_name])) as Record<string, string>;
}
