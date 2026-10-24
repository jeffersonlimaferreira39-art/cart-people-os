/**
 * Integração com o processamento oficial da folha (sistema de folha ou escritório
 * contábil). O People OS NÃO calcula a folha nem transmite ao eSocial: ele
 * consolida movimentações aprovadas e o resumo de ponto num arquivo que o
 * processador oficial importa. Cada destino vira um adaptador.
 */
import { toCsv } from "@/lib/domain/csv";

export type PayrollEvent = {
  unitCode: string;
  registrationNumber: string;
  fullName: string;
  cpf: string | null;
  type: string;
  effectiveDate: string;
  payload: Record<string, unknown>;
  notes: string | null;
};

export type TimeSummary = {
  unitCode: string;
  registrationNumber: string;
  fullName: string;
  workedMinutes: number;
  overtimeMinutes: number;
  absenceMinutes: number;
  nightMinutes: number;
};

export type PayrollFile = { fileName: string; content: string; mimeType: string };

export interface PayrollAdapter {
  id: string;
  label: string;
  buildEvents(period: string, events: PayrollEvent[]): PayrollFile;
  buildTimeSummary(period: string, rows: TimeSummary[]): PayrollFile;
}

export const DP_EVENT_LABELS: Record<string, string> = {
  admissao: "Admissão",
  alteracao_salarial: "Alteração salarial",
  alteracao_cargo: "Alteração de cargo",
  transferencia: "Transferência",
  afastamento: "Afastamento",
  retorno_afastamento: "Retorno de afastamento",
  desligamento: "Desligamento",
  ferias: "Férias",
  outro: "Outro",
};

/** "novo_salario=4600 | motivo=Promoção" */
export function flattenPayload(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" | ");
}

export const hoursFromMinutes = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export const genericCsvPayrollAdapter: PayrollAdapter = {
  id: "generic-csv",
  label: "CSV para escritório contábil",
  buildEvents(period, events) {
    const rows = events.map((e) => [
      e.unitCode,
      e.registrationNumber,
      e.fullName,
      e.cpf ?? "",
      DP_EVENT_LABELS[e.type] ?? e.type,
      e.effectiveDate.split("-").reverse().join("/"),
      flattenPayload(e.payload),
      e.notes ?? "",
    ]);
    return {
      fileName: `movimentacoes-${period}.csv`,
      mimeType: "text/csv;charset=utf-8",
      content: toCsv(
        ["unidade", "matricula", "nome", "cpf", "movimentacao", "data_efeito", "detalhes", "observacoes"],
        rows,
      ),
    };
  },
  buildTimeSummary(period, summary) {
    const rows = summary.map((s) => [
      s.unitCode,
      s.registrationNumber,
      s.fullName,
      hoursFromMinutes(s.workedMinutes),
      hoursFromMinutes(s.overtimeMinutes),
      hoursFromMinutes(s.absenceMinutes),
      hoursFromMinutes(s.nightMinutes),
    ]);
    return {
      fileName: `resumo-ponto-${period}.csv`,
      mimeType: "text/csv;charset=utf-8",
      content: toCsv(
        ["unidade", "matricula", "nome", "horas_trabalhadas", "horas_extras", "faltas", "adicional_noturno"],
        rows,
      ),
    };
  },
};

export const payrollAdapters: PayrollAdapter[] = [genericCsvPayrollAdapter];
export const getPayrollAdapter = (id: string) => payrollAdapters.find((a) => a.id === id);
