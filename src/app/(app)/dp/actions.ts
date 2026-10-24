"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, success, type ActionState } from "@/lib/actions";
import { DP_EVENT_TYPES, buildPayload } from "@/lib/domain/dp-events";
import { isIsoDate, monthBounds } from "@/lib/domain/dates";

const baseSchema = z.object({
  employee_id: z.uuid("Escolha o colaborador."),
  type: z.enum(DP_EVENT_TYPES),
  effective_date: z.string().refine(isIsoDate, "Data inválida."),
  notes: z.string().max(1000).optional(),
  submit: z.enum(["draft", "submitted"]).default("draft"),
});

export async function createDpEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageDp")) return fail("Seu perfil não registra movimentações.");
  const raw = formToObject(form);
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const fe: Record<string, string[]> = {};
    parsed.error.issues.forEach((i) => (fe[i.path.join(".")] ??= []).push(i.message));
    return fail("Revise os campos destacados.", fe);
  }
  const { payload, errors } = buildPayload(parsed.data.type, raw);
  if (Object.keys(errors).length) return fail("Revise os campos destacados.", errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dp_events")
    .insert({
      employee_id: parsed.data.employee_id,
      organization_id: viewer.organization.id,
      type: parsed.data.type,
      effective_date: parsed.data.effective_date,
      notes: parsed.data.notes ?? null,
      status: parsed.data.submit,
      payload,
    })
    .select("id")
    .single();
  if (error || !data) return fromDbError(error);
  redirect(`/dp/${data.id}`);
}

const TRANSITIONS = ["submitted", "approved", "rejected", "cancelled", "draft"] as const;

export async function transitionDpEvent(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageDp")) return fail("Seu perfil não altera movimentações.");
  const to = z.enum(TRANSITIONS).safeParse(form.get("to"));
  if (!to.success) return fail("Ação inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("dp_events").update({ status: to.data }).eq("id", id).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Movimentação não encontrada ou fora do seu escopo.");
  refresh();
  const msg = { submitted: "Enviada para aprovação.", approved: "Movimentação aprovada.", rejected: "Movimentação recusada.", cancelled: "Movimentação cancelada.", draft: "Voltou para rascunho." };
  return success(msg[to.data]);
}

/**
 * Gera um lote para a folha com as movimentações aprovadas até o fim do período,
 * marcando-as como enviadas. O arquivo é baixado pela rota /dp/lotes/[id].
 */
export async function createPayrollBatch(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "exportPayroll")) return fail("Seu perfil não gera lotes para a folha.");
  const period = String(form.get("period") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail("Informe a competência no formato AAAA-MM.");
  const { end } = monthBounds(period);

  const supabase = await createClient();
  let q = supabase.from("dp_events").select("id").eq("status", "approved").lte("effective_date", end);
  if (viewer.selectedUnitId) q = q.eq("unit_id", viewer.selectedUnitId);
  const { data: events, error: qErr } = await q;
  if (qErr) return fromDbError(qErr);
  if (!events?.length) return fail("Não há movimentações aprovadas para esta competência.");

  const { data: batch, error: bErr } = await supabase
    .from("payroll_export_batches")
    .insert({
      organization_id: viewer.organization.id,
      unit_id: viewer.selectedUnitId,
      provider: "generic-csv",
      period,
      file_name: `movimentacoes-${period}.csv`,
      event_count: events.length,
      created_by: viewer.userId,
    })
    .select("id")
    .single();
  if (bErr || !batch) return fromDbError(bErr);

  const { error: uErr } = await supabase
    .from("dp_events")
    .update({ status: "exported", export_batch_id: batch.id })
    .in("id", events.map((e) => e.id));
  if (uErr) return fromDbError(uErr);
  redirect(`/dp?lote=${batch.id}`);
}

/** Cria rascunhos de movimentação para férias aprovadas que ainda não têm uma. */
export async function importApprovedVacations(): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageDp")) return fail("Seu perfil não registra movimentações.");
  const supabase = await createClient();
  let lq = supabase
    .from("leave_requests")
    .select("id, employee_id, start_date, end_date, sell_days")
    .eq("type", "ferias")
    .eq("status", "approved")
    .gte("end_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  if (viewer.selectedUnitId) lq = lq.eq("unit_id", viewer.selectedUnitId);
  const { data: leaves } = await lq;
  if (!leaves?.length) return success("Nenhuma férias aprovada recente encontrada.");

  const { data: existing } = await supabase
    .from("dp_events")
    .select("payload")
    .eq("type", "ferias")
    .in("payload->>leave_request_id", leaves.map((l) => l.id));
  const done = new Set((existing ?? []).map((e) => (e.payload as { leave_request_id?: string }).leave_request_id));
  const rows = leaves
    .filter((l) => !done.has(l.id))
    .map((l) => ({
      employee_id: l.employee_id,
      organization_id: viewer.organization.id,
      type: "ferias",
      effective_date: l.start_date,
      status: "draft",
      payload: { inicio: l.start_date, fim: l.end_date, abono_dias: l.sell_days, leave_request_id: l.id },
    }));
  if (!rows.length) return success("Todas as férias aprovadas já têm movimentação.");
  const { error } = await supabase.from("dp_events").insert(rows);
  if (error) return fromDbError(error);
  refresh();
  return success(`${rows.length} rascunho(s) de férias criado(s).`);
}

export async function importApprovedVacationsAction(): Promise<ActionState> {
  return importApprovedVacations();
}
