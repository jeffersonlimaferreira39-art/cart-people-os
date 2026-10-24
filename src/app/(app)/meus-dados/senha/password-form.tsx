"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { setPassword } from "./actions";

export function PasswordForm() {
  const [state, action] = useActionState(setPassword, null);
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Link href="/painel" className="text-accent hover:underline">Ir para o painel</Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <FormMessage state={state} />
      <Field label="Nova senha" name="password" error={state?.fieldErrors?.password} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input type="password" name="password" autoComplete="new-password" required invalid={!!state?.fieldErrors?.password} />
      </Field>
      <Field label="Repita a senha" name="confirm" error={state?.fieldErrors?.confirm}>
        <Input type="password" name="confirm" autoComplete="new-password" required invalid={!!state?.fieldErrors?.confirm} />
      </Field>
      <div><SubmitButton>Salvar senha</SubmitButton></div>
    </form>
  );
}
