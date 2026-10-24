/**
 * Indicadores de pessoas calculados sobre linhas já filtradas pela RLS.
 * Funções puras: recebem datas ISO e devolvem séries prontas para gráfico e relatório.
 * As definições (rotatividade, tempo de casa) são gerenciais — validar com o RH.
 */
import { addMonths, daysInclusive, monthBounds } from "./dates";

export type EmployeeFacts = {
  hire_date: string;
  termination_date: string | null;
  status: string;
};

export type LeaveFacts = { type: string; start_date: string; end_date: string };
export type TimeFacts = { work_date: string; overtime_minutes: number; absence_minutes: number };

export type MonthPoint = {
  period: string; // YYYY-MM
  headcount: number; // quadro no fim do mês (ou hoje, no mês corrente)
  hires: number;
  terminations: number;
  /** Rotatividade do mês em %: média de entradas e saídas sobre o quadro. */
  turnover: number | null;
};

export const PERIOD_OPTIONS = [6, 12, 24] as const;
export type PeriodMonths = (typeof PERIOD_OPTIONS)[number];

export function parsePeriodMonths(value: string | undefined): PeriodMonths {
  const n = Number(value);
  return (PERIOD_OPTIONS as readonly number[]).includes(n) ? (n as PeriodMonths) : 12;
}

/** Meses (YYYY-MM) do período, do mais antigo ao mês de `today`. */
export function monthsBack(today: string, months: number): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7));
  return out;
}

/** Primeiro dia do período analisado. */
export function periodStart(today: string, months: number): string {
  return `${monthsBack(today, months)[0]}-01`;
}

function activeOn(e: EmployeeFacts, day: string): boolean {
  return e.hire_date <= day && (!e.termination_date || e.termination_date > day);
}

export function headcountSeries(rows: EmployeeFacts[], today: string, months: number): MonthPoint[] {
  return monthsBack(today, months).map((period) => {
    const { start, end } = monthBounds(period);
    const cutoff = end < today ? end : today;
    const headcount = rows.filter((r) => activeOn(r, cutoff)).length;
    const hires = rows.filter((r) => r.hire_date >= start && r.hire_date <= cutoff).length;
    const terminations = rows.filter((r) => r.termination_date && r.termination_date >= start && r.termination_date <= cutoff).length;
    const turnover = headcount ? round1((((hires + terminations) / 2) / headcount) * 100) : null;
    return { period, headcount, hires, terminations, turnover };
  });
}

export type Summary = {
  headcount: number;
  hires: number;
  terminations: number;
  /** Rotatividade acumulada no período, em %. */
  turnover: number | null;
  /** Tempo médio de casa do quadro ativo, em anos. */
  avgTenureYears: number | null;
  onLeave: number;
  onboarding: number;
};

export function summarize(rows: EmployeeFacts[], today: string, months: number): Summary {
  const from = periodStart(today, months);
  const active = rows.filter((r) => activeOn(r, today));
  const hires = rows.filter((r) => r.hire_date >= from && r.hire_date <= today).length;
  const terminations = rows.filter((r) => r.termination_date && r.termination_date >= from && r.termination_date <= today).length;
  const tenureDays = active.map((r) => daysInclusive(r.hire_date, today) - 1);
  return {
    headcount: active.length,
    hires,
    terminations,
    turnover: active.length ? round1((((hires + terminations) / 2) / active.length) * 100) : null,
    avgTenureYears: tenureDays.length ? round1(tenureDays.reduce((a, b) => a + b, 0) / tenureDays.length / 365.25) : null,
    onLeave: active.filter((r) => r.status === "on_leave").length,
    onboarding: active.filter((r) => r.status === "onboarding").length,
  };
}

export const TENURE_BUCKETS = [
  { label: "Até 1 ano", max: 1 },
  { label: "1 a 2 anos", max: 2 },
  { label: "2 a 5 anos", max: 5 },
  { label: "5 a 10 anos", max: 10 },
  { label: "Mais de 10 anos", max: Infinity },
] as const;

export function tenureDistribution(rows: EmployeeFacts[], today: string): { label: string; count: number }[] {
  const counts: number[] = TENURE_BUCKETS.map(() => 0);
  for (const r of rows) {
    if (!activeOn(r, today)) continue;
    const years = (daysInclusive(r.hire_date, today) - 1) / 365.25;
    counts[TENURE_BUCKETS.findIndex((b) => years < b.max)]++;
  }
  return TENURE_BUCKETS.map((b, i) => ({ label: b.label, count: counts[i] }));
}

/** Contagem por chave, do maior para o menor; chaves vazias viram `emptyLabel`. */
export function countBy<T>(rows: T[], key: (r: T) => string | null | undefined, emptyLabel = "Não informado") {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = key(r) || emptyLabel;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Dias de ausência aprovados dentro do período, recortando o que sai dele. */
export function leaveDaysByType(leaves: LeaveFacts[], from: string, to: string): { type: string; days: number }[] {
  const map = new Map<string, number>();
  for (const l of leaves) {
    const start = l.start_date > from ? l.start_date : from;
    const end = l.end_date < to ? l.end_date : to;
    if (end < start) continue;
    map.set(l.type, (map.get(l.type) ?? 0) + daysInclusive(start, end));
  }
  return [...map.entries()].map(([type, days]) => ({ type, days })).sort((a, b) => b.days - a.days);
}

/** Horas extras e ausências do ponto por mês (em minutos). */
export function timeByMonth(entries: TimeFacts[], months: string[]) {
  return months.map((period) => {
    const inMonth = entries.filter((e) => e.work_date.startsWith(period));
    return {
      period,
      overtime: inMonth.reduce((a, e) => a + e.overtime_minutes, 0),
      absence: inMonth.reduce((a, e) => a + e.absence_minutes, 0),
    };
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
