"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan, viewerCanInUnit, type Viewer } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";
import { DEFAULT_CHECKLIST, canMove, isStage } from "@/lib/domain/recruitment";

async function recruiter(): Promise<Viewer | ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "manageRecruitment")) return fail("Seu perfil não gerencia contratações.");
  return viewer;
}
const isFail = (v: unknown): v is ActionState => !!v && typeof v === "object" && "ok" in v;
const opt = (max: number) => z.string().trim().max(max).optional();

// ---------------------------------------------------------------------------
// Vagas
// ---------------------------------------------------------------------------
const openingSchema = z.object({
  id: z.uuid().optional(),
  title: z.string({ error: "Informe o título." }).trim().min(2, "Informe o título.").max(120),
  unit_id: z.uuid("Escolha a unidade."),
  department_id: z.uuid().optional(),
  position_id: z.uuid().optional(),
  openings: z.coerce.number().int("Número inteiro.").min(1, "Ao menos 1 vaga.").max(500),
  employment_type: z.enum(["clt", "pj", "estagio", "temporario", "aprendiz", "intermitente"]),
  salary_range: opt(80),
  description: opt(4000),
});

export async function saveOpening(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await recruiter();
  if (isFail(viewer)) return viewer;
  const parsed = openingSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  if (!viewerCanInUnit(viewer, "manageRecruitment", v.unit_id)) return fail("Você não abre vagas nesta unidade.");
  const row = {
    organization_id: viewer.organization.id,
    unit_id: v.unit_id,
    title: v.title,
    department_id: v.department_id ?? null,
    position_id: v.position_id ?? null,
    openings: v.openings,
    employment_type: v.employment_type,
    salary_range: v.salary_range || null,
    description: v.description || null,
  };
  const supabase = await createClient();
  const { error } = v.id ? await supabase.from("job_openings").update(row).eq("id", v.id) : await supabase.from("job_openings").insert(row);
  if (error) return fromDbError(error);
  refresh();
  return success(v.id ? "Vaga atualizada." : "Vaga aberta.");
}

export async function setOpeningStatus(id: string, status: "aberta" | "pausada" | "encerrada"): Promise<ActionState> {
  const viewer = await recruiter();
  if (isFail(viewer)) return viewer;
  if (!z.uuid().safeParse(id).success) return fail("Vaga inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_openings").update({ status }).eq("id", id).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Vaga fora do seu escopo.");
  refresh();
  return success(status === "encerrada" ? "Vaga encerrada." : status === "pausada" ? "Vaga pausada." : "Vaga reaberta.");
}

// ---------------------------------------------------------------------------
// Candidatos
// ---------------------------------------------------------------------------
const RESUME_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_RESUME = 4 * 1024 * 1024;

const candidateSchema = z.object({
  opening_id: z.uuid("Escolha a vaga."),
  full_name: z.string({ error: "Informe o nome." }).trim().min(3, "Informe o nome completo.").max(120),
  email: z.union([z.literal(""), z.email("E-mail inválido.")]).optional(),
  phone: opt(30),
  source: z.enum(["indicacao", "site", "linkedin", "agencia", "outro"]),
  notes: opt(4000),
  consent: z.literal("on", { error: "Confirme o consentimento do candidato (LGPD)." }),
});

export async function addCandidate(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await recruiter();
  if (isFail(viewer)) return viewer;
  const parsed = candidateSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const file = form.get("resume");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && (file.size > MAX_RESUME || !RESUME_TYPES.includes(file.type))) return fail("Currículo em PDF, DOCX, JPG ou PNG até 4 MB.");

  const supabase = await createClient();
  const id = randomUUID();
  const path = hasFile ? `${viewer.organization.id}/${id}/${randomUUID()}-${file.name.normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-100)}` : null;
  const { error } = await supabase.from("candidates").insert({
    id,
    organization_id: viewer.organization.id,
    unit_id: viewer.units[0]?.id, // corrigido pela vaga no banco
    opening_id: v.opening_id,
    full_name: v.full_name,
    email: v.email || null,
    phone: v.phone || null,
    source: v.source,
    notes: v.notes || null,
    resume_path: path,
    resume_name: hasFile ? file.name.slice(0, 200) : null,
    consent_at: new Date().toISOString(),
  });
  if (error) return fromDbError(error);
  if (hasFile && path) {
    const { error: upErr } = await supabase.storage.from("recruitment").upload(path, file, { contentType: file.type });
    if (upErr) {
      await supabase.from("candidates").update({ resume_path: null, resume_name: null }).eq("id", id);
      refresh();
      return fail("Candidato cadastrado, mas o currículo não foi armazenado. Tente anexar de novo.");
    }
  }
  refresh();
  return success("Candidato cadastrado.");
}

export async function moveCandidate(id: string, stage: string, note?: string): Promise<ActionState> {
  const viewer = await recruiter();
  if (isFail(viewer)) return viewer;
  if (!z.uuid().safeParse(id).success || !isStage(stage)) return fail("Dados inválidos.");
  const supabase = await createClient();
  const { data: c } = await supabase.from("candidates").select("stage, organization_id, unit_id").eq("id", id).maybeSingle();
  if (!c) return fail("Candidato não encontrado.");
  const check = canMove(c.stage as never, stage);
  if (!check.ok) return fail(check.reason);
  const { error } = await supabase.from("candidates").update({ stage }).eq("id", id);
  if (error) return fromDbError(error);
  if (note?.trim()) {
    // Anota o motivo no último evento (o gatilho já registrou a mudança).
    await supabase.from("candidate_events").insert({
      organization_id: c.organization_id, unit_id: c.unit_id, candidate_id: id, from_stage: stage, to_stage: stage, note: note.trim().slice(0, 1000),
    });
  }
  refresh();
  return success("Etapa atualizada.");
}

