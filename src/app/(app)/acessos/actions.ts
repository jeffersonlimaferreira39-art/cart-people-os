"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/viewer";
import { isOrgAdmin } from "@/lib/data/access";
import { env } from "@/lib/env";
import { ROLES } from "@/lib/domain/roles";
import { password } from "@/lib/validation/common";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";

/** "Bloqueio por tempo indeterminado" no Auth (100 anos). */
const BAN_FOREVER = "876000h";

async function orgAdmin() {
  const viewer = await getViewer();
  return isOrgAdmin(viewer) ? viewer : null;
}

const uuid = z.uuid();

async function logAdminEvent(userId: string, actorId: string, event: "bloqueio" | "desbloqueio" | "sessoes_encerradas" | "link_reenviado" | "usuario_criado") {
  const supabase = await createClient();
  await supabase.from("access_events").insert({ user_id: userId, event, actor_id: actorId });
}

/** Confirma (revisa) os papéis selecionados: continuam válidos por mais 90 dias. */
export async function confirmReview(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await orgAdmin())) return fail("Apenas o administrador geral revisa acessos.");
  const ids = form.getAll("ids").map(String).filter((v) => uuid.safeParse(v).success);
  if (!ids.length) return fail("Selecione ao menos um acesso.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ reviewed_at: new Date().toISOString() }).in("id", ids).eq("active", true).select("id");
  if (error) return fromDbError(error);
  refresh();
  const n = data?.length ?? 0;
  const skipped = ids.length - n;
  return success(`${n} acesso(s) confirmado(s).${skipped ? ` ${skipped} não alterado(s) (o seu próprio acesso é revisado por outro administrador).` : ""}`);
}

const membershipSchema = z.object({
  role: z.enum(ROLES),
  unit_id: z.uuid().optional(),
});

export async function updateMembership(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await orgAdmin();
  if (!viewer) return fail("Apenas o administrador geral altera papéis.");
  const parsed = membershipSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role, unit_id: parsed.data.unit_id ?? null })
    .eq("id", id)
    .select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Não foi possível alterar este acesso (o seu próprio papel só é alterado por outro administrador).");
  refresh();
  return success("Papel atualizado.");
}

export async function revokeAccess(id: string): Promise<ActionState> {
  if (!(await orgAdmin())) return fail("Apenas o administrador geral revoga acessos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ active: false, suspended_at: null }).eq("id", id).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Não foi possível revogar este acesso.");
  refresh();
  return success("Acesso revogado.");
}

export async function restoreAccess(id: string): Promise<ActionState> {
  if (!(await orgAdmin())) return fail("Apenas o administrador geral reativa acessos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ active: true, reviewed_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Não foi possível reativar este acesso.");
  refresh();
  return success("Acesso reativado.");
}

/**
 * Bloqueia o usuário: suspende os papéis na organização (efeito imediato na RLS),
 * encerra as sessões e bloqueia o login no Auth. Reversível com desbloquear.
 */
