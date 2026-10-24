import { NextResponse, type NextRequest } from "next/server";
import { getViewer, unitLabel, viewerCan } from "@/lib/auth/viewer";
import { getPayrollPreview } from "@/lib/data/payroll";
import { todayIn } from "@/lib/domain/dates";
import { EMPLOYMENT_TYPE_LABELS, formatPeriod } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ReportTable } from "@/lib/reports/catalog";
import { reportFileName, tableToCsv } from "@/lib/reports/files";
import { tableToXlsx } from "@/lib/reports/xlsx";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Rótulos cuja descrição varia por colaborador viram um cabeçalho único.
const COLUMN_LABELS: Record<string, string> = {
  SALARIO: "Salário / bolsa-auxílio",
  INSALUBRIDADE: "Insalubridade",
  FGTS: "FGTS (empresa)",
};

/**
 * Prévia da folha em planilha para a contabilidade: uma linha por colaborador e
 * uma coluna por rubrica. Dado sensível: só Admin/RH/DP, e toda exportação fica registrada.
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "viewSensitive")) return new NextResponse("Seu perfil não exporta a prévia da folha.", { status: 403 });
  const period = req.nextUrl.searchParams.get("competencia") ?? "";
  if (!PERIOD_RE.test(period)) return new NextResponse("Competência inválida.", { status: 400 });
  const format = req.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "xlsx";

  const preview = await getPayrollPreview(viewer, period);
  const calc = preview.rows.filter((r) => r.result.status === "calculada");
  // Colunas de rubrica na ordem em que aparecem (proventos, depois descontos).
  const rubrics = new Map<string, { label: string; kind: string }>();
  for (const kind of ["provento", "desconto", "informativo"]) {
    for (const r of calc) {
      for (const l of r.result.lines) {
        if (l.kind !== kind || rubrics.has(l.code)) continue;
        rubrics.set(l.code, { label: COLUMN_LABELS[l.code] ?? l.label.replace(" (ponto)", ""), kind });
      }
    }
  }
  const rubricList = [...rubrics.entries()];
  const table: ReportTable = {
    title: `Prévia da folha ${formatPeriod(period)}`,
    scope: `${unitLabel(viewer)} · estimativa para conferência, não é a folha oficial`,
    columns: [
      { header: "Matrícula", kind: "text", width: 12 },
      { header: "Nome", kind: "text", width: 32 },
      { header: "Unidade", kind: "text", width: 10 },
      { header: "Vínculo", kind: "text", width: 12 },
      { header: "Dias pagos", kind: "number", width: 10 },
      { header: "Filhos até 14", kind: "number", width: 12 },
      { header: "Dependentes IR", kind: "number", width: 14 },
      ...rubricList.map(([code, r]) => ({
        header: `${r.kind === "desconto" ? "(−) " : r.kind === "informativo" ? "(i) " : ""}${r.label} [${code}]`,
        kind: "number" as const,
        width: 16,
      })),
      { header: "Total proventos", kind: "number", width: 16 },
      { header: "Total descontos", kind: "number", width: 16 },
      { header: "Líquido", kind: "number", width: 14 },
      { header: "Base INSS", kind: "number", width: 14 },
      { header: "Base IRRF", kind: "number", width: 14 },
      { header: "Base FGTS", kind: "number", width: 14 },
      { header: "FGTS", kind: "number", width: 12 },
      { header: "Avisos", kind: "text", width: 40 },
    ],
    rows: calc.map(({ employee: e, result: r, childrenUnder14, irrfDependents }) => {
      const t = r.totals;
      const amounts = rubricList.map(([code]) => {
        const v = r.lines.filter((l) => l.code === code).reduce((a, l) => a + l.amount, 0);
        return v ? Math.round(v * 100) / 100 : null;
      });
      return [
        e.registration_number, e.full_name, e.unit_code,
        EMPLOYMENT_TYPE_LABELS[e.employment_type as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? e.employment_type,
        r.paidDays, childrenUnder14, irrfDependents, ...amounts,
        t.proventos, t.descontos, t.liquido, t.baseInss, t.baseIrrf, t.baseFgts, t.fgts, r.warnings.join(" | ") || null,
      ];
    }),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("report_exports").insert({
    organization_id: viewer.organization.id,
    unit_id: viewer.selectedUnitId,
    user_id: viewer.userId,
    report: "previa_folha",
    format,
    filters: { period },
    row_count: table.rows.length,
  });
  if (error) return new NextResponse("Não foi possível registrar a exportação. Tente de novo.", { status: 500 });

  const today = todayIn();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const name = reportFileName(`previa_folha_${period}`, format, today);
  if (format === "csv") {
    return new NextResponse(tableToCsv(table), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
    });
  }
  const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }).format(new Date());
  const buffer = await tableToXlsx(table, generatedAt);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
