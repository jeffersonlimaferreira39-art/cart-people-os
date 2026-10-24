"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ActionState } from "@/lib/actions";
import { LEAVE_TYPE_LABELS } from "@/lib/format";
import { daysInclusive, isIsoDate } from "@/lib/domain/dates";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";

type Person = { id: string; full_name: string; registration_number: string };

export function LeaveForm({
  action, people, defaultEmployeeId,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  people: Person[];
  defaultEmployeeId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [type, setType] = useState("ferias");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const err = (k: string) => state?.fieldErrors?.[k];
  const days = isIsoDate(start) && isIsoDate(end) && end >= start ? daysInclusive(start, end) : null;
  const warnings = err("ack");

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {!warnings ? <FormMessage state={state} /> : null}
      <Field label="Colaborador" name="employee_id" error={err("employee_id")}>
        <Select name="employee_id" defaultValue={defaultEmployeeId} required disabled={people.length === 1}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.registration_number ? `${p.full_name} (${p.registration_number})` : p.full_name}</option>
          ))}
        </Select>
      </Field>
      {people.length === 1 ? <input type="hidden" name="employee_id" value={people[0].id} /> : null}

      <Field label="Tipo" name="type">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primeiro dia" name="start_date" error={err("start_date")}>
          <Input type="date" name="start_date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field
          label="Último dia"
          name="end_date"
          error={err("end_date")}
          hint={days ? <span className="tnum">{days} {days === 1 ? "dia corrido" : "dias corridos"}</span> : undefined}
        >
          <Input type="date" name="end_date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
      </div>

      {type === "ferias" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Início do período aquisitivo" name="acquisition_period_start" hint="Usado para conferir parcelas e prazo concessivo.">
            <Input type="date" name="acquisition_period_start" />
          </Field>
          <Field label="Dias vendidos (abono)" name="sell_days" error={err("sell_days")} hint="Até 10 dias por período.">
            <Input type="number" name="sell_days" min={0} max={10} defaultValue={0} />
          </Field>
        </div>
      ) : null}

      <Field label="Observação" name="reason" hint="Opcional. Visível para quem decide.">
        <Textarea name="reason" maxLength={500} />
      </Field>

      {warnings ? (
        <Notice tone="attention" title="Confira antes de enviar">
          <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          <label className="mt-3 flex items-center gap-2 text-ink">
            <input type="checkbox" name="ack" className="size-4 accent-[var(--accent)]" required />
            Estou ciente e quero enviar mesmo assim
          </label>
        </Notice>
      ) : null}

      <div className="flex gap-2 pt-2">
        <SubmitButton pendingLabel="Enviando…">Enviar solicitação</SubmitButton>
        <Link href="/ausencias" className={buttonClasses("ghost")}>Cancelar</Link>
      </div>
      <p className="text-[13px] text-ink-3">
        As regras de férias aplicadas aqui são uma conferência prévia. A validação final é do DP e da contabilidade.
      </p>
    </form>
  );
}
