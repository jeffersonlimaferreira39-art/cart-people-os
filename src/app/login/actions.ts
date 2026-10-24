"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { fail, success, type ActionState } from "@/lib/actions";

const schema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().optional(),
  next: z.string().optional(),
  intent: z.enum(["password", "link"]),
});

/** Aceita apenas caminhos internos para evitar redirecionamento aberto. */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/painel";
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    email: form.get("email"),
    password: form.get("password") || undefined,
    next: form.get("next") || undefined,
    intent: form.get("intent"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { email, password, intent } = parsed.data;
  const next = safeNext(parsed.data.next);
  const supabase = await createClient();

  if (intent === "link") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Apenas usuários convidados entram: nada de cadastro aberto.
        shouldCreateUser: false,
        emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // Mesma resposta exista ou não a conta, para não revelar e-mails cadastrados.
    if (error && error.status !== 400 && error.status !== 422) {
      return fail("Não foi possível enviar o link agora. Tente novamente em alguns minutos.");
    }
    return success("Se este e-mail tiver acesso, você receberá um link para entrar.");
  }

  if (!password) return fail("Informe a senha ou peça um link de acesso por e-mail.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail("E-mail ou senha incorretos.");
  redirect(next);
}
