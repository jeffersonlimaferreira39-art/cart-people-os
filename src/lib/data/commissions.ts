import "server-only";
import { createClient } from "@/lib/supabase/server";
import { viewerCan, type Viewer } from "@/lib/auth/viewer";
import { monthBounds } from "@/lib/domain/dates";
import { calculateCommission, type CommissionPlan, type CommissionResult } from "@/lib/domain/commissions";
import { inUnit } from "./scope";

export type PlanRow = CommissionPlan & { id: string; name: string; active: boolean };
export type SellerRow = {
  employee_id: string;
  plan_id: string;
  monthly_target: number | null;
  rate_override: number | null;
  active: boolean;
  employee: { full_name: string; registration_number: string; unit_id: string; unit: { code: string } | null } | null;
};
export type SaleRow = {
  id: string;
  employee_id: string;
  sale_date: string;
  order_number: string | null;
  customer: string | null;
  category: string;
  amount: number;
  status: "ativa" | "cancelada";
  source: "manual" | "importacao";
  employee: { full_name: string; registration_number: string } | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function listPlans(viewer: Viewer): Promise<PlanRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("commission_plans")
    .select("id, name, base, default_rate, tiers, category_rates, active")
    .eq("organization_id", viewer.organization.id)
    .order("name");
  return (data ?? []).map((p) => ({
    ...(p as unknown as PlanRow),
    default_rate: Number(p.default_rate),
    tiers: ((p.tiers as { from: number; rate: number }[]) ?? []).map((t) => ({ from: Number(t.from), rate: Number(t.rate) })),
    category_rates: Object.fromEntries(Object.entries((p.category_rates as Record<string, number>) ?? {}).map(([k, v]) => [k, Number(v)])),
  }));
}

export async function listSellers(viewer: Viewer): Promise<SellerRow[]> {
  const supabase = await createClient();
  const q = inUnit(
    supabase
      .from("employee_commission")
      .select("employee_id, plan_id, monthly_target, rate_override, active, employee:employees(full_name, registration_number, unit_id, unit:units(code))")
      .limit(2000),
    viewer,
  );
  const { data } = await q;
  return ((data ?? []) as unknown as SellerRow[])
    .map((s) => ({ ...s, monthly_target: num(s.monthly_target), rate_override: num(s.rate_override) }))
    .sort((a, b) => (a.employee?.full_name ?? "").localeCompare(b.employee?.full_name ?? ""));
}

export async function listSales(viewer: Viewer, period: string): Promise<SaleRow[]> {
  const supabase = await createClient();
  const { start, end } = monthBounds(period);
  const q = inUnit(
    supabase
      .from("sales")
      .select("id, employee_id, sale_date, order_number, customer, category, amount, status, source, employee:employees(full_name, registration_number)")
      .gte("sale_date", start)
      .lte("sale_date", end)
      .order("sale_date", { ascending: false })
      .limit(5000),
    viewer,
  );
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SaleRow[]).map((s) => ({ ...s, amount: Number(s.amount) }));
}

export type PaymentRow = { id: string; sale_id: string; paid_at: string; amount: number; sale: { order_number: string | null; employee: { full_name: string } | null } | null };

export async function listPayments(viewer: Viewer, period: string): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { start, end } = monthBounds(period);
  const q = inUnit(
    supabase
      .from("sale_payments")
      .select("id, sale_id, paid_at, amount, sale:sales(order_number, employee:employees(full_name))")
      .gte("paid_at", start)
      .lte("paid_at", end)
      .order("paid_at", { ascending: false })
      .limit(5000),
    viewer,
  );
  const { data } = await q;
  return ((data ?? []) as unknown as PaymentRow[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export type Settlement = {
  seller: SellerRow;
  plan: PlanRow | null;
  result: CommissionResult | null;
};

/**
 * Apuração da competência para cada vendedor ativo. Para base "recebimento",
 * considera pagamentos do mês de vendas de qualquer data (até 24 meses antes).
 */
export async function getSettlement(viewer: Viewer, period: string): Promise<Settlement[]> {
  if (!viewerCan(viewer, "viewSensitive")) throw new Error("Sem acesso às comissões.");
  return computeSettlement(viewer, period);
}

/** Comissão do próprio vendedor (RLS libera ao titular as próprias vendas e meta). */
export async function getMySettlement(viewer: Viewer, period: string): Promise<Settlement | null> {
  if (!viewer.employee) return null;
  const all = await computeSettlement(viewer, period, viewer.employee.id);
  return all[0] ?? null;
}

async function computeSettlement(viewer: Viewer, period: string, employeeId?: string): Promise<Settlement[]> {
  const supabase = await createClient();
  const { start, end } = monthBounds(period);
  const [plans, sellersAll] = await Promise.all([listPlans(viewer), employeeId ? mySeller(employeeId) : listSellers(viewer)]);
  const sellers = sellersAll.filter((s) => s.active);
  if (!sellers.length) return [];
  const ids = sellers.map((s) => s.employee_id);
  const histStart = `${Number(period.slice(0, 4)) - 2}${period.slice(4)}-01`;

  const [{ data: sales }, { data: payments }] = await Promise.all([
    supabase.from("sales").select("id, employee_id, sale_date, category, amount, status").in("employee_id", ids).gte("sale_date", histStart).lte("sale_date", end).limit(100000),
    supabase.from("sale_payments").select("sale_id, paid_at, amount").gte("paid_at", start).lte("paid_at", end).limit(100000),
  ]);
  const salesBy = new Map<string, { id: string; sale_date: string; category: string; amount: number; status: "ativa" | "cancelada" }[]>();
  for (const s of sales ?? []) {
    const list = salesBy.get(s.employee_id) ?? [];
    list.push({ id: s.id, sale_date: s.sale_date, category: s.category, amount: Number(s.amount), status: s.status as "ativa" | "cancelada" });
    salesBy.set(s.employee_id, list);
  }
  const pays = (payments ?? []).map((p) => ({ sale_id: p.sale_id as string, paid_at: p.paid_at as string, amount: Number(p.amount) }));

  return sellers.map((seller) => {
    const plan = plans.find((p) => p.id === seller.plan_id) ?? null;
    if (!plan) return { seller, plan, result: null };
    const mySales = salesBy.get(seller.employee_id) ?? [];
    const myIds = new Set(mySales.map((s) => s.id));
    const result = calculateCommission({
      period,
      plan,
      target: seller.monthly_target,
      rateOverride: seller.rate_override,
      sales: mySales,
      payments: pays.filter((p) => myIds.has(p.sale_id)),
    });
    return { seller, plan, result };
  });

  async function mySeller(id: string): Promise<SellerRow[]> {
    const { data } = await supabase
      .from("employee_commission")
      .select("employee_id, plan_id, monthly_target, rate_override, active, employee:employees(full_name, registration_number, unit_id, unit:units(code))")
      .eq("employee_id", id);
    return ((data ?? []) as unknown as SellerRow[]).map((s) => ({ ...s, monthly_target: num(s.monthly_target), rate_override: num(s.rate_override) }));
  }
}
