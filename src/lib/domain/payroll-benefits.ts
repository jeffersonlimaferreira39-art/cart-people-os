/**
 * Consolidação de benefícios e descontos a partir do demonstrativo mensal.
 * Usa as mesmas linhas do cálculo da prévia, então os números batem com o holerite estimado.
 */
import { ITEM_CODES, round2, type PayrollResult } from "./payroll";

export type BenefitsBreakdown = {
  vtGranted: number;
  vtDiscount: number;
  vtCompany: number;
  foodGranted: number;
  foodDiscount: number;
  foodCompany: number;
  healthEmployee: number;
  healthCompany: number;
  dental: number;
  lifeInsurance: number;
  unionFee: number;
  alimony: number;
  /** Rubricas fixas de desconto (consignado, previdência privada, farmácia...). */
  fixedDiscounts: number;
  advance: number;
  otherDiscounts: number;
  /** Custo da empresa com VT, alimentação e saúde. */
  companyTotal: number;
  /** Descontos do colaborador fora INSS, IRRF e faltas. */
  employeeTotal: number;
};

const FIXED_DISCOUNT_CODES = new Set(Object.entries(ITEM_CODES).filter(([, d]) => d.kind === "desconto").map(([c]) => c));

export function benefitsBreakdown(result: PayrollResult): BenefitsBreakdown {
  const sum = (pred: (code: string) => boolean) => round2(result.lines.filter((l) => pred(l.code)).reduce((a, l) => a + l.amount, 0));
  const one = (code: string) => sum((c) => c === code);
  const vtGranted = one("VT_INFO");
  const vtDiscount = one("VT");
  const foodGranted = one("VA_INFO");
  const foodDiscount = one("VA");
  const healthCompany = one("PLANO_SAUDE_EMPRESA");
  const b = {
    vtGranted,
    vtDiscount,
    vtCompany: round2(vtGranted - vtDiscount),
    foodGranted,
    foodDiscount,
    foodCompany: round2(foodGranted - foodDiscount),
    healthEmployee: one("PLANO_SAUDE"),
    healthCompany,
    dental: one("PLANO_ODONTO"),
    lifeInsurance: one("SEGURO_VIDA"),
    unionFee: one("CONTRIB_SINDICAL"),
    alimony: one("PENSAO"),
    fixedDiscounts: sum((c) => FIXED_DISCOUNT_CODES.has(c)),
    advance: one("ADIANTAMENTO"),
    otherDiscounts: one("DESCONTO_DIVERSO"),
  };
  return {
    ...b,
    companyTotal: round2(b.vtCompany + b.foodCompany + b.healthCompany),
    employeeTotal: round2(
      b.vtDiscount + b.foodDiscount + b.healthEmployee + b.dental + b.lifeInsurance + b.unionFee + b.alimony + b.fixedDiscounts + b.advance + b.otherDiscounts,
    ),
  };
}

/** Colunas da aba e da planilha, na ordem de exibição. */
export const BENEFIT_COLUMNS: { key: keyof BenefitsBreakdown; label: string; group: "beneficio" | "desconto" | "total" }[] = [
  { key: "vtGranted", label: "VT concedido", group: "beneficio" },
  { key: "vtDiscount", label: "VT desconto (6%)", group: "desconto" },
  { key: "vtCompany", label: "VT custo empresa", group: "beneficio" },
  { key: "foodGranted", label: "VA/VR concedido", group: "beneficio" },
  { key: "foodDiscount", label: "VA/VR coparticipação", group: "desconto" },
  { key: "foodCompany", label: "VA/VR custo empresa", group: "beneficio" },
  { key: "healthEmployee", label: "Plano de saúde (colaborador)", group: "desconto" },
  { key: "healthCompany", label: "Plano de saúde (empresa)", group: "beneficio" },
  { key: "dental", label: "Plano odontológico", group: "desconto" },
  { key: "lifeInsurance", label: "Seguro de vida", group: "desconto" },
  { key: "unionFee", label: "Contribuição sindical", group: "desconto" },
  { key: "alimony", label: "Pensão alimentícia", group: "desconto" },
  { key: "fixedDiscounts", label: "Descontos fixos (consignado etc.)", group: "desconto" },
  { key: "advance", label: "Adiantamento", group: "desconto" },
  { key: "otherDiscounts", label: "Outros descontos", group: "desconto" },
  { key: "companyTotal", label: "Total custo empresa", group: "total" },
  { key: "employeeTotal", label: "Total descontado", group: "total" },
];
