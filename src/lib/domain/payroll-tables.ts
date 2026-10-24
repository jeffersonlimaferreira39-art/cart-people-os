/**
 * Tabelas de cálculo da prévia de folha. Os valores abaixo são REFERÊNCIA para
 * 2026 e precisam ser conferidos com a contabilidade antes do uso; a empresa
 * pode cadastrar novas vigências em DP → Prévia da folha → Tabelas, que têm
 * prioridade sobre estas.
 */
import { z } from "zod";

const money = z.number().min(0).max(1_000_000);

export const inssTableSchema = z.object({
  /** Faixas progressivas: cada uma tributa a parte do salário até `upTo`. */
  brackets: z.array(z.object({ upTo: money, rate: z.number().min(0).max(100) })).min(1).max(8),
});
export const irrfTableSchema = z.object({
  brackets: z
    .array(z.object({ upTo: money.nullable(), rate: z.number().min(0).max(100), deduction: money }))
    .min(1)
    .max(8),
  dependentDeduction: money,
  /** Desconto simplificado mensal (substitui as deduções legais quando mais vantajoso). */
  simplifiedDiscount: money,
  /** Redução do imposto (Lei 15.270/2025): zera até `exemptUpTo` e reduz linearmente até `phaseOutUpTo`. */
  reduction: z
    .object({
      exemptUpTo: money,
      maxReduction: money,
      phaseOutUpTo: money,
      phaseOutConstant: money,
      phaseOutFactor: z.number().min(0).max(1),
    })
    .nullable(),
});
export const familyAllowanceSchema = z.object({
  /** Remuneração máxima para ter direito e valor da cota por filho (até 14 anos). */
  incomeLimit: money,
  quota: money,
});
export const parametersSchema = z.object({
  minimumWage: money,
  fgtsRate: z.number().min(0).max(100),
  fgtsApprenticeRate: z.number().min(0).max(100),
  vtMaxDiscountRate: z.number().min(0).max(100),
  overtimeRate: z.number().min(0).max(300),
  overtimeHolidayRate: z.number().min(0).max(300),
  nightShiftRate: z.number().min(0).max(100),
  hazardRate: z.number().min(0).max(100),
  unhealthinessRates: z.object({ minimo: z.number(), medio: z.number(), maximo: z.number() }),
});

export type InssTable = z.infer<typeof inssTableSchema>;
export type IrrfTable = z.infer<typeof irrfTableSchema>;
export type FamilyAllowanceTable = z.infer<typeof familyAllowanceSchema>;
export type PayrollParameters = z.infer<typeof parametersSchema>;
export type PayrollTables = {
  inss: InssTable;
  irrf: IrrfTable;
  salario_familia: FamilyAllowanceTable;
  parametros: PayrollParameters;
  /** Vigência de cada tabela usada (ou "referência" quando veio do código). */
  sources: Record<TableKind, string>;
};
export type TableKind = "inss" | "irrf" | "salario_familia" | "parametros";

export const TABLE_SCHEMAS = {
  inss: inssTableSchema,
  irrf: irrfTableSchema,
  salario_familia: familyAllowanceSchema,
  parametros: parametersSchema,
} as const;

export const TABLE_LABELS: Record<TableKind, string> = {
  inss: "INSS (contribuição do empregado)",
  irrf: "IRRF (imposto de renda retido)",
  salario_familia: "Salário-família",
  parametros: "Parâmetros gerais",
};

/** Referência 2026 — CONFERIR com a contabilidade e com as portarias vigentes. */
export const REFERENCE_TABLES: Omit<PayrollTables, "sources"> = {
  inss: {
    brackets: [
      { upTo: 1621.0, rate: 7.5 },
      { upTo: 2902.84, rate: 9 },
      { upTo: 4354.27, rate: 12 },
      { upTo: 8475.55, rate: 14 },
    ],
  },
  irrf: {
    brackets: [
      { upTo: 2428.8, rate: 0, deduction: 0 },
      { upTo: 2826.65, rate: 7.5, deduction: 182.16 },
      { upTo: 3751.05, rate: 15, deduction: 394.16 },
      { upTo: 4664.68, rate: 22.5, deduction: 675.49 },
      { upTo: null, rate: 27.5, deduction: 908.73 },
    ],
    dependentDeduction: 189.59,
    simplifiedDiscount: 607.2,
    reduction: { exemptUpTo: 5000, maxReduction: 312.89, phaseOutUpTo: 7350, phaseOutConstant: 978.62, phaseOutFactor: 0.133145 },
  },
  salario_familia: { incomeLimit: 1980.38, quota: 67.54 },
  parametros: {
    minimumWage: 1621,
    fgtsRate: 8,
    fgtsApprenticeRate: 2,
    vtMaxDiscountRate: 6,
    overtimeRate: 50,
    overtimeHolidayRate: 100,
    nightShiftRate: 20,
    hazardRate: 30,
    unhealthinessRates: { minimo: 10, medio: 20, maximo: 40 },
  },
};
