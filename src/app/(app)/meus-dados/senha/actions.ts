"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, success, type ActionState } from "@/lib/actions";

const schema = z
  .object({
    password: z
      .string()
      .min(10, "Use pelo menos 10 caracteres.")
      .regex(/[A-Za-z]/, "Inclua letras.")
      .regex(/\d/, "Inclua números."),
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
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("Não foi possível salvar a senha. Se o link de acesso expirou, entre novamente.");
  return success("Senha definida. Use-a nos próximos acessos.");
}
