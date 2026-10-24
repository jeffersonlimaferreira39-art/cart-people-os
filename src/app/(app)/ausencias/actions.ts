"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";
import { leaveSchema } from "@/lib/validation/leave";
import { checkVacationRequest } from "@/lib/domain/vacation";

export async function requestLeave(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  const raw = formToObject(form);
  const parsed = leaveSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;
  const supabase = await createClient();

  if (input.type === "ferias") {
    let others = supabase
      .from("leave_requests")
      .select("start_date, end_date, sell_days")
      .eq("employee_id", input.employee_id)
      .eq("type", "ferias")
      .in("status", ["pending", "approved"]);
    others = input.acquisition_period_start
      ? others.eq("acquisition_period_start", input.acquisition_period_start)
      : others.is("acquisition_period_start", null);
    const { data: otherRows } = await others;
    const { data: unitRow } = await supabase
      .from("employees")
      .select("unit:units(timezone)")
      .eq("id", input.employee_id)
      .maybeSingle();
    const tz = (unitRow?.unit as unknown as { timezone: string } | null)?.timezone;

    const check = checkVacationRequest({
      request: { start: input.start_date, end: input.end_date, sellDays: input.sell_days },
      otherPeriods: (otherRows ?? []).map((o) => ({ start: o.start_date, end: o.end_date, sellDays: o.sell_days })),
      acquisitionStart: input.acquisition_period_start ?? null,
      today: tz ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()) : undefined,
    });
    if (check.errors.length) return fail(check.errors.join(" "));
    if (check.warnings.length && raw.ack !== "on") {
      return { ok: false, message: "Confira os avisos antes de enviar.", fieldErrors: { ack: check.warnings } };
    }
  }

  const { error } = await supabase.from("leave_requests").insert({
    ...input,
    organization_id: viewer.organization.id,
    acquisition_period_start: input.acquisition_period_start ?? null,
    reason: input.reason ?? null,
  });
  if (error) return fromDbError(error);
  redirect("/ausencias?enviada=1");
}

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export async function decideLeave(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await getViewer();
  const parsed = decisionSchema.safeParse(formToObject(form));
  if (!parsed.success) return fail("Decisão inválida.");
  if (parsed.data.decision === "rejected" && !parsed.data.note) {
    return fail("Explique o motivo da recusa para o colaborador.", { note: ["Informe o motivo."] });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: parsed.data.decision, decision_note: parsed.data.note ?? null })
    .eq("id", id)
    .select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Solicitação não encontrada ou fora do seu escopo.");
  refresh();
  return success(parsed.data.decision === "approved" ? "Solicitação aprovada." : "Solicitação recusada.");
}

export async function cancelLeave(id: string) {
  await getViewer();
  const supabase = await createClient();
  await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id);
  refresh();
}
