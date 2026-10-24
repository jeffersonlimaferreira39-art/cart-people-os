import { z } from "zod";
import { cpf, isoDate, money, optionalIsoDate, optionalText, optionalUuid, pis, uuid } from "./common";

export const employeeSchema = z
  .object({
    full_name: z.string({ error: "Informe o nome completo." }).min(3, "Informe o nome completo.").max(160),
    social_name: optionalText(160),
    registration_number: z
      .string({ error: "Informe a matrícula." })
      .regex(/^[A-Za-z0-9._-]{1,20}$/, "Use até 20 letras, números, ponto, hífen ou sublinhado."),
    unit_id: uuid,
    department_id: optionalUuid,
    position_id: optionalUuid,
    manager_id: optionalUuid,
    employment_type: z.enum(["clt", "pj", "estagio", "temporario", "aprendiz", "intermitente"]),
    work_schedule: optionalText(120),
    work_email: z.email("E-mail inválido.").optional(),
    phone: optionalText(30),
    hire_date: isoDate,
    status: z.enum(["onboarding", "active", "on_leave", "terminated"]),
    termination_date: optionalIsoDate,
  })
  .refine((v) => v.status !== "terminated" || !!v.termination_date, {
    path: ["termination_date"],
    message: "Informe a data de desligamento.",
  })
  .refine((v) => !v.termination_date || v.termination_date >= v.hire_date, {
    path: ["termination_date"],
    message: "Deve ser igual ou posterior à admissão.",
  });

export type EmployeeInput = z.infer<typeof employeeSchema>;

export const sensitiveSchema = z.object({
  cpf,
  rg: optionalText(30),
  birth_date: optionalIsoDate,
  pis,
  base_salary: money,
  bank_name: optionalText(80),
  bank_agency: optionalText(20),
  bank_account: optionalText(30),
  pix_key: optionalText(120),
  address_cep: optionalText(12),
  address_street: optionalText(160),
  address_number: optionalText(20),
  address_complement: optionalText(80),
  address_district: optionalText(80),
  address_city: optionalText(80),
  address_state: z.string().regex(/^[A-Za-z]{2}$/, "UF com 2 letras.").optional(),
  emergency_name: optionalText(120),
  emergency_phone: optionalText(30),
  emergency_relationship: optionalText(40),
});

export type SensitiveInput = z.infer<typeof sensitiveSchema>;

export function sensitiveToRow(input: SensitiveInput) {
  const pick = (o: Record<string, string | undefined>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, string>;
  return {
    cpf: input.cpf ?? null,
    rg: input.rg ?? null,
    birth_date: input.birth_date ?? null,
    pis: input.pis ?? null,
    base_salary: input.base_salary ?? null,
    bank_name: input.bank_name ?? null,
    bank_agency: input.bank_agency ?? null,
    bank_account: input.bank_account ?? null,
    pix_key: input.pix_key ?? null,
    address: pick({
      cep: input.address_cep,
      logradouro: input.address_street,
      numero: input.address_number,
      complemento: input.address_complement,
      bairro: input.address_district,
      cidade: input.address_city,
      uf: input.address_state?.toUpperCase(),
    }),
    emergency_contact: pick({
      nome: input.emergency_name,
      telefone: input.emergency_phone,
      parentesco: input.emergency_relationship,
    }),
  };
}
