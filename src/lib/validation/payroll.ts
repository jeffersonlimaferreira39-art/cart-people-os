import { z } from "zod";
import { cpf, isoDate, money, optionalText } from "./common";
import { ENTRY_CODES, ITEM_CODES } from "@/lib/domain/payroll";

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida (use AAAA-MM).");
const reqMoney = (max = 1_000_000) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return 0;
      const s = v.replace(/[R$\s]/g, "");
      return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    })
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= max, "Valor inválido.");
const decimal = (min: number, max: number, msg: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : 0))
    .refine((n) => Number.isFinite(n) && n >= min && n <= max, msg);
const checkbox = z.string().optional().transform((v) => v === "on");

export const profileSchema = z
  .object({
    base_salary: money,
    salary_type: z.enum(["mensalista", "horista"]),
    monthly_hours: decimal(1, 300, "Informe as horas mensais (ex.: 220)."),
    vt_enabled: checkbox,
    vt_daily_amount: reqMoney(1000),
    vt_days: decimal(0, 31, "Dias entre 0 e 31.").refine(Number.isInteger, "Use um número inteiro de dias."),
    va_monthly: reqMoney(20000),
    vr_monthly: reqMoney(20000),
    food_discount_pct: decimal(0, 20, "A coparticipação no PAT vai de 0 a 20%."),
    health_plan_employee: reqMoney(50000),
    health_plan_company: reqMoney(50000),
    dental_plan_employee: reqMoney(50000),
    life_insurance_employee: reqMoney(50000),
    unhealthiness_grade: z.enum(["nenhum", "minimo", "medio", "maximo"]),
    hazard_pay: checkbox,
    union_fee: reqMoney(50000),
    alimony_type: z.enum(["nenhuma", "percentual", "valor"]),
    alimony_value: decimal(0, 1_000_000, "Valor inválido."),
    notes: optionalText(1000),
  })
  .refine((v) => v.alimony_type !== "percentual" || v.alimony_value <= 100, {
    path: ["alimony_value"],
    message: "Percentual de pensão até 100%.",
  })
  .refine((v) => !(v.unhealthiness_grade !== "nenhum" && v.hazard_pay), {
    path: ["hazard_pay"],
    message: "Insalubridade e periculosidade não se acumulam (CLT art. 193 §2º): escolha o mais vantajoso.",
  });

const itemCodes = Object.keys(ITEM_CODES) as [keyof typeof ITEM_CODES, ...(keyof typeof ITEM_CODES)[]];
export const itemSchema = z
  .object({
    code: z.enum(itemCodes, "Escolha a rubrica."),
    description: optionalText(120),
    value_type: z.enum(["valor", "percentual"]),
    value: z
      .string({ error: "Informe o valor." })
      .transform((v) => Number(v.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")))
      .refine((n) => Number.isFinite(n) && n > 0, "Informe um valor maior que zero."),
    incidence_inss: checkbox,
    incidence_irrf: checkbox,
    incidence_fgts: checkbox,
    start_period: period,
    end_period: period.optional(),
  })
  .refine((v) => v.value_type !== "percentual" || v.value <= 100, { path: ["value"], message: "Percentual até 100%." })
  .refine((v) => !v.end_period || v.end_period >= v.start_period, { path: ["end_period"], message: "O fim vem depois do início." });

const entryCodes = Object.keys(ENTRY_CODES) as [keyof typeof ENTRY_CODES, ...(keyof typeof ENTRY_CODES)[]];
export const entrySchema = z.object({
  period,
  code: z.enum(entryCodes, "Escolha o lançamento."),
  value: z
    .string({ error: "Informe a quantidade ou o valor." })
    .transform((v) => Number(v.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")))
    .refine((n) => Number.isFinite(n) && n > 0 && n < 1_000_000, "Informe um número maior que zero."),
  notes: optionalText(300),
});

export const dependentSchema = z.object({
  full_name: z.string({ error: "Informe o nome." }).min(3, "Informe o nome completo.").max(120),
  relationship: z.enum(["conjuge", "filho", "enteado", "pai_mae", "outro"]),
  birth_date: isoDate,
  cpf,
  ir_dependent: checkbox,
});

export { period as periodSchema };
