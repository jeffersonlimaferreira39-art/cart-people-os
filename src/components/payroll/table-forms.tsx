"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions";
import type { FamilyAllowanceTable, InssTable, IrrfTable, PayrollParameters, TableKind } from "@/lib/domain/payroll-tables";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;
const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

function Shell({ action, defaultPeriod, children }: { action: Act; defaultPeriod: string; children: React.ReactNode }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      {children}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Vale a partir de" name="valid_from"><Input type="month" name="valid_from" defaultValue={defaultPeriod} required className="w-40" /></Field>
          <Field label="Fonte / observação" name="notes"><Input name="notes" placeholder="Ex.: Portaria MPS 2026" className="w-64" /></Field>
        </div>
        <SubmitButton variant="secondary">Salvar vigência</SubmitButton>
      </div>
    </form>
  );
}

function Brackets({ kind, rows: initial }: { kind: "inss" | "irrf"; rows: { upTo: number | null; rate: number; deduction?: number }[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label={`Faixa ${i + 1}: até (R$)`} name={`upTo_${i}`}>
            <Input name={`upTo_${i}`} inputMode="decimal" defaultValue={n(r.upTo)} placeholder={kind === "irrf" ? "acima (sem limite)" : ""} />
          </Field>
          <Field label="Alíquota (%)" name={`rate_${i}`}><Input name={`rate_${i}`} inputMode="decimal" defaultValue={n(r.rate)} required /></Field>
          {kind === "irrf" ? (
            <Field label="Parcela a deduzir (R$)" name={`deduction_${i}`}><Input name={`deduction_${i}`} inputMode="decimal" defaultValue={n(r.deduction)} required /></Field>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>Remover</Button>
        </div>
      ))}
      {rows.length < 6 ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRows([...rows, { upTo: null, rate: 0, deduction: 0 }])}>
          Adicionar faixa
        </Button>
      ) : null}
    </div>
  );
}

export function TaxTableForm({ kind, action, current, defaultPeriod }: { kind: TableKind; action: Act; current: unknown; defaultPeriod: string }) {
  if (kind === "inss") {
    const t = current as InssTable;
    return <Shell action={action} defaultPeriod={defaultPeriod}><Brackets kind="inss" rows={t.brackets} /></Shell>;
  }
  if (kind === "irrf") {
    const t = current as IrrfTable;
    const r = t.reduction;
    return (
      <Shell action={action} defaultPeriod={defaultPeriod}>
        <Brackets kind="irrf" rows={t.brackets} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dedução por dependente (R$)" name="dependentDeduction"><Input name="dependentDeduction" inputMode="decimal" defaultValue={n(t.dependentDeduction)} required /></Field>
          <Field label="Desconto simplificado mensal (R$)" name="simplifiedDiscount"><Input name="simplifiedDiscount" inputMode="decimal" defaultValue={n(t.simplifiedDiscount)} required /></Field>
        </div>
        <p className="eyebrow mt-2 !text-[10.5px] text-ink-3">Redução do imposto (deixe em branco se não houver)</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Zera até (R$)" name="exemptUpTo"><Input name="exemptUpTo" inputMode="decimal" defaultValue={n(r?.exemptUpTo)} /></Field>
          <Field label="Redução máxima (R$)" name="maxReduction"><Input name="maxReduction" inputMode="decimal" defaultValue={n(r?.maxReduction)} /></Field>
          <Field label="Redução parcial até (R$)" name="phaseOutUpTo"><Input name="phaseOutUpTo" inputMode="decimal" defaultValue={n(r?.phaseOutUpTo)} /></Field>
          <Field label="Constante (R$)" name="phaseOutConstant"><Input name="phaseOutConstant" inputMode="decimal" defaultValue={n(r?.phaseOutConstant)} /></Field>
          <Field label="Fator × renda" name="phaseOutFactor"><Input name="phaseOutFactor" inputMode="decimal" defaultValue={n(r?.phaseOutFactor)} /></Field>
        </div>
      </Shell>
    );
  }
  if (kind === "salario_familia") {
    const t = current as FamilyAllowanceTable;
    return (
      <Shell action={action} defaultPeriod={defaultPeriod}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Remuneração máxima (R$)" name="incomeLimit"><Input name="incomeLimit" inputMode="decimal" defaultValue={n(t.incomeLimit)} required /></Field>
          <Field label="Cota por filho (R$)" name="quota"><Input name="quota" inputMode="decimal" defaultValue={n(t.quota)} required /></Field>
        </div>
      </Shell>
    );
  }
  const t = current as PayrollParameters;
  const fields: [string, string, number][] = [
    ["minimumWage", "Salário mínimo (R$)", t.minimumWage],
    ["fgtsRate", "FGTS (%)", t.fgtsRate],
    ["fgtsApprenticeRate", "FGTS aprendiz (%)", t.fgtsApprenticeRate],
    ["vtMaxDiscountRate", "Desconto máximo de VT (%)", t.vtMaxDiscountRate],
    ["overtimeRate", "Hora extra (%)", t.overtimeRate],
    ["overtimeHolidayRate", "Hora extra domingo/feriado (%)", t.overtimeHolidayRate],
    ["nightShiftRate", "Adicional noturno (%)", t.nightShiftRate],
    ["hazardRate", "Periculosidade (%)", t.hazardRate],
    ["unh_minimo", "Insalubridade mínima (%)", t.unhealthinessRates.minimo],
    ["unh_medio", "Insalubridade média (%)", t.unhealthinessRates.medio],
    ["unh_maximo", "Insalubridade máxima (%)", t.unhealthinessRates.maximo],
  ];
  return (
    <Shell action={action} defaultPeriod={defaultPeriod}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(([k, label, v]) => (
          <Field key={k} label={label} name={k}><Input name={k} inputMode="decimal" defaultValue={n(v)} required /></Field>
        ))}
      </div>
    </Shell>
  );
}
