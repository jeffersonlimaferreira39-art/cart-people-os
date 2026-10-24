"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer, viewerCanInUnit, type Viewer } from "@/lib/auth/viewer";
import { fail, formToObject, fromDbError, fromZod, success, type ActionState } from "@/lib/actions";
import { ENTRY_CODES, ITEM_CODES } from "@/lib/domain/payroll";
import { TABLE_SCHEMAS, type TableKind } from "@/lib/domain/payroll-tables";
import { dependentSchema, entrySchema, itemSchema, periodSchema, profileSchema } from "@/lib/validation/payroll";
import { GRID_CODES, gridUnit } from "@/lib/domain/payroll-grid";

const uuid = z.uuid();

/** Confere sessão, papel e unidade do colaborador antes de qualquer escrita. */
async function guard(employeeId: string): Promise<{ viewer: Viewer; unitId: string } | ActionState> {
  if (!uuid.safeParse(employeeId).success) return fail("Colaborador inválido.");
  const viewer = await getViewer();
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("unit_id").eq("id", employeeId).maybeSingle();
  if (!data) return fail("Colaborador não encontrado ou fora do seu escopo.");
  if (!viewerCanInUnit(viewer, "viewSensitive", data.unit_id)) return fail("Seu perfil não altera dados de folha nesta unidade.");
  return { viewer, unitId: data.unit_id };
}
const isFail = (g: unknown): g is ActionState => !!g && typeof g === "object" && "ok" in g;

export async function saveProfile(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  const parsed = profileSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const { base_salary, notes, ...profile } = parsed.data;
  const supabase = await createClient();
  const scope = { employee_id: employeeId, organization_id: g.viewer.organization.id, unit_id: g.unitId };

  const { error } = await supabase.from("employee_payroll_profile").upsert({ ...scope, ...profile, notes: notes ?? null });
  if (error) return fromDbError(error);
  if (base_salary !== undefined) {
    const { data: existing } = await supabase.from("employee_sensitive").select("employee_id").eq("employee_id", employeeId).maybeSingle();
    const { error: sErr } = existing
      ? await supabase.from("employee_sensitive").update({ base_salary }).eq("employee_id", employeeId)
      : await supabase.from("employee_sensitive").insert({ ...scope, base_salary });
    if (sErr) return fromDbError(sErr);
  }
  refresh();
  return success("Dados da folha salvos.");
}

export async function addItem(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  const parsed = itemSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const def = ITEM_CODES[v.code];
  const supabase = await createClient();
  const { error } = await supabase.from("employee_payroll_items").insert({
    employee_id: employeeId,
    organization_id: g.viewer.organization.id,
    unit_id: g.unitId,
    kind: def.kind,
    code: v.code,
    description: v.description ?? def.label,
    amount: v.value_type === "valor" ? v.value : null,
    percent: v.value_type === "percentual" ? v.value : null,
    // Desconto não tem incidência (não reduz base de tributos).
    incidence_inss: def.kind === "provento" && v.incidence_inss,
    incidence_irrf: def.kind === "provento" && v.incidence_irrf,
    incidence_fgts: def.kind === "provento" && v.incidence_fgts,
    start_period: v.start_period,
    end_period: v.end_period ?? null,
  });
  if (error) return fromDbError(error);
  refresh();
  return success("Rubrica incluída.");
}

export async function removeItem(employeeId: string, itemId: string): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  if (!uuid.safeParse(itemId).success) return fail("Rubrica inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("employee_payroll_items").delete().eq("id", itemId).eq("employee_id", employeeId);
  if (error) return fromDbError(error);
  refresh();
  return success("Rubrica removida.");
}

export async function addDependent(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  const parsed = dependentSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("dependents").insert({
    employee_id: employeeId,
    organization_id: g.viewer.organization.id,
    unit_id: g.unitId,
    ...parsed.data,
    cpf: parsed.data.cpf ?? null,
  });
  if (error) return fromDbError(error);
  refresh();
  return success("Dependente incluído.");
}

