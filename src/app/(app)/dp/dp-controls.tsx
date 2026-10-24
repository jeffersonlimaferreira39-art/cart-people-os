"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/field";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;

export function TransitionButtons({ action, options }: { action: Act; options: { to: string; label: string; variant?: "primary" | "secondary" | "danger" | "ghost" }[] }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <SubmitButton key={o.to} name="to" value={o.to} variant={o.variant ?? "secondary"} pendingLabel="Salvando…">
            {o.label}
          </SubmitButton>
        ))}
      </div>
    </form>
  );
}

export function BatchForm({ action, defaultPeriod }: { action: Act; defaultPeriod: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Competência
          <Input type="month" name="period" defaultValue={defaultPeriod} required className="w-44" />
        </label>
        <SubmitButton pendingLabel="Gerando lote…">Gerar lote para a folha</SubmitButton>
      </div>
    </form>
  );
}

export function SimpleAction({ action, label }: { action: (s: ActionState) => Promise<ActionState>; label: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton variant="secondary" pendingLabel="Processando…">{label}</SubmitButton>
      {state?.message ? <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.message}</span> : null}
    </form>
  );
}
