"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { ENTRY_CODES, ITEM_CODES, type PayrollProfile } from "@/lib/domain/payroll";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;

const dec = (n: number) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line px-4 pt-4 pb-5 first:border-t-0">
      <legend className="eyebrow float-left mb-3 w-full !text-[10.5px] text-accent">{title}</legend>
      {hint ? <p className="clear-both mb-3 text-[12.5px] text-ink-3">{hint}</p> : null}
      <div className="clear-both grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{children}</div>
    </fieldset>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex h-9 items-center gap-2 self-end text-sm text-ink">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function ProfileForm({
  action,
  profile,
  baseSalary,
  notes,
}: {
  action: Act;
  profile: PayrollProfile;
  baseSalary: number | null;
  notes: string | null;
}) {
  const [state, formAction] = useActionState(action, null);
  const err = (k: string) => state?.fieldErrors?.[k];
  const [alimony, setAlimony] = useState(profile.alimony_type);
  return (
    <form action={formAction}>
      <div className="px-4 pt-4"><FormMessage state={state} /></div>
      <Group title="Remuneração">
        <Field label="Salário-base (R$)" name="base_salary" error={err("base_salary")} hint="Mensal; para horista, o valor da hora.">
          <Input name="base_salary" inputMode="decimal" defaultValue={baseSalary ? dec(baseSalary) : ""} placeholder="0,00" />
        </Field>
        <Field label="Tipo de salário" name="salary_type">
          <Select name="salary_type" defaultValue={profile.salary_type}>
            <option value="mensalista">Mensalista</option>
            <option value="horista">Horista</option>
          </Select>
        </Field>
        <Field label="Horas mensais (divisor)" name="monthly_hours" error={err("monthly_hours")} hint="44h semanais = 220">
          <Input name="monthly_hours" inputMode="decimal" defaultValue={String(profile.monthly_hours).replace(".", ",")} />
        </Field>
      </Group>

      <Group title="Vale-transporte" hint="Desconto do colaborador limitado a 6% do salário-base; a empresa paga o restante.">
        <Check name="vt_enabled" label="Recebe vale-transporte" defaultChecked={profile.vt_enabled} />
        <Field label="Custo diário das passagens (R$)" name="vt_daily_amount" error={err("vt_daily_amount")}>
          <Input name="vt_daily_amount" inputMode="decimal" defaultValue={dec(profile.vt_daily_amount)} placeholder="0,00" />
        </Field>
        <Field label="Dias úteis padrão no mês" name="vt_days" error={err("vt_days")}>
          <Input name="vt_days" inputMode="numeric" defaultValue={String(profile.vt_days)} />
        </Field>
      </Group>

      <Group title="Alimentação" hint="Crédito mensal do benefício. Pelo PAT, a coparticipação do colaborador vai até 20%.">
        <Field label="Vale-alimentação (R$/mês)" name="va_monthly" error={err("va_monthly")}>
          <Input name="va_monthly" inputMode="decimal" defaultValue={dec(profile.va_monthly)} placeholder="0,00" />
        </Field>
        <Field label="Vale-refeição (R$/mês)" name="vr_monthly" error={err("vr_monthly")}>
          <Input name="vr_monthly" inputMode="decimal" defaultValue={dec(profile.vr_monthly)} placeholder="0,00" />
        </Field>
        <Field label="Coparticipação (%)" name="food_discount_pct" error={err("food_discount_pct")}>
          <Input name="food_discount_pct" inputMode="decimal" defaultValue={profile.food_discount_pct ? String(profile.food_discount_pct).replace(".", ",") : ""} placeholder="0" />
        </Field>
      </Group>

      <Group title="Planos e seguros">
        <Field label="Plano de saúde — colaborador (R$)" name="health_plan_employee" error={err("health_plan_employee")}>
          <Input name="health_plan_employee" inputMode="decimal" defaultValue={dec(profile.health_plan_employee)} placeholder="0,00" />
        </Field>
        <Field label="Plano de saúde — empresa (R$)" name="health_plan_company" error={err("health_plan_company")} hint="Custo da empresa, não desconta.">
          <Input name="health_plan_company" inputMode="decimal" defaultValue={dec(profile.health_plan_company)} placeholder="0,00" />
        </Field>
        <Field label="Plano odontológico (R$)" name="dental_plan_employee" error={err("dental_plan_employee")}>
          <Input name="dental_plan_employee" inputMode="decimal" defaultValue={dec(profile.dental_plan_employee)} placeholder="0,00" />
        </Field>
        <Field label="Seguro de vida (R$)" name="life_insurance_employee" error={err("life_insurance_employee")}>
          <Input name="life_insurance_employee" inputMode="decimal" defaultValue={dec(profile.life_insurance_employee)} placeholder="0,00" />
        </Field>
      </Group>

      <Group title="Adicionais">
        <Field label="Insalubridade" name="unhealthiness_grade" hint="Sobre o salário mínimo">
          <Select name="unhealthiness_grade" defaultValue={profile.unhealthiness_grade}>
            <option value="nenhum">Não se aplica</option>
            <option value="minimo">Grau mínimo (10%)</option>
            <option value="medio">Grau médio (20%)</option>
            <option value="maximo">Grau máximo (40%)</option>
          </Select>
        </Field>
        <div className="flex flex-col">
          <Check name="hazard_pay" label="Periculosidade (30% do salário)" defaultChecked={profile.hazard_pay} />
          {err("hazard_pay") ? <p className="text-[13px] text-danger">{err("hazard_pay")?.[0]}</p> : null}
        </div>
      </Group>

      <Group title="Descontos">
        <Field label="Contribuição sindical/assistencial (R$)" name="union_fee" error={err("union_fee")} hint="Só com autorização expressa.">
          <Input name="union_fee" inputMode="decimal" defaultValue={dec(profile.union_fee)} placeholder="0,00" />
        </Field>
        <Field label="Pensão alimentícia" name="alimony_type">
          <Select name="alimony_type" value={alimony} onChange={(e) => setAlimony(e.target.value as typeof alimony)}>
            <option value="nenhuma">Não se aplica</option>
            <option value="percentual">Percentual (sobre rendimentos − INSS)</option>
            <option value="valor">Valor fixo</option>
          </Select>
        </Field>
        {alimony !== "nenhuma" ? (
          <Field label={alimony === "percentual" ? "Percentual (%)" : "Valor (R$)"} name="alimony_value" error={err("alimony_value")}>
            <Input name="alimony_value" inputMode="decimal" defaultValue={profile.alimony_value ? String(profile.alimony_value).replace(".", ",") : ""} />
          </Field>
        ) : (
          <input type="hidden" name="alimony_value" value="0" />
        )}
      </Group>

      <div className="border-t border-line px-4 pt-4 pb-4">
        <Field label="Observações" name="notes" error={err("notes")}>
          <Textarea name="notes" defaultValue={notes ?? ""} maxLength={1000} />
        </Field>
        <div className="mt-4 flex justify-end">
          <SubmitButton>Salvar dados da folha</SubmitButton>
        </div>
      </div>
    </form>
  );
}