export async function moveCandidateForm(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  return moveCandidate(id, raw.stage ?? "", raw.note);
}

/** Exclui candidato e currículo (LGPD: fim do processo ou pedido do titular). */
export async function deleteCandidate(id: string): Promise<ActionState> {
  const viewer = await recruiter();
  if (isFail(viewer)) return viewer;
  if (!z.uuid().safeParse(id).success) return fail("Candidato inválido.");
  const supabase = await createClient();
  const { data: c } = await supabase.from("candidates").select("resume_path, stage").eq("id", id).maybeSingle();
  if (!c) return fail("Candidato não encontrado.");
  if (c.stage === "contratado") return fail("Candidato contratado: os dados seguem no cadastro do colaborador.");
  if (c.resume_path) await supabase.storage.from("recruitment").remove([c.resume_path]);
  const { error } = await supabase.from("candidates").delete().eq("id", id);
  if (error) return fromDbError(error);
  redirect("/contratacao?aba=painel");
}

// ---------------------------------------------------------------------------
// Contratar → cadastro + checklist (+ movimentação de admissão em rascunho)
// ---------------------------------------------------------------------------
const hireSchema = z.object({
  registration_number: z.string({ error: "Informe a matrícula." }).trim().min(1, "Informe a matrícula.").max(30),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de admissão."),
  department_id: z.uuid().optional(),
  position_id: z.uuid().optional(),
});

export async function hireCandidate(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await recruiter();
  if (isFail(viewer)) return viewer;
  if (!viewerCan(viewer, "managePeople")) return fail("Seu perfil não cadastra colaboradores.");
  const parsed = hireSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, stage, opening:job_openings(id, unit_id, department_id, position_id, employment_type, openings)")
    .eq("id", id)
    .maybeSingle();
  if (!c) return fail("Candidato não encontrado.");
  if (c.stage === "contratado") return fail("Este candidato já foi contratado.");
  if (c.stage !== "aprovado" && c.stage !== "proposta") return fail("Contrate a partir das etapas Proposta ou Aprovado.");
  const o = c.opening as unknown as { id: string; unit_id: string; department_id: string | null; position_id: string | null; employment_type: string; openings: number };
  if (!viewerCanInUnit(viewer, "managePeople", o.unit_id)) return fail("Você não cadastra colaboradores nesta unidade.");

  const { data: emp, error } = await supabase
    .from("employees")
    .insert({
      organization_id: viewer.organization.id,
      unit_id: o.unit_id,
      department_id: v.department_id ?? o.department_id,
      position_id: v.position_id ?? o.position_id,
      registration_number: v.registration_number,
      full_name: c.full_name,
      work_email: null,
      phone: c.phone,
      employment_type: o.employment_type,
      status: "onboarding",
      hire_date: v.hire_date,
    })
    .select("id")
    .single();
  if (error || !emp) return fromDbError(error);

  await supabase.from("admission_checklist").insert(
    DEFAULT_CHECKLIST.map((it, i) => ({ employee_id: emp.id, organization_id: viewer.organization.id, unit_id: o.unit_id, item: it.item, label: it.label, position: i })),
  );
  if (viewerCan(viewer, "manageDp")) {
    await supabase.from("dp_events").insert({
      employee_id: emp.id, organization_id: viewer.organization.id, unit_id: o.unit_id, type: "admissao", effective_date: v.hire_date, status: "draft",
      payload: { tipo_contrato: o.employment_type, origem: "contratacao" },
    });
  }
  const { error: cErr } = await supabase.from("candidates").update({ stage: "contratado", hired_employee_id: emp.id }).eq("id", id);
  if (cErr) return fromDbError(cErr);

  // Vaga preenchida: encerra automaticamente.
  const { count } = await supabase.from("candidates").select("id", { count: "exact", head: true }).eq("opening_id", o.id).eq("stage", "contratado");
  if ((count ?? 0) >= o.openings) await supabase.from("job_openings").update({ status: "encerrada" }).eq("id", o.id);

  redirect(`/contratacao?aba=admissoes&novo=${emp.id}`);
}

// ---------------------------------------------------------------------------
// Checklist de admissão
// ---------------------------------------------------------------------------
export async function toggleChecklist(employeeId: string, item: string, done: boolean): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "managePeople")) return fail("Seu perfil não atualiza admissões.");
  if (!z.uuid().safeParse(employeeId).success || !/^[a-z_]{2,40}$/.test(item)) return fail("Item inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admission_checklist")
    .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? viewer.userId : null })
    .eq("employee_id", employeeId)
    .eq("item", item)
    .select("item");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Item fora do seu escopo.");
  refresh();
  return success();
}

/** Conclui a admissão: o colaborador passa a "ativo". Exige checklist completo. */
export async function completeAdmission(employeeId: string): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "managePeople")) return fail("Seu perfil não conclui admissões.");
  if (!z.uuid().safeParse(employeeId).success) return fail("Colaborador inválido.");
  const supabase = await createClient();
  const { data: items } = await supabase.from("admission_checklist").select("done").eq("employee_id", employeeId);
  if (items?.length && items.some((i) => !i.done)) return fail("Conclua todos os itens do checklist antes.");
  const { data, error } = await supabase.from("employees").update({ status: "active" }).eq("id", employeeId).eq("status", "onboarding").select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Colaborador não está em admissão.");
  refresh();
  return success("Admissão concluída: colaborador ativo.");
}
