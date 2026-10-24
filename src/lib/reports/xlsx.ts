import "server-only";
import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import type { ReportTable } from "./catalog";

/** Planilha com título, recorte, cabeçalho fixo e tipos corretos (data e número). */
export async function tableToXlsx(table: ReportTable, generatedAt: string): Promise<Buffer> {
  const data: SheetData = [
    [{ value: table.title, fontWeight: "bold", fontSize: 14 }],
    [{ value: `${table.scope} · gerado em ${generatedAt}`, textColor: "#555555" }],
    [],
    table.columns.map((c) => ({
      value: c.header,
      fontWeight: "bold" as const,
      backgroundColor: "#0A111B",
      textColor: "#E6EEF7",
      align: c.kind === "number" ? ("right" as const) : undefined,
    })),
    ...table.rows.map((r) =>
      r.map((v, i) => {
        const kind = table.columns[i]?.kind;
        if (v === null || v === "") return null;
        if (kind === "date" && typeof v === "string") return { value: new Date(`${v}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" };
        if (kind === "number" && typeof v === "number") return { value: v, type: Number };
        return { value: String(v), type: String };
      }),
    ),
  ];
  const result = writeXlsxFile(data, {
    sheet: table.title.slice(0, 31),
    columns: table.columns.map((c) => ({ width: c.width ?? 16 })),
    stickyRowsCount: 4,
  });
  return result.toBuffer();
}
