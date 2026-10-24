/**
 * Leitura das planilhas de vendas e recebimentos (CSV ";" ou ","; Excel salvo como CSV).
 * Cabeçalhos aceitos sem acento e sem diferença de maiúsculas.
 *   Vendas:       data; matricula; pedido; cliente; categoria; valor
 *   Recebimentos: pedido; matricula (opcional); data_pagamento; valor
 */
import { parseCsv } from "./csv";
import { isIsoDate } from "./dates";

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Categoria como chave estável: "Móveis Planejados" → "moveis_planejados". */
export const categoryKey = (s: string | undefined) => (s && norm(s).slice(0, 40)) || "geral";
export const categoryLabel = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");

/** "05/10/2026" | "2026-10-05" → ISO; null se inválida. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : s.slice(0, 10);
  return isIsoDate(iso) ? iso : null;
}

/** "R$ 1.234,56" | "1234.56" → número positivo; null se inválido. */
export function parseMoney(v: string): number | null {
  const s = v.replace(/[R$\s]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null;
}

type Issue = { line: number; message: string };

function table(text: string, required: string[]) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: "Planilha vazia." } as const;
  const head = rows[0].map(norm);
  const missing = required.filter((r) => !head.includes(r));
  if (missing.length) return { error: `Colunas obrigatórias ausentes: ${missing.join(", ")}.` } as const;
  const get = (row: string[], name: string) => {
    const i = head.indexOf(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };
  return { rows: rows.slice(1), get } as const;
}

export type ImportedSale = { line: number; sale_date: string; registration: string; order_number: string | null; customer: string | null; category: string; amount: number };

export function parseSalesCsv(text: string): { rows: ImportedSale[]; issues: Issue[]; error?: string } {
  const t = table(text, ["data", "matricula", "valor"]);
  if ("error" in t) return { rows: [], issues: [], error: t.error };
  const rows: ImportedSale[] = [];
  const issues: Issue[] = [];
  t.rows.forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(t.get(r, "data"));
    const amount = parseMoney(t.get(r, "valor"));
    const registration = t.get(r, "matricula");
    if (!date) return issues.push({ line, message: "data inválida" });
    if (!registration) return issues.push({ line, message: "matrícula vazia" });
    if (amount === null) return issues.push({ line, message: "valor inválido" });
    rows.push({
      line,
      sale_date: date,
      registration,
      order_number: t.get(r, "pedido").slice(0, 60) || null,
      customer: t.get(r, "cliente").slice(0, 120) || null,
      category: categoryKey(t.get(r, "categoria")),
      amount,
    });
  });
  return { rows, issues };
}

export type ImportedPayment = { line: number; order_number: string; registration: string | null; paid_at: string; amount: number };

export function parsePaymentsCsv(text: string): { rows: ImportedPayment[]; issues: Issue[]; error?: string } {
  const t = table(text, ["pedido", "data_pagamento", "valor"]);
  if ("error" in t) return { rows: [], issues: [], error: t.error };
  const rows: ImportedPayment[] = [];
  const issues: Issue[] = [];
  t.rows.forEach((r, i) => {
    const line = i + 2;
    const order = t.get(r, "pedido");
    const paid = parseDate(t.get(r, "data_pagamento"));
    const amount = parseMoney(t.get(r, "valor"));
    if (!order) return issues.push({ line, message: "pedido vazio" });
    if (!paid) return issues.push({ line, message: "data de pagamento inválida" });
    if (amount === null) return issues.push({ line, message: "valor inválido" });
    rows.push({ line, order_number: order, registration: t.get(r, "matricula") || null, paid_at: paid, amount });
  });
  return { rows, issues };
}
