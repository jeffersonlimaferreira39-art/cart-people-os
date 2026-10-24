/** Utilitários de data puros, sempre em UTC sobre strings ISO (YYYY-MM-DD). */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const d = parseIso(value);
  return toIso(d) === value;
}

export function parseIso(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const d = parseIso(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function addMonths(value: string, months: number): string {
  const d = parseIso(value);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toIso(d);
}

/** Dias corridos, inclusivo nas duas pontas. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((parseIso(end).getTime() - parseIso(start).getTime()) / 86_400_000) + 1;
}

/** 0 = domingo … 6 = sábado */
export function weekday(value: string): number {
  return parseIso(value).getUTCDay();
}

export function rangesOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Data de hoje no fuso informado, em ISO. */
export function todayIn(timeZone = "America/Fortaleza", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function monthBounds(period: string): { start: string; end: string } {
  const start = `${period}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}
