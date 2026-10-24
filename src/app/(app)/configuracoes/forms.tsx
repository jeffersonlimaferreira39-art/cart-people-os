"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/actions";
import { ROLE_LABELS, ROLES } from "@/lib/domain/roles";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function UnitForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_80px_auto] sm:items-end">
        <Field label="Nome" name="name" error={err("name")}><Input name="name" required placeholder="Filial Eusébio" /></Field>
        <Field label="Código" name="code" error={err("code")}><Input name="code" required placeholder="EUS" /></Field>
        <Field label="Cidade" name="city"><Input name="city" /></Field>
        <Field label="UF" name="state" error={err("state")}><Input name="state" maxLength={2} /></Field>
        <SubmitButton variant="secondary">Criar unidade</SubmitButton>
      </div>
    </form>
  );
}

export function DepartmentForm({ action, units }: { action: Act; units: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,1fr)_auto] sm:items-end">
        <Field label="Departamento" name="name" error={state?.fieldErrors?.name}><Input name="name" required /></Field>
        <Field label="Unidade" name="unit_id">
          <Select name="unit_id" defaultValue="">
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <SubmitButton variant="secondary">Criar departamento</SubmitButton>
      </div>
    </form>
  );
}

export function PositionForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="Cargo" name="title" error={state?.fieldErrors?.title}><Input name="title" required /></Field>
        <Field label="CBO" name="cbo" error={state?.fieldErrors?.cbo}><Input name="cbo" inputMode="numeric" maxLength={6} /></Field>
        <SubmitButton variant="secondary">Criar cargo</SubmitButton>
      </div>
    </form>
  );
}

export function InviteForm({
  action, units, employees,
}: {
  action: Act;
  units: { id: string; name: string }[];
  employees: { id: string; full_name: string }[];
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1.2fr)_minmax(11rem,1.3fr)_minmax(0,1.8fr)_auto] lg:items-end">
        <Field label="E-mail" name="email" error={err("email")}><Input type="email" name="email" required /></Field>
        <Field label="Papel" name="role">
          <Select name="role" defaultValue="colaborador">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        <Field label="Escopo" name="unit_id">
          <Select name="unit_id" defaultValue="">
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Cadastro de colaborador" name="employee_id">
          <Select name="employee_id" defaultValue="">
            <option value="">Não vincular</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>
        <SubmitButton pendingLabel="Enviando…">Conceder acesso</SubmitButton>
      </div>
    </form>
  );
}