export async function removeDependent(employeeId: string, dependentId: string): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  if (!uuid.safeParse(dependentId).success) return fail("Dependente inválido.");
  const supabase = await createClient();
  const { error } = await supabase.from("dependents").delete().eq("id", dependentId).eq("employee_id", employeeId);
  if (error) return fromDbError(error);
  refresh();
  return success("Dependente removido.");
}

export async function addEntry(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  const parsed = entrySchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZod(parsed.error);
  const v = parsed.data;
  const isValue = ENTRY_CODES[v.code].unit === "valor";
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_entries").insert({
    employee_id: employeeId,
    organization_id: g.viewer.organization.id,
    unit_id: g.unitId,
    period: v.period,
    code: v.code,
    quantity: isValue ? null : v.value,
    amount: isValue ? v.value : null,
    notes: v.notes ?? null,
  });
  if (error) return fromDbError(error);
  refresh();
  return success("Lançamento incluído.");
}

export async function removeEntry(employeeId: string, entryId: string): Promise<ActionState> {
  const g = await guard(employeeId);
  if (isFail(g)) return g;
  if (!uuid.safeParse(entryId).success) return fail("Lançamento inválido.");
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_entries").delete().eq("id", entryId).eq("employee_id", employeeId);
  if (error) return fromDbError(error);
  refresh();
  return success("Lançamento excluído.");
}

/** Nova vigência de uma tabela de cálculo (Admin/DP da organização; a RLS confirma). */
export async function saveTaxTable(kind: TableKind, _: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer.orgWide || !viewer.roles.some((r) => r === "admin" || r === "dp")) {
    return fail("Só Admin ou DP com acesso a todas as unidades alteram as tabelas.");
  }
  if (!Object.hasOwn(TABLE_SCHEMAS, kind)) return fail("Tabela inválida.");
  const raw = formToObject(form);
  const validFrom = periodSchema.safeParse(raw.valid_from);
  if (!validFrom.success) return fail("Informe a competência de início (AAAA-MM).", { valid_from: ["Competência inválida."] });
  let data: unknown;
  try {
    data = buildTableData(kind, raw);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Revise os valores.");
  }
  const parsed = TABLE_SCHEMAS[kind].safeParse(data);
  if (!parsed.success) return fail("Revise os valores da tabela: há campos vazios ou fora do intervalo.");
  const supabase = await createClient();
  const { error } = await supabase.from("payroll_tax_tables").upsert(
    {
      organization_id: viewer.organization.id,
      kind,
      valid_from: `${validFrom.data}-01`,
      data: parsed.data,
      notes: raw.notes ?? null,
    },
    { onConflict: "organization_id,kind,valid_from" },
  );
  if (error) return fromDbError(error);
  refresh();
  return success("Tabela salva. Ela vale a partir da competência informada.");
}

