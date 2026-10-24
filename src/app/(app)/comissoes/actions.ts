"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCan, viewerCanInUnit, type Viewer } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";
import { categoryKey, parseMoney, parsePaymentsCsv, parseSalesCsv } from "@/lib/domain/commission-import";
import { getSettlement } from "@/lib/data/commissions";

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.");
const pct = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined))
    .refine((n) => n === undefined || (Number.isFinite(n) && n >= 0 && n <= 100), `${label}: use um percentual de 0 a 100.`);

async function staff(): Promise<Viewer | ActionState> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewSensitive")) return fail("Seu perfil não gerencia comissões.");
  return viewer;
}
const isFail = (v: unknown): v is ActionState => !!v && typeof v === "object" && "ok" in v;

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

/** Faixas em texto: "0:2; 80:3; 100:4" (a partir de X% da meta → taxa). */
function parseTiers(raw: string | undefined) {
  if (!raw?.trim()) return [];
  return raw.split(/[;\n]+/).map((part) => {
    const m = part.trim().match(/^(\d+(?:[.,]\d+)?)\s*%?\s*[:=→>-]+\s*(\d+(?:[.,]\d+)?)\s*%?$/);
    if (!m) throw new Error(`Faixa inválida: "${part.trim()}". Use, por exemplo, 80:3 (a partir de 80% da meta, 3%).`);
    return { from: Number(m[1].replace(",", ".")), rate: Number(m[2].replace(",", ".")) };
  });
}
/** Categorias em texto: "planejados:3; acessórios:5". */
function parseCategoryRates(raw: string | undefined) {
  const out: Record<string, number> = {};
  if (!raw?.trim()) return out;
  for (const part of raw.split(/[;\n]+/)) {
    const m = part.trim().match(/^(.+?)\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%?$/);
    if (!m) throw new Error(`Categoria inválida: "${part.trim()}". Use, por exemplo, acessórios:5.`);
    out[categoryKey(m[1])] = Number(m[2].replace(",", "."));
  }
  return out;
}

const planSchema = z.object({
  id: z.uuid().optional(),
  name: z.string({ error: "Informe o nome." }).trim().min(2, "Informe o nome.").max(80),
  base: z.enum(["venda", "recebimento"]),
  default_rate: pct("% padrão"),
  tiers: z.string().max(500).optional(),
  category_rates: z.string().max(1000).optional(),
  active: z.string().optional(),
});

export async function savePlan(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  const parsed = planSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  let tiers, category_rates;
  try {
    tiers = parseTiers(parsed.data.tiers);
    category_rates = parseCategoryRates(parsed.data.category_rates);
  } catch (e) {
    return fail((e as Error).message);
  }
  if ([...tiers.map((t) => t.rate), ...Object.values(category_rates)].some((r) => r < 0 || r > 100)) return fail("Percentuais de 0 a 100.");
  const row = {
    organization_id: viewer.organization.id,
    name: parsed.data.name,
    base: parsed.data.base,
    default_rate: parsed.data.default_rate ?? 0,
    tiers,
    category_rates,
    active: parsed.data.active !== "off",
  };
  const supabase = await createClient();
  const { error } = parsed.data.id
    ? await supabase.from("commission_plans").update(row).eq("id", parsed.data.id)
    : await supabase.from("commission_plans").insert(row);
  if (error) return fromDbError(error);
  refresh();
  return success("Plano salvo.");
}

// ---------------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------------

const sellerSchema = z.object({
  employee_id: z.uuid("Escolha o vendedor."),
  plan_id: z.uuid("Escolha o plano."),
  monthly_target: z.string().optional().transform((v) => (v ? parseMoney(v) : null)),
  rate_override: pct("% próprio"),
});

export async function saveSeller(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  const parsed = sellerSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("unit_id").eq("id", parsed.data.employee_id).maybeSingle();
  if (!emp || !viewerCanInUnit(viewer, "viewSensitive", emp.unit_id)) return fail("Colaborador fora do seu escopo.");
  const { error } = await supabase.from("employee_commission").upsert({
    employee_id: parsed.data.employee_id,
    organization_id: viewer.organization.id,
    unit_id: emp.unit_id,
    plan_id: parsed.data.plan_id,
    monthly_target: parsed.data.monthly_target,
    rate_override: parsed.data.rate_override ?? null,
    active: true,
  });
  if (error) return fromDbError(error);
  refresh();
  return success("Vendedor salvo.");
}

