import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPayrollAdapter, type PayrollEvent } from "@/lib/integrations/payroll";

/** Regera o arquivo de um lote (as movimentações exportadas são imutáveis). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/dp/lotes/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("payroll_export_batches")
    .select("id, period, provider")
    .eq("id", id)
    .maybeSingle();
  if (!batch) return new NextResponse("Lote não encontrado.", { status: 404 });

  const { data: events } = await supabase
    .from("dp_events")
    .select("employee_id, type, effective_date, payload, notes, employee:employees(full_name, registration_number), unit:units(code)")
    .eq("export_batch_id", id)
    .order("effective_date");
  const ids = [...new Set((events ?? []).map((e) => e.employee_id))];
  const { data: sensitive } = await supabase.from("employee_sensitive").select("employee_id, cpf").in("employee_id", ids);
  const cpfs = new Map((sensitive ?? []).map((s) => [s.employee_id, s.cpf as string | null]));

  const rows: PayrollEvent[] = (events ?? []).map((e) => {
    const emp = e.employee as unknown as { full_name: string; registration_number: string };
    const unit = e.unit as unknown as { code: string };
    const payload = { ...(e.payload as Record<string, unknown>) };
    delete payload.leave_request_id;
    return {
      unitCode: unit?.code ?? "",
      registrationNumber: emp?.registration_number ?? "",
      fullName: emp?.full_name ?? "",
      cpf: cpfs.get(e.employee_id) ?? null,
      type: e.type,
      effectiveDate: e.effective_date,
      payload,
      notes: e.notes,
    };
  });

  const adapter = getPayrollAdapter(batch.provider) ?? getPayrollAdapter("generic-csv")!;
  const file = adapter.buildEvents(batch.period, rows);
  return new NextResponse(file.content, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
