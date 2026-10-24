"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ActionState } from "@/lib/actions";
import { DP_EVENT_FIELDS, DP_EVENT_TYPES, type DpEventType } from "@/lib/domain/dp-events";
import { DP_EVENT_LABELS } from "@/lib/integrations/payroll";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

export function DpForm({
  action, people, defaultEmployeeId,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  people: { id: string; full_name: string; registration_number: string }[];
  defaultEmployeeId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [type, setType] = useState<DpEventType>("alteracao_salarial");
  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <FormMessage state={state} />
      <Field label="Colaborador" name="employee_id" error={err("employee_id")}>
        <Select name="employee_id" defaultValue={defaultEmployeeId} required>
          <option value="">Escolha…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name} ({p.registration_number})</option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Movimentação" name="type">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as DpEventType)}>
            {DP_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{DP_EVENT_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Data de efeito" name="effective_date" error={err("effective_date")}>
          <Input type="date" name="effective_date" required />
        </Field>
      </div>

      <div className="grid gap-4 rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:grid-cols-2" key={type}>
        {DP_EVENT_FIELDS[type].map((f) => {
          const name = `payload.${f.key}`;
          const label = f.required ? f.label : `${f.label} (opcional)`;
          return (
            <Field key={name} label={label} name={name} error={err(name)} hint={f.hint}>
              {f.type === "select" ? (
                <Select name={name} required={f.required} defaultValue="">
                  <option value="">Escolha…</option>
                  {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              ) : (
                <Input
                  name={name}
                  required={f.required}
                  type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  placeholder={f.type === "money" ? "0,00" : undefined}
                  invalid={!!err(name)}
                />
              )}
            </Field>
          );
        })}
      </div>

      <Field label="Observações para o DP e a contabilidade" name="notes">
        <Textarea name="notes" maxLength={1000} />
      </Field>

      <div className="flex flex-wrap gap-2 pt-1">
        <SubmitButton name="submit" value="submitted" pendingLabel="Enviando…">Enviar para aprovação</SubmitButton>
        <SubmitButton name="submit" value="draft" variant="secondary" pendingLabel="Salvando…">Salvar rascunho</SubmitButton>
        <Link href="/dp" className={buttonClasses("ghost")}>Cancelar</Link>
      </div>
      <p className="text-[13px] text-ink-3">A aprovação precisa ser feita por outra pessoa do RH, DP ou administração.</p>
    </form>
  );
}
