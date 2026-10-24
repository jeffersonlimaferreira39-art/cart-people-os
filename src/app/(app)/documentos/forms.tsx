"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/actions";
import { DOCUMENT_CATEGORY_LABELS, ORG_DOCUMENT_CATEGORIES, type OrgDocumentArea } from "@/lib/format";
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

export function EmployeeDocumentForm({ action, employees }: { action: Act; employees: { id: string; full_name: string; registration_number: string }[] }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_160px_auto] xl:items-end">
        <Field label="Colaborador" name="employee_id" error={state?.fieldErrors?.employee_id}>
          <Select name="employee_id" required defaultValue="">
            <option value="" disabled>Escolha…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.registration_number}</option>)}
          </Select>
        </Field>
        <Field label="Arquivo (PDF, JPG ou PNG até 4 MB)" name="file">
          <Input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required className="h-auto py-1.5" />
        </Field>
        <Field label="Categoria" name="category">
          <Select name="category" defaultValue="documento_pessoal">
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Vencimento" name="expires_at"><Input type="date" name="expires_at" /></Field>
        <SubmitButton pendingLabel="Enviando…">Enviar documento</SubmitButton>
      </div>
    </form>
  );
}

export function OrgDocumentForm({
  action,
  area,
  units,
  orgWide,
}: {
  action: Act;
  area: OrgDocumentArea;
  units: { id: string; name: string }[];
  orgWide: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Título" name="title" error={err("title")} className="xl:col-span-2">
          <Input name="title" required maxLength={160} placeholder={area === "rh" ? "Regulamento interno 2026" : "Guia FGTS outubro/2026"} />
        </Field>
        <Field label="Categoria" name="category" error={err("category")}>
          <Select name="category" defaultValue="">
            <option value="" disabled>Escolha…</option>
            {Object.entries(ORG_DOCUMENT_CATEGORIES[area]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Arquivo (até 4 MB)" name="file" hint="PDF, JPG, PNG, XLSX, CSV ou DOCX">
          <Input
            type="file"
            name="file"
            required
            className="h-auto py-1.5"
            accept="application/pdf,image/jpeg,image/png,text/csv,.xlsx,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
        </Field>
        <Field label="Unidade" name="unit_id" error={err("unit_id")}>
          <Select name="unit_id" defaultValue={orgWide ? "" : (units[0]?.id ?? "")}>
            {orgWide ? <option value="">Todas as unidades</option> : null}
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Competência" name="period" error={err("period")} hint="Opcional (guias, folhas)">
          <Input type="month" name="period" />
        </Field>
        <Field label="Vencimento" name="expires_at" error={err("expires_at")} hint="Opcional">
          <Input type="date" name="expires_at" />
        </Field>
        <Field label="Quem vê" name="visibility">
          <Select name="visibility" defaultValue="restrito">
            <option value="restrito">Só Admin, RH e DP</option>
            <option value="todos">Todos os colaboradores</option>
          </Select>
        </Field>
        <Field label="Descrição" name="description" error={err("description")} className="sm:col-span-2 xl:col-span-3">
          <Input name="description" maxLength={500} placeholder="Opcional" />
        </Field>
        <div className="flex items-end justify-end">
          <SubmitButton pendingLabel="Enviando…">Enviar documento</SubmitButton>
        </div>
      </div>
    </form>
  );
}
