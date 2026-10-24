import { NextResponse, type NextRequest } from "next/server";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { monthlySummary } from "@/lib/data/time";
import { genericCsvPayrollAdapter } from "@/lib/integrations/payroll";

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewerCan(viewer, "exportPayroll")) return new NextResponse("Sem permissão.", { status: 403 });
  const period = request.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return new NextResponse("Competência inválida.", { status: 400 });
  const rows = await monthlySummary(viewer, period);
  const file = genericCsvPayrollAdapter.buildTimeSummary(
    period,
    rows.map((r) => ({
      unitCode: r.unit_code,
      registrationNumber: r.registration_number,
      fullName: r.full_name,
      workedMinutes: r.worked,
      overtimeMinutes: r.overtime,
      absenceMinutes: r.absence,
      nightMinutes: r.night,
    })),
  );
  return new NextResponse(file.content, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