export async function blockUser(userId: string): Promise<ActionState> {
  const viewer = await orgAdmin();
  if (!viewer) return fail("Apenas o administrador geral bloqueia usuários.");
  if (!uuid.safeParse(userId).success) return fail("Usuário inválido.");
  if (userId === viewer.userId) return fail("Você não pode bloquear o próprio acesso.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ active: false, suspended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("organization_id", viewer.organization.id)
    .eq("active", true)
    .select("id");
  if (error) return fromDbError(error);
  const { error: sessErr } = await supabase.rpc("end_user_sessions", { p_org: viewer.organization.id, p_user: userId });
  if (sessErr) return fromDbError(sessErr);

  // O login só é bloqueado no Auth se o usuário não tiver papel ativo em outra organização.
  const admin = createAdminClient();
  const { count } = await admin.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("active", true);
  if (!count) {
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
    if (banErr) return fail("Papéis suspensos e sessões encerradas, mas o bloqueio de login falhou. Tente novamente.");
  }
  await logAdminEvent(userId, viewer.userId, "bloqueio");
  refresh();
  return success(`Acesso bloqueado (${data?.length ?? 0} papel(is) suspenso(s), sessões encerradas).`);
}

export async function unblockUser(userId: string): Promise<ActionState> {
  const viewer = await orgAdmin();
  if (!viewer) return fail("Apenas o administrador geral desbloqueia usuários.");
  if (!uuid.safeParse(userId).success) return fail("Usuário inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ active: true, reviewed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("organization_id", viewer.organization.id)
    .not("suspended_at", "is", null)
    .select("id");
  if (error) return fromDbError(error);
  const { error: banErr } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (banErr) return fail("Papéis reativados, mas o desbloqueio do login falhou. Tente novamente.");
  await logAdminEvent(userId, viewer.userId, "desbloqueio");
  refresh();
  return success(`Acesso desbloqueado (${data?.length ?? 0} papel(is) reativado(s)).`);
}

export async function endSessions(userId: string): Promise<ActionState> {
  const viewer = await orgAdmin();
  if (!viewer) return fail("Apenas o administrador geral encerra sessões.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_user_sessions", { p_org: viewer.organization.id, p_user: userId });
  if (error) return fromDbError(error);
  await logAdminEvent(userId, viewer.userId, "sessoes_encerradas");
  refresh();
  return success(`${data ?? 0} sessão(ões) encerrada(s). O usuário precisará entrar de novo.`);
}

/** Reenvia um link para o usuário definir a senha (serve para convite pendente e senha esquecida). */
export async function resendAccessLink(userId: string): Promise<ActionState> {
  const viewer = await orgAdmin();
  if (!viewer) return fail("Apenas o administrador geral reenvia links.");
  const supabase = await createClient();
  const { data: users, error } = await supabase.rpc("org_users", { p_org: viewer.organization.id });
  if (error) return fromDbError(error);
  const email = (users as { user_id: string; email: string }[] | null)?.find((u) => u.user_id === userId)?.email;
  if (!email) return fail("Usuário não encontrado.");
  // Fluxo implícito: o link funciona no navegador de quem recebe (o PKCE prenderia
  // o código ao navegador do administrador), como no convite.
  const mailer = createPlainClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error: sendErr } = await mailer.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/meus-dados/senha`,
  });
  if (sendErr) return fail("Não foi possível enviar agora. Tente novamente em alguns minutos.");
  await logAdminEvent(userId, viewer.userId, "link_reenviado");
  refresh();
  return success(`Link enviado para ${email}.`);
}

const createUserSchema = z.object({
  email: z.email("E-mail inválido."),
  password,
  role: z.enum(ROLES),
  unit_id: z.uuid().optional(),
  employee_id: z.uuid().optional(),
});

/**
 * Cria o usuário já com e-mail e senha provisória (sem depender do e-mail de
 * convite). No primeiro acesso ele é obrigado a trocar a senha: a marca fica em
 * app_metadata, que só o servidor altera. O papel é gravado com a sessão do
 * administrador, portanto validado pela RLS.
 */
export async function createUserWithPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await orgAdmin();
  if (!viewer) return fail("Apenas o administrador geral cria usuários com senha.");
  const parsed = createUserSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const { email, role, unit_id, employee_id } = parsed.data;

  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (created.error?.code === "email_exists") {
    return fail("Este e-mail já tem conta. Use \"Conceder acesso\" abaixo para dar o papel, ou \"Reenviar link\" na página do usuário para uma nova senha.", { email: ["E-mail já cadastrado."] });
  }
  if (created.error?.code === "weak_password") return fail("Senha fraca para o Auth. Escolha outra.", { password: ["Senha recusada pelo Auth."] });
  const userId = created.data.user?.id;
  if (!userId) return fail("Não foi possível criar o usuário. Confira o e-mail e tente novamente.");

  const supabase = await createClient();
  const { error } = await supabase.from("memberships").insert({
    user_id: userId,
    organization_id: viewer.organization.id,
    unit_id: unit_id ?? null,
    role,
    created_by: viewer.userId,
  });
  if (error) {
    // Sem papel, a conta não serve para nada: desfaz para não deixar login órfão.
    await admin.auth.admin.deleteUser(userId);
    return fromDbError(error);
  }
  await logAdminEvent(userId, viewer.userId, "usuario_criado");

  if (employee_id) {
    const { error: linkErr } = await supabase.from("employees").update({ user_id: userId }).eq("id", employee_id);
    if (linkErr) return fail("Usuário criado, mas não foi possível vincular ao cadastro do colaborador (ele já pode estar vinculado a outro usuário).");
  }
  refresh();
  return success(`Usuário ${email} criado. Passe a senha provisória por um canal seguro: no primeiro acesso ela será trocada.`);
}
