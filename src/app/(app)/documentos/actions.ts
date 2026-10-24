"use server";

import { refresh } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan, viewerCanInUnit } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";
import { ORG_DOCUMENT_CATEGORIES, type OrgDocumentArea } from "@/lib/format";
import { uploadDocument } from "../colaboradores/actions";

// A Vercel limita o corpo das funções a ~4,5 MB.
const MAX_FILE = 4 * 1024 * 1024;
const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Envio de documento de colaborador a partir da aba Documentos (escolhendo a pessoa). */
export async function uploadEmployeeDocument(_: ActionState, form: FormData): Promise<ActionState> {
  const employeeId = z.uuid().safeParse(form.get("employee_id"));
  if (!employeeId.success) return fail("Escolha o colaborador.", { employee_id: ["Escolha o colaborador."] });
  return uploadDocument(employeeId.data, null, form);
}

const orgDocSchema = z.object({
  title: z.string({ error: "Informe o título." }).trim().min(2, "Informe o título.").max(160),
  category: z.string(),
  description: z.string().max(500).optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.").optional(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional(),
  visibility: z.enum(["restrito", "todos"]),
  unit_id: z.uuid().optional(),
});

export async function uploadOrgDocument(area: OrgDocumentArea, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, area === "rh" ? "manageRhDocs" : "manageDpDocs")) {
    return fail(`Seu perfil não envia documentos do ${area.toUpperCase()}.`);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha um arquivo.");
  if (file.size > MAX_FILE) return fail("O arquivo passa de 4 MB. Comprima o PDF ou envie em partes.");
  if (!ALLOWED.includes(file.type)) return fail("Envie PDF, imagem (JPG/PNG), planilha (XLSX/CSV) ou Word (DOCX).");
  const parsed = orgDocSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  if (!Object.hasOwn(ORG_DOCUMENT_CATEGORIES[area], v.category)) return fail("Categoria inválida.", { category: ["Escolha a categoria."] });
  if (v.unit_id ? !viewerCanInUnit(viewer, area === "rh" ? "manageRhDocs" : "manageDpDocs", v.unit_id) : !viewer.orgWide) {
    return fail("Você só envia documentos das unidades em que tem acesso. Escolha a unidade.", { unit_id: ["Escolha a unidade."] });
  }

  const safeName = file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `${viewer.organization.id}/${area}/${randomUUID()}-${safeName}`;
  const supabase = await createClient();
  // Registro primeiro: a política de leitura do arquivo depende dele.
  const { data: doc, error } = await supabase
    .from("org_documents")
    .insert({
      organization_id: viewer.organization.id,
      unit_id: v.unit_id ?? null,
      area,
      category: v.category,
      title: v.title,
      description: v.description ?? null,
      period: v.period ?? null,
      expires_at: v.expires_at ?? null,
      visibility: v.visibility,
      file_name: file.name.slice(0, 200),
      storage_path: path,
    })
    .select("id")
    .single();
  if (error || !doc) return fromDbError(error);

  const { error: upErr } = await supabase.storage.from("org-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    await supabase.from("org_documents").delete().eq("id", doc.id);
    return fail("Não foi possível armazenar o arquivo. Tente novamente.");
  }
  refresh();
  return success("Documento enviado.");
}

export async function deleteOrgDocument(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return fail("Documento inválido.");
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageRhDocs") && !viewerCan(viewer, "manageDpDocs")) return fail("Seu perfil não exclui documentos.");
  const supabase = await createClient();
  const { data } = await supabase.from("org_documents").select("storage_path").eq("id", id).maybeSingle();
  if (!data) return fail("Documento não encontrado.");
  // Arquivo primeiro: a política do bucket confere área/unidade pelo registro, que ainda existe.
  const { data: removedFile, error: fileErr } = await supabase.storage.from("org-documents").remove([data.storage_path]);
  if (fileErr || !removedFile?.length) return fail("Você não pode excluir documentos desta área ou unidade.");
  const { error } = await supabase.from("org_documents").delete().eq("id", id);
  if (error) return fromDbError(error);
  refresh();
  return success("Documento excluído.");
}

export async function deleteEmployeeDocument(employeeId: string, documentId: string): Promise<ActionState> {
  if (!z.uuid().safeParse(employeeId).success || !z.uuid().safeParse(documentId).success) return fail("Documento inválido.");
  const { deleteDocument } = await import("../colaboradores/actions");
  await deleteDocument(employeeId, documentId);
  return success("Documento excluído.");
}
