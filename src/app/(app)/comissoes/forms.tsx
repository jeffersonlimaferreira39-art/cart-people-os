"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export type PlanValues = {
  id?: string;
  name: string;
  base: "venda" | "recebimento";
  default_rate: number;
  tiers: { from: number; rate: number }[];
  category_rates: Record<string, number>;
  active: boolean;
};

const n = (v: number) => String(v).replace(".", ",");

export function PlanForm({ action, plan }: { action: Act; plan?: PlanValues }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(plan ? null : state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      {plan?.id ? <input type="hidden" name="id" value={plan.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Nome do plano" name="name" error={err("name")}>
          <Input name="name" required defaultValue={plan?.name} placeholder="Vendas loja" />
        </Field>
        <Field label="Base de cálculo" name="base">
          <Select name="base" defaultValue={plan?.base ?? "venda"}>
            <option value="venda">Venda fechada no mês</option>
            <option value="recebimento">Valor recebido no mês</option>
          </Select>
        </Field>
        <Field label="% padrão" name="default_rate" error={err("default_rate")} hint="Quando não há faixa nem categoria">
          <Input name="default_rate" inputMode="decimal" defaultValue={plan ? n(plan.default_rate) : ""} placeholder="3" />
        </Field>
        {plan?.id ? (
          <Field label="Situação" name="active">
            <Select name="active" defaultValue={plan.active ? "on" : "off"}>
              <option value="on">Ativo</option>
              <option value="off">Inativo</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Faixas por meta" name="tiers" hint="% da meta : % de comissão — ex.: 0:2; 80:3; 100:4" className="sm:col-span-2">
          <Input name="tiers" defaultValue={plan?.tiers.map((t) => `${n(t.from)}:${n(t.rate)}`).join("; ")} placeholder="0:2; 80:3; 100:4" />
        </Field>
        <Field label="% por categoria (prevalece)" name="category_rates" hint="categoria : % — ex.: planejados:3; acessórios:5" className="sm:col-span-2">
          <Input name="category_rates" defaultValue={plan ? Object.entries(plan.category_rates).map(([k, v]) => `${k}:${n(v)}`).join("; ") : ""} placeholder="planejados:3; acessorios:5" />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant={plan?.id ? "secondary" : "primary"}>{plan?.id ? "Salvar plano" : "Criar plano"}</SubmitButton>
      </div>
    </form>
  );
}

export function SellerForm({ action, employees, plans }: { action: Act; employees: Option[]; plans: Option[] }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1.5fr_1fr_1fr_auto] xl:items-end">
        <Field label="Vendedor" name="employee_id" error={err("employee_id")}>
          <Select name="employee_id" defaultValue="" required>
            <option value="" disabled>Escolha…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </Select>
        </Field>
        <Field label="Plano" name="plan_id" error={err("plan_id")}>
          <Select name="plan_id" defaultValue={plans[0]?.id ?? ""} required>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Meta mensal (R$)" name="monthly_target" hint="Para faixas"><Input name="monthly_target" inputMode="decimal" placeholder="50.000,00" /></Field>
        <Field label="% próprio" name="rate_override" error={err("rate_override")} hint="Opcional"><Input name="rate_override" inputMode="decimal" /></Field>
        <SubmitButton variant="secondary">Salvar vendedor</SubmitButton>
      </div>
    </form>
  );
}

export function SaleForm({ action, sellers, defaultDate }: { action: Act; sellers: Option[]; defaultDate: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1.2fr_1fr_1fr_auto] xl:items-end">
        <Field label="Vendedor" name="employee_id" error={err("employee_id")}>
          <Select name="employee_id" defaultValue="" required>
            <option value="" disabled>Escolha…</option>
            {sellers.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </Select>
        </Field>
        <Field label="Data" name="sale_date" error={err("sale_date")}><Input type="date" name="sale_date" defaultValue={defaultDate} required /></Field>
        <Field label="Pedido" name="order_number"><Input name="order_number" maxLength={60} /></Field>
        <Field label="Cliente" name="customer" hint="Opcional"><Input name="customer" maxLength={120} /></Field>
        <Field label="Categoria" name="category"><Input name="category" placeholder="planejados" /></Field>
        <Field label="Valor (R$)" name="amount" error={err("amount")}><Input name="amount" inputMode="decimal" required /></Field>
        <SubmitButton>Lançar venda</SubmitButton>
      </div>
    </form>
  );
}

export function ImportForm({ action, kind }: { action: Act; kind: "vendas" | "recebimentos" }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Planilha CSV (até 2 MB)" name="file" className="min-w-72 flex-1">
          <Input type="file" name="file" accept=".csv,text/csv" required className="h-auto py-1.5" />
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Importando…">Importar {kind}</SubmitButton>
      </div>
      <p className="text-[12.5px] text-ink-3">
        {kind === "vendas"
          ? "Colunas: data; matricula; pedido; cliente; categoria; valor. Separador ; ou , — no Excel, salve como CSV. Pedido repetido para o mesmo vendedor é ignorado."
          : "Colunas: pedido; matricula (se o pedido tiver mais de um vendedor); data_pagamento; valor."}
      </p>
    </form>
  );
}

/** Botão de ação simples com confirmação e mensagem. */
export function ActionButton({
  action,
  label,
  confirmText,
  variant = "secondary",
  size = "md",
}: {
  action: () => Promise<ActionState>;
  label: string;
  confirmText?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => setState(await action()));
        }}
      >
        {pending ? "Aguarde…" : label}
      </Button>
      {state?.message && size === "md" ? <Notice tone={state.ok ? "ok" : "danger"}>{state.message}</Notice> : null}
      {state?.message && size === "sm" && !state.ok ? <span className="text-[12px] text-danger">{state.message}</span> : null}
    </span>
  );
}
