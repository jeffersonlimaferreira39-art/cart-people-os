"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";
import { signIn } from "./actions";

export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(signIn, null);
  const callbackError = params.get("erro");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      {callbackError ? (
        <Notice tone="danger">O link de acesso expirou ou já foi usado. Peça um novo.</Notice>
      ) : null}
      <FormMessage state={state} />
      <Field label="E-mail corporativo" name="email">
        <Input name="email" type="email" autoComplete="email" required placeholder="nome@cart.com.br" />
      </Field>
      <Field label="Senha" name="password" hint="Sem senha? Use o link de acesso por e-mail.">
        <Input name="password" type="password" autoComplete="current-password" />
      </Field>
      <div className="flex flex-col gap-2 pt-1">
        <SubmitButton name="intent" value="password" pendingLabel="Entrando…">
          Entrar
        </SubmitButton>
        <Button type="submit" name="intent" value="link" variant="secondary" formNoValidate>
          Receber link de acesso
        </Button>
      </div>
    </form>
  );
}
