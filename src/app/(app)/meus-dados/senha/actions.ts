"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { password } from "@/lib/validation/common";
import { fail, success, type ActionState } from "@/lib/actions";

const schema = z
  .object({
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não conferem." });

export async function setPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) {
    const fe: Record<string, string[]> = {};
    parsed.error.issues.forEach((i) => (fe[i.path.join(".")] ??= []).push(i.message));
    return fail("Revise a senha.", fe);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error?.code === "same_password") return fail("Escolha uma senha diferente da provisória.", { password: ["Escolha uma senha diferente da atual."] });
  if (error) return fail("Não foi possível salvar a senha. Se o link de acesso expirou, entre novamente.");

  // Senha provisória (criada pelo administrador): libera o sistema e renova o token,
  // que ainda carrega a marca de troca obrigatória.
  if (data.user?.app_metadata?.must_change_password) {
    const { error: flagErr } = await createAdminClient().auth.admin.updateUserById(data.user.id, { app_metadata: { must_change_password: false } });
    if (flagErr) return fail("Senha salva, mas não foi possível liberar o acesso. Tente salvar de novo.");
    await supabase.auth.refreshSession();
  }
  if (data.user) await supabase.from("access_events").insert({ user_id: data.user.id, actor_id: data.user.id, event: "senha_alterada" });
  return success("Senha definida. Use-a nos próximos acessos.");
}
