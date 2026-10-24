import type { Capability } from "@/lib/domain/roles";

/** Relatórios exportáveis. Nenhum inclui CPF, salário, dados bancários ou de saúde. */
export const REPORTS = {
  quadro: {
    title: "Quadro de colaboradores",
    description: "Pessoas ativas e afastadas com unidade, departamento, cargo, vínculo e admissão.",
    capability: "viewPeople",
    usesPeriod: false,
  },
  movimento: {
    title: "Admissões e desligamentos",
    description: "Entradas e saídas do período, com data, unidade, departamento e cargo.",
    capability: "viewPeople",
    usesPeriod: true,
  },
  indicadores: {
    title: "Indicadores mensais",
    description: "Quadro no fim do mês, admissões, desligamentos e rotatividade mês a mês.",
    capability: "viewPeople",
    usesPeriod: true,
  },
  ausencias: {
    title: "Férias e ausências",
    description: "Solicitações que tocam o período, com tipo, datas, dias, abono e situação.",
    capability: "viewPeople",
    usesPeriod: true,
  },
  movimentacoes_dp: {
    title: "Movimentações do DP",
    description: "Movimentações com data de efeito no período, tipo e situação (sem valores).",
    capability: "viewDp",
    usesPeriod: true,
  },
  ponto: {
    title: "Resumo do ponto",
    description: "Horas trabalhadas, extras, ausências e noturnas por pessoa no período.",
    capability: "viewTime",
    usesPeriod: true,
  },
} as const satisfies Record<string, { title: string; description: string; capability: Capability; usesPeriod: boolean }>;

export type ReportId = keyof typeof REPORTS;
export const REPORT_FORMATS = ["xlsx", "csv", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export function isReportId(value: string): value is ReportId {
  return Object.hasOwn(REPORTS, value);
}

export type ColumnKind = "text" | "date" | "number";
export type ReportTable = {
  title: string;
  /** Descrição do recorte: unidade e período. */
  scope: string;
  columns: { header: string; kind: ColumnKind; width?: number }[];
  rows: (string | number | null)[][];
};
