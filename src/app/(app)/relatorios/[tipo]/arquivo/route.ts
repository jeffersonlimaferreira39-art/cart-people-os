import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { parsePeriodMonths } from "@/lib/domain/analytics";
import { todayIn } from "@/lib/domain/dates";
import { isReportId } from "@/lib/reports/catalog";
import { buildReport, logExport } from "@/lib/reports/build";
import { reportFileName, tableToCsv } from "@/lib/reports/files";
import { tableToXlsx } from "@/lib/reports/xlsx";

/** Entrega o relatório em Excel (.xlsx) ou CSV, sob a sessão do usuário. */
export async function GET(req: NextRequest, ctx: RouteContext<"/relatorios/[tipo]/arquivo">) {
  const { tipo } = await ctx.params;
  if (!isReportId(tipo)) return new NextResponse("Relatório não encontrado.", { status: 404 });
  const format = req.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "xlsx";
  const months = parsePeriodMonths(req.nextUrl.searchParams.get("periodo") ?? undefined);

  const viewer = await getViewer();
  const table = await buildReport(viewer, tipo, months);
  if (!table) return new NextResponse("Seu perfil não dá acesso a este relatório.", { status: 403 });
  if (!(await logExport(viewer, tipo, format, months, table.rows.length))) {
    return new NextResponse("Não foi possível registrar a exportação. Tente de novo.", { status: 500 });
  }

  const today = todayIn();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "csv") {
    return new NextResponse(tableToCsv(table), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${reportFileName(tipo, "csv", today)}"`,
      },
    });
  }
  const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }).format(new Date());
  const buffer = await tableToXlsx(table, generatedAt);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${reportFileName(tipo, "xlsx", today)}"`,
    },
  });
}
