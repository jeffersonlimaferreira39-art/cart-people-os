"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCanInUnit } from "@/lib/auth/viewer";
import { fail, fromDbError, success, type ActionState } from "@/lib/actions";
import { getTimeClockAdapter } from "@/lib/integrations/time-clock";
import { isIsoDate } from "@/lib/domain/dates";

export async function importTimeFile(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  const unitId = viewer.selectedUnitId;
  if (!unitId) return fail("Escolha uma unidade no topo da página antes de importar.");
  if (!viewerCanInUnit(viewer, "importTime", unitId)) return fail("Seu perfil não importa ponto nesta unidade.");

  const adapter = getTimeClockAdapter(String(form.get("provider") ?? ""));
  if (!adapter) return fail("Escolha o formato do arquivo.");
  const periodStart = String(form.get("period_start") ?? "");
  const periodEnd = String(form.get("period_end") ?? "");
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodEnd < periodStart) {
    return fail("Informe um período válido.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha o arquivo exportado do sistema de ponto.");
  if (file.size > 4 * 1024 * 1024) return fail("O arquivo passa de 4 MB. Divida o período em partes.");

  const parsed = adapter.parse(await file.text());
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, registration_number")
    .eq("unit_id", unitId);
  const byReg = new Map((employees ?? []).map((e) => [e.registration_number, e.id]));

  const errors = [...parsed.errors];
  const valid = parsed.rows.filter((r, i) => {
    if (r.workDate < periodStart || r.workDate > periodEnd) {
      errors.push({ line: i + 2, message: `Data ${r.workDate} fora do período informado.` });
      return false;
    }
    if (!byReg.has(r.registrationNumber)) {
      errors.push({ line: i + 2, message: `Matrícula ${r.registrationNumber} não encontrada nesta unidade.` });
      return false;
    }
    return true;
  });
  if (!valid.length) {
    return fail(`Nenhuma linha válida. ${errors.slice(0, 3).map((e) => `Linha ${e.line}: ${e.message}`).join(" ")}`);
  }

  const { data: imp, error: iErr } = await supabase
    .from("time_imports")
    .insert({
      organization_id: viewer.organization.id,
      unit_id: unitId,
      provider: adapter.id,
      file_name: file.name.slice(0, 200),
      period_start: periodStart,
      period_end: periodEnd,
      row_count: valid.length,
      rejected_count: errors.length,
      imported_by: viewer.userId,
    })
    .select("id")
    .single();
  if (iErr || !imp) return fromDbError(iErr);

  const rows = valid.map((r) => ({
    organization_id: viewer.organization.id,
    unit_id: unitId,
    employee_id: byReg.get(r.registrationNumber)!,
    work_date: r.workDate,
    worked_minutes: r.workedMinutes,
    overtime_minutes: r.overtimeMinutes,
    absence_minutes: r.absenceMinutes,
    night_minutes: r.nightMinutes,
    source_import_id: imp.id,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("time_entries").upsert(rows.slice(i, i + 500), { onConflict: "employee_id,work_date" });
    if (error) return fromDbError(error);
  }
  refresh();
  const extra = errors.length
    ? ` ${errors.length} linha(s) ignorada(s): ${errors.slice(0, 3).map((e) => `linha ${e.line} (${e.message})`).join("; ")}${errors.length > 3 ? "…" : ""}`
    : "";
  return success(`${valid.length} registro(s) importado(s).${extra}`);
}
