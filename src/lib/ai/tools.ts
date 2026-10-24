import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { viewerCan, type Viewer } from "@/lib/auth/viewer";
import { addMonths, isIsoDate, monthBounds, todayIn } from "@/lib/domain/dates";
import { inUnit, sanitizeSearch } from "@/lib/data/scope";

/**
 * Ferramentas do assistente. Regras:
 * - Toda consulta usa a sessão do usuário (RLS) e a unidade em foco.
 * - Nenhuma ferramenta devolve dado pessoal sensível (CPF, salário, banco,
 *   endereço, saúde): o modelo nunca recebe esses campos.
 * - Resultados são limitados em tamanho.
 */

type Json = Record<string, unknown>;
type ToolDef = {
  definition: Anthropic.Tool;
  allowed: (v: Viewer) => boolean;
  run: (v: Viewer, input: Json) => Promise<unknown>;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const dateOr = (v: unknown, fallback: string) => (typeof v === "string" && isIsoDate(v) ? v : fallback);

const TOOLS: ToolDef[] = [
  {
    allowed: (v) => viewerCan(v, "viewPeople"),
    definition: {
      name: "quadro_de_pessoal",
      description: "Conta colaboradores não desligados agrupando por unidade, departamento, cargo, tipo de contrato ou situação.",
      input_schema: {
        type: "object",
        properties: {
          agrupar_por: { type: "string", enum: ["unidade", "departamento", "cargo", "tipo_contrato", "situacao"] },
          incluir_desligados: { type: "boolean" },
        },
        required: ["agrupar_por"],
      },
    },
    async run(viewer, input) {
      const supabase = await createClient();
      let q = supabase
        .from("employees")
        .select("status, employment_type, unit:units(name), department:departments(name), position:positions(title)")
        .limit(5000);
      q = inUnit(q, viewer);
      if (!input.incluir_desligados) q = q.neq("status", "terminated");
      const { data, error } = await q;
      if (error) return { erro: error.message };
      const key = (r: Json) => {
        switch (input.agrupar_por) {
          case "unidade": return (r.unit as Json | null)?.name ?? "Sem unidade";
          case "departamento": return (r.department as Json | null)?.name ?? "Sem departamento";
          case "cargo": return (r.position as Json | null)?.title ?? "Sem cargo";
          case "tipo_contrato": return r.employment_type;
          default: return r.status;
        }
      };
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as Json[]) counts[String(key(r))] = (counts[String(key(r))] ?? 0) + 1;
      return { total: data?.length ?? 0, grupos: counts };
    },
  },
  {
    allowed: (v) => viewerCan(v, "viewPeople"),
    definition: {
      name: "listar_colaboradores",
      description: "Lista colaboradores (nome, matrícula, cargo, departamento, unidade, admissão, situação). Sem dados pessoais sensíveis.",
      input_schema: {
        type: "object",
        properties: {
          busca: { type: "string", description: "Trecho do nome ou matrícula" },
          departamento: { type: "string" },
          situacao: { type: "string", enum: ["onboarding", "active", "on_leave", "terminated"] },
          admitidos_desde: { type: "string", description: "AAAA-MM-DD" },
          limite: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
    },
    async run(viewer, input) {
      const supabase = await createClient();
      let q = supabase
        .from("employees")
        .select("full_name, registration_number, status, employment_type, hire_date, termination_date, unit:units(name), department:departments(name), position:positions(title)")
        .order("full_name")
        .limit(Math.min(Number(input.limite) || 30, 50));
      q = inUnit(q, viewer);
      const busca = sanitizeSearch(str(input.busca));
      if (busca) q = q.or(`full_name.ilike.*${busca}*,registration_number.ilike.*${busca}*`);
      if (str(input.situacao)) q = q.eq("status", str(input.situacao)!);
      if (str(input.admitidos_desde)) q = q.gte("hire_date", dateOr(input.admitidos_desde, "1900-01-01"));
      const { data, error } = await q;
      if (error) return { erro: error.message };
      let rows = (data ?? []) as Json[];
      const dep = str(input.departamento)?.toLowerCase();
      if (dep) rows = rows.filter((r) => String((r.department as Json | null)?.name ?? "").toLowerCase().includes(dep));
      return { quantidade: rows.length, colaboradores: rows };
    },
  },
  {
    allowed: () => true,
    definition: {
      name: "ausencias_no_periodo",
      description: "Férias e ausências que se sobrepõem a um período. Retorna lista e totais de dias por tipo.",
      input_schema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "AAAA-MM-DD" },
          fim: { type: "string", description: "AAAA-MM-DD" },
          tipo: { type: "string", enum: ["ferias", "licenca_medica", "licenca_maternidade", "licenca_paternidade", "falta_justificada", "folga", "outro"] },
          situacao: { type: "string", enum: ["pending", "approved", "rejected", "cancelled"] },
        },
        required: ["inicio", "fim"],
      },
    },
    async run(viewer, input) {
      const today = todayIn();
      const supabase = await createClient();
      let q = supabase
        .from("leave_requests")
        .select("type, start_date, end_date, days, sell_days, status, employee:employees(full_name, registration_number)")
        .lte("start_date", dateOr(input.fim, today))
        .gte("end_date", dateOr(input.inicio, today))
        .order("start_date")
        .limit(150);
      q = inUnit(q, viewer);
      if (str(input.tipo)) q = q.eq("type", str(input.tipo)!);
      if (str(input.situacao)) q = q.eq("status", str(input.situacao)!);
      const { data, error } = await q;
      if (error) return { erro: error.message };
      const totais: Record<string, number> = {};
      for (const r of data ?? []) totais[r.type] = (totais[r.type] ?? 0) + r.days;
      return { quantidade: data?.length ?? 0, dias_por_tipo: totais, ausencias: data };
    },
  },
  {
    allowed: (v) => viewerCan(v, "viewDp"),
    definition: {
      name: "movimentacoes_dp",
      description: "Movimentações do Departamento Pessoal (tipo, data de efeito, situação, colaborador) num período. Não inclui valores salariais.",
      input_schema: {
        type: "object",
        properties: {
          inicio: { type: "string" },
          fim: { type: "string" },
          tipo: { type: "string" },
          situacao: { type: "string", enum: ["draft", "submitted", "approved", "rejected", "exported", "cancelled"] },
        },
        required: ["inicio", "fim"],
      },
    },
    async run(viewer, input) {
      const supabase = await createClient();
      let q = supabase
        .from("dp_events")
        .select("type, effective_date, status, employee:employees(full_name, registration_number)")
        .gte("effective_date", dateOr(input.inicio, "1900-01-01"))
        .lte("effective_date", dateOr(input.fim, "2999-12-31"))
        .order("effective_date")
        .limit(150);
      q = inUnit(q, viewer);
      if (str(input.tipo)) q = q.eq("type", str(input.tipo)!);
      if (str(input.situacao)) q = q.eq("status", str(input.situacao)!);
      const { data, error } = await q;
      if (error) return { erro: error.message };
      return { quantidade: data?.length ?? 0, movimentacoes: data };
    },
  },
  {
    allowed: (v) => viewerCan(v, "viewPeople"),
    definition: {
      name: "indicadores_rotatividade",
      description: "Admissões, desligamentos, quadro atual e taxa de rotatividade nos últimos N meses.",
      input_schema: {
        type: "object",
        properties: { meses: { type: "integer", minimum: 1, maximum: 36 } },
        required: ["meses"],
      },
    },
    async run(viewer, input) {
      const meses = Math.min(Math.max(Number(input.meses) || 12, 1), 36);
      const today = todayIn();
      const since = addMonths(today, -meses);
      const supabase = await createClient();
      const { data, error } = await inUnit(
        supabase.from("employees").select("status, hire_date, termination_date").limit(5000),
        viewer,
      );
      if (error) return { erro: error.message };
      const rows = data ?? [];
      const ativos = rows.filter((r) => r.status !== "terminated").length;
      const admissoes = rows.filter((r) => r.hire_date >= since && r.hire_date <= today).length;
      const desligamentos = rows.filter((r) => r.termination_date && r.termination_date >= since && r.termination_date <= today).length;
      return {
        periodo: { de: since, ate: today },
        quadro_atual: ativos,
        admissoes,
        desligamentos,
        rotatividade_percentual: ativos ? Math.round((((admissoes + desligamentos) / 2) / ativos) * 1000) / 10 : null,
        formula: "((admissões + desligamentos) / 2) / quadro atual",
      };
    },
  },
  {
    allowed: (v) => viewerCan(v, "viewTime"),
    definition: {
      name: "resumo_ponto",
      description: "Totais de horas trabalhadas, extras, faltas e noturnas por colaborador numa competência, a partir do espelho importado.",
      input_schema: {
        type: "object",
        properties: { competencia: { type: "string", description: "AAAA-MM" } },
        required: ["competencia"],
      },
    },
    async run(viewer, input) {
      const period = typeof input.competencia === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.competencia) ? input.competencia : todayIn().slice(0, 7);
      const { start, end } = monthBounds(period);
      const supabase = await createClient();
      const { data, error } = await inUnit(
        supabase
          .from("time_entries")
          .select("employee_id, worked_minutes, overtime_minutes, absence_minutes, night_minutes, employee:employees(full_name)")
          .gte("work_date", start)
          .lte("work_date", end)
          .limit(20000),
        viewer,
      );
      if (error) return { erro: error.message };
      const map = new Map<string, Json & { horas_extras_min: number }>();
      for (const r of data ?? []) {
        const cur = map.get(r.employee_id) ?? {
          nome: (r.employee as unknown as { full_name: string })?.full_name,
          dias: 0, horas_trabalhadas_min: 0, horas_extras_min: 0, faltas_min: 0, noturno_min: 0,
        };
        cur.dias = (cur.dias as number) + 1;
        cur.horas_trabalhadas_min = (cur.horas_trabalhadas_min as number) + r.worked_minutes;
        cur.horas_extras_min += r.overtime_minutes;
        cur.faltas_min = (cur.faltas_min as number) + r.absence_minutes;
        cur.noturno_min = (cur.noturno_min as number) + r.night_minutes;
        map.set(r.employee_id, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.horas_extras_min - a.horas_extras_min).slice(0, 50);
      return { competencia: period, colaboradores: map.size, ordenado_por: "horas extras", dados: rows };
    },
  },
  {
    allowed: (v) => viewerCan(v, "viewPeople"),
    definition: {
      name: "ferias_em_risco",
      description: "Colaboradores CLT ativos com mais de 12 meses de casa sem férias aprovadas nos últimos 12 meses.",
      input_schema: { type: "object", properties: {} },
    },
    async run(viewer) {
      const today = todayIn();
      const yearAgo = addMonths(today, -12);
      const supabase = await createClient();
      const empQ = inUnit(
        supabase.from("employees").select("id, full_name, hire_date").eq("employment_type", "clt").in("status", ["active", "on_leave"]).lte("hire_date", yearAgo),
        viewer,
      );
      const leaveQ = inUnit(
        supabase.from("leave_requests").select("employee_id").eq("type", "ferias").eq("status", "approved").gte("end_date", yearAgo),
        viewer,
      );
      const { data: emps } = await empQ;
      const { data: leaves } = await leaveQ;
      const took = new Set((leaves ?? []).map((l) => l.employee_id));
      const risco = (emps ?? []).filter((e) => !took.has(e.id)).map((e) => ({ nome: e.full_name, admissao: e.hire_date }));
      return {
        quantidade: risco.length,
        colaboradores: risco.slice(0, 60),
        observacao: "Triagem simplificada; confirme saldos e períodos aquisitivos com o DP.",
      };
    },
  },
];

export function toolsFor(viewer: Viewer) {
  return TOOLS.filter((t) => t.allowed(viewer));
}

export async function runTool(viewer: Viewer, name: string, input: Json) {
  const tool = toolsFor(viewer).find((t) => t.definition.name === name);
  if (!tool) return { erro: "Ferramenta indisponível para este perfil." };
  try {
    return await tool.run(viewer, input);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao consultar." };
  }
}