const num = (raw: Record<string, string | undefined>, key: string, label: string) => {
  const v = raw[key];
  if (v === undefined) throw new Error(`Informe ${label}.`);
  const n = Number(v.replace(/[R$\s%]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido em ${label}.`);
  return n;
};

function buildTableData(kind: TableKind, raw: Record<string, string | undefined>) {
  const rows = [0, 1, 2, 3, 4, 5].filter((i) => raw[`rate_${i}`] !== undefined);
  switch (kind) {
    case "inss":
      return { brackets: rows.map((i) => ({ upTo: num(raw, `upTo_${i}`, `o limite da faixa ${i + 1}`), rate: num(raw, `rate_${i}`, "a alíquota") })) };
    case "irrf":
      return {
        brackets: rows.map((i) => ({
          upTo: raw[`upTo_${i}`] === undefined ? null : num(raw, `upTo_${i}`, `o limite da faixa ${i + 1}`),
          rate: num(raw, `rate_${i}`, "a alíquota"),
          deduction: num(raw, `deduction_${i}`, "a parcela a deduzir"),
        })),
        dependentDeduction: num(raw, "dependentDeduction", "a dedução por dependente"),
        simplifiedDiscount: num(raw, "simplifiedDiscount", "o desconto simplificado"),
        reduction:
          raw.exemptUpTo === undefined
            ? null
            : {
                exemptUpTo: num(raw, "exemptUpTo", "o limite de isenção"),
                maxReduction: num(raw, "maxReduction", "a redução máxima"),
                phaseOutUpTo: num(raw, "phaseOutUpTo", "o limite da redução parcial"),
                phaseOutConstant: num(raw, "phaseOutConstant", "a constante da redução"),
                phaseOutFactor: num(raw, "phaseOutFactor", "o fator da redução"),
              },
      };
    case "salario_familia":
      return { incomeLimit: num(raw, "incomeLimit", "a remuneração máxima"), quota: num(raw, "quota", "o valor da cota") };
    case "parametros":
      return {
        minimumWage: num(raw, "minimumWage", "o salário mínimo"),
        fgtsRate: num(raw, "fgtsRate", "o FGTS"),
        fgtsApprenticeRate: num(raw, "fgtsApprenticeRate", "o FGTS do aprendiz"),
        vtMaxDiscountRate: num(raw, "vtMaxDiscountRate", "o desconto de VT"),
        overtimeRate: num(raw, "overtimeRate", "o adicional de hora extra"),
        overtimeHolidayRate: num(raw, "overtimeHolidayRate", "o adicional de hora extra em feriado"),
        nightShiftRate: num(raw, "nightShiftRate", "o adicional noturno"),
        hazardRate: num(raw, "hazardRate", "a periculosidade"),
        unhealthinessRates: {
          minimo: num(raw, "unh_minimo", "a insalubridade mínima"),
          medio: num(raw, "unh_medio", "a insalubridade média"),
          maximo: num(raw, "unh_maximo", "a insalubridade máxima"),
        },
      };
  }
}

const gridChangesSchema = z
  .array(z.object({ employee_id: z.uuid(), code: z.enum(GRID_CODES), value: z.number().min(0).max(999_999).nullable() }))
  .min(1, "Nada para salvar.")
  .max(5000, "Salve em partes menores (até 5.000 células).");

/**
 * Salva as células alteradas da digitação de folha. Cada célula substitui os
 * lançamentos manuais daquele código no mês (vazio/zero = remove).
 */
export async function saveGrid(period: string, changesJson: string): Promise<ActionState> {
  const viewer = await getViewer();
  const p = periodSchema.safeParse(period);
  if (!p.success) return fail("Competência inválida.");
  let raw: unknown;
  try {
    raw = JSON.parse(changesJson);
  } catch {
    return fail("Dados da grade inválidos.");
  }
  const parsed = gridChangesSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados da grade inválidos.");
  const changes = parsed.data;

  const supabase = await createClient();
  const ids = [...new Set(changes.map((c) => c.employee_id))];
  const { data: emps } = await supabase.from("employees").select("id, unit_id").in("id", ids);
  const unitOf = new Map((emps ?? []).map((e) => [e.id as string, e.unit_id as string]));
  const denied = ids.filter((id) => !unitOf.has(id) || !viewerCanInUnit(viewer, "viewSensitive", unitOf.get(id)!));
  if (denied.length) return fail(`Sem permissão para ${denied.length} colaborador(es) desta grade. Nada foi salvo.`);

  for (const id of ids) {
    const mine = changes.filter((c) => c.employee_id === id);
    const { error: delErr } = await supabase
      .from("payroll_entries")
      .delete()
      .eq("employee_id", id)
      .eq("period", p.data)
      .in("code", mine.map((c) => c.code));
    if (delErr) return fromDbError(delErr);
    const rows = mine
      .filter((c) => c.value !== null)
      .map((c) => ({
        employee_id: id,
        organization_id: viewer.organization.id,
        unit_id: unitOf.get(id)!,
        period: p.data,
        code: c.code,
        quantity: gridUnit(c.code) === "valor" ? null : c.value,
        amount: gridUnit(c.code) === "valor" ? c.value : null,
        notes: "Digitação de folha",
      }));
    if (rows.length) {
      const { error } = await supabase.from("payroll_entries").insert(rows);
      if (error) return fromDbError(error);
    }
  }
  refresh();
  return success(`${changes.length} célula(s) salva(s).`);
}
