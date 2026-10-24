import { toCsv } from "@/lib/domain/csv";
import type { ReportTable } from "./catalog";

const isoToBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** CSV pt-BR: ";" como separador, vírgula decimal e datas dd/mm/aaaa. */
export function tableToCsv(table: ReportTable): string {
  return toCsv(
    table.columns.map((c) => c.header),
    table.rows.map((r) =>
      r.map((v, i) => {
        if (v === null || v === "") return "";
        const kind = table.columns[i]?.kind;
        if (kind === "date" && typeof v === "string") return isoToBr(v);
        if (kind === "number" && typeof v === "number") return String(v).replace(".", ",");
        return v;
      }),
    ),
  );
}

export function reportFileName(id: string, ext: string, today: string) {
  return `cart-people-os_${id}_${today}.${ext}`;
}