export async function removeSeller(employeeId: string): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  if (!z.uuid().safeParse(employeeId).success) return fail("Vendedor inválido.");
  const supabase = await createClient();
  const { error } = await supabase.from("employee_commission").update({ active: false }).eq("employee_id", employeeId);
  if (error) return fromDbError(error);
  refresh();
  return success("Vendedor desativado (histórico mantido).");
}

// ---------------------------------------------------------------------------
// Vendas e recebimentos
// ---------------------------------------------------------------------------

const saleSchema = z.object({
  employee_id: z.uuid("Escolha o vendedor."),
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  order_number: z.string().trim().max(60).optional(),
  customer: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  amount: z.string({ error: "Informe o valor." }).transform((v) => parseMoney(v)).refine((n) => n !== null, "Valor inválido."),
});

export async function addSale(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  const parsed = saleSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("unit_id").eq("id", v.employee_id).maybeSingle();
  if (!emp || !viewerCanInUnit(viewer, "viewSensitive", emp.unit_id)) return fail("Vendedor fora do seu escopo.");
  const { error } = await supabase.from("sales").insert({
    employee_id: v.employee_id,
    organization_id: viewer.organization.id,
    unit_id: emp.unit_id,
    sale_date: v.sale_date,
    order_number: v.order_number || null,
    customer: v.customer || null,
    category: categoryKey(v.category),
    amount: v.amount!,
  });
  if (error) return error.code === "23505" ? fail("Este pedido já foi lançado para este vendedor.") : fromDbError(error);
  refresh();
  return success("Venda lançada.");
}

export async function setSaleStatus(saleId: string, status: "ativa" | "cancelada"): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  if (!z.uuid().safeParse(saleId).success) return fail("Venda inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales").update({ status }).eq("id", saleId).select("id");
  if (error) return fromDbError(error);
  if (!data?.length) return fail("Venda fora do seu escopo.");
  refresh();
  return success(status === "cancelada" ? "Venda cancelada: sai da comissão." : "Venda reativada.");
}

const MAX_CSV = 2 * 1024 * 1024;

async function readCsv(form: FormData): Promise<string | ActionState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Escolha a planilha (CSV).");
  if (file.size > MAX_CSV) return fail("Planilha acima de 2 MB: divida em partes.");
  const buf = Buffer.from(await file.arrayBuffer());
  // Excel em pt-BR costuma salvar CSV em Windows-1252; tenta UTF-8 e cai para latin1.
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}

export async function importSales(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  const text = await readCsv(form);
  if (typeof text !== "string") return text;
  const parsed = parseSalesCsv(text);
  if (parsed.error) return fail(parsed.error);
  const supabase = await createClient();
  const regs = [...new Set(parsed.rows.map((r) => r.registration))];
  const { data: emps } = regs.length
    ? await supabase.from("employees").select("id, unit_id, registration_number").eq("organization_id", viewer.organization.id).in("registration_number", regs)
    : { data: [] };
  const byReg = new Map((emps ?? []).map((e) => [e.registration_number as string, e]));
  const issues = [...parsed.issues];
  const rows = [];
  for (const r of parsed.rows) {
    const e = byReg.get(r.registration);
    if (!e) { issues.push({ line: r.line, message: `matrícula ${r.registration} não encontrada` }); continue; }
    if (!viewerCanInUnit(viewer, "viewSensitive", e.unit_id)) { issues.push({ line: r.line, message: "vendedor fora do seu escopo" }); continue; }
    rows.push({
      employee_id: e.id, organization_id: viewer.organization.id, unit_id: e.unit_id, sale_date: r.sale_date,
      order_number: r.order_number, customer: r.customer, category: r.category, amount: r.amount, source: "importacao",
    });
  }
  let inserted = 0;
  let duplicated = 0;
  for (const row of rows) {
    const { error } = await supabase.from("sales").insert(row);
    if (!error) inserted++;
    else if (error.code === "23505") duplicated++;
    else issues.push({ line: 0, message: error.message });
  }
  refresh();
  const extra = [duplicated ? `${duplicated} pedido(s) já existiam` : "", issues.length ? `${issues.length} linha(s) ignorada(s): ${issues.slice(0, 5).map((i) => `linha ${i.line} (${i.message})`).join("; ")}${issues.length > 5 ? "…" : ""}` : ""].filter(Boolean).join(" · ");
  return { ok: inserted > 0 || (!issues.length && duplicated > 0), message: `${inserted} venda(s) importada(s).${extra ? ` ${extra}.` : ""}` };
}

