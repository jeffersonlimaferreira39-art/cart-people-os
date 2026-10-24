"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { env } from "@/lib/env";
import { ROLES } from "@/lib/domain/roles";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";

async function adminViewer() {
  const viewer = await getViewer();
  return viewerCan(viewer, "manageSettings") ? viewer : null;
}

const unitSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  code: z.string().regex(/^[A-Z0-9-]{2,10}$/, "Use 2 a 10 letras maiúsculas, números ou hífen."),
  city: z.string().max(80).optional(),
  state: z.string().regex(/^[A-Z]{2}$/, "UF com 2 letras.").optional(),
  timezone: z.string().default("America/Fortaleza"),
});

export async function createUnit(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await adminViewer();
  if (!viewer) return fail("Apenas administradores criam unidades.");
  const raw = formToObject(form);
  const parsed = unitSchema.safeParse({ ...raw, code: raw.code?.toUpperCase(), state: raw.state?.toUpperCase() });
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("units").insert({ ...parsed.data, organization_id: viewer.organization.id });
  if (error) return fromDbError(error);
  refresh();
  return success(`Unidade ${parsed.data.name} criada.`);
}

export async function createDepartment(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await adminViewer();
  if (!viewer) return fail("Apenas administradores mantêm departamentos aqui.");
  const parsed = z
    .object({ name: z.string().min(2, "Informe o nome."), unit_id: z.uuid().optional() })
    .safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .insert({ ...parsed.data, unit_id: parsed.data.unit_id ?? null, organization_id: viewer.organization.id });
  if (error) return fromDbError(error);
  refresh();
  return success("Departamento criado.");
}

export async function createPosition(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await adminViewer();
  if (!viewer) return fail("Apenas administradores mantêm cargos aqui.");
  const parsed = z
    .object({ title: z.string().min(2, "Informe o cargo."), cbo: z.string().regex(/^\d{6}$/, "CBO tem 6 dígitos.").optional() })
    .safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("positions").insert({ ...parsed.data, organization_id: viewer.organization.id });
  if (error) return fromDbError(error);
  refresh();
  return success("Cargo criado.");
}

const TABLES = { units: "units", departments: "departments", positions: "positions" } as const;

export async function toggleActive(table: keyof typeof TABLES, id: string, active: boolean) {
  if (!(await adminViewer())) return;
  const supabase = await createClient();
  await supabase.from(TABLES[table]).update({ active }).eq("id", id);
  refresh();
}

const inviteSchema = z.object({
  email: z.email("E-mail inválido."),
  role: z.enum(ROLES),
  unit_id: z.uuid().optional(),
  employee_id: z.uuid().optional(),
});

/**
 * Convida (ou reaproveita) um usuário e concede o papel. A chave secreta só é
 * usada para a parte que exige o Auth admin; o papel em si é gravado com a
 * sessão do administrador, portanto validado pela RLS.
 */
export async function inviteUser(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await adminViewer();
  if (!viewer) return fail("Apenas administradores concedem acesso.");
  const parsed = inviteSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const { email, role, unit_id, employee_id } = parsed.data;
  if (role === "admin" && unit_id && !viewer.orgWide) return fail("Somente o administrador geral cria outros administradores.");

  const admin = createAdminClient();
  let userId: string | undefined;
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/meus-dados/senha`,
  });
  if (invited.data.user) {
    userId = invited.data.user.id;
  } else {
    // Já existe: localiza pelo e-mail.
    for (let page = 1; page <= 10 && !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
      if (!data.users.length) break;
    }
  }
  if (!userId) return fail("Não foi possível convidar este e-mail. Confira o endereço e tente novamente.");

  const supabase = await createClient();
  const { error } = await supabase.from("memberships").insert({
    user_id: userId,
    organization_id: viewer.organization.id,
    unit_id: unit_id ?? null,
    role,
    created_by: viewer.userId,
  });
  if (error) return fromDbError(error);

  if (employee_id) {
    const { error: linkErr } = await supabase.from("employees").update({ user_id: userId }).eq("id", employee_id);
    if (linkErr) return fail("Acesso concedido, mas não foi possível vincular ao cadastro do colaborador (ele já pode estar vinculado a outro usuário).");
  }
  refresh();
  return success(invited.data.user ? `Convite enviado para ${email}.` : `Papel concedido a ${email}.`);
}

export async function revokeMembership(id: string) {
  if (!(await adminViewer())) return;
  const supabase = await createClient();
  await supabase.from("memberships").update({ active: false }).eq("id", id);
  refresh();
}
