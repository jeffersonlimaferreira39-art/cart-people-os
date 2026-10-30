"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/actions";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/domain/roles";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { ActionButton } from "../comissoes/forms";

type Act = (s: ActionState, f: FormData) => Promise<ActionState>;

export type ReviewItem = {
  id: string;
  user: string;
  detail: string;
  role: string;
  scope: string;
  since: string;
  days: number;
  status: "em_dia" | "vence" | "vencida";
  self: boolean;
  href: string;
  revoke: () => Promise<ActionState>;
};

const REVIEW_TONE = { em_dia: "ok", vence: "attention", vencida: "danger" } as const;
const REVIEW_LABEL = { em_dia: "Em dia", vence: "Vence em breve", vencida: "Vencida" } as const;

/** Lista de papéis ativos para revisão em lote: marque e confirme. */
export function ReviewForm({ action, items }: { action: Act; items: ReviewItem[] }) {
  const [state, formAction] = useActionState(action, null);
  const due = items.filter((i) => i.status !== "em_dia" && !i.self).map((i) => i.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(due));
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  return (
    <form action={formAction} className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <p className="text-[13px] text-ink-2">
          Confirme que cada pessoa ainda precisa do papel. Quem não precisa: revogue. Os marcados ficam válidos por mais 90 dias.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="text-[13px] text-ink-2 hover:text-ink hover:underline" onClick={() => setSelected(new Set(items.filter((i) => !i.self).map((i) => i.id)))}>Marcar todos</button>
          <button type="button" className="text-[13px] text-ink-2 hover:text-ink hover:underline" onClick={() => setSelected(new Set())}>Limpar</button>
          <SubmitButton disabled={!selected.size} pendingLabel="Confirmando…">Confirmar {selected.size} acesso(s)</SubmitButton>
        </div>
      </div>
      <div className="px-4 pt-3"><FormMessage state={state} /></div>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", i.status === "vencida" && "bg-danger/5")}>
            <input
              type="checkbox"
              name="ids"
              value={i.id}
              disabled={i.self}
              checked={selected.has(i.id)}
              onChange={(e) => toggle(i.id, e.target.checked)}
              aria-label={`Confirmar ${i.role} de ${i.user}`}
              className="size-4 accent-[var(--accent)]"
            />
            <div className="min-w-0 flex-1">
              <a href={i.href} className="font-medium text-ink hover:underline">{i.user}</a>
              <span className="block truncate text-[12.5px] text-ink-3">{i.detail}</span>
            </div>
            <div className="w-44 text-[13px]">
              <span className="block text-ink">{i.role}</span>
              <span className="block text-ink-3">{i.scope}</span>
            </div>
            <div className="w-40 text-[12.5px] text-ink-3">
              <Badge tone={REVIEW_TONE[i.status]}>{REVIEW_LABEL[i.status]}</Badge>
              <span className="mt-0.5 block">revisado há {i.days} dia(s)</span>
            </div>
            <div className="w-24 text-right">
              {i.self ? <span className="text-[12px] text-ink-3">Você</span> : <ActionButton size="sm" variant="ghost" label="Revogar" action={i.revoke} confirmText={`Revogar o papel ${i.role} de ${i.user}?`} />}
            </div>
          </li>
        ))}
      </ul>
    </form>
  );
}

/** Edição de papel e escopo de um acesso. */
export function MembershipForm({ action, role, unitId, units }: { action: Act; role: Role; unitId: string | null; units: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,14rem)_auto] sm:items-center">
        <label className="sr-only" htmlFor={`role-${unitId}-${role}`}>Papel</label>
        <Select id={`role-${unitId}-${role}`} name="role" defaultValue={role}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
        <label className="sr-only" htmlFor={`unit-${unitId}-${role}`}>Escopo</label>
        <Select id={`unit-${unitId}-${role}`} name="unit_id" defaultValue={unitId ?? ""}>
          <option value="">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <SubmitButton variant="secondary" size="sm">Salvar</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** Senha provisória legível (sem 0/O, 1/l/I), sempre com letras e números. */
function generatePassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(letters), pick("23456789"), ...Array.from({ length: 10 }, () => pick(letters + "23456789"))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Cria o usuário com e-mail e senha provisória (troca obrigatória no primeiro acesso). */
export function CreateUserForm({
  action, units, employees,
}: {
  action: Act;
  units: { id: string; name: string }[];
  employees: { id: string; full_name: string }[];
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  // Limpa a senha ao criar (ajuste durante a renderização, sem efeito em cascata).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) {
      setPwd("");
      setShow(false);
    }
  }
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3 p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-mail de acesso" name="nu-email" error={err("email")}>
          <Input id="nu-email" aria-describedby={err("email") ? "nu-email-error" : undefined} type="email" name="email" autoComplete="off" required invalid={!!err("email")} />
        </Field>
        <Field label="Senha provisória" name="nu-password" error={err("password")} hint="Mínimo de 10 caracteres, com letras e números. A pessoa troca no primeiro acesso.">
          <div className="flex gap-2">
            <Input
              id="nu-password"
              aria-describedby={err("password") ? "nu-password-error" : undefined}
              type={show ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              required
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              invalid={!!err("password")}
              className="min-w-0 flex-1 font-mono"
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="shrink-0 rounded-[var(--radius-control)] border border-line-strong px-2.5 text-[13px] text-ink-2 hover:text-ink">
              {show ? "Ocultar" : "Mostrar"}
            </button>
            <button type="button" onClick={() => { setPwd(generatePassword()); setShow(true); }} className="shrink-0 rounded-[var(--radius-control)] border border-line-strong px-2.5 text-[13px] text-ink-2 hover:text-ink">
              Gerar
            </button>
          </div>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(0,1.6fr)_auto] lg:items-end">
        <Field label="Papel" name="nu-role">
          <Select id="nu-role" name="role" defaultValue="colaborador">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        <Field label="Escopo" name="nu-unit_id">
          <Select id="nu-unit_id" name="unit_id" defaultValue="">
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Cadastro de colaborador" name="nu-employee_id">
          <Select id="nu-employee_id" name="employee_id" defaultValue="">
            <option value="">Não vincular</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>
        <SubmitButton pendingLabel="Criando…">Criar usuário</SubmitButton>
      </div>
    </form>
  );
}
