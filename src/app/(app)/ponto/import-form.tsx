"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function TimeImportForm({
  action, adapters, defaultStart, defaultEnd,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  adapters: { id: string; label: string; description: string }[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4 p-5">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Formato" name="provider" hint={adapters[0]?.description}>
          <Select name="provider" defaultValue={adapters[0]?.id}>
            {adapters.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Arquivo" name="file">
          <Input type="file" name="file" accept=".csv,text/csv" required className="h-auto py-1.5" />
        </Field>
        <Field label="De" name="period_start">
          <Input type="date" name="period_start" defaultValue={defaultStart} required />
        </Field>
        <Field label="Até" name="period_end">
          <Input type="date" name="period_end" defaultValue={defaultEnd} required />
        </Field>
      </div>
      <div><SubmitButton pendingLabel="Importando…">Importar espelho de ponto</SubmitButton></div>
    </form>
  );
}
