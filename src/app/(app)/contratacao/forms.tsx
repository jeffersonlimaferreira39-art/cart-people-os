"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/lib/actions";
import { SOURCES, STAGES } from "@/lib/domain/recruitment";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/format";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/components/ui/cn";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function OpeningForm({ action, units, departments, positions }: { action: Act; units: Option[]; departments: Option[]; positions: Option[] }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Título da vaga" name="title" error={err("title")} className="xl:col-span-2">
          <Input name="title" required maxLength={120} placeholder="Vendedor(a) de móveis planejados" />
        </Field>
        <Field label="Unidade" name="unit_id" error={err("unit_id")}>
          <Select name="unit_id" defaultValue={units[0]?.id}>{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select>
        </Field>
        <Field label="Quantidade" name="openings" error={err("openings")}><Input name="openings" type="number" min={1} max={500} defaultValue={1} /></Field>
        <Field label="Departamento" name="department_id">
          <Select name="department_id" defaultValue=""><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
        </Field>
        <Field label="Cargo" name="position_id">
          <Select name="position_id" defaultValue=""><option value="">—</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
        </Field>
        <Field label="Vínculo" name="employment_type">
          <Select name="employment_type" defaultValue="clt">{Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Faixa salarial" name="salary_range" hint="Opcional, uso interno"><Input name="salary_range" maxLength={80} placeholder="R$ 2.500 a 3.000 + comissão" /></Field>
        <Field label="Descrição e requisitos" name="description" className="sm:col-span-2 xl:col-span-4">
          <Textarea name="description" maxLength={4000} />
        </Field>
      </div>
      <div className="flex justify-end"><SubmitButton>Abrir vaga</SubmitButton></div>
    </form>
  );
}

export function CandidateForm({ action, openings, defaultOpening }: { action: Act; openings: Option[]; defaultOpening?: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Vaga" name="opening_id" error={err("opening_id")}>
          <Select name="opening_id" defaultValue={defaultOpening ?? openings[0]?.id}>{openings.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
        </Field>
        <Field label="Nome completo" name="full_name" error={err("full_name")}><Input name="full_name" required maxLength={120} /></Field>
        <Field label="E-mail" name="email" error={err("email")}><Input name="email" type="email" /></Field>
        <Field label="Telefone" name="phone"><Input name="phone" maxLength={30} /></Field>
        <Field label="Origem" name="source">
          <Select name="source" defaultValue="indicacao">{Object.entries(SOURCES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Currículo" name="resume" hint="PDF, DOCX, JPG ou PNG até 4 MB">
          <Input type="file" name="resume" className="h-auto py-1.5" accept="application/pdf,image/jpeg,image/png,.docx" />
        </Field>
        <Field label="Observações" name="notes" className="sm:col-span-2"><Input name="notes" maxLength={4000} /></Field>
      </div>
      <label className={cn("flex items-start gap-2 text-[13px]", err("consent") ? "text-danger" : "text-ink-2")}>
        <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[var(--accent)]" />
        O candidato autorizou o uso dos dados para este processo seletivo (LGPD). Os dados serão excluídos ao fim do processo se não houver contratação.
      </label>
      {err("consent") ? <p className="text-[13px] text-danger">{err("consent")?.[0]}</p> : null}
      <div className="flex justify-end"><SubmitButton pendingLabel="Salvando…">Cadastrar candidato</SubmitButton></div>
    </form>
  );
}

export function MoveForm({ action, current }: { action: Act; current: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <Field label="Nova etapa" name="stage">
          <Select name="stage" defaultValue={current}>
            {STAGES.filter((s) => s.id !== "contratado").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Anotação (opcional)" name="note"><Input name="note" maxLength={1000} placeholder="Ex.: entrevista com o gestor em 28/10" /></Field>
        <SubmitButton variant="secondary">Atualizar etapa</SubmitButton>
      </div>
    </form>
  );
}

export function HireForm({ action, departments, positions, defaults }: {
  action: Act;
  departments: Option[];
  positions: Option[];
  defaults: { department_id: string | null; position_id: string | null; hire_date: string };
}) {
  const [state, formAction] = useActionState(action, null);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Matrícula" name="registration_number" error={err("registration_number")}><Input name="registration_number" required maxLength={30} /></Field>
        <Field label="Data de admissão" name="hire_date" error={err("hire_date")}><Input name="hire_date" type="date" defaultValue={defaults.hire_date} required /></Field>
        <Field label="Departamento" name="department_id">
          <Select name="department_id" defaultValue={defaults.department_id ?? ""}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
        </Field>
        <Field label="Cargo" name="position_id">
          <Select name="position_id" defaultValue={defaults.position_id ?? ""}><option value="">—</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
        </Field>
      </div>
      <p className="text-[12.5px] text-ink-3">
        Cria o cadastro em “Em admissão”, o checklist de admissão e (para o DP) a movimentação de admissão em rascunho. CPF, salário e
        dados bancários são preenchidos depois, no cadastro.
      </p>
      <div className="flex justify-end"><SubmitButton pendingLabel="Contratando…">Contratar e gerar cadastro</SubmitButton></div>
    </form>
  );
}

/** Caixa de checklist que salva ao marcar. */
export function ChecklistItem({ label, done, toggle }: { label: string; done: boolean; toggle: (done: boolean) => Promise<ActionState> }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className={cn("flex items-start gap-2 py-1 text-[13px]", checked ? "text-ink-3 line-through" : "text-ink", pending && "opacity-60")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          start(async () => {
            const r = await toggle(next);
            if (!r?.ok) { setChecked(!next); setError(r?.message ?? "Não foi possível salvar."); } else setError(null);
          });
        }}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span>{label}{error ? <span className="block text-[12px] text-danger no-underline">{error}</span> : null}</span>
    </label>
  );
}
