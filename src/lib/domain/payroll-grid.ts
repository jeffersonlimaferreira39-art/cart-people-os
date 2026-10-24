/**
 * Digitação de folha em grade: colunas lançáveis e comparação entre o que está
 * salvo e o que foi digitado. Cada célula vale o total do código no mês para o
 * colaborador (os lançamentos manuais daquele código são substituídos).
 */
import { ENTRY_CODES, type EntryCode } from "./payroll";

export const GRID_CODES = [
  "HE50", "HE100", "ADN", "FALTA_DIAS", "FALTA_HORAS", "VT_DIAS",
  "COMISSAO", "GRATIFICACAO", "PROVENTO_DIVERSO", "REEMBOLSO", "ADIANTAMENTO", "DESCONTO_DIVERSO",
] as const satisfies readonly EntryCode[];
export type GridCode = (typeof GRID_CODES)[number];
export const isGridCode = (v: string): v is GridCode => (GRID_CODES as readonly string[]).includes(v);

export const GRID_SHORT_LABELS: Record<GridCode, string> = {
  HE50: "HE 50% (h)",
  HE100: "HE 100% (h)",
  ADN: "Ad. noturno (h)",
  FALTA_DIAS: "Faltas (d)",
  FALTA_HORAS: "Atrasos (h)",
  VT_DIAS: "Dias de VT",
  COMISSAO: "Comissões (R$)",
  GRATIFICACAO: "Gratificação (R$)",
  PROVENTO_DIVERSO: "Outros prov. (R$)",
  REEMBOLSO: "Reembolso (R$)",
  ADIANTAMENTO: "Adiantamento (R$)",
  DESCONTO_DIVERSO: "Outros desc. (R$)",
};

export type GridValues = Record<string, Partial<Record<GridCode, number>>>; // employee_id → código → valor
export type GridChange = { employee_id: string; code: GridCode; value: number | null };

/** "1.234,56" | "1234.5" | "" → número ou null (vazio). Lança erro se inválido. */
export function parseGridNumber(raw: string): number | null {
  const s = raw.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) throw new Error(`Valor inválido: ${raw}`);
  return Math.round(n * 100) / 100;
}

/** Células alteradas: valor novo, ou null quando a célula foi esvaziada (zera o código). */
export function diffGrid(saved: GridValues, edited: GridValues): GridChange[] {
  const out: GridChange[] = [];
  const ids = new Set([...Object.keys(saved), ...Object.keys(edited)]);
  for (const id of ids) {
    for (const code of GRID_CODES) {
      const before = saved[id]?.[code] ?? null;
      const after = edited[id]?.[code] ?? null;
      const norm = (v: number | null) => (v === null || v === 0 ? null : v);
      if (norm(before) !== norm(after)) out.push({ employee_id: id, code, value: norm(after) });
    }
  }
  return out;
}

export const gridUnit = (code: GridCode) => ENTRY_CODES[code].unit;
