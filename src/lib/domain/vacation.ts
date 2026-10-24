/**
 * Regras de férias da CLT aplicadas na solicitação.
 *
 * Referências: arts. 130, 134, 135, 137 e 143 da CLT (redação da Lei 13.467/2017).
 * Implementação simplificada para triagem no fluxo de aprovação — o cálculo e a
 * conferência oficiais continuam com o sistema de folha/contabilidade.
 * Validar com a contabilidade antes de ampliar estas regras.
 */
import { addDays, addMonths, daysInclusive, todayIn, weekday } from "./dates";

export const VACATION_DAYS_PER_PERIOD = 30;
export const MAX_SPLITS = 3;
export const MIN_SPLIT_DAYS = 5;
export const MIN_MAIN_SPLIT_DAYS = 14;
export const MAX_SELL_DAYS = 10; // abono pecuniário: até 1/3 (art. 143)
export const NOTICE_DAYS = 30; // aviso prévio de férias (art. 135)

export type Period = { start: string; end: string; sellDays?: number };

export type VacationCheckInput = {
  request: Period;
  /** Outras parcelas (pendentes ou aprovadas) do mesmo período aquisitivo. */
  otherPeriods?: Period[];
  /** Feriados no formato ISO. */
  holidays?: string[];
  /** Dia do repouso semanal remunerado (0 = domingo). */
  weeklyRestDay?: number;
  /** Início do período aquisitivo, para avisar sobre o prazo concessivo. */
  acquisitionStart?: string | null;
  today?: string;
};

export type VacationCheck = { errors: string[]; warnings: string[] };

export function checkVacationRequest(input: VacationCheckInput): VacationCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { request } = input;
  const others = input.otherPeriods ?? [];
  const holidays = new Set(input.holidays ?? []);
  const rest = input.weeklyRestDay ?? 0;
  const today = input.today ?? todayIn();

  if (request.end < request.start) {
    errors.push("A data final deve ser igual ou posterior à data inicial.");
    return { errors, warnings };
  }

  const days = daysInclusive(request.start, request.end);
  const sell = request.sellDays ?? 0;

  if (days < MIN_SPLIT_DAYS) {
    errors.push(`Cada parcela de férias deve ter pelo menos ${MIN_SPLIT_DAYS} dias corridos.`);
  }

  const all = [...others, request];
  if (all.length > MAX_SPLITS) {
    errors.push(`As férias podem ser divididas em no máximo ${MAX_SPLITS} parcelas por período aquisitivo.`);
  }

  const totalSell = all.reduce((s, p) => s + (p.sellDays ?? 0), 0);
  if (sell < 0 || totalSell > MAX_SELL_DAYS) {
    errors.push(`O abono pecuniário é limitado a ${MAX_SELL_DAYS} dias por período aquisitivo.`);
  }

  const usedDays = all.reduce((s, p) => s + daysInclusive(p.start, p.end), 0);
  if (usedDays + totalSell > VACATION_DAYS_PER_PERIOD) {
    errors.push(
      `O total de dias (${usedDays} de descanso + ${totalSell} de abono) passa de ${VACATION_DAYS_PER_PERIOD}.`,
    );
  }

  // Uma das parcelas precisa ter 14 dias ou mais. Se nenhuma tem, verifica se
  // ainda sobra espaço para uma parcela assim no futuro.
  const hasMain = all.some((p) => daysInclusive(p.start, p.end) >= MIN_MAIN_SPLIT_DAYS);
  if (!hasMain) {
    const remaining = VACATION_DAYS_PER_PERIOD - usedDays - totalSell;
    if (all.length >= MAX_SPLITS || remaining < MIN_MAIN_SPLIT_DAYS) {
      errors.push(`Uma das parcelas precisa ter pelo menos ${MIN_MAIN_SPLIT_DAYS} dias corridos.`);
    }
  }

  // Início vedado nos dois dias que antecedem feriado ou repouso semanal (art. 134, §3º).
  for (const offset of [1, 2]) {
    const next = addDays(request.start, offset);
    if (holidays.has(next) || weekday(next) === rest) {
      errors.push("As férias não podem começar nos dois dias que antecedem feriado ou o repouso semanal.");
      break;
    }
  }

  if (request.start < addDays(today, NOTICE_DAYS)) {
    warnings.push("A CLT pede aviso de férias com 30 dias de antecedência.");
  }

  if (input.acquisitionStart) {
    const acquisitionEnd = addDays(addMonths(input.acquisitionStart, 12), -1);
    const concessiveEnd = addMonths(acquisitionEnd, 12);
    if (request.start <= acquisitionEnd) {
      warnings.push("O período aquisitivo ainda não terminou: confirme se são férias antecipadas.");
    }
    if (request.end > concessiveEnd) {
      warnings.push("Termina depois do prazo concessivo: há risco de pagamento em dobro (art. 137).");
    }
  }

  return { errors, warnings };
}