/** Botão que chama uma ação de exclusão, com confirmação. */
export function RemoveButton({ action, label, confirmText }: { action: () => Promise<ActionState>; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(confirmText)) return;
          start(async () => {
            const r = await action();
            setError(r && !r.ok ? (r.message ?? "Não foi possível excluir.") : null);
          });
        }}
        className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-3 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
        aria-label={label}
        title={label}
      >
        <Trash2 className="size-4" strokeWidth={1.75} />
      </button>
    </span>
  );
}

export function DependentForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end 2xl:grid-cols-[2fr_1fr_1fr_1fr]">
        <Field label="Nome" name="full_name" error={err("full_name")}><Input name="full_name" required /></Field>
        <Field label="Parentesco" name="relationship">
          <Select name="relationship" defaultValue="filho">
            <option value="filho">Filho(a)</option>
            <option value="enteado">Enteado(a)</option>
            <option value="conjuge">Cônjuge</option>
            <option value="pai_mae">Pai/mãe</option>
            <option value="outro">Outro</option>
          </Select>
        </Field>
        <Field label="Nascimento" name="birth_date" error={err("birth_date")}><Input name="birth_date" type="date" required /></Field>
        <Field label="CPF" name="cpf" error={err("cpf")}><Input name="cpf" inputMode="numeric" placeholder="opcional" /></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Check name="ir_dependent" label="Dependente no imposto de renda" />
        <SubmitButton variant="secondary">Incluir dependente</SubmitButton>
      </div>
    </form>
  );
}

