/**
 * Integração com a solução de ponto existente.
 *
 * O People OS não substitui o registro oficial de ponto (REP/REP-P da Portaria
 * MTP 671/2021); ele importa o espelho consolidado para indicadores, conferência
 * e envio à folha. Cada fornecedor vira um adaptador que produz TimeRow[].
 * O adaptador "generic-csv" cobre exportações em planilha enquanto o fornecedor
 * oficial não é definido.
 */
import { parseCsv } from "@/lib/domain/csv";
import { isIsoDate } from "@/lib/domain/dates";

export type TimeRow = {
  registrationNumber: string;
  workDate: string;
  workedMinutes: number;
  overtimeMinutes: number;
  absenceMinutes: number;
  nightMinutes: number;
};

export type TimeImportResult = {
  rows: TimeRow[];
  errors: { line: number; message: string }[];
};

export interface TimeClockAdapter {
  id: string;
  label: string;
  description: string;
  parse(content: string): TimeImportResult;
}

/** Aceita "08:30", "8:30", "8,5", "8.5" (horas) e devolve minutos. */
export function parseHours(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return 0;
  const hm = v.match(/^(\d{1,3}):([0-5]\d)$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const dec = v.replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(dec)) return Math.round(Number(dec) * 60);
  return null;
}

/** Aceita "31/12/2026" ou "2026-12-31". */
export function parseBrDate(raw: string): string | null {
  const v = raw.trim();
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : v;
  return isIsoDate(iso) ? iso : null;
}

const normalize = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");

const COLUMNS = {
  registration: ["matricula", "registro", "cracha"],
  date: ["data", "dia"],
  worked: ["horas_trabalhadas", "trabalhadas", "horas"],
  overtime: ["horas_extras", "extras", "he"],
  absence: ["faltas", "horas_falta", "atrasos_faltas"],
  night: ["adicional_noturno", "noturno", "horas_noturnas"],
} as const;

export const genericCsvAdapter: TimeClockAdapter = {
  id: "generic-csv",
  label: "Planilha CSV (layout padrão)",
  description:
    "Colunas: matricula; data; horas_trabalhadas; horas_extras; faltas; adicional_noturno. Horas em 08:30 ou 8,5.",
  parse(content) {
    const table = parseCsv(content);
    const errors: TimeImportResult["errors"] = [];
    if (table.length < 2) return { rows: [], errors: [{ line: 1, message: "Arquivo sem linhas de dados." }] };

    const header = table[0].map(normalize);
    const find = (names: readonly string[]) => header.findIndex((h) => names.includes(h));
    const idx = {
      registration: find(COLUMNS.registration),
      date: find(COLUMNS.date),
      worked: find(COLUMNS.worked),
      overtime: find(COLUMNS.overtime),
      absence: find(COLUMNS.absence),
      night: find(COLUMNS.night),
    };
    if (idx.registration < 0 || idx.date < 0 || idx.worked < 0) {
      return {
        rows: [],
        errors: [{ line: 1, message: "Cabeçalho precisa ter ao menos: matricula, data, horas_trabalhadas." }],
      };
    }

    const rows: TimeRow[] = [];
    const seen = new Set<string>();
    table.slice(1).forEach((cells, i) => {
      const line = i + 2;
      const get = (n: number) => (n >= 0 ? (cells[n] ?? "") : "");
      const registrationNumber = get(idx.registration).trim();
      const workDate = parseBrDate(get(idx.date));
      const minutes = [idx.worked, idx.overtime, idx.absence, idx.night].map((n) => parseHours(get(n)));

      if (!registrationNumber) return errors.push({ line, message: "Matrícula vazia." });
      if (!workDate) return errors.push({ line, message: `Data inválida: "${get(idx.date)}".` });
      if (minutes.some((m) => m === null)) return errors.push({ line, message: "Horas em formato inválido." });
      const [worked, overtime, absence, night] = minutes as number[];
      if (worked > 24 * 60) return errors.push({ line, message: "Mais de 24 horas trabalhadas no dia." });
      const key = `${registrationNumber}|${workDate}`;
      if (seen.has(key)) return errors.push({ line, message: "Linha duplicada para a mesma matrícula e data." });
      seen.add(key);
      rows.push({
        registrationNumber,
        workDate,
        workedMinutes: worked,
        overtimeMinutes: overtime,
        absenceMinutes: absence,
        nightMinutes: night,
      });
    });
    return { rows, errors };
  },
};

export const timeClockAdapters: TimeClockAdapter[] = [genericCsvAdapter];

export function getTimeClockAdapter(id: string): TimeClockAdapter | undefined {
  return timeClockAdapters.find((a) => a.id === id);
}
