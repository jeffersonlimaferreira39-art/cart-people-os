"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import type { ActionState } from "@/lib/actions";
import type { Lookups } from "@/lib/data/employees";
import type { Employee, EmployeeSensitive } from "@/lib/types";
import { EMPLOYEE_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/lib/format";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { formatCpf } from "@/lib/domain/documents-br";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  lookups: Lookups;
  employee?: Employee;
  sensitive?: EmployeeSensitive | null;
  showSensitive: boolean;
  canCreateAdmission?: boolean;
  defaultUnitId?: string | null;
  cancelHref: string;
};

function Fieldset({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-x-8 gap-y-5 border-t border-line py-7 first-of-type:border-t-0 first-of-type:pt-0 lg:grid-cols-[220px_minmax(0,1fr)]">
      <legend className="contents">
        <span className="block">
          <span className="block font-semibold text-ink">{title}</span>
          {description ? <span className="mt-1 block text-[13.5px] text-ink-3">{description}</span> : null}
        </span>
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function EmployeeForm({
  action, lookups, employee, sensitive, showSensitive, canCreateAdmission, defaultUnitId, cancelHref,
}: Props) {
  const [state, formAction] = useActionState(action, null);
  const [unitId, setUnitId] = useState(employee?.unit_id ?? defaultUnitId ?? lookups.units[0]?.id ?? "");
  const [status, setStatus] = useState<string>(employee?.status ?? "onboarding");
  const err = (k: string) => state?.fieldErrors?.[k];
  const departments = useMemo(
    () => lookups.departments.filter((d) => !d.unit_id || d.unit_id === unitId),
    [lookups.departments, unitId],
  );
  const managers = lookups.managers.filter((m) => m.id !== employee?.id);
  const addr = sensitive?.address ?? {};
  const emergency = sensitive?.emergency_contact ?? {};

  return (
    <form action={formAction} className="flex flex-col">
      <div className="mb-6 empty:hidden">
        <FormMessage state={state} />
      </div>

      <Fieldset title="Vínculo" description="Onde a pessoa trabalha e como foi contratada.">
        <Field label="Nome completo" name="full_name" error={err("full_name")} className="sm:col-span-2">
          <Input name="full_name" defaultValue={employee?.full_name} required invalid={!!err("full_name")} />
        </Field>
        <Field label="Nome social" name="social_name" hint="Usado na exibição quando informado.">
          <Input name="social_name" defaultValue={employee?.social_name ?? ""} />
        </Field>
        <Field label="Matrícula" name="registration_number" error={err("registration_number")}>
          <Input name="registration_number" defaultValue={employee?.registration_number} required invalid={!!err("registration_number")} />
        </Field>
        <Field label="Unidade" name="unit_id" error={err("unit_id")}>
          <Select name="unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
            {lookups.units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Departamento" name="department_id">
          <Select name="department_id" defaultValue={employee?.department_id ?? ""} key={unitId}>
            <option value="">Sem departamento</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cargo" name="position_id">
          <Select name="position_id" defaultValue={employee?.position_id ?? ""}>
            <option value="">Sem cargo definido</option>
            {lookups.positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Gestor direto" name="manager_id" error={err("manager_id")}>
          <Select name="manager_id" defaultValue={employee?.manager_id ?? ""}>
            <option value="">Sem gestor</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de contrato" name="employment_type">
          <Select name="employment_type" defaultValue={employee?.employment_type ?? "clt"}>
            {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Jornada" name="work_schedule" hint="Ex.: 44h semanais, seg a sex 8h–18h">
          <Input name="work_schedule" defaultValue={employee?.work_schedule ?? ""} />
        </Field>
        <Field label="Admissão" name="hire_date" error={err("hire_date")}>
          <Input type="date" name="hire_date" defaultValue={employee?.hire_date} required invalid={!!err("hire_date")} />
        </Field>
        <Field label="Situação" name="status">
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(EMPLOYEE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        {status === "terminated" ? (
          <Field label="Data de desligamento" name="termination_date" error={err("termination_date")}>
            <Input type="date" name="termination_date" defaultValue={employee?.termination_date ?? ""} invalid={!!err("termination_date")} />
          </Field>
        ) : null}
      </Fieldset>

      <Fieldset title="Contato de trabalho">
        <Field label="E-mail corporativo" name="work_email" error={err("work_email")}>
          <Input type="email" name="work_email" defaultValue={employee?.work_email ?? ""} invalid={!!err("work_email")} />
        </Field>
        <Field label="Telefone" name="phone">
          <Input name="phone" type="tel" defaultValue={employee?.phone ?? ""} />
        </Field>
      </Fieldset>

      {showSensitive ? (
        <>
          <Fieldset
            title="Dados pessoais"
            description="Visíveis apenas para RH, DP, administração e o próprio colaborador."
          >
            <Field label="CPF" name="cpf" error={err("cpf")}>
              <Input name="cpf" inputMode="numeric" defaultValue={sensitive?.cpf ? formatCpf(sensitive.cpf) : ""} invalid={!!err("cpf")} />
            </Field>
            <Field label="RG" name="rg">
              <Input name="rg" defaultValue={sensitive?.rg ?? ""} />
            </Field>
            <Field label="Nascimento" name="birth_date" error={err("birth_date")}>
              <Input type="date" name="birth_date" defaultValue={sensitive?.birth_date ?? ""} />
            </Field>
            <Field label="PIS/PASEP" name="pis" error={err("pis")}>
              <Input name="pis" inputMode="numeric" defaultValue={sensitive?.pis ?? ""} invalid={!!err("pis")} />
            </Field>
            <Field label="Salário base (R$)" name="base_salary" error={err("base_salary")}>
              <Input
                name="base_salary"
                inputMode="decimal"
                defaultValue={sensitive?.base_salary != null ? String(sensitive.base_salary).replace(".", ",") : ""}
                invalid={!!err("base_salary")}
              />
            </Field>
          </Fieldset>
          <Fieldset title="Dados bancários">
            <Field label="Banco" name="bank_name"><Input name="bank_name" defaultValue={sensitive?.bank_name ?? ""} /></Field>
            <Field label="Agência" name="bank_agency"><Input name="bank_agency" defaultValue={sensitive?.bank_agency ?? ""} /></Field>
            <Field label="Conta" name="bank_account"><Input name="bank_account" defaultValue={sensitive?.bank_account ?? ""} /></Field>
            <Field label="Chave Pix" name="pix_key"><Input name="pix_key" defaultValue={sensitive?.pix_key ?? ""} /></Field>
          </Fieldset>
          <Fieldset title="Endereço e emergência">
            <Field label="CEP" name="address_cep"><Input name="address_cep" defaultValue={addr.cep ?? ""} /></Field>
            <Field label="Logradouro" name="address_street"><Input name="address_street" defaultValue={addr.logradouro ?? ""} /></Field>
            <Field label="Número" name="address_number"><Input name="address_number" defaultValue={addr.numero ?? ""} /></Field>
            <Field label="Complemento" name="address_complement"><Input name="address_complement" defaultValue={addr.complemento ?? ""} /></Field>
            <Field label="Bairro" name="address_district"><Input name="address_district" defaultValue={addr.bairro ?? ""} /></Field>
            <Field label="Cidade" name="address_city"><Input name="address_city" defaultValue={addr.cidade ?? ""} /></Field>
            <Field label="UF" name="address_state" error={err("address_state")}>
              <Input name="address_state" maxLength={2} defaultValue={addr.uf ?? ""} invalid={!!err("address_state")} />
            </Field>
            <Field label="Contato de emergência" name="emergency_name"><Input name="emergency_name" defaultValue={emergency.nome ?? ""} /></Field>
            <Field label="Telefone de emergência" name="emergency_phone"><Input name="emergency_phone" type="tel" defaultValue={emergency.telefone ?? ""} /></Field>
            <Field label="Parentesco" name="emergency_relationship"><Input name="emergency_relationship" defaultValue={emergency.parentesco ?? ""} /></Field>
          </Fieldset>
        </>
      ) : null}

      {canCreateAdmission ? (
        <label className="mt-2 flex items-start gap-3 border-t border-line pt-6 text-sm">
          <input type="checkbox" name="create_admission" defaultChecked className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            <span className="font-medium text-ink">Abrir movimentação de admissão para o DP</span>
            <span className="block text-ink-3">Cria um rascunho em Movimentações para conferência e envio à folha.</span>
          </span>
        </label>
      ) : null}

      <div className="sticky bottom-0 mt-6 flex gap-2 border-t border-line bg-bg/95 py-4 backdrop-blur">
        <SubmitButton>{employee ? "Salvar alterações" : "Cadastrar colaborador"}</SubmitButton>
        <Link href={cancelHref} className={buttonClasses("ghost")}>Cancelar</Link>
      </div>
    </form>
  );
}
