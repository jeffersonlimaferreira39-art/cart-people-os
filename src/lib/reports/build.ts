import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unitLabel, viewerCan, type Viewer } from "@/lib/auth/viewer";
import { todayIn } from "@/lib/domain/dates";
import { headcountSeries, periodStart, type PeriodMonths } from "@/lib/domain/analytics";
import {
  DP_STATUS_LABELS, EMPLOYEE_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, formatDate, formatPeriod,
} from "@/lib/format";
import { inUnit } from "@/lib/data/scope";
import { REPORTS, type ReportFormat, type ReportId, type ReportTable } from "./catalog";

type Named = { name: string } | null;
const nameOf = (v: unknown) => (v as Named)?.name ?? "";
const titleOf = (v: unknown) => (v as { title: string } | null)?.title ?? "";
const label = <T extends Record<string, string>>(map: T, key: string) => map[key as keyof T] ?? key;

const DP_TYPE_LABELS: Record<string, string> = {
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

const hours = (min: number) => Math.round((min / 60) * 100) / 100;

/**
 * Monta a tabela do relatório sob a sessão do usuário (RLS) e a unidade em foco.
 * Devolve null se o papel não tem acesso a este relatório.
 */
export async function buildReport(viewer: Viewer, id: ReportId, months: PeriodMonths): Promise<ReportTable | null> {
  const def = REPORTS[id];
  if (!viewerCan(viewer, def.capability)) return null;
  const supabase = await createClient();
  const today = todayIn(viewer.units.find((u) => u.id === viewer.selectedUnitId)?.timezone);
  const from = periodStart(today, months);
  const where = unitLabel(viewer);
  const scope = def.usesPeriod ? `${where} · ${formatDate(from)} a ${formatDate(today)}` : `${where} · posição em ${formatDate(today)}`;
  const base = { title: def.title, scope };

  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };

  switch (id) {
    case "quadro": {
      const { data, error } = await inUnit(
        supabase
          .from("employees")
          .select("registration_number, full_name, social_name, status, employment_type, hire_date, work_email, unit:units(name), department:departments(name), position:positions(title)")
          .neq("status", "terminated")
          .order("full_name")
          .limit(10000),
        viewer,
      );
      fail(error);
      return {
        ...base,
        columns: [
          { header: "Matrícula", kind: "text", width: 12 },
          { header: "Nome", kind: "text", width: 34 },
          { header: "Nome social", kind: "text", width: 20 },
          { header: "Unidade", kind: "text", width: 18 },
          { header: "Departamento", kind: "text", width: 20 },
          { header: "Cargo", kind: "text", width: 24 },
          { header: "Vínculo", kind: "text", width: 14 },
          { header: "Situação", kind: "text", width: 14 },
          { header: "Admissão", kind: "date", width: 12 },
          { header: "E-mail corporativo", kind: "text", width: 28 },
        ],
        rows: (data ?? []).map((e) => [
          e.registration_number, e.full_name, e.social_name, nameOf(e.unit), nameOf(e.department), titleOf(e.position),
          label(EMPLOYMENT_TYPE_LABELS, e.employment_type), label(EMPLOYEE_STATUS_LABELS, e.status), e.hire_date, e.work_email,
        ]),
      };
    }

    case "movimento": {
      const cols = "registration_number, full_name, hire_date, termination_date, unit:units(name), department:departments(name), position:positions(title)";
      const [hires, terms] = await Promise.all([
        inUnit(supabase.from("employees").select(cols).gte("hire_date", from).lte("hire_date", today).limit(10000), viewer),
        inUnit(supabase.from("employees").select(cols).gte("termination_date", from).lte("termination_date", today).limit(10000), viewer),
      ]);
      fail(hires.error);
      fail(terms.error);
      const rows = [
        ...(hires.data ?? []).map((e) => ["Admissão", e.hire_date, e]),
        ...(terms.data ?? []).map((e) => ["Desligamento", e.termination_date as string, e]),
      ] as [string, string, NonNullable<typeof hires.data>[number]][];
      rows.sort((a, b) => a[1].localeCompare(b[1]) || a[2].full_name.localeCompare(b[2].full_name));
      return {
        ...base,
        columns: [
          { header: "Movimento", kind: "text", width: 14 },
          { header: "Data", kind: "date", width: 12 },
          { header: "Matrícula", kind: "text", width: 12 },
          { header: "Nome", kind: "text", width: 34 },
          { header: "Unidade", kind: "text", width: 18 },
          { header: "Departamento", kind: "text", width: 20 },
          { header: "Cargo", kind: "text", width: 24 },
        ],
        rows: rows.map(([kind, date, e]) => [kind, date, e.registration_number, e.full_name, nameOf(e.unit), nameOf(e.department), titleOf(e.position)]),
      };
    }

    case "indicadores": {
      const { data, error } = await inUnit(
        supabase.from("employees").select("hire_date, termination_date, status").limit(10000),
        viewer,
      );
      fail(error);
      return {
        ...base,
        columns: [
          { header: "Mês", kind: "text", width: 12 },
          { header: "Quadro no fim do mês", kind: "number", width: 20 },
          { header: "Admissões", kind: "number", width: 12 },
          { header: "Desligamentos", kind: "number", width: 14 },
          { header: "Rotatividade (%)", kind: "number", width: 16 },
        ],
        rows: headcountSeries(data ?? [], today, months).map((p) => [formatPeriod(p.period), p.headcount, p.hires, p.terminations, p.turnover]),
      };
    }

    case "ausencias": {
      const { data, error } = await inUnit(
        supabase
          .from("leave_requests")
          .select("type, start_date, end_date, days, sell_days, status, employee:employees(full_name, registration_number), unit:units(name)")
          .lte("start_date", today)
          .gte("end_date", from)
          .order("start_date")
          .limit(20000),
        viewer,
      );
      fail(error);
      return {
        ...base,
        columns: [
          { header: "Matrícula", kind: "text", width: 12 },
          { header: "Nome", kind: "text", width: 34 },
          { header: "Unidade", kind: "text", width: 18 },
          { header: "Tipo", kind: "text", width: 20 },
          { header: "Início", kind: "date", width: 12 },
          { header: "Fim", kind: "date", width: 12 },
          { header: "Dias", kind: "number", width: 8 },
          { header: "Dias de abono", kind: "number", width: 14 },
          { header: "Situação", kind: "text", width: 14 },
        ],
        rows: (data ?? []).map((l) => {
          const emp = l.employee as unknown as { full_name: string; registration_number: string } | null;
          return [
            emp?.registration_number ?? "", emp?.full_name ?? "", nameOf(l.unit), label(LEAVE_TYPE_LABELS, l.type),
            l.start_date, l.end_date, l.days, l.sell_days, label(LEAVE_STATUS_LABELS, l.status),
          ];
        }),
      };
    }

    case "movimentacoes_dp": {
      // Sem o payload: ele pode conter valores salariais.
      const { data, error } = await inUnit(
        supabase
          .from("dp_events")
          .select("type, effective_date, status, notes, employee:employees(full_name, registration_number), unit:units(name)")
          .gte("effective_date", from)
          .lte("effective_date", today)
          .order("effective_date")
          .limit(20000),
        viewer,
      );
      fail(error);
      return {
        ...base,
        columns: [
          { header: "Data de efeito", kind: "date", width: 14 },
          { header: "Tipo", kind: "text", width: 22 },
          { header: "Matrícula", kind: "text", width: 12 },
          { header: "Nome", kind: "text", width: 34 },
          { header: "Unidade", kind: "text", width: 18 },
          { header: "Situação", kind: "text", width: 14 },
          { header: "Observações", kind: "text", width: 40 },
        ],
        rows: (data ?? []).map((d) => {
          const emp = d.employee as unknown as { full_name: string; registration_number: string } | null;
          return [d.effective_date, DP_TYPE_LABELS[d.type] ?? d.type, emp?.registration_number ?? "", emp?.full_name ?? "", nameOf(d.unit), label(DP_STATUS_LABELS, d.status), d.notes];
        }),
      };
    }

    case "ponto": {
      const { data, error } = await inUnit(
        supabase
          .from("time_entries")
          .select("employee_id, worked_minutes, overtime_minutes, absence_minutes, night_minutes, employee:employees(full_name, registration_number), unit:units(name)")
          .gte("work_date", from)
          .lte("work_date", today)
          .limit(100000),
        viewer,
      );
      fail(error);
      const map = new Map<string, { reg: string; name: string; unit: string; days: number; w: number; o: number; a: number; n: number }>();
      for (const r of data ?? []) {
        const emp = r.employee as unknown as { full_name: string; registration_number: string } | null;
        const row = map.get(r.employee_id) ?? { reg: emp?.registration_number ?? "", name: emp?.full_name ?? "", unit: nameOf(r.unit), days: 0, w: 0, o: 0, a: 0, n: 0 };
        row.days++;
        row.w += r.worked_minutes;
        row.o += r.overtime_minutes;
        row.a += r.absence_minutes;
        row.n += r.night_minutes;
        map.set(r.employee_id, row);
      }
      return {
        ...base,
        columns: [
          { header: "Matrícula", kind: "text", width: 12 },
          { header: "Nome", kind: "text", width: 34 },
          { header: "Unidade", kind: "text", width: 18 },
          { header: "Dias com registro", kind: "number", width: 16 },
          { header: "Horas trabalhadas", kind: "number", width: 16 },
          { header: "Horas extras", kind: "number", width: 12 },
          { header: "Horas de ausência", kind: "number", width: 16 },
          { header: "Horas noturnas", kind: "number", width: 14 },
        ],
        rows: [...map.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => [r.reg, r.name, r.unit, r.days, hours(r.w), hours(r.o), hours(r.a), hours(r.n)]),
      };
    }
  }
}

/** Registra a exportação (LGPD). Sem registro, o arquivo não é entregue. */
export async function logExport(
  viewer: Viewer,
  report: ReportId,
  format: ReportFormat,
  months: PeriodMonths,
  rowCount: number,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("report_exports").insert({
    organization_id: viewer.organization.id,
    unit_id: viewer.selectedUnitId,
    user_id: viewer.userId,
    report,
    format,
    filters: { months: REPORTS[report].usesPeriod ? months : null },
    row_count: rowCount,
  });
  if (error) console.error("report_exports insert failed", error.message);
  return !error;
}