const ITEM_OPTIONS = Object.entries(ITEM_CODES) as [keyof typeof ITEM_CODES, (typeof ITEM_CODES)[keyof typeof ITEM_CODES]][];

export function ItemForm({ action, defaultPeriod }: { action: Act; defaultPeriod: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  const [code, setCode] = useState<keyof typeof ITEM_CODES>("GRATIFICACAO_FUNCAO");
  const def = ITEM_CODES[code];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rubrica" name="code" error={err("code")}>
          <Select name="code" value={code} onChange={(e) => setCode(e.target.value as keyof typeof ITEM_CODES)}>
            <optgroup label="Proventos">
              {ITEM_OPTIONS.filter(([, d]) => d.kind === "provento").map(([c, d]) => <option key={c} value={c}>{d.label}</option>)}
            </optgroup>
            <optgroup label="Descontos">
              {ITEM_OPTIONS.filter(([, d]) => d.kind === "desconto").map(([c, d]) => <option key={c} value={c}>{d.label}</option>)}
            </optgroup>
          </Select>
        </Field>
        <Field label="Descrição no holerite" name="description" error={err("description")}>
          <Input name="description" placeholder={def.label} maxLength={120} />
        </Field>
        <Field label="Tipo de valor" name="value_type">
          <Select name="value_type" defaultValue="valor">
            <option value="valor">Valor fixo (R$)</option>
            <option value="percentual">% do salário</option>
          </Select>
        </Field>
        <Field label="Valor" name="value" error={err("value")}><Input name="value" inputMode="decimal" required /></Field>
        <Field label="Início (competência)" name="start_period" error={err("start_period")}>
          <Input name="start_period" type="month" defaultValue={defaultPeriod} required />
        </Field>
        <Field label="Fim (opcional)" name="end_period" error={err("end_period")}>
          <Input name="end_period" type="month" />
        </Field>
        {def.kind === "provento" ? (
          <div key={code} className="flex flex-wrap items-end gap-x-4 sm:col-span-2">
            <span className="w-full text-[13px] font-medium text-ink-2">Incide em</span>
            <Check name="incidence_inss" label="INSS" defaultChecked={def.incidence.inss} />
            <Check name="incidence_irrf" label="IRRF" defaultChecked={def.incidence.irrf} />
            <Check name="incidence_fgts" label="FGTS" defaultChecked={def.incidence.fgts} />
          </div>
        ) : null}
      </div>
      <div className="flex justify-end"><SubmitButton variant="secondary">Incluir rubrica</SubmitButton></div>
    </form>
  );
}

const ENTRY_OPTIONS = Object.entries(ENTRY_CODES) as [keyof typeof ENTRY_CODES, (typeof ENTRY_CODES)[keyof typeof ENTRY_CODES]][];
const UNIT_LABEL = { horas: "Horas", dias: "Dias", valor: "Valor (R$)" } as const;

export function EntryForm({ action, period }: { action: Act; period: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  const [code, setCode] = useState<keyof typeof ENTRY_CODES>("HE50");
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <input type="hidden" name="period" value={period} />
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Field label="Lançamento" name="code" error={err("code")}>
          <Select name="code" value={code} onChange={(e) => setCode(e.target.value as keyof typeof ENTRY_CODES)}>
            {(["provento", "desconto", "informativo"] as const).map((k) => (
              <optgroup key={k} label={k === "provento" ? "Proventos" : k === "desconto" ? "Descontos" : "Informativos"}>
                {ENTRY_OPTIONS.filter(([, d]) => d.kind === k).map(([c, d]) => <option key={c} value={c}>{d.label}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label={UNIT_LABEL[ENTRY_CODES[code].unit]} name="value" error={err("value")}>
          <Input name="value" inputMode="decimal" required />
        </Field>
        <Field label="Observação" name="notes" error={err("notes")} className="sm:col-span-2"><Input name="notes" maxLength={300} /></Field>
      </div>
      <div className="flex justify-end"><SubmitButton variant="secondary">Lançar</SubmitButton></div>
      {code === "HE50" || code === "ADN" ? (
        <Notice tone="info">Horas lançadas aqui substituem as horas vindas do ponto neste mês.</Notice>
      ) : null}
    </form>
  );
}