export async function importPayments(_: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  const text = await readCsv(form);
  if (typeof text !== "string") return text;
  const parsed = parsePaymentsCsv(text);
  if (parsed.error) return fail(parsed.error);
  const supabase = await createClient();
  const orders = [...new Set(parsed.rows.map((r) => r.order_number))];
  const { data: sales } = orders.length
    ? await supabase.from("sales").select("id, order_number, employee:employees(registration_number)").eq("organization_id", viewer.organization.id).in("order_number", orders)
    : { data: [] };
  const issues = [...parsed.issues];
  let inserted = 0;
  let duplicated = 0;
  for (const r of parsed.rows) {
    const matches = (sales ?? []).filter((s) => s.order_number === r.order_number && (!r.registration || (s.employee as unknown as { registration_number: string })?.registration_number === r.registration));
    if (matches.length !== 1) {
      issues.push({ line: r.line, message: matches.length ? `pedido ${r.order_number} tem mais de um vendedor: informe a matrícula` : `pedido ${r.order_number} não encontrado` });
      continue;
    }
    const { error } = await supabase.from("sale_payments").insert({
      sale_id: matches[0].id, organization_id: viewer.organization.id, unit_id: viewer.units[0]?.id, paid_at: r.paid_at, amount: r.amount,
    });
    if (!error) inserted++;
    else if (error.code === "23505") duplicated++;
    else issues.push({ line: r.line, message: /row-level/.test(error.message) ? "fora do seu escopo" : error.message });
  }
  refresh();
  const extra = [duplicated ? `${duplicated} já existiam` : "", issues.length ? `${issues.length} linha(s) ignorada(s): ${issues.slice(0, 5).map((i) => `linha ${i.line} (${i.message})`).join("; ")}${issues.length > 5 ? "…" : ""}` : ""].filter(Boolean).join(" · ");
  return { ok: inserted > 0 || (!issues.length && duplicated > 0), message: `${inserted} recebimento(s) importado(s).${extra ? ` ${extra}.` : ""}` };
}

// ---------------------------------------------------------------------------
// Lançar na folha
// ---------------------------------------------------------------------------

/** Lança a comissão apurada de cada vendedor como COMISSAO na folha do mês (substitui a anterior). */
export async function postToPayroll(p: string): Promise<ActionState> {
  const viewer = await staff();
  if (isFail(viewer)) return viewer;
  const parsed = period.safeParse(p);
  if (!parsed.success) return fail("Competência inválida.");
  const settlement = await getSettlement(viewer, parsed.data);
  const supabase = await createClient();
  let posted = 0;
  for (const s of settlement) {
    if (!s.result) continue;
    const unit = s.seller.employee?.unit_id;
    if (!unit || !viewerCanInUnit(viewer, "viewSensitive", unit)) continue;
    const { error: delErr } = await supabase
      .from("payroll_entries")
      .delete()
      .eq("employee_id", s.seller.employee_id)
      .eq("period", parsed.data)
      .eq("code", "COMISSAO");
    if (delErr) return fromDbError(delErr);
    if (s.result.total > 0) {
      const { error } = await supabase.from("payroll_entries").insert({
        employee_id: s.seller.employee_id,
        organization_id: viewer.organization.id,
        unit_id: unit,
        period: parsed.data,
        code: "COMISSAO",
        amount: s.result.total,
        notes: `Comissões apuradas: base ${s.result.base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      });
      if (error) return fromDbError(error);
      posted++;
    }
  }
  refresh();
  return success(`Comissão lançada na folha de ${posted} vendedor(es). O DSR sobre comissões entra na prévia mensal.`);
}
