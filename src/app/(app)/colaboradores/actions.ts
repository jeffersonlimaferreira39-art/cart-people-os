"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan, viewerCanInUnit } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";
import { employeeSchema, sensitiveSchema, sensitiveToRow } from "@/lib/validation/employee";

const SENSITIVE_KEYS = Object.keys(sensitiveSchema.shape);

function hasSensitiveInput(raw: Record<string, string | undefined>) {
  return SENSITIVE_KEYS.some((k) => raw[k] !== undefined);
}

export async function createEmployee(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  const raw = formToObject(form);
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;
  if (!viewerCanInUnit(viewer, "managePeople", input.unit_id)) {
    return fail("Você não pode cadastrar colaboradores nesta unidade.");
  }
  const sensitive = viewerCan(viewer, "viewSensitive") && hasSensitiveInput(raw) ? sensitiveSchema.safeParse(raw) : null;
  if (sensitive && !sensitive.success) return fromZod(sensitive.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      ...input,
      organization_id: viewer.organization.id,
      department_id: input.department_id ?? null,
      position_id: input.position_id ?? null,
      manager_id: input.manager_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return fromDbError(error);

  let warning = "";
  if (sensitive?.success) {
    const { error: sErr } = await supabase.from("employee_sensitive").insert({
      employee_id: data.id,
      organization_id: viewer.organization.id,
      unit_id: input.unit_id,
      ...sensitiveToRow(sensitive.data),
    });
    if (sErr) warning = "sensiveis";
  }

  if (raw.create_admission === "on" && viewerCan(viewer, "manageDp")) {
    const { error: dErr } = await supabase.from("dp_events").insert({
      employee_id: data.id,
      organization_id: viewer.organization.id,
      unit_id: input.unit_id,
      type: "admissao",
      effective_date: input.hire_date,
      status: "draft",
      payload: {
        tipo_contrato: input.employment_type,
        jornada: input.work_schedule,
        salario_base: sensitive?.success ? sensitive.data.base_salary : undefined,
      },
    });
    if (dErr && !warning) warning = "admissao";
  }

  redirect(`/colaboradores/${data.id}${warning ? `?aviso=${warning}` : ""}`);
}

export async function updateEmployee(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  const raw = formToObject(form);
  const parsed = employeeSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;
  if (!viewerCanInUnit(viewer, "managePeople", input.unit_id)) {
    return fail("Você não pode manter colaboradores nesta unidade.");
  }
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("employees")
    .update({
      ...input,
      department_id: input.department_id ?? null,
      position_id: input.position_id ?? null,
      manager_id: input.manager_id ?? null,
      social_name: input.social_name ?? null,
      work_email: input.work_email ?? null,
      phone: input.phone ?? null,
      work_schedule: input.work_schedule ?? null,
      termination_date: input.termination_date ?? null,
    })
    .eq("id", id)
    .select("id");
  if (error) return fromDbError(error);
  if (!updated?.length) return fail("Colaborador não encontrado ou fora do seu escopo.");

  if (viewerCan(viewer, "viewSensitive")) {
    const sensitive = sensitiveSchema.safeParse(raw);
    if (!sensitive.success) return fromZod(sensitive.error);
    const { error: sErr } = await supabase.from("employee_sensitive").upsert({
      employee_id: id,
      organization_id: viewer.organization.id,
      unit_id: input.unit_id,
      ...sensitiveToRow(sensitive.data),
    });
    if (sErr) return fromDbError(sErr);
  }
  redirect(`/colaboradores/${id}`);
}

// A Vercel limita o corpo das funções a ~4,5 MB; arquivos maiores exigem upload assinado direto ao Storage.
const MAX_FILE = 4 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

const documentSchema = z.object({
  category: z.enum(["contrato", "documento_pessoal", "aso", "certificado", "advertencia", "ferias", "rescisao", "outro"]),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function uploadDocument(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "managePeople")) return fail("Seu perfil não envia documentos.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha um arquivo.");
  if (file.size > MAX_FILE) return fail("O arquivo passa de 4 MB. Comprima o PDF ou envie em partes.");
  if (!ALLOWED.includes(file.type)) return fail("Envie PDF, JPG ou PNG.");
  const parsed = documentSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);

  const safeName = file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `${viewer.organization.id}/${employeeId}/${randomUUID()}-${safeName}`;
  const supabase = await createClient();

  // Registro primeiro: a política de leitura do arquivo depende dele.
  const { data: doc, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: employeeId,
      organization_id: viewer.organization.id,
      unit_id: viewer.selectedUnitId ?? viewer.units[0]?.id,
      category: parsed.data.category,
      expires_at: parsed.data.expires_at ?? null,
      file_name: file.name.slice(0, 200),
      storage_path: path,
      uploaded_by: viewer.userId,
    })
    .select("id")
    .single();
  if (error || !doc) return fromDbError(error);

  const { error: upErr } = await supabase.storage
    .from("employee-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    await supabase.from("employee_documents").delete().eq("id", doc.id);
    return fail("Não foi possível armazenar o arquivo. Tente novamente.");
  }
  refresh();
  return success("Documento enviado.");
}

export async function deleteDocument(employeeId: string, documentId: string) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "managePeople")) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!data) return;
  await supabase.storage.from("employee-documents").remove([data.storage_path]);
  await supabase.from("employee_documents").delete().eq("id", documentId);
  refresh();
}
